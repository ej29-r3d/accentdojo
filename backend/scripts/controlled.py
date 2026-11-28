"""Controlled learner errors: Kokoro reads a respelled phrase, the detectors judge it against the real one.

    PYTHONPATH=. .venv/bin/python scripts/controlled.py

Each case is (phrase, what the voice reads, word expected to be flagged for a sound). The
reference is af_heart reading the phrase; each respelling is read by af_heart and am_michael.
"""
import numpy as np

from accentdojo import analysis, content
from accentdojo.scoring import Scorer
from accentdojo.tts import Tts

CASES = [
    ("It was very good.", "It was bery good.", "very"),            # v -> b
    ("Turn on the light.", "Turn on the right.", "light"),          # l -> r
    ("I really like rice.", "I leally like lice.", "really"),       # r -> l
    ("Pass me a pen.", "Pass me a ben.", "pen"),                     # p -> b
    ("A cup of coffee.", "A cup of copy.", "coffee"),               # f -> p
    ("Yes, of course.", "Jes, of course.", "Yes"),                 # j -> dʒ
    ("I got the job.", "I got the yob.", "job"),                    # dʒ -> j
    ("I usually walk.", "I yujually walk.", "usually"),             # ʒ -> dʒ
    ("Ship it today.", "Chip it today.", "Ship"),                   # ʃ -> tʃ
    ("Think about it.", "Sink about it.", "Think"),                 # θ -> s
    ("We went home.", "Ve vent home.", "We"),                       # w -> v
    ("It is easy.", "It is eesy.", "easy"),                         # z -> s
    ("I walk to school.", "I walk to eh school.", "school"),        # added vowel before an s-cluster
    ("Stop here, please.", "Sutop here, please.", "Stop"),         # added vowel inside a cluster
    ("Take the bus.", "Take the buh.", "bus"),                      # dropped final consonant
    ("Sit in the sun.", "Sit in the suh.", "sun"),                  # dropped final consonant
]
VOICES = ["af_heart", "am_michael"]

sc = Scorer(); sc.load()
tts = Tts(); tts.load()


def synth(text, voice):
    parts = [x.audio.numpy() for x in tts.pipeline(text, voice=voice) if x.audio is not None]
    import librosa
    return librosa.resample(np.concatenate(parts), orig_sr=24000, target_sr=16000).astype(np.float32)


def measure(p, wav):
    r = sc._assess(wav, " ".join(w.text for w in p.words))
    return analysis.measure(p, wav, r["differences"]["words"])


caught = total = clean_flags = 0
for text, spoken, target in CASES:
    p = content.prepare(text)
    ref = measure(p, synth(text, "af_heart"))
    for v in VOICES:
        out = analysis.compare(p, measure(p, synth(spoken, v)), ref)
        flagged = {p.words[w["index"]].text.strip(".,?!"): w["sounds"] for w in out["words"] if "sound" in w["kinds"]}
        hit = target in flagged
        caught += hit; total += 1
        clean = analysis.compare(p, measure(p, synth(text, v)), ref)
        clean_flags += sum("sound" in w["kinds"] for w in clean["words"])
        take = measure(p, synth(spoken, v))
        ti = next(i for i, w in enumerate(p.words) if w.text.strip(".,?!") == target)
        heard = "".join(take["words"][ti]["heard"]) if take["words"][ti] else "-"
        print(f"{'caught' if hit else 'MISSED'}  {v:10}  {spoken:24} heard /{heard}/  {flagged.get(target, '')}")
print(f"\n{caught} of {total} controlled errors caught; {clean_flags} sound flags on the same phrases read correctly")
