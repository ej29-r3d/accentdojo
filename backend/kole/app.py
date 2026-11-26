"""AccentDojo API (spec/openapi.yaml). One process, one inference at a time, models warmed at startup."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import random
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import audio, content, scoring
from .scoring import Scorer
from .tts import Tts

log = logging.getLogger("kole")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MAX_UPLOAD_BYTES = 2 * 1024 * 1024
#: Whole-request caps, enforced before auth and before anything is buffered: the recording
#: plus multipart framing, and a login body that only ever holds one short password.
MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024
MAX_LOGIN_BODY_BYTES = 4096
#: Off by default: a recording is someone's voice. KOLE_KEEP_TAKES=1 keeps every take and its
#: result here to calibrate the detectors. Git-ignored, never committed.
KEEP_TAKES = os.environ.get("KOLE_KEEP_TAKES") == "1"
TAKES_DIR = Path(__file__).resolve().parents[1] / ".cache" / "takes"
MAX_SECONDS = 15.0
#: Requests allowed to wait for the inference lane before new ones get 503.
MAX_WAITING = 4


class Engine:
    """Content plus the two models, with a single inference lane shared by TTS and scoring."""

    def __init__(self) -> None:
        self.content = content.Content()
        self.tts = Tts()
        self.scorer = Scorer()
        self.lane = threading.Lock()
        self.waiting = 0
        self._count = threading.Lock()

    def run(self, fn, *args):
        with self._count:
            if self.waiting >= MAX_WAITING:
                raise HTTPException(503, "Busy, try again in a moment.", headers={"Retry-After": "2"})
            self.waiting += 1
        try:
            with self.lane:
                return fn(*args)
        finally:
            with self._count:
                self.waiting -= 1

    def warm(self) -> None:
        t = time.perf_counter()
        with self.lane:
            self.scorer.load()
        log.info("scorer ready in %.1f s", time.perf_counter() - t)
        t = time.perf_counter()
        with self.lane:
            self.tts.load()
        log.info("tts ready in %.1f s", time.perf_counter() - t)
        # Pre-render every built-in phrase so Listen is instant; one at a time so takes
        # being scored only ever wait for one synthesis.
        n = 0
        for p in self.content.phrases.values():
            if self.tts.cached(p.text) is None:
                with self.lane:
                    self.tts.render(p.text)
                n += 1
            self.reference_info(p, lane=True)
        log.info("pre-rendered %d reference clips (word times and ceilings cached)", n)

    def reference_info(self, phrase: content.Phrase, lane: bool = False) -> dict | None:
        """Word times and utterance total of the reference clip, computed once, cached next to the WAV."""
        hit = self.tts.cached(phrase.text)
        if hit is None or not self.scorer.ready:
            return None
        path = self.tts.times_path(hit[0])
        if path.is_file():
            cached = json.loads(path.read_text())
            if isinstance(cached, dict) and cached.get("version") == scoring.REF_VERSION:
                return cached
        wav = audio.decode((self.tts.cache_dir / hit[0]).read_bytes())
        if lane:
            with self.lane:
                info = self.scorer.reference_info(phrase, wav)
        else:
            info = self.run(self.scorer.reference_info, phrase, wav)
        path.write_text(json.dumps(info))
        return info


engine: Engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    if not PASSWORD:
        log.warning("KOLE_PASSWORD is not set: running WITHOUT a password. Fine on localhost; "
                    "set it before exposing this port to a network.")
    engine = Engine()
    threading.Thread(target=engine.warm, name="warm", daemon=True).start()
    yield


app = FastAPI(title="AccentDojo API", version="0.1.0", lifespan=lifespan, docs_url="/api/docs",
              openapi_url="/api/openapi.json")

# ---------------------------------------------------------------------------
# Shared password (public deployment). Off when KOLE_PASSWORD is unset.
# ---------------------------------------------------------------------------

PASSWORD = os.environ.get("KOLE_PASSWORD", "")
COOKIE = "kole_session"
OPEN_PATHS = {"/api/health", "/api/session", "/api/login"}
#: Wrong passwords are answered one at a time, this far apart, so guessing is slow for everyone
#: while the right password is never refused (one global queue: a shared password has no users).
LOGIN_FAIL_DELAY_S = 1.0
#: Wrong guesses already queued this far ahead get 429 at once instead of holding a connection.
LOGIN_MAX_WAIT_S = 10.0
#: time.monotonic() at which the next wrong guess may be answered.
_next_fail = 0.0


def _token() -> str:
    """Session cookie value: derived from the password, so changing it signs everyone out."""
    return hmac.new(PASSWORD.encode(), b"kole-session-v1", hashlib.sha256).hexdigest()


def _authed(request: Request) -> bool:
    # Bytes: compare_digest raises on a non-ASCII str, and the cookie is whatever the client sent.
    return not PASSWORD or hmac.compare_digest(request.cookies.get(COOKIE, "").encode(), _token().encode())


@app.middleware("http")
async def require_password(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in OPEN_PATHS and not _authed(request):
        return error(401, "unauthorized", "Password needed.")
    return await call_next(request)


class BodyLimit:
    """Refuses oversized request bodies: by Content-Length up front, and by counting as the body
    streams for requests without one (or with a false one). Outermost, so it runs before auth."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = MAX_LOGIN_BODY_BYTES if scope["path"] == "/api/login" else MAX_BODY_BYTES
        too_large = error(413, "unknown", "Request too large.")
        declared = dict(scope["headers"]).get(b"content-length", b"")
        if declared.isdigit() and int(declared) > limit:
            return await too_large(scope, receive, send)
        seen, refused, started = 0, False, False

        async def capped():
            nonlocal seen, refused
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > limit:
                    refused = True
                    raise HTTPException(413, "Request too large.")
            return message

        async def relay(message) -> None:
            # Layers below may turn that exception into a 400 or a 500 of their own; drop it.
            nonlocal started
            if not refused:
                started = True
                await send(message)

        try:
            await self.app(scope, capped, relay)
        except Exception:
            if not refused:
                raise
        if refused and not started:
            await too_large(scope, receive, send)


