"""Pronunciation scoring: OpenPronounce 1.x (AGPL-3.0-or-later) behind kole's own result model.

OpenPronounce runs one wav2vec2 phone-recogniser pass, force-aligns the expected phones,
computes GOP features and applies its models trained on speechocean762 human ratings.
It is called with no TTS reference, no word transcription and no prosody contours, so
only the phone recogniser is loaded and nothing leaves the machine.

kole maps its output onto the contract in spec/openapi.yaml:

- quality gates -> ``unscorable`` with too_short / too_quiet / noisy / off_phrase;
- utterance ``total`` (0-100 on the raters' scale; a clean adult reading is about 80)
  -> a four-step band with fixed cutpoints, the same at every level;
- that total relative to the reference voice's own total for the phrase, less penalties
  for detected problems, as ``score``;
- every word the word model doubts -> ``words`` with a severity: ``major`` from the
  model's own error zone, ``minor`` below it but well above anything a clean native-like
  reading produces; missing words are always major;
- the detectors in kole.analysis add their own findings per word (``kinds``: sound,
  swallowed, stress; ``unclear`` when only the word model doubts it) and per take
  (``pauses``, ``pace``, ``intonation``), and each finding takes points off ``score``.
"""

from __future__ import annotations

import logging
import os

import numpy as np

from . import analysis, g2p
from .content import Phrase

log = logging.getLogger("kole.scoring")

THREADS = int(os.environ.get("KOLE_TORCH_THREADS", "6"))
SR = 16000

#: The raters' scale tops out around 80-85 even for clean native speech, so the shown score
#: is relative to Kokoro's own reading of the same phrase: 100 = as clear as the reference.
#: The reference total is clamped so a TTS slip cannot inflate or deflate a phrase.
REF_TOTAL_RANGE = (75.0, 95.0)
DEFAULT_REF_TOTAL = 83.0
#: Shown score (0-100, relative) at which each band starts: 2 Getting there, 3 Clear,
#: 4 Very clear. Equivalent to the earlier raw cuts 45 / 62 / 75 at a reference of ~83.
BAND_CUTS = (55.0, 75.0, 90.0)
#: Points taken off the relative score per problem found by the detectors, capped. First
#: guess so a take full of flagged problems cannot still read "Very clear"; re-fit on takes.
PENALTY = {"major": 8.0, "minor": 3.0, "pause": 5.0, "slow": 8.0, "flat": 5.0}
MAX_PENALTY = 50.0
#: A relative score below this (before penalties) means a different phrase was said, not a
#: weak attempt at this one. Clean readings of another built-in phrase that got past the
#: alignment check came out at 10-14 (scripts/wrong_phrase.py); real takes at 48 and up, the
#: lowest being 21 for a take cut off halfway.
OFF_PHRASE_RELATIVE = 18.0
#: Bump when reference_info's cached shape changes, so old cache files are recomputed.
REF_VERSION = 3

#: Word-model probability (that the word is mispronounced) from which a word is shown.
#: Kokoro's readings of all built-in phrases never pass 0.07 on any word; OpenPronounce's
#: own F1-tuned error threshold is 0.354.
MINOR_WORD = 0.10
MAJOR_WORD = 0.50

MIN_SPEECH_SECONDS = 0.4


def band_of(total: float) -> int:
    return 1 + sum(total >= c for c in BAND_CUTS)


def severity_of(confidence: float, missing: bool = False) -> str | None:
    if missing or confidence >= MAJOR_WORD:
        return "major"
    return "minor" if confidence >= MINOR_WORD else None


