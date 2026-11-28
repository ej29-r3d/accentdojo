"""False-alarm check for accentdojo.analysis: clean readings by other Kokoro voices vs af_heart.

    PYTHONPATH=. .venv/bin/python scripts/calibrate.py [n_phrases]
"""
import collections
import sys
import time

import numpy as np

from accentdojo import analysis, audio, content
from accentdojo.scoring import Scorer
from accentdojo.tts import Tts

VOICES = ["am_michael", "am_adam", "af_bella", "af_nicole"]
sc = Scorer(); sc.load()
tts = Tts(); tts.load()
c = content.Content()
phrases = list(c.phrases.values())[: int(sys.argv[1]) if len(sys.argv) > 1 else None]


def assess(p, wav):
    r = sc._assess(wav, " ".join(w.text for w in p.words))
    t = time.perf_counter()
    m = analysis.measure(p, wav, r["differences"]["words"])
    return m, (time.perf_counter() - t) * 1000


def synth(text, voice):
    parts = [x.audio.numpy() for x in tts.pipeline(text, voice=voice) if x.audio is not None]
    import librosa
    return librosa.resample(np.concatenate(parts), orig_sr=24000, target_sr=16000).astype(np.float32)


stats = {"slow": collections.defaultdict(list), "range": collections.defaultdict(list)}
counts = collections.Counter(); examples = collections.defaultdict(list); words = 0; ms = []
for p in phrases:
    ref, _ = assess(p, audio.decode((tts.cache_dir / tts.cached(p.text)[0]).read_bytes()))
    for v in VOICES:
        take, t = assess(p, synth(p.text, v)); ms.append(t)
        out = analysis.compare(p, take, ref)
        stats["slow"][v].append((take["span"][1] - take["span"][0]) / (ref["span"][1] - ref["span"][0]))
        stats["range"][v].append((analysis._range(take["contour"]), analysis._range(ref["contour"])))
        words += len(p.words)
        for w in out["words"]:
            for k in w["kinds"]:
                counts[k] += 1
                examples[k].append((v, p.words[w["index"]].text, "".join(take["words"][w["index"]]["heard"]) if take["words"][w["index"]] else "", w["sounds"] or w["stress"]))
        counts["pause"] += len(out["pauses"]); counts["slow"] += out["pace"] == "slow"; counts["flat"] += out["intonation"]["flat"]
        for pz in out["pauses"]:
            examples["pause"].append((v, p.text, pz))
print(f"{len(phrases)} phrases x {len(VOICES)} voices = {len(phrases)*len(VOICES)} clean takes, {words} words")
print("measure() time: p50 %.0f ms, max %.0f ms" % (np.median(ms), max(ms)))
for k in ["sound", "swallowed", "stress"]:
    print(f"  {k:9} flagged words: {counts[k]} ({100*counts[k]/words:.1f}%)")
for k in ["pause", "slow", "flat"]:
    print(f"  {k:9} flagged takes: {counts[k]}")
for k, xs in examples.items():
    print(k, xs[:12])

for v in VOICES:
    sl = np.array(stats["slow"][v]); rg = np.array(stats["range"][v])
    print(f"{v:11} span ratio p50 {np.median(sl):.2f} p95 {np.percentile(sl,95):.2f} max {sl.max():.2f} | "
          f"pitch range take p10 {np.percentile(rg[:,0],10):.1f} p50 {np.median(rg[:,0]):.1f} st, ref p50 {np.median(rg[:,1]):.1f}, "
          f"take/ref p10 {np.percentile(rg[:,0]/np.maximum(rg[:,1],.1),10):.2f}")
