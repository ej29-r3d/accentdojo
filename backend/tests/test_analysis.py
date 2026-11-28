"""Detector and score arithmetic tests on synthetic inputs. No models are loaded."""

import numpy as np
import pytest

from accentdojo import analysis, g2p, scoring
from accentdojo.content import Phrase


def word(text: str) -> g2p.DisplayWord:
    return g2p.words_of(text)[0]


def phrase(text: str) -> Phrase:
    return Phrase("t", text, None, None, tuple(g2p.words_of(text)))


def said(start: float, end: float, **extra) -> dict:
    return {"start": start, "end": end, "missing": False, "heard": [], "syllables": [], **extra}


def test_align_pairs_substitutions_and_gaps():
    assert analysis._align(["θ", "ɪ", "ŋ", "k"], ["s", "ɪ", "ŋ", "k"]) == [(0, 0), (1, 1), (2, 2), (3, 3)]
    assert analysis._align(["k", "æ", "t"], ["k", "t"]) == [(0, 0), (1, None), (2, 1)]
    assert analysis._align(["k", "æ", "t"], ["k", "æ", "s", "t"]) == [(0, 0), (1, 1), (None, 2), (2, 3)]
    # A vowel is never paired with a consonant: that costs more (1.2) than a gap on each side would save.
    assert analysis._align(["æ", "t"], ["t", "æ"]) == [(None, 0), (0, 1), (1, None)]


def test_th_and_w_substitutions_count_even_in_function_words():
    assert analysis.sound_errors(word("think"), ["s", "ɪ", "ŋ", "k"]) == [{"at": 0, "expected": "θ", "heard": "s"}]
    assert analysis.sound_errors(word("the"), ["z", "ə"]) == [{"at": 0, "expected": "ð", "heard": "z"}]
    assert analysis.sound_errors(word("was"), ["v", "ɑ", "z"]) == [{"at": 0, "expected": "w", "heard": "v"}]


def test_final_devoicing_only_in_content_words():
    assert analysis.sound_errors(word("dogs"), ["d", "ɑ", "ɡ", "s"]) == [{"at": 3, "expected": "z", "heard": "s"}]
    assert analysis.sound_errors(word("bed"), ["b", "ɛ", "t"]) == [{"at": 2, "expected": "d", "heard": "t"}]
    assert analysis.sound_errors(word("was"), ["w", "ɑ", "s"]) == []
    # Not word-final: /d/ -> /t/ at the start is not on the list.
    assert analysis.sound_errors(word("dogs"), ["t", "ɑ", "ɡ", "z"]) == []


def test_vowels_strict_only_when_stressed_in_content_words():
    assert analysis.sound_errors(word("bed"), ["b", "æ", "d"]) == [{"at": 1, "expected": "ɛ", "heard": "æ"}]
    assert analysis.sound_errors(word("the"), ["ð", "i"]) == []  # function word
    assert analysis.sound_errors(word("banana"), ["b", "æ", "n", "æ", "n", "ʌ"]) == []  # unstressed syllables
    assert analysis.sound_errors(word("banana"), ["b", "ə", "n", "ɑ", "n", "ə"]) == [{"at": 3, "expected": "æ", "heard": "ɑ"}]
    assert analysis.sound_errors(word("dogs"), ["d", "ɔ", "ɡ", "z"]) == []  # ɑ/ɔ is dialect, tolerated


def test_dropped_sounds():
    assert analysis.sound_errors(word("bed"), ["ɛ", "d"]) == [{"at": 0, "expected": "b", "heard": None}]
    assert analysis.sound_errors(word("bed"), ["b", "d"]) == [{"at": 1, "expected": "ɛ", "heard": None}]
    assert analysis.sound_errors(word("bed"), ["b", "ɛ"]) == []  # a final consonant may be unreleased
    assert analysis.sound_errors(word("the"), ["ə"]) == []
    assert analysis.sound_errors(word("bed"), []) == []  # nothing heard is "swallowed", not a sound error


