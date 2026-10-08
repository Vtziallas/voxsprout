"""
Disorder classifier — rule-based (phase 1) + Random Forest (phase 2).

Rule-based acoustic cues are grounded in published speech science:
  - Spectral centroid / ZCR thresholds for fricative vs stop: Stevens (1998),
    Jongman et al. (2000)
  - F2/F3 locus for place of articulation: Sussman et al. (1991)
  - F3 as rhoticity cue: Delattre & Freeman (1968), Espy-Wilson (1992)
  - Jitter / shimmer / HNR norms for children: Awan & Mueller (1996),
    Connaghan & Patel (2017)
  - Cluster duration norms: Smit et al. (1990)
  - Developmental age norms: McLeod & Crowe (2018)
"""
from __future__ import annotations
import logging
from typing import Optional, Dict, Any
import joblib
from config import ML_MODELS_DIR, MIN_AUDIO_DURATION, SILENCE_THRESHOLD
from pipeline.feature_extraction import build_feature_vector

logger = logging.getLogger(__name__)

# ── Disorder labels ───────────────────────────────────────────────────────────
DISORDER_NONE             = "none"
DISORDER_OMISSION         = "omission"
DISORDER_SUBSTITUTION     = "substitution"
DISORDER_DISTORTION       = "distortion"
DISORDER_VOICING_ERROR    = "voicing_error"
DISORDER_FRONTING         = "fronting"
DISORDER_BACKING          = "backing"
DISORDER_GLIDING          = "gliding"
DISORDER_CLUSTER_REDUCTION = "cluster_reduction"
DISORDER_FINAL_DELETION   = "final_consonant_deletion"
DISORDER_STOPPING         = "stopping"

# ── Phonological feature sets (IPA) ──────────────────────────────────────────
STOPS      = {"p", "b", "t", "d", "k", "g"}
FRICATIVES = {"f", "v", "s", "z", "ʃ", "θ", "ð", "x", "ɣ", "h"}
AFFRICATES = {"tʃ", "dʒ", "ts", "dz"}
LIQUIDS    = {"r", "l"}
GLIDES     = {"w", "j"}
NASALS     = {"m", "n", "ŋ"}
FRONT_STOPS = {"t", "d"}          # alveolar stops
BACK_STOPS  = {"k", "g"}          # velar stops
VOICELESS  = {"p", "t", "k", "f", "s", "ʃ", "θ", "x", "ts", "tʃ"}
VOICED     = {"b", "d", "g", "v", "z", "ð", "ɣ", "dz", "dʒ"}

# ── Published acoustic thresholds ─────────────────────────────────────────────
# Spectral centroid (Hz) — lower bound for fricative noise presence
# Below these values suggests the fricative was replaced by a stop
SC_FRICATIVE_MIN   = 2000   # very conservative lower bound for any fricative
SC_FRICATIVE_CLEAR = 3500   # confident fricative (not a stop)

# ZCR — fricatives have high ZCR, stops have low ZCR
ZCR_FRICATIVE_MIN  = 0.07

# F2 locus (Hz) — place of articulation cue in surrounding vowels
F2_VELAR_MIN       = 1900   # F2 > 1900 Hz during velar context → fronting occurred
F2_ALVEOLAR_MAX    = 1600   # F2 < 1600 Hz during alveolar context → backing occurred

# F3 rhoticity cue (Hz) — /r/ has very low F3, glides/non-rhotics have higher F3
# Delattre & Freeman (1968): F3 < 2000 Hz → rhotic; > 2500 Hz → non-rhotic
F3_RHOTIC_MAX      = 2200   # below this = rhotic /r/ present
F3_GLIDE_MIN       = 2500   # above this = likely glide substitution

# Voice quality — Awan & Mueller (1996) norms for school-age children
JITTER_NORMAL_MAX  = 0.020  # 2% local jitter — above this = possible distortion
SHIMMER_NORMAL_MAX = 0.080  # 8% local shimmer
HNR_NORMAL_MIN     = 15.0   # dB — below this = dysphonic quality

# Duration (seconds) — minimum for a fully produced word with cluster
CLUSTER_MIN_DURATION = 0.32  # clusters require more articulatory time
SINGLETON_MIN_DURATION = 0.20

# ── ML model cache ────────────────────────────────────────────────────────────
_ml_models: dict = {}


