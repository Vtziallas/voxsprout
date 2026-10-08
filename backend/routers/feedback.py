from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db, Prediction, Label, Recording, Therapist
from database import Session as DBSession
from auth import get_current_therapist
from schemas import FeedbackCreate, FeedbackOut
from config import RETRAIN_THRESHOLD

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=201)
def submit_feedback(
    data: FeedbackCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    prediction = (
        db.query(Prediction)
        .join(Recording, Recording.id == Prediction.recording_id)
        .join(DBSession, DBSession.id == Recording.session_id)
        .filter(
            Prediction.id == data.prediction_id,
            DBSession.therapist_id == therapist.id,
        )
        .first()
    )
    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found or not authorized")

    recording = db.query(Recording).filter(Recording.id == prediction.recording_id).first()
    session = db.query(DBSession).filter(DBSession.id == recording.session_id).first()

    # Upsert label
    label = db.query(Label).filter(Label.prediction_id == data.prediction_id).first()
    if label:
        label.correct_label = data.correct_label
        label.phoneme_produced = data.phoneme_produced
        label.notes = data.notes
        label.used_for_training = False
    else:
        label = Label(
            prediction_id=data.prediction_id,
            therapist_id=therapist.id,
            correct_label=data.correct_label,
            phoneme_produced=data.phoneme_produced,
            notes=data.notes,
        )
        db.add(label)

    db.commit()
    db.refresh(label)

    # Count unused labels for this language; trigger retrain if threshold met
    from sqlalchemy import func
    unused_count = (
        db.query(func.count(Label.id))
        .join(Prediction, Prediction.id == Label.prediction_id)
        .join(Recording, Recording.id == Prediction.recording_id)
        .join(DBSession, DBSession.id == Recording.session_id)
        .filter(
            Label.used_for_training == False,
            DBSession.language == session.language,
        )
        .scalar()
    )
    if unused_count >= RETRAIN_THRESHOLD:
        from pipeline.trainer import retrain
        background_tasks.add_task(retrain, session.language)

    return label
