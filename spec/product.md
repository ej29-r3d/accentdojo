# Accent Dojo: product spec (v1)

What the app is and how it behaves. The API contract is `spec/openapi.yaml`; the
frontend's `src/api/types.ts` must stay in step with it.

## What Accent Dojo is

A self-hosted pronunciation-practice web app. You hear a short English phrase in a natural
voice, record yourself, replay both, and get a score, a rough clarity band and the words
to work on. It runs on a home server with local models and is used from a phone
(primary) or a desktop browser.

It is a rehearsal tool between lessons, not a teacher replacement: learners comparing their own
recording catch about a quarter of their errors unaided, so Accent Dojo points at where to listen,
and keeps phrases short.

## Users and platform

- Adults learning English, whatever their first language: one household sharing one password.
- Mobile first: a 390 px phone held in one hand; desktop is a scaled-up layout, not a
  different app.
- Installable PWA. The microphone needs HTTPS, so anything beyond localhost is served
  through an HTTPS proxy, behind one shared password (password screen on first visit).
  Settings links to the source code (AGPL-3.0) and says the server may keep recordings.

## Screens and flows

Header on every screen: back (or logo on home), title, **level chip**, **settings**.

| Screen | Route | Purpose |
|---|---|---|
| Home | `/` | Heading "American accent practice" (says what the app is), subtitle "Choose how to practise", and five equal choice cards, in this order: American sounds, Contrasting pairs, Pick a topic, Random phrase, Type your own. |
| Topics | `/topics` | List of situation topics. Tapping one goes **straight to practice at phrase 1** (no phrase-list screen). |
| Contrasting pairs | `/pairs` | Same list layout, one row per contrast (sheep / ship). No pictures. |
| American sounds | `/sounds` | Same list layout under section headings (Vowels, Diphthongs, Vowels with R, Consonants, American T), one row per sound: its IPA symbol in the icon slot and a name with a key word ("ee in see"). No second line of example words. |
| Practice: topic | `/practice/topic/:topicId/:index` | Shared practice screen. Only the current phrase: no phrase counter and no list of the topic's phrases. |
| Practice: random | `/practice/random` | Shared practice screen; Next fetches another random phrase at the current level. |
| Practice: your own | `/practice/custom` | Typing happens **on the practice screen**, in the phrase's place. Done turns the text into the phrase; tapping Record while typing starts recording straight away; a pencil edits; "New phrase" clears. |

Taps from home to speaking: topic, pair or sound 3, random 2, your own 1 + typing. Back and
"Finish topic" return to the list the topic came from.

### Practice screen

- The phrase in large type without its closing full stop (? and ! stay), phonemes (IPA) beneath it.
- Thumb dock at the bottom on phones (sticky panel on the right on desktop) with three
  labelled controls: **Listen** (reference voice), **Record** (big round button,
  tap to start, tap to stop; auto-stops after a pause or 10 s), **My take** (replay).
  Listen and My take each have a small **Slow** button under their label: the same clip at
  0.7× speed, pitch kept (word cards have one beside Listen and Mine too).
  Below: **Next phrase** (or "Finish topic" on the last topic phrase, "New phrase" for your own).
- No instructional text. The next control to use carries a soft orange focus ring:
  Listen first, then Record.
- Record label changes with state: Record → "Stop · 0:04" → "Checking" → "Again".
- Desktop keys: Space record/stop, R listen, Y my take (Shift+R / Shift+Y slowly), N or → next.

### Result (replaces the empty space under the phrase)

- **Score and band**: the score 0–100 in large type ("82 / 100") with the band label beside
  it and a plain bar filled to the score. **100 means as clear as the reference voice**: the
  raters' scale tops out around 80–85 even for clean native speech, so the shown score is
  the take's total divided by Kokoro's own total for the same phrase. One scale for every level: below 55 Hard to follow, 55 Getting there,
  75 Clear, 90 Very clear. About ±8 points of model error.
