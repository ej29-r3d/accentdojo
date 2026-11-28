"""Latency and sanity benchmark on this machine.

Renders every built-in phrase with Kokoro (cold, cache bypassed), scores Kokoro's own
reading of each (should land in the top bands), then a few takes that must come back
unscorable or low. Prints per-step timings.

    .venv/bin/python scripts/bench.py
"""

import tempfile
import time
from pathlib import Path

import numpy as np

from accentdojo import audio, content
from accentdojo.scoring import Scorer
from accentdojo.tts import Tts


def ms(t):
    return (time.perf_counter() - t) * 1000


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]


def summary(name, xs):
    print(f"{name:34s} n={len(xs):3d}  p50 {pct(xs, .5):6.0f} ms  p95 {pct(xs, .95):6.0f} ms  max {max(xs):6.0f} ms")


c = content.Content()
t = time.perf_counter(); scorer = Scorer(); scorer.load(); print(f"scorer load+warm {ms(t)/1000:.1f} s")
tmp = Path(tempfile.mkdtemp(prefix="accentdojo-bench-"))
t = time.perf_counter(); tts = Tts(tmp); tts.load(); print(f"tts load+warm    {ms(t)/1000:.1f} s")

tts_ms, dec_ms, score_ms, durs, bands, rows = [], [], [], [], {}, []
for p in c.phrases.values():
    t = time.perf_counter(); name, dur = tts.render(p.text); tts_ms.append(ms(t)); durs.append(dur)
    data = (tmp / name).read_bytes()
    t = time.perf_counter(); wav = audio.decode(data); dec_ms.append(ms(t))
    t = time.perf_counter(); r = scorer.score(p, wav); score_ms.append(ms(t))
    key = r.get("band", r.get("reason"))
    bands[key] = bands.get(key, 0) + 1
    flagged = [(p.words[w["index"]].text, w["severity"], w["kinds"]) for w in r.get("words", [])]
    notes = [k for k in ("pauses", "pace") if r.get(k)] + (["flat"] if r.get("intonation", {}).get("flat") else [])
    rows.append((p.id, key, r.get("score"), flagged, notes))

print(f"\nclip length: p50 {pct(durs,.5)/1000:.1f} s, max {max(durs)/1000:.1f} s")
summary("Kokoro synth (uncached)", tts_ms)
summary("ffmpeg decode wav->16k", dec_ms)
summary("score (gates + OpenPronounce)", score_ms)
print("Kokoro's own readings by band/reason:", bands)
for row in rows:
    if row[1] not in (3, 4) or row[3] or row[4]:
        print("   ", row)

# Negative checks
sr = audio.SR
p = c.phrases["travel.intermediate.0"]
other = c.phrases["food.advanced.0"]
wrong = audio.decode((tmp / tts.render(other.text)[0]).read_bytes())
rng = np.random.default_rng(1)
cases = {
    "silence 2 s": np.zeros(sr * 2, np.float32),
    "0.3 s blip": rng.normal(0, .1, int(sr * .3)).astype(np.float32),
    "white noise 3 s": rng.normal(0, .2, sr * 3).astype(np.float32),
    "different phrase": wrong,
    "right phrase + loud noise": audio.decode((tmp / tts.render(p.text)[0]).read_bytes()),
}
cases["right phrase + loud noise"] = cases["right phrase + loud noise"] + rng.normal(0, .08, len(cases["right phrase + loud noise"])).astype(np.float32)
print()
for name, wav in cases.items():
    t = time.perf_counter(); r = scorer.score(p, wav)
    print(f"{name:28s} -> {r.get('band', r.get('reason'))}  ({ms(t):.0f} ms)")
