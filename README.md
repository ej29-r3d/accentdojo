# AccentDojo

English pronunciation practice that runs on your own machine. You hear a phrase in a natural
American voice, say it, and get a score, the words to fix, and the sounds you swapped.
Speech synthesis and scoring both run locally on CPU; no audio leaves the server.

It is a rehearsal tool for the time between lessons, not an assessment and not a teacher.

<p>
  <img src="docs/home.png" width="260" alt="Home screen: five ways to practise">
  <img src="docs/result.png" width="260" alt="Result: score, flagged word and the swapped sound">
</p>

Screenshots are from mock mode (see below), so the score shown is an example.

## What it does

- Five ways to practise: situations (18 topics), contrasting pairs (sheep / ship,
  desert / dessert), American sounds (American R, flap T, dark L, ...), random phrases, and
  any phrase you type (up to 15 words).
- Three levels: beginner (CEFR A1-A2), intermediate (B1-B2), advanced (C1-C2). A level
  changes which phrases you get, never how you are scored.
- A score from 0 to 100 where 100 means "as clear as the reference voice", and a four-step
  band.
- Flagged words with a reason: a substituted or dropped sound, a swallowed word, misplaced
  stress, or unclear. Notes for long pauses, slow pace and flat intonation, and a pitch
  curve of your take over the reference.
- "Could not score" with a reason (too short, too quiet, too noisy, different phrase)
  when the audio is not good enough to judge.
- Mobile first, installable as a PWA.

## What it does not do

- American English only, adult voices only.
- No accounts and no progress history. Access control is one optional shared password.
- One inference at a time: fine for a household, not for a classroom.
- The 1,200 built-in phrases were written by an AI model and have not been reviewed by a
  native speaker.

## How good is the scoring

Scoring uses [OpenPronounce](https://github.com/OpenPronounce/OpenPronounce): a wav2vec2
phone recogniser, forced alignment, and word and utterance models trained on
speechocean762. On top of that, AccentDojo compares each take with the same measurements on
the reference clip to find specific problems. The details, thresholds and measurements are
in [backend/README.md](backend/README.md). The short version:

- Expect about ±8 points of model error on the score.
- The detectors were checked for false alarms on clean synthetic speech (216 takes by four
  other voices: 2.9 % of words wrongly flagged for a sound, 2.3 % for stress) and on deliberately
  wrong synthetic takes. They have not been validated on labelled learner recordings.
- Every threshold is a first guess.
- Known miss: in very common phrases the recogniser can hear the sound it expects (it heard
  /θ/ in "I sink"), so some substitutions slip through.
- The list of learner substitutions leans towards Russian speakers, the first users.

## Try the interface without the models

The frontend ships with an in-browser mock of the API, so you can look around without
downloading anything large. Scores in this mode are made up.

```sh
cd frontend
npm install
VITE_API=mock npm run dev      # http://127.0.0.1:5173
```

## Run it for real

Requirements: Linux, Python 3.10-3.12 (Kokoro does not support 3.13 yet),
Node 20.19 or newer (or 22.12+), `ffmpeg` on the PATH, about 6 GB of disk. No GPU needed. macOS may work
but is untested.

```sh
# backend
cd backend
python3.11 -m venv .venv
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/bin/pip install -e '.[dev]'

# frontend, built once and served by the backend
cd ../frontend
npm install
npm run build

# run
cd ../backend
.venv/bin/uvicorn kole.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000.

- The first start downloads the models (about 2.7 GB: 2.4 GB for the recogniser, 0.3 GB for Kokoro, and a
  small spaCy model) from Hugging Face.
- The first start also renders the reference voice for every built-in phrase, about
  35 minutes on a 12-core CPU (measured on a fresh install; ready to score after 2 minutes). The app is usable meanwhile; phrases not yet rendered are
  just slower. Later starts take seconds.
- Browsers only allow the microphone on `localhost` or over HTTPS. To use it from a phone,
  put an HTTPS reverse proxy in front (Caddy, nginx, `tailscale serve`) and set a password.

### Configuration

All optional, read from the environment.

| Variable | Default | Meaning |
|---|---|---|
| `KOLE_PASSWORD` | unset | Shared password. Unset means no login at all, so set it before exposing the app beyond localhost. Changing it signs everyone out. |
| `KOLE_KEEP_TAKES` | off | `1` keeps every recording and its result in `backend/.cache/takes/` for tuning the detectors. Off: recordings are scored and discarded. |
| `KOLE_VOICE` | `af_heart` | Kokoro voice for the reference. |
| `KOLE_TORCH_THREADS` | `6` | CPU threads for inference. |
| `KOLE_CONTENT` | `content/topics.json` | Phrase file. |
| `KOLE_AUDIO_CACHE` | `backend/.cache/audio` | Rendered reference clips and their measurements. |
| `KOLE_DIST` | `frontend/dist` | Built frontend to serve. |
| `KOLE_ALLOWED_HOSTS` | unset | Dev server only: extra hostnames Vite accepts, comma-separated. |
| `VITE_API` | unset | `mock` runs the frontend against the in-browser mock. |
| `VITE_SOURCE_URL` | this repository | Build time: the source link shown in Settings. Point it at your fork if you serve a modified version (AGPL section 13). |

`deploy/kole-backend.service` is an example systemd user unit. It assumes the repository is
at `~/gh/kole` and sets `HF_HUB_OFFLINE=1`, so run the backend once by hand first to
download the models.

## Layout

- `spec/` - product spec and the OpenAPI contract. The contract is the source of truth: the
  backend tests exercise its routes and `frontend/src/api/types.ts` mirrors it.
- `backend/` - FastAPI service: Kokoro reference voice, OpenPronounce scoring, detectors.
- `frontend/` - React, Vite, TypeScript, Tailwind. Talks to the API through one interface
  with two implementations (HTTP and mock).
- `content/` - the phrases, tagged by topic and level.
- `deploy/` - example systemd unit.

## Development

```sh
(cd backend  && .venv/bin/python -m pytest -q && .venv/bin/ruff check .)   # no models needed
(cd frontend && npx tsc -b && npx oxlint src)
```

The code is still named `kole` (package, `KOLE_*` variables, systemd unit) after the
project's working title.

## How this was built

Most of the code and all of the phrase content were written with an AI coding agent (Claude
Code). I decided the product, the scoring design and the thresholds, tested it on my own
speech, and reviewed the changes. `CLAUDE.md` holds the rules the agent works under.

## Contributing

This is a personal project that I use and maintain in my spare time. Bug reports are
welcome, especially recordings-free descriptions of wrong or missed flags. Please open an
issue before a large pull request; I may be slow to answer.

## Licence

Copyright (C) 2026 Ilia Kolesnikov.

Code: [AGPL-3.0-or-later](LICENSE), because the backend builds on OpenPronounce, which is
AGPL. If you serve a modified version to other people, you must offer them your source.
To whatever extent the AI-assisted parts are copyrightable, they are covered by the same
licence.

Phrases in `content/`: [CC0 1.0](content/LICENSE).

Third-party software, models and fonts: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
