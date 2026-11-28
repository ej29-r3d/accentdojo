# Accent Dojo backend

FastAPI service implementing `spec/openapi.yaml`: topics and phrases from
`content/topics.json`, a Kokoro reference voice, and pronunciation scoring with
OpenPronounce. One uvicorn process, models warmed in a background thread at startup
(`/api/health` reports readiness), one inference at a time behind a lock shared by TTS
and scoring (`503` + `Retry-After` when more than 4 requests wait).

## Setup

Python 3.10-3.12 (Kokoro needs < 3.13). The root `README.md` has the full install.

```sh
cd backend
python3.11 -m venv .venv
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/bin/pip install -e '.[dev]'
```

First run downloads `facebook/wav2vec2-lv-60-espeak-cv-ft` (2.4 GB on disk), `hexgrad/Kokoro-82M`
and spaCy `en_core_web_sm` (misaki). The systemd unit then runs with `HF_HUB_OFFLINE=1`.
Needs `ffmpeg` on PATH.

## Modules

| File | Role |
|---|---|
| `accentdojo/app.py` | Routes, error shapes (`{code, message}`), inference lane, warm-up, pre-rendering of every built-in phrase |
| `accentdojo/content.py` | Loads topics; typed phrases (`custom.<base64url(text)>` ids, max 15 words / 140 chars) |
| `accentdojo/g2p.py` | Display words and phonemes from OpenPronounce's CMUdict mapping, plus stress marks |
| `accentdojo/tts.py` | Kokoro `af_heart`, WAV cache in `.cache/audio/` keyed by engine, voice, speed and text |
| `accentdojo/audio.py` | ffmpeg decode to 16 kHz mono through a `/dev/shm` temp file, deleted at once |
| `accentdojo/scoring.py` | Quality gates, OpenPronounce call, reference-relative score, band, penalties |
| `accentdojo/analysis.py` | Detectors compared against the reference clip: sounds, swallowed words, stress, pauses, pace, intonation |

## Scoring

OpenPronounce 1.1.0 (AGPL-3.0-or-later; pinned, since its scale changed between releases),
called as `compare_audio_with_text(wav, text, acoustic=False, transcription=False,
prosody=False)`: one wav2vec2 phone-recogniser pass, CTC forced alignment, GOP features,
then its word and utterance models trained on speechocean762. Nothing is sent off the
machine; no gTTS.

- **Unscorable**, checked in order: `too_quiet` (silent or below -60 dBFS), `too_short`
  (under 0.5 s, or under 0.4 s of speech), `noisy` (SNR below 10 dB on takes of 2 s or
  more, or clipping), `off_phrase` (OpenPronounce's sentence-match probability below 0.5,
  unless at most half the words are just missing, or a lot of speech outside the sentence).
- **Score** shown = 100 × take total / reference total, capped at 100. The reference total
  is OpenPronounce's total for Kokoro's own reading of the phrase, computed once with the
  word times and cached in `.cache/audio/<key>.words.json` (measured on the first 54 phrases written: 72–88, median
  79; clamped to 75–95). Typed phrases get their reference rendered at first score if needed.
- **Band** from the shown score: below 55 → 1, 55 → 2, 75 → 3, 90 → 4 (`BAND_CUTS`; the
  earlier raw cuts 45 / 62 / 75 at a reference of ~83).
  Still a first guess, to be re-fitted on labelled learner takes.
- **Words**: every word whose mispronunciation probability is ≥ 0.10 (`minor`) or ≥ 0.50
  or missing (`major`), weakest first, never dictionary guesses. On Kokoro's readings of
  those 54 phrases no word goes above 0.07; OpenPronounce's own error threshold is 0.354.
  Per-sound probabilities are too noisy to use for this (clean Kokoro speech reaches 0.84).
- **Detectors** (`accentdojo/analysis.py`): strict sounds, swallowed words, stress, long pauses,
  slow pace, flat intonation, plus word-aligned pitch curves. Each compares the take with the
  same measurements on the reference clip (cached with the word times, `REF_VERSION`).
  Detected problems take points off the shown score (`PENALTY`: major word 8, minor 3, pause 5, slow 8, flat 5; capped at 50), and the band follows the shown score.
  False alarms on clean readings by am_michael / am_adam / af_bella / af_nicole (216 takes,
  1200 words; `scripts/calibrate.py 54`, the first 54 phrases, re-run 2026-11-28 with the
  substitutions, final drops and added vowels for other first languages): sound 2.8 % of words
  (2.8 % before those were added), swallowed 0 %, stress 2.2 %, slow 1 take, flat 6 takes,
  pauses 18 takes. An earlier, easier phrase set gave 1.1 % and 0.1 %; the harder phrases raise
  the false alarms.
  Controlled errors (`scripts/controlled.py`: af_heart and am_michael read a respelled phrase,
  judged against the real one): 31 of 32 caught, covering v→b, l→r, r→l, p→b, f→p, j→dʒ, dʒ→j,
  ʒ→dʒ, ʃ→tʃ, θ→s, w→v, z→s, an added vowel before an s-cluster and inside one, and dropped
  final s and n. Missed: am_michael's "eh school" (the vowel was not heard). Kokoro will not
  add a vowel after a final consonant, so that check is covered by unit tests only.
  Earlier hand-made checks, not scripted: ɪ→i, ð→z, ʌ→æ, wrong stress on recommend / revisit /
  allergic / penicillin, a missing word, a 0.9 s pause, speed 0.55 were caught; "I sink" was
  missed (the recogniser itself heard /θ/).