app.add_middleware(BodyLimit)


@app.get("/api/session")
def session(request: Request):
    return {"required": bool(PASSWORD), "authenticated": _authed(request)}


class LoginBody(BaseModel):
    password: str


@app.post("/api/login")
async def login(body: LoginBody, response: Response):
    global _next_fail
    if not PASSWORD or not hmac.compare_digest(body.password.strip().encode(), PASSWORD.encode()):
        now = time.monotonic()
        wait = max(_next_fail - now, 0.0) + LOGIN_FAIL_DELAY_S
        if wait > LOGIN_MAX_WAIT_S:
            raise HTTPException(429, "Too many attempts. Try again in a moment.", headers={"Retry-After": "10"})
        _next_fail = now + wait
        await asyncio.sleep(wait)  # on the event loop: no worker thread is held, other routes go on
        raise HTTPException(401, "Wrong password.")
    response.set_cookie(COOKIE, _token(), max_age=365 * 24 * 3600, httponly=True, secure=True, samesite="lax")
    return {"ok": True}


def error(status: int, code: str, message: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"code": code, "message": message}, status_code=status, headers=headers)


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    code = {401: "unauthorized", 404: "not_found", 422: "invalid"}.get(exc.status_code, "unknown")
    return error(exc.status_code, code, str(exc.detail), getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(x) for x in first.get("loc", []))
    return error(422, "invalid", f"{where}: {first.get('msg', 'invalid input')}")


def phrase_or_404(phrase_id: str) -> content.Phrase:
    p = engine.content.phrase(phrase_id)
    if p is None:
        raise HTTPException(404, f"No phrase {phrase_id}")
    return p


def topic_or_404(topic_id: str) -> content.Topic:
    t = engine.content.topics.get(topic_id)
    if t is None:
        raise HTTPException(404, f"No topic {topic_id}")
    return t


@app.get("/api/health")
def health():
    return {"ok": True, "ttsReady": engine.tts.ready, "scorerReady": engine.scorer.ready}


@app.get("/api/topics")
def list_topics():
    return [t.to_json() for t in engine.content.topics.values()]


@app.get("/api/topics/{topic_id}")
def get_topic(topic_id: str):
    return topic_or_404(topic_id).to_json()


def _level(level: str) -> str:
    if level not in content.LEVELS:
        raise HTTPException(422, f"level must be one of {', '.join(content.LEVELS)}")
    return level


@app.get("/api/topics/{topic_id}/phrases")
def list_phrases(topic_id: str, level: str = Query(...)):
    t = topic_or_404(topic_id)
    return [p.to_json() for p in t.phrases[_level(level)]]


@app.get("/api/phrases/random")
def random_phrase(level: str = Query(...), exclude: str | None = None):
    pool = [p for p in engine.content.by_level(_level(level)) if p.id != exclude]
    if not pool:
        raise HTTPException(404, "No phrases at this level")
    return random.choice(pool).to_json()


