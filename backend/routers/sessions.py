from __future__ import annotations
import json
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DBSessionType
from database import get_db, Session, Patient, Recording, Features, Prediction, Therapist
from auth import get_current_therapist
from schemas import SessionCreate, SessionOut, SessionResultsOut, WordResult
from config import RECORDINGS_DIR, WORDS_DIR, SUPPORTED_LANGUAGES
from pipeline.preprocessing import load_and_clean
from pipeline.feature_extraction import extract_features
from pipeline.asr import transcribe
from pipeline.classifier import classify

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _load_words(language: str) -> dict:
    path = WORDS_DIR / f"{language}.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {w["id"]: w for w in data["words"]}


def _patient_age_months(patient: Patient) -> Optional[int]:
    if not patient.date_of_birth:
        return None
    try:
        dob = date.fromisoformat(patient.date_of_birth)
        today = date.today()
        return (today.year - dob.year) * 12 + (today.month - dob.month)
    except ValueError:
        return None


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=SessionOut, status_code=201)
def create_session(
    data: SessionCreate,
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    if data.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {data.language}")
    patient = db.query(Patient).filter(
        Patient.id == data.patient_id, Patient.therapist_id == therapist.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    session = Session(
        patient_id=data.patient_id,
        therapist_id=therapist.id,
        language=data.language,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("", response_model=List[SessionOut])
def list_sessions(
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    return db.query(Session).filter(Session.therapist_id == therapist.id).all()


@router.get("/patient/{patient_id}", response_model=List[SessionOut])
def list_patient_sessions(
    patient_id: int,
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    patient = db.query(Patient).filter(
        Patient.id == patient_id, Patient.therapist_id == therapist.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return db.query(Session).filter(Session.patient_id == patient_id).all()


# ── Word list ─────────────────────────────────────────────────────────────────

@router.get("/words/{language}")
def get_word_list(language: str):
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language")
    path = WORDS_DIR / f"{language}.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ── Record a single word ──────────────────────────────────────────────────────

@router.post("/{session_id}/record/{word_id}")
async def record_word(
    session_id: int,
    word_id: str,
    audio: UploadFile = File(...),
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    """
    Upload audio for one word. Runs the full pipeline immediately and returns
    the analysis result so the therapist sees feedback word-by-word.
    """
    session = db.query(Session).filter(
        Session.id == session_id, Session.therapist_id == therapist.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "completed":
        raise HTTPException(status_code=400, detail="Session is already completed")

    words_map = _load_words(session.language)
    word_info = words_map.get(word_id)
    if not word_info:
        raise HTTPException(
            status_code=404,
            detail=f"Word '{word_id}' not found for language '{session.language}'"
        )

    # Save audio — convert to real WAV so the browser can play it back
    session_dir = RECORDINGS_DIR / str(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)

    # Write raw upload (webm/ogg/wav) to a temp file first
    raw_path = session_dir / f"{word_id}_raw.webm"
    content = await audio.read()
    with open(raw_path, "wb") as f:
        f.write(content)

    audio_path = session_dir / f"{word_id}.wav"

    # Decode with PyAV (handles webm/ogg/wav) and write as proper WAV
    try:
        import av
        import soundfile as sf
        import numpy as _np

        container = av.open(str(raw_path))
        resampler = av.audio.resampler.AudioResampler(
            format="fltp", layout="mono", rate=16000
        )
        chunks = []
        for frame in container.decode(audio=0):
            frame.pts = None
            for rf in resampler.resample(frame):
                chunks.append(rf.to_ndarray().flatten())
        container.close()

        if chunks:
            pcm = _np.concatenate(chunks).astype(_np.float32)
            sf.write(str(audio_path), pcm, 16000, subtype="PCM_16")
        else:
            raise RuntimeError("No audio decoded")
    except Exception:
        # Last resort: copy raw bytes (won't play but pipeline still works)
        import shutil
        shutil.copy(str(raw_path), str(audio_path))
    finally:
        try:
            raw_path.unlink()
        except Exception:
            pass

    # Pipeline
    audio_array, sr = load_and_clean(str(audio_path))
    feat_dict = extract_features(audio_array, sr)
    transcription, ipa_produced = transcribe(str(audio_path), session.language)

    patient = session.patient
    age_months = _patient_age_months(patient)
    result = classify(feat_dict, word_info, transcription, ipa_produced, age_months, session.language, db)

    # Persist
    recording = Recording(
        session_id=session_id,
        word_id=word_id,
        word=word_info["word"],
        phoneme_target=word_info["phoneme_target"],
        position=word_info["position"],
        audio_path=str(audio_path),
        duration_seconds=feat_dict.get("duration"),
    )
    db.add(recording)
    db.flush()

    features_row = Features(
        recording_id=recording.id,
        mfcc_means_json=json.dumps(feat_dict.get("mfcc_means", [])),
        mfcc_stds_json=json.dumps(feat_dict.get("mfcc_stds", [])),
        formants_json=json.dumps(feat_dict.get("formants", {})),
        pitch_mean=feat_dict.get("pitch_mean"),
        pitch_std=feat_dict.get("pitch_std"),
        duration=feat_dict.get("duration"),
        spectral_centroid_mean=feat_dict.get("spectral_centroid_mean"),
        zcr_mean=feat_dict.get("zcr_mean"),
        energy=feat_dict.get("energy"),
        jitter=feat_dict.get("jitter"),
        shimmer=feat_dict.get("shimmer"),
        hnr=feat_dict.get("hnr"),
        is_silent=feat_dict.get("is_silent", False),
    )
    db.add(features_row)
    db.flush()

    prediction = Prediction(
        recording_id=recording.id,
        disorder_type=result["disorder_type"],
        confidence=result["confidence"],
        phoneme_produced=result.get("phoneme_produced"),
        transcription=transcription,
        ipa_produced=ipa_produced,
        is_developmentally_appropriate=result["is_developmentally_appropriate"],
        model_version=result.get("model_version", "rule-based"),
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    return {
        "recording_id": recording.id,
        "prediction_id": prediction.id,
        "word": word_info["word"],
        "word_id": word_id,
        "phoneme_target": word_info["phoneme_target"],
        "position": word_info["position"],
        "ipa_target": word_info["ipa"],
        "transcription": transcription,
        "ipa_produced": ipa_produced,
        "disorder_type": result["disorder_type"],
        "confidence": result["confidence"],
        "is_developmentally_appropriate": result["is_developmentally_appropriate"],
        "audio_url": f"/sessions/audio/{session_id}/{word_id}",
    }


# ── Complete session ──────────────────────────────────────────────────────────

@router.post("/{session_id}/complete", response_model=SessionOut)
def complete_session(
    session_id: int,
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    session = db.query(Session).filter(
        Session.id == session_id, Session.therapist_id == therapist.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


# ── Get session results ───────────────────────────────────────────────────────

@router.get("/{session_id}/results", response_model=SessionResultsOut)
def get_results(
    session_id: int,
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    session = db.query(Session).filter(
        Session.id == session_id, Session.therapist_id == therapist.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    words_map = _load_words(session.language)
    patient = session.patient
    age_months = _patient_age_months(patient)

    results = []
    disorder_counts: dict = {}

    for rec in session.recordings:
        pred = rec.prediction
        word_info = words_map.get(rec.word_id, {})
        disorder = pred.disorder_type if pred else None
        if disorder and disorder != "none":
            disorder_counts[disorder] = disorder_counts.get(disorder, 0) + 1

        results.append(WordResult(
            recording_id=rec.id,
            prediction_id=pred.id if pred else 0,
            word=rec.word,
            word_id=rec.word_id,
            phoneme_target=rec.phoneme_target or "",
            position=rec.position or "",
            ipa_target=word_info.get("ipa", ""),
            transcription=pred.transcription if pred else None,
            ipa_produced=pred.ipa_produced if pred else None,
            disorder_type=disorder,
            confidence=pred.confidence if pred else None,
            is_developmentally_appropriate=pred.is_developmentally_appropriate if pred else False,
            audio_url=f"/sessions/audio/{session_id}/{rec.word_id}",
        ))

    return SessionResultsOut(
        session_id=session_id,
        patient_name=patient.name,
        patient_age_months=age_months,
        language=session.language,
        results=results,
        summary=disorder_counts,
    )


# ── Acoustic features for analysis view ──────────────────────────────────────

@router.get("/{session_id}/features")
def get_session_features(
    session_id: int,
    db: DBSessionType = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    """Return all recordings with full acoustic feature data for the analysis view."""
    import json as _json
    session = db.query(Session).filter(
        Session.id == session_id, Session.therapist_id == therapist.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    recordings_out = []
    for rec in session.recordings:
        pred = rec.prediction
        feat = rec.features
        feat_data = None
        if feat:
            feat_data = {
                "mfcc_means": _json.loads(feat.mfcc_means_json) if feat.mfcc_means_json else [],
                "mfcc_stds":  _json.loads(feat.mfcc_stds_json)  if feat.mfcc_stds_json  else [],
                "formants":   _json.loads(feat.formants_json)    if feat.formants_json    else {},
                "pitch_mean":            feat.pitch_mean,
                "pitch_std":             feat.pitch_std,
                "duration":              feat.duration,
                "spectral_centroid_mean": feat.spectral_centroid_mean,
                "zcr_mean":              feat.zcr_mean,
                "energy":                feat.energy,
                "jitter":                feat.jitter,
                "shimmer":               feat.shimmer,
                "hnr":                   feat.hnr,
                "is_silent":             feat.is_silent,
            }
        recordings_out.append({
            "recording_id":   rec.id,
            "word_id":        rec.word_id,
            "word":           rec.word,
            "phoneme_target": rec.phoneme_target,
            "position":       rec.position,
            "disorder_type":  pred.disorder_type if pred else None,
            "transcription":  pred.transcription if pred else None,
            "ipa_produced":   pred.ipa_produced  if pred else None,
            "audio_url":      f"/sessions/audio/{session_id}/{rec.word_id}",
            "features":       feat_data,
        })

    return {
        "session_id": session_id,
        "language":   session.language,
        "recordings": recordings_out,
    }


# ── Serve audio ───────────────────────────────────────────────────────────────

@router.get("/audio/{session_id}/{word_id}")
def get_audio(
    session_id: int,
    word_id: str,
):
    """Serve audio file — no auth required so <audio> elements work in the browser."""
    audio_path = RECORDINGS_DIR / str(session_id) / f"{word_id}.wav"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(audio_path), media_type="audio/wav")