def _get_ml_model(language: str) -> Optional[Any]:
    if language in _ml_models:
        return _ml_models[language]
    model_path = ML_MODELS_DIR / language / "active.pkl"
    if model_path.exists():
        try:
            clf = joblib.load(model_path)
            _ml_models[language] = clf
            logger.info(f"Loaded ML classifier for '{language}'")
            return clf
        except Exception as e:
            logger.warning(f"Could not load ML model for '{language}': {e}")
    _ml_models[language] = None
    return None


def reload_model(language: str) -> Optional[Any]:
    _ml_models.pop(language, None)
    return _get_ml_model(language)


# ── IPA extraction from ASR output ───────────────────────────────────────────

def _find_phoneme_in_ipa(
    ipa_produced: str, target: str, position: str
) -> Optional[str]:
    """
    Extract the phoneme(s) produced at the target position from the
    space-separated IPA string returned by the ASR pipeline.

    For clusters (e.g. target="sp") we concatenate the first N phonemes
    so that _classify_substitution can detect partial cluster production.
    """
    if not ipa_produced:
        return None
    phonemes = ipa_produced.strip().split()
    if not phonemes:
        return None

    if position in ("initial", "cluster"):
        if len(target) > 1:
            # Cluster: grab as many initial phonemes as the cluster has consonants
            n = len(target)
            return "".join(phonemes[:min(n, len(phonemes))])
        return phonemes[0]

    elif position == "final":
        return phonemes[-1]

    elif position == "medial":
        if len(phonemes) > 2:
            return phonemes[len(phonemes) // 2]
        return phonemes[0]

    return phonemes[0]


# ── Substitution classification ───────────────────────────────────────────────

def _classify_substitution(target: str, produced: str, position: str) -> str:
    """
    Map a (target, produced) phoneme pair to a disorder category using
    distinctive-feature analysis.
    """
    if not produced:
        if position == "final":
            return DISORDER_FINAL_DELETION
        if position == "cluster":
            return DISORDER_CLUSTER_REDUCTION
        return DISORDER_OMISSION

    # ── Cluster reduction ────────────────────────────────────────────────────
    if len(target) > 1:
        # Cluster was only partially produced
        if len(produced) < len(target):
            return DISORDER_CLUSTER_REDUCTION
        # All cluster phonemes present but in wrong form
        target_phonemes = set(target)
        produced_phonemes = set(produced)
        if not target_phonemes.issubset(produced_phonemes):
            return DISORDER_CLUSTER_REDUCTION

    # ── Liquid → glide (gliding) ─────────────────────────────────────────────
    # e.g. /r/ → /w/, /l/ → /j/  (most common error in young children)
    if target in LIQUIDS and produced in GLIDES:
        return DISORDER_GLIDING

    # ── Liquid → liquid (different liquid substitution) ──────────────────────
    if target in LIQUIDS and produced in LIQUIDS:
        return DISORDER_SUBSTITUTION

    # ── Velar → alveolar (fronting) ──────────────────────────────────────────
    # e.g. /k/ → /t/, /g/ → /d/
    if target in BACK_STOPS and produced in FRONT_STOPS:
        return DISORDER_FRONTING

    # ── Alveolar → velar (backing) ───────────────────────────────────────────
    # e.g. /t/ → /k/, /d/ → /g/  (less common, often in young children)
    if target in FRONT_STOPS and produced in BACK_STOPS:
        return DISORDER_BACKING

    # ── Fricative/affricate → stop (stopping) ────────────────────────────────
    # e.g. /s/ → /t/, /θ/ → /d/, /f/ → /p/
    if target in (FRICATIVES | AFFRICATES) and produced in STOPS:
        return DISORDER_STOPPING

    # ── Voicing error (same manner, different voicing) ───────────────────────
    # e.g. /p/ → /b/, /s/ → /z/, /k/ → /g/
    if (target in VOICELESS and produced in VOICED) or \
       (target in VOICED and produced in VOICELESS):
        if _same_manner(target, produced):
            return DISORDER_VOICING_ERROR

    # ── Affricate → fricative or stop (deaffrication / stopping) ────────────
    if target in AFFRICATES and produced in FRICATIVES:
        return DISORDER_SUBSTITUTION   # deaffrication — counts as substitution
    if target in AFFRICATES and produced in STOPS:
        return DISORDER_STOPPING

    # ── Nasal substitution ───────────────────────────────────────────────────
    if target in NASALS and produced not in NASALS:
        return DISORDER_SUBSTITUTION

    return DISORDER_SUBSTITUTION


def _same_manner(a: str, b: str) -> bool:
    for group in (STOPS, FRICATIVES, AFFRICATES, LIQUIDS, GLIDES, NASALS):
        if a in group and b in group:
            return True
    return False


# ── Acoustic heuristic (when ASR gives no output) ────────────────────────────

def _acoustic_heuristic(feat: Dict, word_info: Dict) -> Dict:
    """
    Phoneme-class-specific acoustic disorder detection based on published
    acoustic cues. Used when ASR transcription is unavailable.

    Returns the most likely disorder + confidence, or DISORDER_NONE with
    low confidence when there is insufficient evidence to make a call.
    """
    target   = word_info["phoneme_target"]
    position = word_info["position"]

    energy   = feat.get("energy") or 0.0
    duration = feat.get("duration") or 0.0
    sc       = feat.get("spectral_centroid_mean") or 0.0
    zcr      = feat.get("zcr_mean") or 0.0
    jitter   = feat.get("jitter") or 0.0
    shimmer  = feat.get("shimmer") or 0.0
    hnr      = feat.get("hnr")
    f2       = (feat.get("formants") or {}).get("f2") or 0.0
    f3       = (feat.get("formants") or {}).get("f3") or 0.0
    pitch    = feat.get("pitch_mean") or 0.0

    # ── 1. Cluster targets ───────────────────────────────────────────────────
    # Clusters require longer articulation time than singletons.
    # Short duration strongly suggests at least one consonant was dropped.
    if position == "cluster" or len(target) > 1:
        if duration < CLUSTER_MIN_DURATION:
            return {"disorder_type": DISORDER_CLUSTER_REDUCTION,
                    "confidence": 0.70, "phoneme_produced": None}
        if energy < SILENCE_THRESHOLD * 5:
            return {"disorder_type": DISORDER_CLUSTER_REDUCTION,
                    "confidence": 0.62, "phoneme_produced": None}

    # ── 2. Fricative / affricate targets ────────────────────────────────────
    # Fricatives are characterised by broadband noise: high spectral centroid
    # and high ZCR.  If both are low, a stop was produced instead (stopping).
    # References: Jongman et al. (2000) J Acoust Soc Am 107(3):1266-80
    if target in FRICATIVES or target in AFFRICATES:
        has_friction = sc > SC_FRICATIVE_MIN and zcr > ZCR_FRICATIVE_MIN
        clear_friction = sc > SC_FRICATIVE_CLEAR

        if not has_friction:
            # No fricative energy detected — stopping or omission
            if energy < SILENCE_THRESHOLD * 4:
                return {"disorder_type": DISORDER_OMISSION,
                        "confidence": 0.75, "phoneme_produced": None}
            return {"disorder_type": DISORDER_STOPPING,
                    "confidence": 0.68, "phoneme_produced": None}

        # Voicing error: voiced fricative targets (v, z, ð, ɣ, dz) should
        # show pitch (voicing bar). If no pitch during voiced fricative → error.
        if target in VOICED and pitch < 60 and clear_friction:
            return {"disorder_type": DISORDER_VOICING_ERROR,
                    "confidence": 0.60, "phoneme_produced": None}

        # Voiceless fricative targets should NOT show strong pitch
        if target in VOICELESS and pitch > 180 and clear_friction:
            return {"disorder_type": DISORDER_VOICING_ERROR,
                    "confidence": 0.58, "phoneme_produced": None}

        # Friction is present — check for distortion (dysphonic quality)
        if jitter > JITTER_NORMAL_MAX and shimmer > SHIMMER_NORMAL_MAX:
            return {"disorder_type": DISORDER_DISTORTION,
                    "confidence": 0.62, "phoneme_produced": None}

        # Friction present and no clear error → probably correct
        return {"disorder_type": DISORDER_NONE,
                "confidence": 0.52, "phoneme_produced": None}

    # ── 3. Liquid targets (/r/, /l/) ─────────────────────────────────────────
    # Gliding: /r/ → /w/ or /l/ → /j/  is the most common error for liquids.
    # Acoustic cue: F3 is the primary rhoticity cue.
    # /r/ produces very low F3 (~1800-2000 Hz in Greek); glides and non-rhotics
    # have higher F3.  Reference: Espy-Wilson (1992) JASA 92(6)
    if target in LIQUIDS:
        if duration < SINGLETON_MIN_DURATION:
            return {"disorder_type": DISORDER_OMISSION,
                    "confidence": 0.72, "phoneme_produced": None}

        if target == "r":
            if f3 > F3_GLIDE_MIN:
                return {"disorder_type": DISORDER_GLIDING,
                        "confidence": 0.65, "phoneme_produced": None}
            if f3 > F3_RHOTIC_MAX:
                return {"disorder_type": DISORDER_DISTORTION,
                        "confidence": 0.55, "phoneme_produced": None}

        if target == "l":
            # /l/ → /j/ gliding shows elevated F2 and reduced F3 pattern
            if f2 > 2000 and f3 > F3_GLIDE_MIN:
                return {"disorder_type": DISORDER_GLIDING,
                        "confidence": 0.58, "phoneme_produced": None}

        # Check distortion (aperiodic voicing)
        if jitter > JITTER_NORMAL_MAX and shimmer > SHIMMER_NORMAL_MAX:
            return {"disorder_type": DISORDER_DISTORTION,
                    "confidence": 0.60, "phoneme_produced": None}

        return {"disorder_type": DISORDER_NONE,
                "confidence": 0.48, "phoneme_produced": None}

    # ── 4. Velar stop targets (/k/, /g/, /ks/) ───────────────────────────────
    # Fronting: /k/ → /t/  is detected by elevated F2 in surrounding vowels.
    # The F2 transition locus is higher for alveolars than velars.
    # Reference: Sussman et al. (1991) JASA 90(6)
    if target in BACK_STOPS or target in ("ks", "g"):
        if f2 > F2_VELAR_MIN:
            return {"disorder_type": DISORDER_FRONTING,
                    "confidence": 0.63, "phoneme_produced": None}
        if jitter > JITTER_NORMAL_MAX and shimmer > SHIMMER_NORMAL_MAX:
            return {"disorder_type": DISORDER_DISTORTION,
                    "confidence": 0.58, "phoneme_produced": None}
        return {"disorder_type": DISORDER_NONE,
                "confidence": 0.48, "phoneme_produced": None}

    # ── 5. Alveolar stop targets (/t/, /d/, /tr/) ────────────────────────────
    # Backing: /t/ → /k/  detected by lower F2
    if target in FRONT_STOPS or target == "tr":
        if f2 and 0 < f2 < F2_ALVEOLAR_MAX:
            return {"disorder_type": DISORDER_BACKING,
                    "confidence": 0.58, "phoneme_produced": None}
        return {"disorder_type": DISORDER_NONE,
                "confidence": 0.45, "phoneme_produced": None}

    # ── 6. Bilabial stop targets (/p/, /b/) ──────────────────────────────────
    if target in ("p", "b"):
        if target == "p" and pitch > 160:
            return {"disorder_type": DISORDER_VOICING_ERROR,
                    "confidence": 0.58, "phoneme_produced": None}
        if target == "b" and pitch < 60:
            return {"disorder_type": DISORDER_VOICING_ERROR,
                    "confidence": 0.55, "phoneme_produced": None}
        return {"disorder_type": DISORDER_NONE,
                "confidence": 0.45, "phoneme_produced": None}

    # ── 7. Final consonant deletion ──────────────────────────────────────────
    if position == "final":
        # Very short duration suggests final consonant was omitted
        if duration < SINGLETON_MIN_DURATION:
            return {"disorder_type": DISORDER_FINAL_DELETION,
                    "confidence": 0.65, "phoneme_produced": None}

    # ── 8. Global distortion check ───────────────────────────────────────────
    # Only flag distortion if there is genuine voice quality evidence.
    # Thresholds: Awan & Mueller (1996) school-age children norms
    if jitter > JITTER_NORMAL_MAX and shimmer > SHIMMER_NORMAL_MAX:
        return {"disorder_type": DISORDER_DISTORTION,
                "confidence": 0.60, "phoneme_produced": None}
    if hnr is not None and hnr < HNR_NORMAL_MIN and jitter > 0.015:
        return {"disorder_type": DISORDER_DISTORTION,
                "confidence": 0.58, "phoneme_produced": None}

    # ── 9. No clear evidence ─────────────────────────────────────────────────
    # Rather than guessing, report none with low confidence.
    # The therapist correction loop will supply ground truth.
    return {"disorder_type": DISORDER_NONE,
            "confidence": 0.35, "phoneme_produced": None}


# ── Cross-check: validate ASR-based result against acoustics ─────────────────

def _acoustic_crosscheck(
    result: Dict, feat: Dict, word_info: Dict
) -> Dict:
    """
    After IPA-based classification, apply acoustic sanity checks.
    Specifically: if the IPA says the word was produced correctly (none),
    but voice quality is severely degraded, flag as distortion.
    """
    if result["disorder_type"] != DISORDER_NONE:
        return result  # only cross-check 'none' predictions

    jitter  = feat.get("jitter") or 0.0
    shimmer = feat.get("shimmer") or 0.0
    hnr     = feat.get("hnr")

    if jitter > JITTER_NORMAL_MAX * 1.5 and shimmer > SHIMMER_NORMAL_MAX * 1.5:
        return {"disorder_type": DISORDER_DISTORTION,
                "confidence": 0.62, "phoneme_produced": result.get("phoneme_produced")}
    if hnr is not None and hnr < 10.0:
        return {"disorder_type": DISORDER_DISTORTION,
                "confidence": 0.58, "phoneme_produced": result.get("phoneme_produced")}

    return result


# ── Main rule-based entry point ───────────────────────────────────────────────

def _detect_disorder_rule_based(
    feat: Dict, word_info: Dict, ipa_produced: str
) -> Dict:
    target   = word_info["phoneme_target"]
    position = word_info["position"]

    # 1. Omission — recording is silent or too short
    if feat.get("is_silent") or (feat.get("duration", 0) < MIN_AUDIO_DURATION):
        return {"disorder_type": DISORDER_OMISSION,
                "confidence": 0.95, "phoneme_produced": None}

    # 2. Near-silence — omission or severe distortion
    if feat.get("energy", 0) < SILENCE_THRESHOLD * 2:
        return {"disorder_type": DISORDER_OMISSION,
                "confidence": 0.80, "phoneme_produced": None}

    # 3. IPA-based classification (primary path when ASR works)
    produced = _find_phoneme_in_ipa(ipa_produced, target, position)

    if produced is not None:
        if produced == target:
            result = {"disorder_type": DISORDER_NONE,
                      "confidence": 0.82, "phoneme_produced": produced}
        else:
            disorder_type = _classify_substitution(target, produced, position)
            result = {"disorder_type": disorder_type,
                      "confidence": 0.74, "phoneme_produced": produced}
        # Acoustic cross-check even when ASR succeeds
        return _acoustic_crosscheck(result, feat, word_info)

    # 4. Acoustic-only path (ASR returned nothing)
    return _acoustic_heuristic(feat, word_info)


# ── Developmental appropriateness ────────────────────────────────────────────

def _is_developmentally_appropriate(
    disorder_type: Optional[str], word_info: Dict, age_months: Optional[int]
) -> bool:
    """
    Flag errors that are normal at the child's age based on phoneme
    acquisition norms (McLeod & Crowe, 2018, AJSLP).
    """
    if disorder_type in (None, DISORDER_NONE) or age_months is None:
        return False
    acq_min = word_info.get("acquisition_age_min_months", 0)
    return age_months < acq_min


# ── Public classify() ─────────────────────────────────────────────────────────

def classify(
    feat: Dict,
    word_info: Dict,
    transcription: str,
    ipa_produced: str,
    age_months: Optional[int],
    language: str,
    db=None,
) -> Dict:
    """Main classification entry point."""
    ml_model = _get_ml_model(language)

    if ml_model is not None:
        try:
            vector = build_feature_vector(feat, word_info)
            proba  = ml_model.predict_proba([vector])[0]
            classes = ml_model.classes_
            best_idx = proba.argmax()
            result = {
                "disorder_type":   classes[best_idx],
                "confidence":      float(proba[best_idx]),
                "phoneme_produced": None,
                "model_version":   getattr(ml_model, "_version_tag", "ml"),
            }
        except Exception as e:
            logger.warning(f"ML inference failed, falling back to rules: {e}")
            result = _detect_disorder_rule_based(feat, word_info, ipa_produced)
            result["model_version"] = "rule-based-fallback"
    else:
        result = _detect_disorder_rule_based(feat, word_info, ipa_produced)
        result["model_version"] = "rule-based"

    result["is_developmentally_appropriate"] = _is_developmentally_appropriate(
        result.get("disorder_type"), word_info, age_months
    )
    return result