- **Takes** are discarded after scoring. With `ACCENTDOJO_KEEP_TAKES=1` each take is saved with
  its result in `.cache/takes/` (git-ignored) for tuning the detectors.
- **Different phrase.** Besides OpenPronounce's own alignment check, a take whose relative
  score is below 18 (`OFF_PHRASE_RELATIVE`, before penalties) is `off_phrase`, not a score.
  The reference voice reading one built-in phrase against another (`scripts/wrong_phrase.py`,
  30 pairs) lands at 10-14 when it gets past alignment; real takes of the right phrase at 48
  and up (21 for one cut off halfway). With the cut: 30 of 30 wrong pairs refused (17
  before), 30 of 30 correct readings scored, 60 real takes unchanged, and 3 real takes of a
  phrase that was later rewritten all refused (2 before).
- The trained word model is lenient on accent-only swaps ("beel" for "bill" scores 0.002);
  the strict sound detector covers those.

The model follows the raters and is lenient on accent traits they rarely mark down: in
tests "sink" for "think" and "beel" for "bill" were not flagged, while "Vere" for "Where" (w→v)
and dropped words were.

## Measurements (one home server, 2026-11-23)

12 cores, no GPU, `torch.set_num_threads(6)`, taken when the content was 54 phrases (it is
1,794 now; the figures have not been re-run on the full set). Those phrases are 1.4-3.5 s of audio
(median 2.2 s). Run `PYTHONPATH=. .venv/bin/python scripts/bench.py` to repeat.

| Step | p50 | p95 | max |
|---|---|---|---|
| Kokoro synthesis, uncached (54 phrases) | 577 ms | 828 ms | 867 ms |
| Reference audio, cached | file served directly | | |
| ffmpeg decode to 16 kHz | 49 ms | 54 ms | 128 ms |
| Scoring (gates + OpenPronounce) | 489 ms | 610 ms | 644 ms |
| `POST /score` over HTTPS on the local network, 1.8 s take (curl, webm and m4a) | ~0.5 s | | |
| Startup: scorer load + warm-up | 4-20 s (cold disk cache ~20 s) | | |
| Startup: Kokoro load + warm-up | 2.5-4.5 s | | |

A 3.8 s browser take (speech plus trailing silence) scored in 1.27 s server-side.
Self-check: Kokoro's own readings of those 54 phrases come out band 4 (51) or
band 3 (3), with no words flagged. Silence, a 0.3 s blip, white noise, a noisy take and a
different phrase all come back unscorable with the expected reason.

## Startup and cache

Every built-in phrase (1,794) is pre-rendered at startup: Kokoro clip, word times, reference
total and detector measurements, about 1.7 s per phrase, so the first start after new
content takes about 35 minutes (measured on a fresh install, 12 cores) while the API already serves requests. Everything lands in
`.cache/audio/` and later starts take seconds. Bumping `scoring.REF_VERSION` recomputes the
measurements (not the clips).

## Deployment

One process serves both the API and `frontend/dist` (built with `npm run build`). Put an
HTTPS proxy in front for anything beyond localhost: browsers need HTTPS for the microphone.
`deploy/accentdojo-backend.service` is an example systemd user unit.

- **Password.** With `ACCENTDOJO_PASSWORD` set, every `/api` route except `health`, `session` and
  `login` needs the `accentdojo_session` cookie, set by `POST /api/login`. The cookie is an HMAC of
  the password, so changing the password signs everyone out. Without `ACCENTDOJO_PASSWORD` the gate
  is off and a warning is logged at startup.
- **Guessing.** Wrong passwords are answered one at a time, one second apart; a wrong guess
  queued more than 10 s ahead gets `429`. The right password is never refused.
- **Request size.** Bodies over 4 KB on `/api/login` and over 3 MB elsewhere get `413` before
  anything is buffered. Recordings are capped at 2 MB and 15 s; ffmpeg stops decoding at 16 s.
- **Recordings** are discarded after scoring unless `ACCENTDOJO_KEEP_TAKES=1`.
