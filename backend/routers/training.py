from __future__ import annotations
from fastapi import APIRouter, Depends, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List
from database import get_db, ModelVersion, Label, Therapist, Recording, Prediction
from database import Session as DBSession
from auth import get_current_therapist
from schemas import TrainingStatsOut, ModelVersionOut
from config import RETRAIN_THRESHOLD, SUPPORTED_LANGUAGES

router = APIRouter(prefix="/training", tags=["training"])


@router.get("/stats/{language}", response_model=TrainingStatsOut)
def get_training_stats(
    language: str,
    db: Session = Depends(get_db),
    _: Therapist = Depends(get_current_therapist),
):
    active = (
        db.query(ModelVersion)
        .filter(ModelVersion.language == language, ModelVersion.is_active == True)
        .first()
    )
    all_versions = (
        db.query(ModelVersion)
        .filter(ModelVersion.language == language)
        .order_by(ModelVersion.created_at.desc())
        .all()
    )
    pending = db.query(Label).filter(Label.used_for_training == False).count()
    return TrainingStatsOut(
        language=language,
        active_model=active,
        all_versions=all_versions,
        pending_labels=pending,
        labels_until_retrain=max(0, RETRAIN_THRESHOLD - pending),
    )


@router.post("/retrain/{language}", status_code=202)
def trigger_retrain(
    language: str,
    background_tasks: BackgroundTasks,
    _: Therapist = Depends(get_current_therapist),
):
    from pipeline.trainer import retrain
    background_tasks.add_task(retrain, language)
    return {"message": f"Retraining started for language '{language}'"}


@router.get("/versions", response_model=List[ModelVersionOut])
def list_all_versions(
    db: Session = Depends(get_db),
    _: Therapist = Depends(get_current_therapist),
):
    return db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()


@router.get("/labeling-queue")
def get_labeling_queue(
    language: str = Query("el"),
    limit: int = Query(100),
    db: Session = Depends(get_db),
    _: Therapist = Depends(get_current_therapist),
):
    """Return recordings that have a prediction but no therapist label yet."""
    labeled_ids = db.query(Label.prediction_id).subquery()

    rows = (
        db.query(Recording, Prediction)
        .join(DBSession, Recording.session_id == DBSession.id)
        .join(Prediction, Prediction.recording_id == Recording.id)
        .filter(DBSession.language == language)
        .filter(~Prediction.id.in_(labeled_ids))
        .order_by(Recording.created_at.desc())
        .limit(limit)
        .all()
    )

    items = []
    for rec, pred in rows:
        items.append({
            "recording_id": rec.id,
            "prediction_id": pred.id,
            "word_id": rec.word_id,
            "word": rec.word,
            "phoneme_target": rec.phoneme_target,
            "position": rec.position,
            "language": language,
            "disorder_type": pred.disorder_type,
            "confidence": pred.confidence,
            "transcription": pred.transcription,
            "ipa_produced": pred.ipa_produced,
            "is_developmentally_appropriate": pred.is_developmentally_appropriate,
            "audio_url": f"/audio/{rec.session_id}/{rec.word_id}",
        })

    return {"items": items, "total": len(items)}