- **Problems flagged**: Accent Dojo flags what a
  teacher would point at, not only what the trained raters' model marks down. Detectors in
  `backend/accentdojo/analysis.py`, each checked for false alarms on clean readings by four other
  Kokoro voices:
  - **Sound**: a learner substitution (θ→s, w→v, ð→z, ɪ→i, æ→ɛ, final devoicing, …) or a
    dropped sound, from the recognised phones; vowels only in stressed syllables of content
    words. 2.9 % of clean words flagged.
  - **Swallowed**: a word not said, or much shorter than in the reference / most sounds missing.
  - **Stress**: another syllable clearly more prominent (loudness, length, pitch) than the
    stressed one, relative to the reference. 2.3 % of clean words flagged.
  - **Unclear**: the trained model doubts the word but no specific reason was found.
  - **Long pause** inside the phrase, **Slow** (1.6× the reference or more), **Flat
    intonation** (pitch range far narrower than the reference's): notes under the score.
- **Phrase**: every flagged word underlined (solid major, dotted minor); a ‖ marks a long pause.
- **You said**: under the reference IPA, the same sounds with only the confirmed errors
  swapped in (orange), a dropped sound as `_`, a swallowed word as "—"; other words dimmed.
- **Word cards**, weakest first, at most three plus "+N more": the word, what kind of
  problem, its IPA with the wrong sounds marked, one line per wrong sound ("w as in we →
  closer to v as in very") and the stress as written vs as said, then Listen / Mine (just
  that word from the reference clip and from the take), each with a Slow button. No extra "right vs yours"
  synthesised variants: one pair of buttons is enough. One list only: no separate "work on"
  summary.
- **Intonation**: the take's pitch curve over the reference's, aligned word by word.
- Known gap: the phone recogniser can "hear" the expected sound in very common phrases
  (it heard /θ/ in "I sink"), so some substitutions slip through.
- **Could not score** instead of a band when the audio fails checks: Too short, Too quiet,
  Too noisy, or Different phrase. The take is still replayable.

### Levels

Beginner, Intermediate, Advanced, modelled on CEFR bands without the
sub-steps: Beginner = A1–A2, Intermediate = B1–B2, Advanced = C1–C2. The bands guide phrase writing only; the UI never shows the
CEFR codes. API ids `beginner`,
`intermediate`, `advanced`; a level saved under the old names (medium, difficult) is carried
over. **Levels choose which phrases you get (topics and random); they never change scoring.** The level is a single chip in the header ("Level Beginner ⌄"),
opening a bottom sheet on phones and a menu on desktop, each option just its name, no
description. Not asked on first launch; default Beginner. Changing it on a topic practice
screen restarts the topic at phrase 1 of the new level.

### Settings

Gear button in the header. v1 holds Theme (Dark, Light, System; dark by default). Room for
later items (voice, speed, accent).

## Visual design

- Vercel/Geist look: black, white and greys, 1 px borders, large confident type, Geist Sans.
- **One accent, orange**, meaning "you and your voice" plus key navigation cues: logo,
  home card icons and arrows, selected level, Listen focus ring and
  playback progress, the record dot, the band meter, weak words and the mismatched sound.
  Light `#cd4100` (4.8:1 on white), dark `oklch(0.76 0.16 60)`. The record dot uses the
  opposite value because the record button is inverted. Never use the accent for errors.
- **Logo and app icon**: four black sound bars with an orange (`#cd4100`)
  acute accent over the tallest bar, on white, in both themes. One drawing serves the header
  mark, the favicon and the home-screen icons (`frontend/public/`).
- No monospace UI text, no small uppercase letter-spaced labels, no zero-padded numbers
  ("01"). Counters read "2 of 5".
- Phonemes are set in Noto Sans (Geist lacks most IPA glyphs).
- Every icon button has a visible text label. No tutorials or explanatory paragraphs;
  if a control needs explaining, change the control.

## Content

- Phrases are written by us, tagged by topic and level, stored in `content/topics.json`
  (shared by the backend and the frontend mock). 1,452 phrases in three groups, each with its
  own entry on the home screen:
  - **Situations** (`situations`): 18 everyday topics (American wording), 10 phrases per level.
  - **Contrasting pairs** (`pairs`): 17 contrasts: sheep/ship, bad/bed, cup/cap,
    work/walk, fool/full, boat/bought, wet/vet, bad/bat, pin/bin, think/sink, then/Zen,
    sing/sin, hair/air, cot/cut, late/let, three/tree and word stress (desert/dessert).
    8 items per level: word pairs first, then sentences that put both sides close together
    (6 + 2 at Beginner, 4 + 4 at Intermediate, 3 + 5 at Advanced).
  - **American sounds** (`sounds`): 28 sounds, each a topic with an IPA `symbol` and a
    `section`, listed in this order. Vowels: i ɪ ɛ æ ʌ ɑ ʊ u ə. Diphthongs: eɪ aɪ ɔɪ aʊ oʊ.
    Vowels with R: ɝ (her), ɑɹ, ɔɹ, ɛɹ, ɪɹ. Consonants: ɹ ɫ θ ð w h ŋ. American T: ɾ (water),
    ʔ (button). Not included yet: p b t d k g f
    v s z ʃ ʒ ʧ ʤ m n j, and /ɔ/ (merged with /ɑ/ for many Americans). 6 phrases per level,
    loaded with that sound.
  - Written by AI, not yet reviewed by a native speaker.
- **A harder level means harder sounds and words, not longer phrases** (a first, easier set proved too simple). Beginner keeps A1–A2 vocabulary but picks words that are hard to
  say (Thursday, throat, vegetables, thirty/thirteen); Intermediate uses B1–B2 words with
  clusters and shifting stress (itinerary, thoroughly, refrigerator); Advanced uses C1–C2
  words and dense runs of hard sounds (rural, unequivocally, anesthesiologist).
  Lengths: beginner 2–6 words, intermediate and advanced 2–9 (the pairs topics have
  two-word items at every level).
- Every word is in the scorer's dictionary (CMUdict); a word it would have to guess is not
  used in built-in phrases.
- Reference phonemes per word are derived by the backend at load time (US, CMUdict
  through OpenPronounce's G2P), so they always match the scorer's phoneme set.
- Typed phrases: at most 15 words; dictionary misses are shown but never flagged.

## Backend (v1)

- FastAPI, one process, models loaded and warmed at startup, one inference at a time
  behind a queue.
- **TTS:** Kokoro-82M, US voice `af_heart`, cached per phrase on disk; all built-in
  phrases are pre-rendered at startup. Engine swappable.
- **Scoring:** OpenPronounce 1.1.0 (AGPL-3.0-or-later): wav2vec2
  phoneme CTC + forced alignment + GOP features + models trained on speechocean762.
  Accent Dojo divides its utterance total by the same total for the reference clip to get
  the shown score, maps that to the band with fixed cutpoints, and runs its own detectors
  (`backend/accentdojo/analysis.py`) against the reference clip for the flagged problems.
  Details in `backend/README.md`.
- Audio decoded with ffmpeg to 16 kHz mono via a RAM temp file. Recordings are discarded
  after scoring; with `ACCENTDOJO_KEEP_TAKES=1` every take and its result are kept in
  `backend/.cache/takes/` (git-ignored) for tuning the detectors.
- Target under 2 s from end of upload to result for a short phrase. Measured about 0.5 s
  (see `backend/README.md`).
- **Licence consequence:** Accent Dojo links AGPL code, so it is AGPL-3.0-or-later itself and
  Settings links to the source for everyone it is served to.

## Out of scope for v1

Accounts, history/progress tracking, child voices,
single-word drills, multiple target accents, Docker packaging, native apps.

## Open questions

Decided: scoring licence → AGPL OpenPronounce; target accent → US only in v1;
typed phrases → capped at 15 words.

1. Is there a "move on" rule per level (e.g. second-best band at Beginner)?
2. Export a take to send to a teacher — v1 or v1.1?
3. Voice choice and speed control in Settings — v1 or later?
