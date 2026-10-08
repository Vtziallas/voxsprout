# VoxSprout

AI-powered speech therapy assessment platform for children. Therapists record a
child reading target words, and the system transcribes the audio, extracts
acoustic features, and classifies articulation disorders (omission,
substitution, distortion, voicing errors, fronting, backing) to support —
not replace — clinical judgment.

## How it works

1. **Record** — a therapist runs a session against a word list (Greek or English).
2. **Transcribe** — `pipeline/asr.py` runs the audio through a wav2vec2 model
   (`jonatasgrosman/wav2vec2-large-xlsr-53-greek` or `facebook/wav2vec2-base-960h`)
   to get phonetic transcription.
3. **Extract features** — `pipeline/feature_extraction.py` pulls acoustic cues
   (spectral centroid, ZCR, formants, jitter/shimmer/HNR, etc.) via Praat/Parselmouth
   and librosa.
4. **Classify** — `pipeline/classifier.py` starts rule-based (grounded in published
   speech-science thresholds) and switches to a trained Random Forest once enough
   labeled samples accumulate (`MIN_SAMPLES_FOR_ML`).
5. **Review & label** — therapists confirm/correct predictions; corrections feed
   active-learning retraining (`training` router, `RETRAIN_THRESHOLD`).

## Stack

- **Backend** — FastAPI, SQLAlchemy, JWT auth. Audio/ML via librosa, PyAV,
  praat-parselmouth, HuggingFace Transformers (wav2vec2), scikit-learn.
- **Frontend** — React + Vite (session recording, dashboard, acoustic analysis
  view, bulk labeling, training dashboard).

## Project structure

```
backend/
  main.py           FastAPI app, routers, static mounts
  routers/           auth, patients, sessions, feedback, training
  pipeline/           asr.py, preprocessing.py, feature_extraction.py,
                      classifier.py, trainer.py
  data/              recordings, extracted features, trained models, reports
frontend/
  src/pages/         Dashboard, NewSession, SessionResults, AcousticAnalysis,
                     BulkLabeling, TrainingDashboard, PatientProfile, Login
```

## Running locally

```bash
# Backend
cd backend
pip install -r ../requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

The backend expects `SECRET_KEY` set via environment (falls back to an
insecure default for local dev only — never use the default in production).