def test_substitutions_from_other_first_languages():
    cases = {
        ("very", ("b", "ɛ", "ɹ", "i")): {"at": 0, "expected": "v", "heard": "b"},
        ("light", ("ɹ", "aɪ", "t")): {"at": 0, "expected": "l", "heard": "ɹ"},
        ("rice", ("l", "aɪ", "s")): {"at": 0, "expected": "ɹ", "heard": "l"},
        ("pen", ("b", "ɛ", "n")): {"at": 0, "expected": "p", "heard": "b"},
        ("fan", ("p", "æ", "n")): {"at": 0, "expected": "f", "heard": "p"},
        ("yes", ("dʒ", "ɛ", "s")): {"at": 0, "expected": "j", "heard": "dʒ"},
        ("job", ("j", "ɑ", "b")): {"at": 0, "expected": "dʒ", "heard": "j"},
        ("ship", ("tʃ", "ɪ", "p")): {"at": 0, "expected": "ʃ", "heard": "tʃ"},
        ("zoo", ("dʒ", "u")): {"at": 0, "expected": "z", "heard": "dʒ"},
        ("time", ("ʈ", "aɪ", "m")): {"at": 0, "expected": "t", "heard": "ʈ"},
        ("night", ("l", "aɪ", "t")): {"at": 0, "expected": "n", "heard": "l"},
        ("easy", ("i", "s", "i")): {"at": 1, "expected": "z", "heard": "s"},
    }
    for (text, heard), error in cases.items():
        assert analysis.sound_errors(word(text), list(heard)) == [error], text


def test_dropped_final_consonant():
    assert analysis.sound_errors(word("bus"), ["b", "ʌ"]) == [{"at": 2, "expected": "s", "heard": None}]
    assert analysis.sound_errors(word("bus"), ["b", "ʌ"], "s") == []  # "bus stop": one long /s/
    assert analysis.sound_errors(word("thing"), ["θ", "ɪ"]) == [{"at": 2, "expected": "ŋ", "heard": None}]


def test_added_vowels():
    assert analysis.sound_errors(word("school"), ["ɛ", "s", "k", "u", "l"]) == [{"at": 0, "expected": "s", "heard": "ɛs"}]
    assert analysis.sound_errors(word("street"), ["s", "ə", "t", "ɹ", "i", "t"]) == [{"at": 0, "expected": "s", "heard": "sə"}]
    assert analysis.sound_errors(word("big"), ["b", "ɪ", "ɡ", "u"]) == [{"at": 2, "expected": "ɡ", "heard": "ɡu"}]
    assert analysis.sound_errors(word("big"), ["b", "ɪ", "ɡ", "u"], "d") == [{"at": 2, "expected": "ɡ", "heard": "ɡu"}]
    # The next word's vowel can be caught at the end of this one: "big apple".
    assert analysis.sound_errors(word("big"), ["b", "ɪ", "ɡ", "ə"], "æ") == []
    assert analysis.sound_errors(word("to"), ["ɛ", "t", "u"]) == []  # function words are left alone


def test_known_substitution_wins_the_alignment():
    assert analysis.sound_errors(word("usually"), ["j", "u", "dʒ", "u", "l", "i"]) == [{"at": 2, "expected": "ʒ", "heard": "dʒ"}]


def test_vowel_before_s_cluster_caught_on_previous_word():
    to, school = g2p.words_of("to school")
    out = analysis._vowel_before_s_cluster(school, ["s", "k", "u", "l"], to, said(0, 1, heard=["t", "ə", "eɪ"]))
    assert out == [{"at": 0, "expected": "s", "heard": "eɪs"}]
    assert analysis._vowel_before_s_cluster(school, ["s", "k", "u", "l"], to, said(0, 1, heard=["t", "ə"])) == []


def test_thought_shows_aw_and_matches_merged_ah():
    assert word("thought").phonemes == ["θ", "ɔ", "t"]
    assert word("cot").phonemes == ["k", "ɑ", "t"]
    assert analysis.sound_errors(word("thought"), ["θ", "ɑ", "t"]) == []