class PrepareBody(BaseModel):
    text: str


@app.post("/api/phrases/prepare")
def prepare_phrase(body: PrepareBody):
    try:
        return content.prepare(body.text).to_json()
    except content.InvalidPhrase as e:
        raise HTTPException(422, str(e)) from None


@app.get("/api/phrases/{phrase_id}/reference")
def reference_audio(phrase_id: str):
    p = phrase_or_404(phrase_id)
    hit = engine.tts.cached(p.text)
    if hit is None:
        if not engine.tts.ready:
            raise HTTPException(503, "Voice still loading.", headers={"Retry-After": "5"})
        hit = engine.run(engine.tts.render, p.text)
    name, duration_ms = hit
    info = engine.reference_info(p)
    return {"url": f"/api/audio/{name}", "durationMs": duration_ms,
            "words": info["words"] if info else [{"startMs": None, "endMs": None} for _ in p.words]}


@app.get("/api/audio/{file}")
def get_audio(file: str):
    path = engine.tts.path(file)
    if path is None:
        raise HTTPException(404, f"No audio {file}")
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "public, max-age=31536000, immutable"})


def _keep_take(p: content.Phrase, data: bytes, mime: str | None, duration_ms: int | None, result: dict) -> None:
    if not KEEP_TAKES:
        return
    try:
        TAKES_DIR.mkdir(parents=True, exist_ok=True)
        ext = {"audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav"}.get((mime or "").split(";")[0], "webm")
        stem = f"{datetime.now():%Y%m%d-%H%M%S-%f}-{p.id[:60].replace('/', '_')}"
        (TAKES_DIR / f"{stem}.{ext}").write_bytes(data)
        (TAKES_DIR / f"{stem}.json").write_text(json.dumps(
            {"phraseId": p.id, "text": p.text, "clientDurationMs": duration_ms, "result": result}, ensure_ascii=False, indent=1))
    except OSError as e:
        log.warning("could not keep take: %s", e)


@app.post("/api/phrases/{phrase_id}/score")
def score_attempt(phrase_id: str, audio_file: UploadFile = File(..., alias="audio"),
                  durationMs: int | None = Form(None)):
    p = phrase_or_404(phrase_id)
    if not engine.scorer.ready:
        raise HTTPException(503, "Scorer still loading.", headers={"Retry-After": "5"})
    data = audio_file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Recording too large.")
    t0 = time.perf_counter()
    try:
        # In the lane, so a burst of uploads cannot run a crowd of ffmpeg processes. One second
        # over the limit is decoded, enough for the length check below and no more.
        wav = engine.run(audio.decode, data, MAX_SECONDS + 1)
    except audio.DecodeError:
        raise HTTPException(422, "Could not read the recording.") from None
    if len(wav) > MAX_SECONDS * audio.SR:
        raise HTTPException(413, "Recording too long (over 15 s).")
    t1 = time.perf_counter()
    # The shown score is relative to Kokoro's reading of the same phrase; typed phrases get
    # their reference rendered here if Listen was never pressed (once, then cached).
    if engine.tts.cached(p.text) is None and engine.tts.ready:
        engine.run(engine.tts.render, p.text)
    info = engine.reference_info(p)
    result = engine.run(engine.scorer.score, p, wav, info)
    t2 = time.perf_counter()
    _keep_take(p, data, audio_file.content_type, durationMs, result)
    log.info("score %s: %.2f s audio, client %s ms, queue+decode %.0f ms, queue+score %.0f ms -> %s",
             p.id, len(wav) / audio.SR, durationMs, (t1 - t0) * 1000, (t2 - t1) * 1000,
             result.get("band", result.get("reason")))
    return result


# ---------------------------------------------------------------------------
# The production build of the frontend (frontend/dist), served from the same origin.
# ---------------------------------------------------------------------------

DIST = Path(os.environ.get("KOLE_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist")).resolve()


@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def frontend(path: str):
    if path.startswith("api/") or not (DIST / "index.html").is_file():
        raise HTTPException(404, "Not found")
    target = (DIST / path).resolve()
    if path and target.is_file() and target.is_relative_to(DIST):
        hashed = path.startswith("assets/")
        cache = "public, max-age=31536000, immutable" if hashed else "no-cache"
        return FileResponse(target, headers={"Cache-Control": cache})
    if path.startswith("assets/"):  # a missing bundle file is an error, not a page
        raise HTTPException(404, "Not found")
    # Client-side routes (/topics, /practice/...) get the app shell.
    return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
