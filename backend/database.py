from sqlalchemy import (
    create_engine, Column, Integer, String, Float,
    Text, DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
from config import DATABASE_URL, DATA_DIR

DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Therapist(Base):
    __tablename__ = "therapists"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    preferred_language = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)

    patients = relationship("Patient", back_populates="therapist")
    sessions = relationship("Session", back_populates="therapist")
    labels = relationship("Label", back_populates="therapist")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    therapist_id = Column(Integer, ForeignKey("therapists.id"), nullable=False)
    name = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=True)   # ISO date string: YYYY-MM-DD
    language = Column(String, default="el")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    therapist = relationship("Therapist", back_populates="patients")
    sessions = relationship("Session", back_populates="patient")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    therapist_id = Column(Integer, ForeignKey("therapists.id"), nullable=False)
    language = Column(String, nullable=False)
    # pending | processing | completed | failed
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    patient = relationship("Patient", back_populates="sessions")
    therapist = relationship("Therapist", back_populates="sessions")
    recordings = relationship("Recording", back_populates="session")


class Recording(Base):
    __tablename__ = "recordings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    word_id = Column(String, nullable=False)        # references word JSON id
    word = Column(String, nullable=False)            # the word string itself
    phoneme_target = Column(String, nullable=True)   # target IPA phoneme
    position = Column(String, nullable=True)         # initial/medial/final/cluster
    audio_path = Column(String, nullable=False)
    duration_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="recordings")
    features = relationship("Features", back_populates="recording", uselist=False)
    prediction = relationship("Prediction", back_populates="recording", uselist=False)


class Features(Base):
    __tablename__ = "features"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False, unique=True)
    # Stored as JSON strings
    mfcc_means_json = Column(Text, nullable=True)       # 13 MFCC means
    mfcc_stds_json = Column(Text, nullable=True)        # 13 MFCC stds
    formants_json = Column(Text, nullable=True)         # {f1, f2, f3} means
    pitch_mean = Column(Float, nullable=True)
    pitch_std = Column(Float, nullable=True)
    duration = Column(Float, nullable=True)
    spectral_centroid_mean = Column(Float, nullable=True)
    zcr_mean = Column(Float, nullable=True)
    energy = Column(Float, nullable=True)
    jitter = Column(Float, nullable=True)
    shimmer = Column(Float, nullable=True)
    hnr = Column(Float, nullable=True)
    is_silent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    recording = relationship("Recording", back_populates="features")


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    recording_id = Column(Integer, ForeignKey("recordings.id"), nullable=False, unique=True)
    # none | substitution | omission | distortion | voicing_error |
    # fronting | backing | gliding | cluster_reduction |
    # final_consonant_deletion | stopping
    disorder_type = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)
    phoneme_produced = Column(String, nullable=True)  # IPA of what child said
    transcription = Column(String, nullable=True)     # raw ASR output
    ipa_produced = Column(String, nullable=True)      # IPA of transcription
    is_developmentally_appropriate = Column(Boolean, default=False)
    model_version = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    recording = relationship("Recording", back_populates="prediction")
    label = relationship("Label", back_populates="prediction", uselist=False)


class Label(Base):
    """Therapist correction of a prediction — this is the training data."""
    __tablename__ = "labels"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id"), nullable=False, unique=True)
    therapist_id = Column(Integer, ForeignKey("therapists.id"), nullable=False)
    correct_label = Column(String, nullable=False)        # actual disorder type
    phoneme_produced = Column(String, nullable=True)      # what therapist heard
    notes = Column(Text, nullable=True)
    used_for_training = Column(Boolean, default=False)    # has this been used in a retrain?
    created_at = Column(DateTime, default=datetime.utcnow)

    prediction = relationship("Prediction", back_populates="label")
    therapist = relationship("Therapist", back_populates="labels")


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(Integer, primary_key=True, index=True)
    version_tag = Column(String, nullable=False)          # e.g. "v1", "v2"
    language = Column(String, nullable=False)
    accuracy = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    training_samples = Column(Integer, default=0)
    model_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)
