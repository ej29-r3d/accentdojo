"""Contract tests. Models are not loaded: warm-up is skipped and the scorer is stubbed."""

import io
import subprocess
import time
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from accentdojo import app as app_module
from accentdojo import audio, content, g2p
from accentdojo.scoring import band_of, severity_of


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.Engine, "warm", lambda self: None)
    monkeypatch.setenv("ACCENTDOJO_AUDIO_CACHE", str(tmp_path))
    monkeypatch.setattr(app_module, "TAKES_DIR", tmp_path / "takes")
    monkeypatch.setattr(app_module, "KEEP_TAKES", False)
    with TestClient(app_module.app) as c:
        yield c


def test_topics_and_phrases(client):
    topics = client.get("/api/topics").json()
    assert {"id", "group", "name", "blurb", "symbol", "counts"} <= topics[0].keys()
    assert {t["group"] for t in topics} == set(content.GROUPS)
    assert all(bool(t["symbol"]) == (t["group"] == "sounds") for t in topics)
    # Every sound has a guide; a diagram, when present, is a file the frontend serves.
    root = Path(__file__).resolve().parents[2] / "frontend" / "public"
    for t in topics:
        assert bool(t["guide"]) == (t["group"] == "sounds")
        if t["guide"]:
            assert t["guide"]["how"] and t["guide"]["tip"]
            if "diagram" in t["guide"]:
                assert (root / t["guide"]["diagram"]["src"].lstrip("/")).is_file()
                assert t["guide"]["diagram"]["credit"]
    assert all(bool(t["section"]) == (t["group"] == "sounds") for t in topics)
    assert set(topics[0]["counts"]) == set(content.LEVELS) == {"beginner", "intermediate", "advanced"}
    t = topics[0]["id"]
    phrases = client.get(f"/api/topics/{t}/phrases", params={"level": "beginner"}).json()
    assert len(phrases) == topics[0]["counts"]["beginner"]
    p = phrases[0]
    assert p["id"] == f"{t}.beginner.0" and p["level"] == "beginner" and p["topicId"] == t
    assert all(w["phonemes"] for w in p["words"])
    assert client.get("/api/topics/nope").json()["code"] == "not_found"
    assert client.get(f"/api/topics/{t}/phrases", params={"level": "expert"}).status_code == 422


def test_random_excludes(client):
    for _ in range(10):
        p = client.get("/api/phrases/random", params={"level": "intermediate", "exclude": "travel.intermediate.0"}).json()
        assert p["level"] == "intermediate" and p["id"] != "travel.intermediate.0"


def test_prepare(client):
    r = client.post("/api/phrases/prepare", json={"text": "  Nice   to meet you, Tavin! "}).json()
    assert r["text"] == "Nice to meet you, Tavin!" and r["level"] is None and r["topicId"] is None
    assert [w["text"] for w in r["words"]] == ["Nice", "to", "meet", "you,", "Tavin!"]
    again = client.post("/api/phrases/prepare", json={"text": "Nice to meet you, Tavin!"}).json()
    assert again["id"] == r["id"]
    assert content.Content().phrase(r["id"]).text == r["text"]
    long = " ".join(["word"] * 16)
    bad = client.post("/api/phrases/prepare", json={"text": long})
    assert bad.status_code == 422 and bad.json()["code"] == "invalid"
    assert client.post("/api/phrases/prepare", json={"text": " ?! "}).status_code == 422


def test_score_shape_and_limits(client, monkeypatch):
    engine = app_module.engine
    assert client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.wav", b"x")}).status_code == 503
    engine.scorer.ready = True
    monkeypatch.setattr(engine.scorer, "score",
                        lambda p, wav, ref=None: {"status": "unscorable", "phraseId": p.id, "reason": "too_short"})
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setparams((1, 2, 16000, 0, "NONE", "NONE"))
        w.writeframes(b"\0\0" * 8000)
    r = client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.wav", buf.getvalue(), "audio/wav")},
                    data={"durationMs": "500"})
    assert r.json() == {"status": "unscorable", "phraseId": "travel.beginner.0", "reason": "too_short"}
    assert client.post("/api/phrases/nope/score", files={"audio": ("a.wav", b"x")}).status_code == 404
    big = client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.wav", b"\0" * (3 << 20))})
    assert big.status_code == 413
    # Under the request cap but over the upload cap: refused by the route itself.
    big = client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.wav", b"\0" * ((2 << 20) + 1))})
    assert big.status_code == 413 and big.json()["message"] == "Recording too large."
    bad = client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.webm", b"not audio")})
    assert bad.status_code == 422 and bad.json() == {"code": "invalid", "message": "Could not read the recording."}
    long = io.BytesIO()
    with wave.open(long, "wb") as w:
        w.setparams((1, 2, 8000, 0, "NONE", "NONE"))
        w.writeframes(b"\0\0" * 8000 * 40)
    r = client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.wav", long.getvalue(), "audio/wav")})
    assert r.status_code == 413 and "too long" in r.json()["message"]


def test_decode_stops_at_the_cap_and_survives_a_timeout(monkeypatch):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setparams((1, 2, 8000, 0, "NONE", "NONE"))
        w.writeframes(b"\0\0" * 8000 * 40)
    assert len(audio.decode(buf.getvalue(), 16)) == 16 * audio.SR
    assert len(audio.decode(buf.getvalue())) == 40 * audio.SR

    def hang(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, kwargs["timeout"])
    monkeypatch.setattr(subprocess, "run", hang)
    with pytest.raises(audio.DecodeError):
        audio.decode(buf.getvalue())


