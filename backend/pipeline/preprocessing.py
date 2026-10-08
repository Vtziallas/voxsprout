from __future__ import annotations
import numpy as np
import librosa
import noisereduce as nr
from config import SAMPLE_RATE


def _load_raw_audio(audio_path: str, target_sr: int):
    """
    Load audio in any format (webm, ogg, mp4, wav, ...) to a float32 numpy array.
    Uses PyAV first (bundles its own ffmpeg, no system install needed).
    Falls back to librosa if av is not available.
    """
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
            return np.concatenate(chunks).astype(np.float32), target_sr
    except Exception:
        pass

    # Fallback: librosa (requires system ffmpeg for webm/ogg)
    return librosa.load(audio_path, sr=target_sr, mono=True)


def load_and_clean(audio_path: str):
    """
    Load an audio file (any format), resample to 16kHz, apply noise reduction,
    trim leading/trailing silence, and normalize amplitude.

    Returns:
        audio (np.ndarray): cleaned mono audio signal
        sr (int): sample rate (always SAMPLE_RATE)
    """
    audio, sr = _load_raw_audio(audio_path, SAMPLE_RATE)

    # Noise reduction using the first 0.3s as noise profile (if long enough)
    if len(audio) > sr * 0.5:
        noise_sample = audio[:int(sr * 0.3)]
        audio = nr.reduce_noise(y=audio, sr=sr, y_noise=noise_sample, prop_decrease=0.8)

    # Trim silence
    audio, _ = librosa.effects.trim(audio, top_db=25)

    # Normalize amplitude
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.95

    return audio, SAMPLE_RATE
