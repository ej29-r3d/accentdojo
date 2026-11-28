"""Phrase text -> display words with reference phonemes.

The phonemes come from OpenPronounce's own G2P (CMUdict mapped to the phone
recogniser's symbols, then normalised), so what the UI shows is what the scorer aligns
against, except that /ɔ/ stays apart from /ɑ/. Accent Dojo adds stress marks for display: a mark sits on the
first sound of the stressed syllable (maximal onset), and the frontend keeps it
glued to that sound. One-syllable words get no mark.

A display word is a whitespace token with at least one letter or digit, punctuation
included ("station?"). OpenPronounce splits on ``[\\w']+``, so one display word can
hold several scorer words ("well-known"); ``scorer_words`` keeps that mapping.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from openpronounce import g2p as op_g2p
from openpronounce import phones as op_phones

LANG = "en"
_TOKEN_OK = re.compile(r"[A-Za-z0-9]")

# Word-initial clusters of English, used to place the stress mark at the syllable onset.
_ONSETS = {
    "pl", "pɹ", "bl", "bɹ", "tɹ", "tw", "dɹ", "dw", "kl", "kɹ", "kw", "ɡl", "ɡɹ", "ɡw", "fl", "fɹ", "θɹ", "θw",
    "ʃɹ", "sl", "sw", "sm", "sn", "sp", "st", "sk", "spl", "spɹ", "stɹ", "skɹ", "skw", "skl", "pj", "bj", "kj",
    "fj", "mj", "hj", "vj", "sf",
}


def _is_vowel_symbol(symbol: str) -> bool:
    return symbol[-1].isdigit()


def arpabet(word: str) -> tuple[tuple[str, ...], bool]:
    """CMUdict symbols (with stress digits) for one lower-case scorer word, and whether they are a guess.

    Mirrors ``openpronounce.g2p._lexicon_word`` so the phones match the scorer's.
    """
    lexicon = op_g2p._lexicon(LANG)
    if word.isdigit():
        spoken = (
            op_g2p.number_words(int(word))
            if len(word) <= 9 and not (len(word) > 1 and word[0] == "0")
            else [op_g2p._ONES[int(d)] for d in word]
        )
        return tuple(s for w in spoken for s in lexicon[w]), False
    symbols = (
        op_g2p._suffixed(word, lexicon)
        or op_g2p._suffixed(word.replace("'", ""), lexicon)
        or op_g2p._compound(word, lexicon)
    )
    if symbols:
        return tuple(symbols), False
    return tuple(op_g2p._spelled(word)), True


def _with_stress(symbols: tuple[str, ...]) -> list[str]:
    """Normalised scorer phones of one word, with ˈ / ˌ on the onset of stressed syllables."""
    raw = list(op_g2p.arpabet_to_phones(symbols))
    norm = op_phones._normalize_indexed(raw, LANG)  # [(phone, [raw indices])]
    # The scorer merges /ɔ/ into /ɑ/ (cot-caught); the reference voice keeps them apart, so the
    # display does too. The detectors tolerate ɔ/ɑ (analysis.VOWEL_TOLERATED).
    out = [("ɔ" if p == "ɑ" and all(raw[r].replace("ː", "") == "ɔ" for r in rs) else p) for p, rs in norm]
    # arpabet_to_phones emits one phone per vowel symbol (r-coloured and syllabic-l merges
    # keep the vowel), so the k-th vowel-bearing phone carries the k-th stress digit.
    stresses = [s[-1] for s in symbols if _is_vowel_symbol(s)]
    raw_to_norm = {r: n for n, (_, rs) in enumerate(norm) for r in rs}
    vowel_norm = sorted({raw_to_norm[i] for i, p in enumerate(raw) if _has_vowel(p)})
    if len(vowel_norm) != len(stresses) or len(stresses) < 2:
        return out
    marks: dict[int, str] = {}
    prev = -1
    for k, n in enumerate(vowel_norm):
        mark = {"1": "ˈ", "2": "ˌ"}.get(stresses[k])
        if mark:
            if k == 0:
                onset = 0  # the whole word-initial cluster belongs to the first syllable
            else:
                cluster = out[prev + 1 : n]
                size = 0
                for size in range(len(cluster), 0, -1):
                    if size == 1 or "".join(cluster[-size:]) in _ONSETS:
                        break
                onset = n - size
            marks[onset] = mark
        prev = n
    return [marks.get(i, "") + p for i, p in enumerate(out)]


_VOWEL_CHARS = set("aeiouæɑɒɔəɚɛɜɝɪʊʌ")


def _has_vowel(phone: str) -> bool:
    return any(c in _VOWEL_CHARS for c in phone)


@dataclass
class DisplayWord:
    text: str
    phonemes: list[str]
    guessed: bool
    scorer_words: list[str] = field(default_factory=list)


def words_of(text: str) -> list[DisplayWord]:
    out = []
    for token in text.split():
        if not _TOKEN_OK.search(token):
            continue
        parts = list(op_g2p.words_of(token))
        phonemes: list[str] = []
        guessed = False
        for part in parts:
            symbols, g = arpabet(part)
            guessed |= g
            phones = _with_stress(symbols)
            if g:  # letter-to-sound guess: its stress digits mean nothing
                phones = [p.lstrip("ˈˌ") for p in phones]
            phonemes += phones
        out.append(DisplayWord(token, phonemes, guessed, parts))
    return out


def scorer_to_display(words: list[DisplayWord]) -> list[int]:
    """Display index of every scorer word, in order."""
    return [i for i, w in enumerate(words) for _ in w.scorer_words]