class Scorer:
    def __init__(self) -> None:
        self.ready = False

    def load(self) -> None:
        import torch

        torch.set_num_threads(THREADS)
        os.environ.setdefault("OPENPRONOUNCE_G2P", "lexicon")
        from openpronounce import compare_audio_with_text  # noqa: F401  (imports the models lazily)

        # Warm-up: one pass loads the recogniser, the word and utterance models.
        rng = np.random.default_rng(0)
        self._assess(rng.normal(0, 0.05, SR * 2).astype(np.float32), "hello there")
        self.ready = True

    def _assess(self, wav: np.ndarray, text: str) -> dict:
        from openpronounce import compare_audio_with_text

        return compare_audio_with_text(wav, text, acoustic=False, transcription=False, prosody=False)

    def score(self, phrase: Phrase, wav: np.ndarray, ref_info: dict | None = None) -> dict:
        """ScoreResult JSON for one take (16 kHz mono float32). ``ref_info``: Engine.reference_info."""
        from openpronounce import audio as op_audio

        unscorable = lambda reason: {"status": "unscorable", "phraseId": phrase.id, "reason": reason}  # noqa: E731

        quality = op_audio.quality(wav, SR)
        issues = set(quality["issues"])
        if "silent" in issues or "too_quiet" in issues:
            return unscorable("too_quiet")
        if "too_short" in issues or _speech_seconds(wav) < MIN_SPEECH_SECONDS:
            return unscorable("too_short")
        if "noisy" in issues or "clipped" in issues:
            return unscorable("noisy")

        text = " ".join(w.text for w in phrase.words)
        result = self._assess(wav, text)
        diff = result["differences"]
        reports = diff.get("words") or []
        alignment = diff.get("alignment", {})
        scores = result.get("scores") or {}
        if not reports or "total" not in scores:
            return unscorable("off_phrase")

        missing = [r for r in reports if r.get("missing")]
        if not alignment.get("reliable", True) and not (missing and 2 * len(missing) <= len(reports)):
            return unscorable("off_phrase")
        if any(r.startswith("speech that is not in the sentence") for r in result.get("reasons", [])):
            return unscorable("off_phrase")

        # Detectors (kole.analysis): strict sounds, swallowed, stress, pauses, pace, intonation.
        take = analysis.measure(phrase, wav, reports)
        found = analysis.compare(phrase, take, (ref_info or {}).get("measure"))
        by_index = {w["index"]: w for w in found["words"]}

        to_display = g2p.scorer_to_display(list(phrase.words))
        times = _display_times(reports, to_display)
        gop_conf: dict[int, tuple[float, bool]] = {}
        for r in reports:
            if r.get("guessed"):
                continue  # no dictionary entry: never blame the speaker
            i = to_display[r["position"]]
            conf, miss = r.get("confidence", 0.0), bool(r.get("missing"))
            if i not in gop_conf or (miss, conf) > (gop_conf[i][1], gop_conf[i][0]):
                gop_conf[i] = (conf, miss)

        words = []
        for i, word in enumerate(phrase.words):
            conf, miss = gop_conf.get(i, (0.0, False))
            det = by_index.get(i, {"kinds": [], "sounds": [], "stress": None, "function": False})
            kinds = list(det["kinds"])
            gop_sev = severity_of(conf, miss)
            if gop_sev and not kinds:
                kinds.append("unclear")  # the trained model doubts it, no specific reason found
            if not kinds:
                continue
            major = (gop_sev == "major" or "swallowed" in kinds or "stress" in kinds
                     or ("sound" in kinds and not det["function"]))
            t = take["words"][i]
            said = t is not None and not t["missing"] and "swallowed" not in kinds
            words.append({
                "index": i, "severity": "major" if major else "minor", "kinds": kinds,
                "sounds": det["sounds"], "stress": det["stress"],
                "heard": t["heard"] if t else [],
                **_times_json(times.get(i) if said or t else None),
                "_rank": (not major, "swallowed" not in kinds, -conf - len(det["sounds"])),
            })
        words.sort(key=lambda w: w.pop("_rank"))

        ref_total = (ref_info or {}).get("total")
        ref = min(max(ref_total or DEFAULT_REF_TOTAL, REF_TOTAL_RANGE[0]), REF_TOTAL_RANGE[1])
        relative = min(100.0, max(0.0, 100.0 * float(scores["total"]) / ref))
        if relative < OFF_PHRASE_RELATIVE:
            return unscorable("off_phrase")
        penalty = min(MAX_PENALTY, sum(PENALTY[w["severity"]] for w in words)
                      + PENALTY["pause"] * len(found["pauses"])
                      + (PENALTY["slow"] if found["pace"] else 0) + (PENALTY["flat"] if found["intonation"]["flat"] else 0))
        shown = max(0.0, relative - penalty)
        band = band_of(shown)  # the band always follows the shown number
        total = float(scores["total"])

        top = sorted(((r["confidence"], r["word"]) for r in reports), reverse=True)[:3]
        log.info("scored %s shown=%.0f (relative %.0f - penalty %.0f) band=%d total=%.1f ref=%.1f words=%s pauses=%s "
                 "pace=%s flat=%s top_conf=%s accuracy=%s fluency=%s prosodic=%s sentence_p=%s",
                 phrase.id, shown, relative, penalty, band, total, ref,
                 [(phrase.words[w["index"]].text, w["severity"], w["kinds"]) for w in words], found["pauses"],
                 found["pace"], found["intonation"]["flat"], [(w, round(c, 3)) for c, w in top],
                 scores.get("accuracy"), scores.get("fluency"), scores.get("prosodic"), alignment.get("sentence_probability"))
        return {"status": "scored", "phraseId": phrase.id, "score": int(round(shown)), "band": band,
                "words": words, "pauses": found["pauses"], "pace": found["pace"],
                "intonation": found["intonation"]}

    def reference_info(self, phrase: Phrase, wav: np.ndarray) -> dict:
        """For the reference clip: word times, utterance total (the ceiling) and the detector measurements."""
        result = self._assess(wav, " ".join(w.text for w in phrase.words))
        reports = result["differences"].get("words") or []
        times = _display_times(reports, g2p.scorer_to_display(list(phrase.words)))
        total = (result.get("scores") or {}).get("total")
        return {"version": REF_VERSION, "words": [_times_json(times.get(i)) for i in range(len(phrase.words))],
                "total": total, "measure": analysis.measure(phrase, wav, reports)}


def _display_times(reports: list[dict], to_display: list[int]) -> dict[int, tuple[float, float]]:
    """(start, end) in seconds per display word, spanning all of its scorer words."""
    out: dict[int, tuple[float, float]] = {}
    for r in reports:
        i = to_display[r["position"]]
        s, e = float(r["start"]), float(r["end"])
        out[i] = (min(s, out[i][0]), max(e, out[i][1])) if i in out else (s, e)
    # CTC alignment marks the peak of each phone, not its full length, so word ends come out
    # early. Let each word run on into the gap before the next one (at most 0.3 s).
    keys = sorted(out)
    for a, b in zip(keys, keys[1:] + [None]):
        s, e = out[a]
        nxt = out[b][0] if b is not None else e + 0.3
        out[a] = (s, max(e, min(nxt, e + 0.3)))
    return out


def _times_json(t: tuple[float, float] | None) -> dict:
    if t is None:
        return {"startMs": None, "endMs": None}
    return {"startMs": int(round(t[0] * 1000)), "endMs": int(round(t[1] * 1000))}


def _speech_seconds(wav: np.ndarray) -> float:
    import librosa

    intervals = librosa.effects.split(wav, top_db=35)
    return float(sum(e - s for s, e in intervals)) / SR