def test_takes_are_kept_only_on_request(client, monkeypatch, tmp_path):
    engine = app_module.engine
    engine.scorer.ready = True
    monkeypatch.setattr(engine.scorer, "score",
                        lambda p, wav, ref=None: {"status": "unscorable", "phraseId": p.id, "reason": "too_short"})
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setparams((1, 2, 16000, 0, "NONE", "NONE"))
        w.writeframes(b"\0\0" * 8000)

    def post():
        return client.post("/api/phrases/travel.beginner.0/score", files={"audio": ("a.wav", buf.getvalue(), "audio/wav")})

    assert post().status_code == 200
    assert not (tmp_path / "takes").exists()
    monkeypatch.setattr(app_module, "KEEP_TAKES", True)
    assert post().status_code == 200
    assert sorted(f.suffix for f in (tmp_path / "takes").iterdir()) == [".json", ".wav"]


def test_body_limits_apply_before_auth(client, monkeypatch):
    monkeypatch.setattr(app_module, "PASSWORD", "x")
    too_large = {"code": "unknown", "message": "Request too large."}
    r = client.post("/api/login", json={"password": "x" * 5000})
    assert r.status_code == 413 and r.json() == too_large
    # No Content-Length (chunked): counted as it arrives.
    r = client.post("/api/login", content=iter([b'{"password": "', b"x" * 5000, b'"}']),
                    headers={"content-type": "application/json"})
    assert "content-length" not in r.request.headers
    assert r.status_code == 413 and r.json() == too_large
    # A Content-Length that understates the body.
    r = client.post("/api/login", content=b'{"password": "' + b"x" * 5000 + b'"}',
                    headers={"content-type": "application/json", "content-length": "20"})
    assert r.status_code == 413 and r.json() == too_large
    # Not signed in: the size is checked first, and a normal-sized request gets the usual 401.
    r = client.post("/api/phrases/prepare", content=b"x" * ((3 << 20) + 1))
    assert r.status_code == 413 and r.json() == too_large
    assert client.post("/api/phrases/prepare", json={"text": "hello"}).status_code == 401
    assert client.post("/api/login", json={"password": "x"}).status_code == 200


def test_audio_names_are_ours(client):
    assert client.get("/api/audio/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get("/api/audio/deadbeef.wav").status_code == 404


def test_rules():
    assert [band_of(x) for x in (10, 60, 80, 95)] == [1, 2, 3, 4]
    assert [severity_of(x) for x in (0.05, 0.2, 0.6)] == [None, "minor", "major"]
    assert severity_of(0.0, missing=True) == "major"


def test_stress_marks():
    words = {w.text: w.phonemes for w in g2p.words_of("station? penicillin cat")}
    assert words["station?"] == ["ˈs", "t", "eɪ", "ʃ", "ə", "n"]
    assert words["penicillin"][0] == "ˌp" and "ˈs" in words["penicillin"]
    assert words["cat"] == ["k", "æ", "t"]


def test_password_gate(client, monkeypatch):
    monkeypatch.setattr(app_module, "PASSWORD", "open sesame")
    monkeypatch.setattr(app_module, "LOGIN_FAIL_DELAY_S", 0.0)
    assert client.get("/api/session").json() == {"required": True, "authenticated": False}
    r = client.get("/api/topics")
    assert r.status_code == 401 and r.json()["code"] == "unauthorized"
    assert client.get("/api/health").status_code == 200
    assert client.post("/api/login", json={"password": "nope"}).status_code == 401
    ok = client.post("/api/login", json={"password": "open sesame"})
    assert ok.status_code == 200 and "accentdojo_session" in ok.headers["set-cookie"]
    # A cookie that is not ASCII is refused, not a crash.
    assert client.get("/api/topics", headers={"cookie": b"accentdojo_session=\xff\xfe"}).status_code == 401
    client.cookies.set("accentdojo_session", app_module._token())
    assert client.get("/api/topics").status_code == 200
    assert client.get("/api/session").json()["authenticated"] is True


def test_login_throttles_failures_only(client, monkeypatch):
    monkeypatch.setattr(app_module, "PASSWORD", "x")
    monkeypatch.setattr(app_module, "LOGIN_FAIL_DELAY_S", 0.05)
    monkeypatch.setattr(app_module, "_next_fail", 0.0)
    t = time.monotonic()
    assert [client.post("/api/login", json={"password": "bad"}).status_code for _ in range(12)] == [401] * 12
    assert time.monotonic() - t >= 12 * 0.05
    # However many wrong guesses came before, the right password gets in, and at once.
    t = time.monotonic()
    assert client.post("/api/login", json={"password": "x"}).status_code == 200
    assert time.monotonic() - t < 0.5
    # With a long queue of wrong guesses ahead, another one is turned away without waiting...
    monkeypatch.setattr(app_module, "_next_fail", time.monotonic() + 60)
    r = client.post("/api/login", json={"password": "bad"})
    assert r.status_code == 429 and r.headers["retry-after"] == "10"
    # ...and does not lengthen the queue, and the right password still gets in.
    assert app_module._next_fail < time.monotonic() + 60
    assert client.post("/api/login", json={"password": "x"}).status_code == 200


def test_spa_fallback(client, monkeypatch, tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "a.js").write_text("js")
    monkeypatch.setattr(app_module, "DIST", tmp_path)
    assert client.get("/practice/topic/travel/0").text == "<html>app</html>"
    assert client.get("/assets/a.js").headers["cache-control"].endswith("immutable")
    assert client.get("/../backend/accentdojo/app.py").text == "<html>app</html>"
    assert client.get("/api/nope").status_code == 404
    assert client.get("/assets/gone.js").status_code == 404
    assert client.head("/").status_code == 200
