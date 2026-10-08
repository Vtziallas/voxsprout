import os
from pathlib import Path

BASE_DIR = Path(__file__).parent

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Directories
DATA_DIR = BASE_DIR / "data"
RECORDINGS_DIR = DATA_DIR / "recordings"
FEATURES_DIR = DATA_DIR / "features"
ML_MODELS_DIR = DATA_DIR / "ml_models"
WORDS_DIR = DATA_DIR / "words"
IMAGES_DIR = DATA_DIR / "images"
REPORTS_DIR = DATA_DIR / "reports"
ASR_MODEL_DIR = BASE_DIR / "models" / "asr"

for d in [RECORDINGS_DIR, FEATURES_DIR, ML_MODELS_DIR, WORDS_DIR, IMAGES_DIR, REPORTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_URL = f"sqlite:///{DATA_DIR}/database.db"

# Active learning thresholds
RETRAIN_THRESHOLD = 20       # retrain when this many new labeled samples accumulate
MIN_SAMPLES_FOR_ML = 50      # below this, use rule-based classifier

# Audio
SAMPLE_RATE = 16000
MIN_AUDIO_DURATION = 0.15    # seconds — below this, treat as omission
SILENCE_THRESHOLD = 0.01     # RMS energy below this = silent

# Supported languages
SUPPORTED_LANGUAGES = ["el", "en"]
