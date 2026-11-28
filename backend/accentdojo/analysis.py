"""Detectors on top of the trained scorer.

The trained OpenPronounce models follow human raters, who forgive accent features
(θ→s, w→v, ɪ→i). Accent Dojo is a practice tool, so it also flags what a teacher would
point at, by comparing the take with the expected phonemes and with Kokoro's reading
of the same phrase:

- sounds: strict per-word check of the recognised phones against the dictionary, with
  a curated list of learner substitutions and tolerance for connected-speech forms;
- swallowed: a word not said, or said much shorter / with most sounds missing;
- stress: the most prominent syllable (energy, length, pitch) is not the stressed one;
- pauses: a gap between words much longer than in the reference;
- pace: the whole phrase much slower than the reference;
- intonation: pitch curves of take and reference (semitones), "flat" when the take's
  range is far narrower.

Every threshold is a first guess, checked for false alarms on clean readings by four
other Kokoro voices; meant to be re-fit on labelled takes (ACCENTDOJO_KEEP_TAKES=1 keeps them
in backend/.cache/takes/).
"""

from __future__ import annotations

import math

import numpy as np

from . import g2p
from .content import Phrase

SR = 16000
HOP = 320  # 20 ms, same as the phone model

# ---------------------------------------------------------------------------
# Sounds
# ---------------------------------------------------------------------------

VOWELS = {"i", "ɪ", "e", "ɛ", "æ", "a", "ɑ", "ɒ", "ɔ", "o", "ʊ", "u", "ʌ", "ə", "ɚ", "ɜ", "y", "ɨ",
          "eɪ", "aɪ", "aʊ", "ɔɪ", "oʊ", "əl"}

#: Function words: vowel changes and reductions in them are normal connected speech.
FUNCTION_WORDS = {
    "a", "an", "the", "of", "to", "in", "on", "at", "for", "and", "or", "is", "are", "was", "were", "it", "i",
    "you", "he", "she", "we", "they", "that", "this", "my", "your", "his", "her", "its", "our", "their", "do",
    "does", "did", "have", "has", "had", "be", "been", "am", "not", "no", "so", "if", "as", "by", "with", "from",
    "but", "me", "him", "us", "them", "can", "could", "would", "should", "will", "shall", "must", "there",
    "i'm", "i've", "i'd", "i'll", "it's", "you're", "we're", "we'd", "they're", "what", "some", "than", "then",
}

#: Consonant substitutions that always count (expected -> heard). Common learner substitutions.
CONSONANT_ERRORS = {
    "θ": {"s", "t", "f", "z"}, "ð": {"z", "d", "v", "s"}, "w": {"v", "f"}, "v": {"w"}, "ŋ": {"n", "ŋk", "ŋɡ"},
    "h": {"x"}, "ɹ": {"r"}, "dʒ": {"ʒ", "ʃ"}, "tʃ": {"ʃ", "ts"}, "ʃ": {"s", "ɕ"}, "ʒ": {"z"}, "l": {"ɫ"},
}
#: Word-final devoicing (common in many first languages); only checked on the last consonant.
FINAL_DEVOICING = {"z": "s", "d": "t", "b": "p", "ɡ": "k", "v": "f", "ʒ": "ʃ", "dʒ": "tʃ"}
#: Vowel pairs that are not errors even in a stressed syllable (recogniser / dialect variation).
VOWEL_TOLERATED = {("ɑ", "ɔ"), ("ɔ", "ɑ"), ("ɚ", "ɜ"), ("ɜ", "ɚ"), ("oʊ", "o"), ("ə", "ʌ"), ("ʌ", "ə"),
                   ("i", "iː"), ("u", "uː"), ("eɪ", "e"), ("əl", "l"), ("ɚ", "ɹ")}


def _bare(p: str) -> str:
    return p.lstrip("ˈˌ")


def _is_vowel(p: str) -> bool:
    return _bare(p) in VOWELS or any(c in "aeiouæɑɒɔəɚɛɜɪʊʌ" for c in _bare(p))


def _is_function(word: g2p.DisplayWord) -> bool:
    key = g2p.op_g2p.words_of(word.text)
    return len(key) == 1 and key[0] in FUNCTION_WORDS


