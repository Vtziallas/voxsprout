import numpy as np
import librosa
import parselmouth
from parselmouth.praat import call
from config import SAMPLE_RATE, SILENCE_THRESHOLD, MIN_AUDIO_DURATION


def extract_features(audio: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
    """
    Extract a full acoustic feature set from a cleaned audio signal.

    Returns a dict with:
        mfcc_means, mfcc_stds  — 13 coefficients each
        formants               — {f1, f2, f3} in Hz
        pitch_mean, pitch_std  — F0 in Hz
        duration               — seconds
        spectral_centroid_mean — Hz
        zcr_mean               — zero crossing rate
        energy                 — RMS energy
        jitter, shimmer, hnr   — voice quality measures
        is_silent              — bool
    """
    duration = len(audio) / sr
    energy = float(np.sqrt(np.mean(audio ** 2)))
    is_silent = duration < MIN_AUDIO_DURATION or energy < SILENCE_THRESHOLD

    features = {
        "duration": duration,
        "energy": energy,
        "is_silent": is_silent,
        "mfcc_means": [],
        "mfcc_stds": [],
        "formants": {"f1": None, "f2": None, "f3": None},
        "pitch_mean": None,
        "pitch_std": None,
        "spectral_centroid_mean": None,
        "zcr_mean": None,
        "jitter": None,
        "shimmer": None,
        "hnr": None,
    }

    if is_silent:
        return features

    # ── librosa features ───────────────────────────────────────────────────
    mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
    features["mfcc_means"] = mfccs.mean(axis=1).tolist()
    features["mfcc_stds"] = mfccs.std(axis=1).tolist()

    sc = librosa.feature.spectral_centroid(y=audio, sr=sr)
    features["spectral_centroid_mean"] = float(sc.mean())

    zcr = librosa.feature.zero_crossing_rate(audio)
    features["zcr_mean"] = float(zcr.mean())

    # ── Praat / parselmouth features ───────────────────────────────────────
    try:
        snd = parselmouth.Sound(audio, sampling_frequency=sr)

        # Pitch (F0)
        pitch = snd.to_pitch()
        pitch_values = pitch.selected_array["frequency"]
        voiced = pitch_values[pitch_values > 0]
        if len(voiced) > 0:
            features["pitch_mean"] = float(voiced.mean())
            features["pitch_std"] = float(voiced.std())

        # Formants
        formants = snd.to_formant_burg(max_number_of_formants=5)
        times = np.linspace(
            formants.xmin + 0.05,
            formants.xmax - 0.05,
            num=min(10, int((formants.xmax - formants.xmin) / 0.02))
        )
        f1_vals, f2_vals, f3_vals = [], [], []
        for t in times:
            v1 = formants.get_value_at_time(1, t)
            v2 = formants.get_value_at_time(2, t)
            v3 = formants.get_value_at_time(3, t)
            if v1 and not np.isnan(v1):
                f1_vals.append(v1)
            if v2 and not np.isnan(v2):
                f2_vals.append(v2)
            if v3 and not np.isnan(v3):
                f3_vals.append(v3)
        features["formants"] = {
            "f1": float(np.mean(f1_vals)) if f1_vals else None,
            "f2": float(np.mean(f2_vals)) if f2_vals else None,
            "f3": float(np.mean(f3_vals)) if f3_vals else None,
        }

        # Voice quality: jitter, shimmer, HNR
        point_process = call(snd, "To PointProcess (periodic, cc)...", 75, 500)
        jitter = call(point_process, "Get jitter (local)...", 0, 0, 0.0001, 0.02, 1.3)
        shimmer = call(
            [snd, point_process], "Get shimmer (local)...", 0, 0, 0.0001, 0.02, 1.3, 1.6
        )
        harmonicity = call(snd, "To Harmonicity (cc)...", 0.01, 75, 0.1, 1.0)
        hnr = call(harmonicity, "Get mean...", 0, 0)

        features["jitter"] = float(jitter) if jitter and not np.isnan(jitter) else None
        features["shimmer"] = float(shimmer) if shimmer and not np.isnan(shimmer) else None
        features["hnr"] = float(hnr) if hnr and not np.isnan(hnr) else None

    except Exception as e:
        # Praat can fail on very short or noisy clips — degrade gracefully
        pass

    return features


def build_feature_vector(feat: dict, word_info: dict) -> list:
    """
    Flatten the feature dict into a fixed-length numeric vector for the ML classifier.
    Includes phoneme identity and position as numeric codes.
    """
    mfcc_means = feat.get("mfcc_means") or [0.0] * 13
    mfcc_stds = feat.get("mfcc_stds") or [0.0] * 13
    formants = feat.get("formants") or {}

    vector = (
        mfcc_means[:13]
        + mfcc_stds[:13]
        + [
            formants.get("f1") or 0.0,
            formants.get("f2") or 0.0,
            formants.get("f3") or 0.0,
            feat.get("pitch_mean") or 0.0,
            feat.get("pitch_std") or 0.0,
            feat.get("duration") or 0.0,
            feat.get("spectral_centroid_mean") or 0.0,
            feat.get("zcr_mean") or 0.0,
            feat.get("energy") or 0.0,
            feat.get("jitter") or 0.0,
            feat.get("shimmer") or 0.0,
            feat.get("hnr") or 0.0,
            1.0 if feat.get("is_silent") else 0.0,
            # Position encoding: initial=0, medial=1, final=2, cluster=3
            {"initial": 0, "medial": 1, "final": 2, "cluster": 3}.get(
                word_info.get("position", "initial"), 0
            ),
        ]
    )
    return [float(x) if x is not None else 0.0 for x in vector]