def test_pauses_against_reference_and_commas():
    p = phrase("good dogs sing")
    take = {"words": [said(0.0, 0.4), said(1.0, 1.4), said(1.5, 1.9)]}
    ref = {"words": [said(0.0, 0.4), said(0.5, 0.9), said(1.0, 1.4)]}
    assert analysis._pauses(p, take, ref) == [{"after": 0, "ms": 600}]
    # The reference pauses there too: 0.6 - 0.4 is under PAUSE_EXTRA.
    ref["words"][1] = said(0.8, 0.9)
    assert analysis._pauses(p, take, ref) == []
    # After a comma 0.3 s more is allowed; without a reference its gap is taken as 0.1 s.
    assert analysis._pauses(p, take, None) == [{"after": 0, "ms": 600}]
    assert analysis._pauses(phrase("good, dogs sing"), take, None) == []
    take["words"][1]["missing"] = True
    assert analysis._pauses(p, take, None) == []


def test_pace_does_not_count_pauses_twice():
    ref = {"span": (0.0, 2.0)}
    assert analysis._pace({"span": (0.5, 3.7)}, ref, []) == "slow"  # 3.2 / 2.0 = 1.6
    assert analysis._pace({"span": (0.5, 3.6)}, ref, []) is None
    assert analysis._pace({"span": (0.0, 4.0)}, ref, [{"after": 0, "ms": 900}]) is None  # 3.1 / 2.0
    assert analysis._pace({"span": (0.0, 9.0)}, None, []) is None


def test_stress_shift_is_relative_to_reference():
    w = word("banana")  # b ə ˈn æ n ə: vowels at 1, 3, 5, primary stress on 3

    def syl(strong: int) -> dict:
        return said(0, 1, syllables=[{"at": at, "dur": 0.2 if at == strong else 0.08, "db": -10.0 if at == strong else -25.0,
                                      "st": 4.0 if at == strong else 0.0} for at in (1, 3, 5)])

    assert analysis._stress(w, syl(1), syl(3)) == {"expectedAt": 3, "heardAt": 1}
    assert analysis._stress(w, syl(3), syl(3)) is None
    # The reference reads it the same way, so nothing is flagged, and nothing without a reference.
    assert analysis._stress(w, syl(1), syl(1)) is None
    assert analysis._stress(w, syl(1), None) is None
    assert analysis._stress(word("bed"), syl(1), syl(3)) is None  # one syllable: no primary mark


def test_compare_swallowed():
    p = phrase("the banana")
    ref = {"words": [said(0.0, 0.2), said(0.2, 1.0)], "span": (0.0, 1.0), "contour": [None] * 48}
    heard = ["b", "ə", "n", "æ", "n", "ə"]
    take = {"words": [said(0.0, 0.2, heard=["ð", "ə"]), said(0.2, 0.5, heard=heard)], "span": (0.0, 0.5), "contour": [None] * 48}
    out = analysis.compare(p, take, ref)
    # 0.3 s against the reference's 0.8 s is under SWALLOWED_DURATION.
    assert [(w["index"], w["kinds"]) for w in out["words"]] == [(1, ["swallowed"])]
    # Full length but two sounds of six: swallowed, and the dropped stressed vowel is a sound error too.
    take["words"][1] = said(0.2, 1.0, heard=["b", "ə"])
    found = analysis.compare(p, take, ref)["words"][0]
    assert found["kinds"] == ["swallowed", "sound"] and found["sounds"] == [{"at": 3, "expected": "æ", "heard": None}]
    take["words"][0] = None  # not aligned at all
    assert [w["index"] for w in analysis.compare(p, take, ref)["words"]] == [0, 1]
    assert out["pauses"] == [] and out["pace"] is None and out["intonation"]["flat"] is False


def test_flat_intonation_needs_a_moving_reference():
    def reading(swing: float) -> dict:  # no words: the whole-take contours are compared
        return {"words": [], "contour": [-swing, swing] * 24}

    assert analysis._intonation(reading(0.5), reading(4.0))["flat"] is True
    assert analysis._intonation(reading(4.0), reading(4.0))["flat"] is False
    assert analysis._intonation(reading(0.5), reading(0.5))["flat"] is False  # the reference is flat too
    assert analysis._intonation(reading(0.5), None)["flat"] is False