def _sub_cost(a: str, b: str) -> float:
    """Vowel for vowel (or consonant for consonant) is cheaper than a gap; across the two, dearer."""
    return 0.0 if a == b else (0.6 if _is_vowel(a) == _is_vowel(b) else 1.2)


def _align(exp: list[str], heard: list[str]) -> list[tuple[int | None, int | None]]:
    """Weighted Levenshtein alignment: pairs of (expected index | None, heard index | None)."""
    n, m = len(exp), len(heard)
    cost = np.zeros((n + 1, m + 1))
    cost[:, 0] = np.arange(n + 1)
    cost[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = _sub_cost(exp[i - 1], heard[j - 1])
            cost[i, j] = min(cost[i - 1, j] + 1, cost[i, j - 1] + 1, cost[i - 1, j - 1] + sub)
    out, i, j = [], n, m
    while i or j:
        if i and j and cost[i, j] == cost[i - 1, j - 1] + _sub_cost(exp[i - 1], heard[j - 1]):
            out.append((i - 1, j - 1))
            i -= 1
            j -= 1
        elif i and cost[i, j] == cost[i - 1, j] + 1:
            out.append((i - 1, None))
            i -= 1
        else:
            out.append((None, j - 1))
            j -= 1
    return out[::-1]


def sound_errors(word: g2p.DisplayWord, heard: list[str]) -> list[dict]:
    """Learner errors in one word: [{at, expected, heard}] (heard None = dropped)."""
    exp = [_bare(p) for p in word.phonemes]
    if not exp or not heard:
        return []
    function = _is_function(word)
    stressed = _stressed_vowels(word.phonemes)
    last_cons = max((i for i, p in enumerate(exp) if not _is_vowel(p)), default=-1)
    errors = []
    for i, j in _align(exp, heard):
        if i is None:
            continue
        e = exp[i]
        h = heard[j] if j is not None else None
        if h == e or _r_variant(e, h, exp[i + 1] if i + 1 < len(exp) else None):
            continue
        if h is None:
            # A dropped consonant at the start of a content word, or a dropped stressed vowel.
            if not function and ((i == 0 and not _is_vowel(e)) or i in stressed):
                errors.append({"at": i, "expected": e, "heard": None})
            continue
        if not _is_vowel(e):
            if h in CONSONANT_ERRORS.get(e, ()):
                errors.append({"at": i, "expected": e, "heard": h})
            elif i == last_cons == len(exp) - 1 and FINAL_DEVOICING.get(e) == h and not function:
                errors.append({"at": i, "expected": e, "heard": h})
        elif _is_vowel(h) and not function and i in stressed and (e, h) not in VOWEL_TOLERATED:
            errors.append({"at": i, "expected": e, "heard": h})
    return errors


def _r_variant(e: str, h: str | None, nxt: str | None) -> bool:
    """r-coloured vowels and vowels before /ɹ/ vary a lot in clean American speech ("where" /wɛ/, /wɚ/)."""
    if h is None:
        return False
    if e.endswith("ɹ") or e in ("ɚ", "aʊɚ"):
        return h in (e[:-1], "ɚ", "ɹ", e[:-1] + "ɹ") or h.endswith("ɹ") or h == "ɚ"
    return nxt == "ɹ" and {e, h} <= {"ɪ", "i", "ɛ", "e", "ʊ", "u"}


def _stressed_vowels(phonemes: list[str]) -> set[int]:
    """Indexes of vowels in stressed syllables; every vowel of a one-syllable word."""
    vowels = [i for i, p in enumerate(phonemes) if _is_vowel(p)]
    if len(vowels) <= 1:
        return set(vowels)
    out = set()
    for i, p in enumerate(phonemes):
        if p.startswith(("ˈ", "ˌ")):
            nxt = next((v for v in vowels if v >= i), None)
            if nxt is not None:
                out.add(nxt)
    return out


def _primary_vowel(phonemes: list[str]) -> int | None:
    vowels = [i for i, p in enumerate(phonemes) if _is_vowel(p)]
    for i, p in enumerate(phonemes):
        if p.startswith("ˈ"):
            return next((v for v in vowels if v >= i), None)
    return None


# ---------------------------------------------------------------------------
# Measurements shared by takes and the reference clip
# ---------------------------------------------------------------------------

def _frames(wav: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per 20 ms frame: RMS in dB and f0 in Hz (nan when unvoiced)."""
    import librosa

    rms = librosa.feature.rms(y=wav, frame_length=640, hop_length=HOP, center=True)[0]
    db = 20 * np.log10(np.maximum(rms, 1e-5))
    f0, voiced, _ = librosa.pyin(wav, fmin=65, fmax=400, sr=SR, frame_length=1024, hop_length=HOP, center=True)
    f0 = np.where(voiced & (db > db.max() - 35), f0, np.nan)
    n = min(len(db), len(f0))
    return db[:n], f0[:n]


def measure(phrase: Phrase, wav: np.ndarray, reports: list[dict]) -> dict:
    """Timing, syllable prominence and pitch of one reading, from OpenPronounce's word reports."""
    from openpronounce import g2p as op_g2p
    from openpronounce import phones as op_phones

    db, f0 = _frames(wav)
    to_display = g2p.scorer_to_display(list(phrase.words))
    words: dict[int, dict] = {}
    for r in sorted(reports, key=lambda r: r["position"]):
        i = to_display[r["position"]]
        w = words.setdefault(i, {"start": math.inf, "end": 0.0, "phones": [], "missing": False, "heard": []})
        w["start"] = min(w["start"], r["start"])
        w["end"] = max(w["end"], r["end"])
        w["missing"] |= bool(r.get("missing"))
        w["heard"] += [] if r.get("missing") else list(r.get("actual", []))
        # Display-phoneme index of each raw phone of this scorer word.
        word = phrase.words[i]
        first = to_display.index(i)
        offset = sum(len(op_phones.normalize_phones(op_g2p.arpabet_to_phones(g2p.arpabet(part)[0]), g2p.LANG))
                     for part in word.scorer_words[: r["position"] - first])
        raw = list(op_g2p.arpabet_to_phones(g2p.arpabet(word.scorer_words[r["position"] - first])[0]))
        norm = op_phones._normalize_indexed(raw, g2p.LANG)
        raw_to_norm = {ri: n for n, (_, rs) in enumerate(norm) for ri in rs}
        if len(r.get("phones", [])) == len(raw):
            for ri, p in enumerate(r["phones"]):
                w["phones"].append((offset + raw_to_norm[ri], float(p["start"]), float(p["end"])))
    out_words = []
    for i, word in enumerate(phrase.words):
        w = words.get(i)
        if not w or not math.isfinite(w["start"]):
            out_words.append(None)
            continue
        out_words.append({
            "start": w["start"], "end": w["end"], "missing": w["missing"], "heard": w["heard"],
            "syllables": _syllables(word, w["phones"], w["end"], db, f0),
        })
    present = [w for w in out_words if w and not w["missing"]]
    span = (present[0]["start"], present[-1]["end"]) if present else (0.0, len(wav) / SR)
    return {"words": out_words, "span": span, "contour": _contour(f0, span),
            "f0": [None if not math.isfinite(x) else round(float(x), 1) for x in f0]}


def _syllables(word: g2p.DisplayWord, phones: list[tuple[int, float, float]], word_end: float,
               db: np.ndarray, f0: np.ndarray) -> list[dict]:
    """Per vowel of a multi-syllable word: display index, duration, loudness and pitch."""
    vowels = [i for i, p in enumerate(word.phonemes) if _is_vowel(p)]
    if len(vowels) < 2 or not phones:
        return []
    phones = sorted(phones, key=lambda x: x[1])
    starts = {idx: s for idx, s, _ in phones}
    out = []
    for v in vowels:
        if v not in starts:
            return []
        s = starts[v]
        later = [ps for idx, ps, _ in phones if ps > s]
        e = min(later) if later else word_end
        e = max(e, s + 0.04)
        a, b = int(s * SR / HOP), max(int(e * SR / HOP), int(s * SR / HOP) + 1)
        seg_db, seg_f0 = db[a:b], f0[a:b]
        pitch = float(np.nanmedian(seg_f0)) if np.isfinite(seg_f0).any() else math.nan
        out.append({"at": v, "dur": e - s, "db": float(seg_db.max()) if len(seg_db) else -100.0,
                    "st": 12 * math.log2(pitch / 100.0) if math.isfinite(pitch) else math.nan})
    return out


def _contour(f0: np.ndarray, span: tuple[float, float], points: int = 48) -> list[float | None]:
    a, b = int(span[0] * SR / HOP), int(span[1] * SR / HOP) + 1
    seg = f0[a:b]
    if len(seg) < 4 or not np.isfinite(seg).any():
        return [None] * points
    st = 12 * np.log2(seg / np.nanmedian(seg))
    xs = np.linspace(0, len(st) - 1, points)
    out = []
    for x in xs:
        lo, hi = int(max(0, x - 1)), int(min(len(st), x + 2))
        window = st[lo:hi]
        out.append(round(float(np.nanmean(window)), 2) if np.isfinite(window).any() else None)
    return out


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

#: A take word shorter than this share of the reference word, with 3+ sounds, is swallowed.
SWALLOWED_DURATION = 0.45
#: Content words where fewer than this share of the expected sounds were heard are swallowed.
SWALLOWED_HEARD = 0.5
#: Prominence (z-score sum) by which another syllable must beat the stressed one.
STRESS_MARGIN = 1.2
#: ...and by this much more than in the reference reading of the same word.
STRESS_SHIFT = 2.0
#: A gap this much longer than the reference's, and at least this long, is a pause.
PAUSE_EXTRA = 0.30
PAUSE_MIN = 0.45
#: Take span / reference span from which the phrase is "slow".
SLOW_RATIO = 1.6
#: Flat when the take's pitch range (p90-p10, semitones) is under FLAT_ABS and under this
#: share of the reference's, and the reference moves at least FLAT_REF_MIN semitones.
#: Clean Kokoro voices: median ranges 3.5-8 st; the narrowest (af_nicole) p10 2.2 st.
FLAT_SHARE = 0.4
FLAT_ABS = 2.0
FLAT_REF_MIN = 3.0


def compare(phrase: Phrase, take: dict, ref: dict | None) -> dict:
    words = []
    for i, word in enumerate(phrase.words):
        t = take["words"][i]
        r = ref["words"][i] if ref else None
        kinds, info = [], {"sounds": [], "stress": None}
        if t is None or t["missing"]:
            kinds.append("swallowed")
        else:
            function = _is_function(word)
            n = len(word.phonemes)
            short = r and r["end"] > r["start"] and n >= 3 and (t["end"] - t["start"]) < SWALLOWED_DURATION * (r["end"] - r["start"])
            sparse = not function and n >= 3 and len(t["heard"]) < SWALLOWED_HEARD * n
            if short or sparse:
                kinds.append("swallowed")
            if not word.guessed:
                info["sounds"] = sound_errors(word, t["heard"])
                if info["sounds"]:
                    kinds.append("sound")
                stress = _stress(word, t, r)
                if stress:
                    kinds.append("stress")
                    info["stress"] = stress
        if kinds:
            words.append({"index": i, "kinds": kinds, **info, "function": _is_function(word)})
    pauses = _pauses(phrase, take, ref)
    return {
        "words": words,
        "pauses": pauses,
        "pace": _pace(take, ref, pauses),
        "intonation": _intonation(take, ref),
    }


def _prominence(syl: list[dict]) -> list[float]:
    def z(xs):
        xs = np.array(xs, dtype=float)
        if not np.isfinite(xs).all() or xs.std() < 1e-6:
            return np.zeros(len(xs))
        return (xs - xs.mean()) / xs.std()
    return list(z([s["db"] for s in syl]) + z([s["dur"] for s in syl]) + z([s["st"] for s in syl]))


def _stress(word: g2p.DisplayWord, t: dict, r: dict | None) -> dict | None:
    """Another syllable is clearly more prominent than the stressed one, compared with the reference.

    Prominence = z(loudness) + z(length) + z(pitch) within the word. Taking the reference's
    pattern for the same word as the baseline cancels phrase effects such as falling pitch.
    """
    primary = _primary_vowel(word.phonemes)
    if primary is None or not r or not t["syllables"] or not r["syllables"]:
        return None
    ats = [s["at"] for s in t["syllables"]]
    if ats != [s["at"] for s in r["syllables"]] or primary not in ats:
        return None
    tp, rp = _prominence(t["syllables"]), _prominence(r["syllables"])
    top = int(np.argmax(tp))
    k = ats.index(primary)
    if top == k:
        return None
    shift = (tp[top] - tp[k]) - (rp[top] - rp[k])
    if tp[top] - tp[k] >= STRESS_MARGIN and shift >= STRESS_SHIFT:
        return {"expectedAt": primary, "heardAt": ats[top]}
    return None


def _pauses(phrase: Phrase, take: dict, ref: dict | None) -> list[dict]:
    out = []
    tw, rw = take["words"], (ref["words"] if ref else [None] * len(take["words"]))
    for i in range(len(tw) - 1):
        a, b = tw[i], tw[i + 1]
        if not a or not b or a["missing"] or b["missing"]:
            continue
        gap = b["start"] - a["end"]
        ra, rb = rw[i], rw[i + 1]
        ref_gap = (rb["start"] - ra["end"]) if ra and rb else 0.1
        allowed = PAUSE_EXTRA + (0.3 if phrase.words[i].text[-1:] in ",;:" else 0.0)
        if gap >= PAUSE_MIN and gap - ref_gap >= allowed:
            out.append({"after": i, "ms": int(round(gap * 1000))})
    return out


def _pace(take: dict, ref: dict | None, pauses: list[dict]) -> str | None:
    """Slow overall; time already reported as long pauses does not count twice."""
    if not ref:
        return None
    t = take["span"][1] - take["span"][0] - sum(p["ms"] for p in pauses) / 1000
    r = ref["span"][1] - ref["span"][0]
    return "slow" if r > 0 and t / r >= SLOW_RATIO else None


def _range(contour: list[float | None]) -> float:
    xs = np.array([x for x in contour if x is not None])
    return float(np.percentile(xs, 90) - np.percentile(xs, 10)) if len(xs) >= 6 else 0.0


def _aligned_contours(take: dict, ref: dict, points: int = 48) -> tuple[list, list] | None:
    """Both pitch curves sampled word by word, so each word sits over its counterpart and pauses drop out.

    Points per word follow the reference's word lengths; within a word each reading is
    sampled over its own span. Semitones are relative to each reading's own median.
    """
    pairs = [(t, r) for t, r in zip(take["words"], ref["words"]) if t and r and not t["missing"] and not r["missing"]]
    if not pairs or "f0" not in take or "f0" not in ref:
        return None
    lengths = [max(r["end"] - r["start"], 0.02) for _, r in pairs]
    total = sum(lengths)
    counts = [max(2, round(points * d / total)) for d in lengths]

    def sample(f0_list, spans):
        f0 = np.array([np.nan if x is None else x for x in f0_list], dtype=float)
        out = []
        for (a, b), n in zip(spans, counts):
            fa, fb = int(a * SR / HOP), max(int(b * SR / HOP), int(a * SR / HOP) + 1)
            seg = f0[fa:fb]
            for k in range(n):
                lo = int(k * len(seg) / n)
                hi = max(lo + 1, int((k + 1) * len(seg) / n))
                w = seg[lo:hi]
                out.append(float(np.nanmean(w)) if np.isfinite(w).any() else math.nan)
        arr = np.array(out)
        if not np.isfinite(arr).any():
            return [None] * len(out)
        st = 12 * np.log2(arr / np.nanmedian(arr))
        return [None if not math.isfinite(x) else round(float(x), 2) for x in st]

    return (sample(take["f0"], [(t["start"], t["end"]) for t, _ in pairs]),
            sample(ref["f0"], [(r["start"], r["end"]) for _, r in pairs]))


def _intonation(take: dict, ref: dict | None) -> dict:
    you, reference = take["contour"], (ref["contour"] if ref else [None] * len(take["contour"]))
    aligned = _aligned_contours(take, ref) if ref else None
    if aligned:
        you, reference = aligned
    r_you, r_ref = _range(you), _range(reference)
    flat = bool(ref and r_ref >= FLAT_REF_MIN and r_you < FLAT_ABS and r_you < FLAT_SHARE * r_ref)
    return {"flat": flat, "you": you, "reference": reference}
