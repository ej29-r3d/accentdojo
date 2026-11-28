"""Reference voice: Kokoro-82M, cached per (engine, voice, speed, text) as a WAV file."""

from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path

import numpy as np
import soundfile as sf

ENGINE = "kokoro-82m-v1.0"
VOICE = os.environ.get("ACCENTDOJO_VOICE", "af_heart")  # American English
SPEED = 1.0
SAMPLE_RATE = 24000
DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "audio"


class Tts:
    def __init__(self, cache_dir: Path | None = None):
        self.cache_dir = cache_dir or Path(os.environ.get("ACCENTDOJO_AUDIO_CACHE", DEFAULT_CACHE_DIR))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.pipeline = None

    def load(self) -> None:
        from kokoro import KPipeline

        self.pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
        self.synthesize("Hello there.")  # warm-up

    @property
    def ready(self) -> bool:
        return self.pipeline is not None

    def key(self, text: str) -> str:
        return hashlib.sha1(f"{ENGINE}|{VOICE}|{SPEED}|{text}".encode()).hexdigest()[:20]

    def path(self, name: str) -> Path | None:
        """Cached file by served name, or None (names are only ever ours: hex + .wav)."""
        stem, _, ext = name.partition(".")
        if ext != "wav" or not stem.isalnum():
            return None
        p = self.cache_dir / name
        return p if p.is_file() else None

    def cached(self, text: str) -> tuple[str, int] | None:
        p = self.cache_dir / f"{self.key(text)}.wav"
        if not p.is_file():
            return None
        return p.name, int(round(sf.info(p).duration * 1000))

    def times_path(self, name: str) -> Path:
        return self.cache_dir / name.replace(".wav", ".words.json")

    def synthesize(self, text: str) -> np.ndarray:
        assert self.pipeline is not None
        parts = [r.audio.detach().cpu().numpy() for r in self.pipeline(text, voice=VOICE, speed=SPEED)
                 if r.audio is not None]
        if not parts:
            raise RuntimeError(f"Kokoro produced no audio for {text!r}")
        return np.concatenate(parts).astype(np.float32)

    def render(self, text: str) -> tuple[str, int]:
        """Synthesize to the cache (atomically) and return (file name, duration ms)."""
        wav = self.synthesize(text)
        # A little lead-in and tail so playback does not clip the first and last sounds.
        pad = np.zeros(int(0.08 * SAMPLE_RATE), dtype=np.float32)
        wav = np.concatenate([pad, wav, pad])
        name = f"{self.key(text)}.wav"
        buf = io.BytesIO()
        sf.write(buf, wav, SAMPLE_RATE, subtype="PCM_16", format="WAV")
        tmp = self.cache_dir / f".{name}.tmp"
        tmp.write_bytes(buf.getvalue())
        tmp.replace(self.cache_dir / name)
        return name, int(round(len(wav) / SAMPLE_RATE * 1000))

