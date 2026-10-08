"""
ASR module — speech to text + Greek/English IPA conversion.

Greek:  jonatasgrosman/wav2vec2-large-xlsr-53-greek (auto-downloads on first use ~1.2GB)
English: facebook/wav2vec2-base-960h (auto-downloads on first use ~360MB)

Both models are cached in HuggingFace's default cache (~/.cache/huggingface).
"""
from __future__ import annotations
import unicodedata
import torch
import numpy as np
import logging
from typing import Tuple, Optional
from config import SAMPLE_RATE

logger = logging.getLogger(__name__)

# ── Lazy model cache ──────────────────────────────────────────────────────────
_models: dict = {}

# HuggingFace model IDs
_MODEL_IDS = {
    "el": "jonatasgrosman/wav2vec2-large-xlsr-53-greek",
    "en": "facebook/wav2vec2-base-960h",
}


def _load_audio(audio_path: str, target_sr: int) -> np.ndarray:
    """Load any audio format (webm, ogg, wav) to float32 numpy array via PyAV."""
    try:
        import av
        container = av.open(audio_path)
        resampler = av.audio.resampler.AudioResampler(
            format="fltp", layout="mono", rate=target_sr
        )
        chunks = []
        for frame in container.decode(audio=0):
            frame.pts = None
            for rf in resampler.resample(frame):
                chunks.append(rf.to_ndarray().flatten())
        container.close()
        if chunks:
            return np.concatenate(chunks).astype(np.float32)
    except Exception:
        pass

    # Fallback: librosa
    import librosa
    audio, _ = librosa.load(audio_path, sr=target_sr, mono=True)
    return audio


def _load_model(language: str) -> Optional[tuple]:
    if language in _models:
        return _models[language]

    model_id = _MODEL_IDS.get(language)
    if not model_id:
        logger.warning(f"No ASR model configured for language '{language}'")
        _models[language] = None
        return None

    try:
        from transformers import Wav2Vec2Processor, Wav2Vec2ForCTC
        logger.info(f"Loading ASR model for '{language}': {model_id} (may download on first run)")
        processor = Wav2Vec2Processor.from_pretrained(model_id)
        model = Wav2Vec2ForCTC.from_pretrained(model_id)
        model.eval()
        _models[language] = (processor, model)
        logger.info(f"ASR model ready for '{language}'")
        return processor, model
    except Exception as e:
        logger.warning(f"Could not load ASR model for '{language}': {e}")
        _models[language] = None
        return None


# ── Greek IPA mapping ─────────────────────────────────────────────────────────
GREEK_TO_IPA = {
    "ου": "u", "ει": "i", "οι": "i", "αυ": "af", "ευ": "ef",
    "μπ": "b", "ντ": "d", "γκ": "g", "τσ": "ts", "τζ": "dz",
    "α": "a", "β": "v", "γ": "ɣ", "δ": "ð", "ε": "e",
    "ζ": "z", "η": "i", "θ": "θ", "ι": "i", "κ": "k",
    "λ": "l", "μ": "m", "ν": "n", "ξ": "ks", "ο": "o",
    "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t",
    "υ": "i", "φ": "f", "χ": "x", "ψ": "ps", "ω": "o",
    "ά": "a", "έ": "e", "ή": "i", "ί": "i", "ό": "o",
    "ύ": "i", "ώ": "o",
}


def _greek_to_ipa(text: str) -> str:
    text = unicodedata.normalize("NFC", text.lower().strip())
    result = []
    i = 0
    while i < len(text):
        if i < len(text) - 1 and text[i:i+2] in GREEK_TO_IPA:
            result.append(GREEK_TO_IPA[text[i:i+2]])
            i += 2
        elif text[i] in GREEK_TO_IPA:
            result.append(GREEK_TO_IPA[text[i]])
            i += 1
        elif text[i].isspace():
            result.append(" ")
            i += 1
        else:
            i += 1
    return " ".join(result)


def _english_to_ipa(text: str) -> str:
    """Basic English passthrough — good enough for logging/display."""
    return text.lower()


def transcribe(audio_path: str, language: str) -> Tuple[str, str]:
    """
    Transcribe audio and return (raw_text, ipa_text).
    Returns ("", "") on failure.
    """
    try:
        result = _load_model(language)
        if result is None:
            return "", ""

        processor, model = result
        audio = _load_audio(audio_path, SAMPLE_RATE)

        if len(audio) == 0:
            return "", ""

        inputs = processor(audio, return_tensors="pt", sampling_rate=SAMPLE_RATE).input_values

        with torch.no_grad():
            logits = model(inputs).logits

        predicted_ids = torch.argmax(logits, dim=-1)
        text = processor.batch_decode(predicted_ids)[0].lower().strip()

        ipa = _greek_to_ipa(text) if language == "el" else _english_to_ipa(text)
        return text, ipa

    except Exception as e:
        logger.warning(f"Transcription failed for '{audio_path}': {e}")
        return "", ""