def test_band_cuts_are_inclusive():
    assert [scoring.band_of(x) for x in (54.9, 55, 74.9, 75, 89.9, 90)] == [1, 2, 2, 3, 3, 4]
    assert [scoring.severity_of(x) for x in (0.099, 0.10, 0.499, 0.50)] == [None, "minor", "minor", "major"]


@pytest.fixture()
def scorer(monkeypatch):
    """Scorer.score with the model pass and the detectors replaced by fixed outputs."""
    p = phrase("good dogs sing")
    state = {"total": 83.0, "confidence": [0.0, 0.0, 0.0], "found": {}}

    def reports() -> list[dict]:
        return [{"position": i, "word": w.text, "start": i * 0.5, "end": i * 0.5 + 0.4,
                 "confidence": state["confidence"][i]} for i, w in enumerate(p.words)]

    s = scoring.Scorer()
    monkeypatch.setattr(s, "_assess", lambda wav, text: {"differences": {"words": reports()}, "scores": {"total": state["total"]}})
    monkeypatch.setattr(analysis, "measure", lambda p, wav, reports: {"words": [said(i * 0.5, i * 0.5 + 0.4) for i in range(3)]})
    monkeypatch.setattr(analysis, "compare", lambda p, take, ref: {
        "words": [], "pauses": [], "pace": None, "intonation": {"flat": False, "you": [], "reference": []}, **state["found"]})
    t = np.arange(scoring.SR * 2) / scoring.SR
    wav = (0.2 * np.sin(2 * np.pi * 220 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t))).astype(np.float32)
    return lambda ref_info=None: s.score(p, wav, ref_info), state


def test_score_is_relative_to_clamped_reference(scorer):
    score, state = scorer
    assert (score()["score"], score()["band"]) == (100, 4)  # 83 over the default reference of 83
    state["total"] = 60.0
    assert score({"total": 80.0})["score"] == 75
    assert score({"total": 50.0})["score"] == 80  # a bad reference clip is clamped up to 75
    assert score({"total": 99.0})["score"] == 63  # and a lucky one down to 95
    state["total"] = 90.0
    assert score()["score"] == 100  # never above the reference


def test_far_below_the_reference_is_a_different_phrase(scorer):
    score, state = scorer
    state["total"] = 14.0  # 17 % of the default reference: what another phrase scores
    r = score()
    assert (r["status"], r["reason"]) == ("unscorable", "off_phrase")
    state["total"] = 17.5  # 21 %: a very weak take of this phrase is still scored
    assert score()["status"] == "scored"


def test_score_penalties(scorer):
    score, state = scorer
    sound = {"index": 1, "kinds": ["sound"], "sounds": [{"at": 3, "expected": "z", "heard": "s"}], "stress": None}
    state["found"] = {"words": [{**sound, "function": False}], "pauses": [{"after": 0, "ms": 600}], "pace": "slow"}
    r = score()
    assert (r["score"], r["band"]) == (79, 3)  # 100 - major 8 - pause 5 - slow 8
    assert [(w["index"], w["severity"], w["kinds"]) for w in r["words"]] == [(1, "major", ["sound"])]
    # The same sound error in a function word is minor (3); flat intonation costs 5.
    state["found"] = {"words": [{**sound, "function": True}], "intonation": {"flat": True, "you": [], "reference": []}}
    assert score()["score"] == 92
    # A word only the trained model doubts is "unclear": minor from 0.10, major from 0.50, majors first.
    state["found"], state["confidence"] = {}, [0.2, 0.0, 0.6]
    r = score()
    assert [(w["index"], w["severity"], w["kinds"]) for w in r["words"]] == [(2, "major", ["unclear"]), (0, "minor", ["unclear"])]
    assert r["score"] == 89
    # Capped at 50 points however much is found.
    state["found"] = {"pauses": [{"after": 0, "ms": 600}] * 20}
    assert (score()["score"], score()["band"]) == (50, 1)
