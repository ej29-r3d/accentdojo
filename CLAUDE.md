# AccentDojo

Instructions for AI coding agents working in this repository. English pronunciation
practice: hear a phrase in a natural voice, say it, get a score and the words to fix. Read
`README.md`, then `spec/product.md` (what to build) and `spec/openapi.yaml` (the API
contract). The code keeps the working title `kole` (package, `KOLE_*` variables, cookie,
localStorage keys).

## Layout

- `frontend/` — React 19 + Vite + TypeScript + Tailwind v4 + Base UI. Mobile first.
- `backend/` — FastAPI service: Kokoro TTS + OpenPronounce scoring (AGPL). See `backend/README.md`.
- `content/` — `topics.json`: 49 topics in three groups (18 situations, 17 contrasting pairs, 14 American sounds), 1,200 phrases; read by the backend and the mock.
- `deploy/` — example systemd user unit for the backend.
- `spec/` — product spec and OpenAPI contract. Update them in the same change as the code.

## Commands (frontend)

```sh
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173, proxies /api to 127.0.0.1:8000
npx tsc -b           # typecheck
npm run build        # typecheck + production build into frontend/dist
npx oxlint src       # lint
```

`VITE_API=mock npm run dev` runs the UI against the in-browser mock instead of the backend.

## Commands (backend)

```sh
cd backend
.venv/bin/python -m pytest -q                       # contract and detector tests, no models needed
.venv/bin/ruff check .                              # lint
PYTHONPATH=. .venv/bin/python scripts/bench.py      # latency + Kokoro self-check (loads models)
.venv/bin/uvicorn kole.app:app --port 8000          # serves the API and frontend/dist
```

Python 3.10–3.12 (Kokoro needs < 3.13). The microphone only works over HTTPS or localhost.

## Architecture rules

- The UI talks only to `frontend/src/api/client.ts` (`KoleApi`), implemented over HTTP in
  `src/api/http.ts` (default) and by the in-browser mock (`VITE_API=mock`).
  `src/api/types.ts` mirrors `spec/openapi.yaml` — change both together.
- Levels are Beginner (A1–A2), Intermediate (B1–B2), Advanced (C1–C2), codes never shown in the UI; ids `beginner` / `intermediate` / `advanced`.
  They choose phrases only; scoring uses one scale at every level. A harder level means harder
  sounds and words, not longer phrases.
- Result model: score 0–100 (100 = reference voice) plus a four-step band label; flagged words
  (sound, swallowed, stress, unclear) graded `major` / `minor` and underlined; "You said" line
  with only the confirmed errors; at most three word cards (Listen / Mine only,
  "+N more"); no separate summary of the same errors; notes for long pauses, slow, flat intonation; an intonation chart; an
  `unscorable` state with a reason. See spec/product.md §Result.
- Backend: one process, models warmed at startup, one inference at a time. Recordings are
  kept only when `KOLE_KEEP_TAKES=1` (in `backend/.cache/takes/`); never commit them.
- Never claim a measurement in a README or the spec that `backend/scripts/` cannot reproduce.

## Design rules

- Vercel/Geist look: black, white, greys, 1px borders, Geist Sans, large type, dark default.
- One orange accent (`--score`, Tailwind `text-score` / `bg-score` / `bg-score-soft`) for
  "your voice" and key navigation cues. Never for errors. Keep light-mode contrast ≥ 4.5:1.
- **No monospace UI text, no small uppercase letter-spaced labels, no "01 02 03" numbering.**
  Counters read "2 of 5". Phonemes use `font-ipa` (Noto Sans).
- No instructional paragraphs, tutorials or step strips. Make controls self-explanatory;
  every icon button has a short visible label.
- Choices look like separate, equal, tappable cards. Keep flows short (topic → practice
  directly; typing happens on the practice screen).
- Level is one header chip on every screen (sheet on phones, menu on desktop). Settings
  (gear) holds theme.
- Mobile first at 390px; check desktop (1440px) too. Thumb-reachable controls at the bottom.
- Verify UI changes with screenshots at both sizes before reporting.

## Git

- Work on a branch and open a pull request; do not commit to `main` directly.
- Typecheck, lint and tests must pass before a merge.
