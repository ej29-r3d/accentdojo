"""Decode uploaded recordings to 16 kHz mono float32.

The upload passes through a temp file that is deleted as soon as ffmpeg returns: in
/dev/shm (RAM) where that exists, otherwise in the system temp directory.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile

import numpy as np

log = logging.getLogger("accentdojo.audio")

SR = 16000
# MP4 from iOS Safari needs a seekable input, so the upload goes to a RAM-backed temp
# file (deleted in `finally`) rather than a pipe.
_TMP_DIR = "/dev/shm" if os.path.isdir("/dev/shm") else None
TIMEOUT_S = 20


class DecodeError(RuntimeError):
    pass


def decode(data: bytes, max_seconds: float | None = None) -> np.ndarray:
    """``max_seconds`` stops ffmpeg there, so a small file cannot expand into hours of samples."""
    fd, path = tempfile.mkstemp(prefix="accentdojo-", dir=_TMP_DIR)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        # The whitelist keeps a crafted playlist or container from making ffmpeg open URLs.
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file", "-i", path,
             *(["-t", str(max_seconds)] if max_seconds else []),
             "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(SR), "-"],
            capture_output=True, check=False, timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        log.warning("ffmpeg timed out after %d s on a %d-byte upload", TIMEOUT_S, len(data))
        raise DecodeError("ffmpeg timed out") from None
    finally:
        os.unlink(path)
    if result.returncode != 0:
        # ffmpeg's message stays in the log: it names server paths and library versions.
        log.warning("ffmpeg failed: %s", result.stderr.decode("utf-8", "replace").strip()[:300])
        raise DecodeError("ffmpeg failed")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()
