from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────────────────

class TherapistRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    preferred_language: str = "en"


class Token(BaseModel):
    access_token: str
    token_type: str


class TherapistOut(BaseModel):
    id: int
    email: str
    name: str
    preferred_language: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Patients ─────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name: str
    date_of_birth: Optional[str] = None   # YYYY-MM-DD
    language: str = "el"
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    date_of_birth: Optional[str] = None
    language: Optional[str] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: int
    name: str
    date_of_birth: Optional[str]
    language: str
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Sessions ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    patient_id: int
    language: str


class SessionOut(BaseModel):
    id: int
    patient_id: int
    language: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Analysis results ──────────────────────────────────────────────────────────

class WordResult(BaseModel):
    recording_id: int
    prediction_id: int
    word: str
    word_id: str
    phoneme_target: str
    position: str
    ipa_target: str
    transcription: Optional[str]
    ipa_produced: Optional[str]
    disorder_type: Optional[str]
    confidence: Optional[float]
    is_developmentally_appropriate: bool
    audio_url: str


class SessionResultsOut(BaseModel):
    session_id: int
    patient_name: str
    patient_age_months: Optional[int]
    language: str
    results: List[WordResult]
    summary: dict   # disorder_type -> count


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    prediction_id: int
    correct_label: str
    phoneme_produced: Optional[str] = None
    notes: Optional[str] = None


class FeedbackOut(BaseModel):
    id: int
    prediction_id: int
    correct_label: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Training / Model stats ────────────────────────────────────────────────────

class ModelVersionOut(BaseModel):
    id: int
    version_tag: str
    language: str
    accuracy: Optional[float]
    f1_score: Optional[float]
    training_samples: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TrainingStatsOut(BaseModel):
    language: str
    active_model: Optional[ModelVersionOut]
    all_versions: List[ModelVersionOut]
    pending_labels: int          # labels not yet used for training
    labels_until_retrain: int    # how many more labels before auto-retrain


# ── Words ─────────────────────────────────────────────────────────────────────

class WordInfo(BaseModel):
    id: str
    word: str
    phoneme_target: str
    position: str
    ipa: str
    image_filename: str
    acquisition_age_min_months: int
    acquisition_age_max_months: int
    detects: List[str]
    translation: Optional[str] = None
