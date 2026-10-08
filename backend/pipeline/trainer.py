"""
Active learning trainer.

When called (manually or automatically after RETRAIN_THRESHOLD new labels):
1. Pulls all labeled recordings from the DB for a given language
2. Builds feature matrix X and label vector y
3. Trains a RandomForestClassifier
4. Evaluates on held-out 20%
5. Saves model to disk as active.pkl
6. Registers new ModelVersion in DB
7. Marks used labels as used_for_training=True
8. Invalidates the in-memory model cache
"""
import json
import logging
import numpy as np
import joblib
from datetime import datetime
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import LabelEncoder
from config import ML_MODELS_DIR, MIN_SAMPLES_FOR_ML

logger = logging.getLogger(__name__)


def retrain(language: str):
    """
    Entry point — called from background tasks.
    Opens its own DB session to avoid thread conflicts.
    """
    from database import SessionLocal
    db = SessionLocal()
    try:
        _run_retrain(language, db)
    except Exception as e:
        logger.error(f"Retraining failed for '{language}': {e}", exc_info=True)
    finally:
        db.close()


def _run_retrain(language: str, db):
    from database import Label, Prediction, Recording, Session as DBSession, ModelVersion
    from pipeline.feature_extraction import build_feature_vector
    from pipeline.classifier import reload_model

    logger.info(f"Starting retrain for language '{language}'...")

    # Collect labeled samples
    labels = (
        db.query(Label)
        .join(Prediction)
        .join(Prediction.recording)
        .join(Recording.session)
        .filter(DBSession.language == language)
        .all()
    )

    if len(labels) < MIN_SAMPLES_FOR_ML:
        logger.info(
            f"Only {len(labels)} labeled samples for '{language}' "
            f"(need {MIN_SAMPLES_FOR_ML}). Skipping retrain."
        )
        return

    X, y = [], []
    valid_label_ids = []

    for lbl in labels:
        pred = lbl.prediction
        rec = pred.recording
        features_row = rec.features

        if features_row is None:
            continue

        feat_dict = {
            "mfcc_means": json.loads(features_row.mfcc_means_json or "[]"),
            "mfcc_stds": json.loads(features_row.mfcc_stds_json or "[]"),
            "formants": json.loads(features_row.formants_json or "{}"),
            "pitch_mean": features_row.pitch_mean,
            "pitch_std": features_row.pitch_std,
            "duration": features_row.duration,
            "spectral_centroid_mean": features_row.spectral_centroid_mean,
            "zcr_mean": features_row.zcr_mean,
            "energy": features_row.energy,
            "jitter": features_row.jitter,
            "shimmer": features_row.shimmer,
            "hnr": features_row.hnr,
            "is_silent": features_row.is_silent,
        }
        word_info = {
            "phoneme_target": rec.phoneme_target or "",
            "position": rec.position or "initial",
        }

        vector = build_feature_vector(feat_dict, word_info)
        X.append(vector)
        y.append(lbl.correct_label)
        valid_label_ids.append(lbl.id)

    if len(X) < MIN_SAMPLES_FOR_ML:
        logger.info(f"Not enough valid feature rows ({len(X)}). Skipping retrain.")
        return

    X = np.array(X, dtype=np.float32)
    y = np.array(y)

    # Train / test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) > 1 else None
    )

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))

    logger.info(f"Retrain complete for '{language}': acc={acc:.3f}, f1={f1:.3f}, n={len(X)}")

    # Determine new version tag
    latest = (
        db.query(ModelVersion)
        .filter(ModelVersion.language == language)
        .order_by(ModelVersion.id.desc())
        .first()
    )
    if latest:
        num = int(latest.version_tag.lstrip("v")) + 1
    else:
        num = 1
    version_tag = f"v{num}"

    # Save model to disk
    model_dir = ML_MODELS_DIR / language
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / f"{version_tag}.pkl"
    clf._version_tag = version_tag
    joblib.dump(clf, model_path)

    # Symlink active.pkl → new model
    active_path = model_dir / "active.pkl"
    if active_path.exists() or active_path.is_symlink():
        active_path.unlink()
    joblib.dump(clf, active_path)

    # Deactivate old active version
    db.query(ModelVersion).filter(
        ModelVersion.language == language, ModelVersion.is_active == True
    ).update({"is_active": False})

    # Register new version
    mv = ModelVersion(
        version_tag=version_tag,
        language=language,
        accuracy=acc,
        f1_score=f1,
        training_samples=len(X),
        model_path=str(model_path),
        is_active=True,
    )
    db.add(mv)

    # Mark labels as used
    db.query(Label).filter(Label.id.in_(valid_label_ids)).update(
        {"used_for_training": True}, synchronize_session="fetch"
    )

    db.commit()

    # Reload in-memory cache
    reload_model(language)
    logger.info(f"Model '{version_tag}' for '{language}' is now active.")
