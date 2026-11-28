# Third-party software, models and fonts

Accent Dojo incorporates or depends on the following. Model weights are downloaded at run
time and are not part of this repository.

## Scoring

- OpenPronounce 1.1.0, (c) 2025-2026 Jean-François Lépine, AGPL-3.0-or-later.
  https://github.com/OpenPronounce/OpenPronounce
  - Its scoring models are trained on speechocean762 (Zhang et al., 2021), CC BY 4.0.
    https://www.openslr.org/101
  - CMUdict, (c) 1993-2015 Carnegie Mellon University, BSD-style licence.
- facebook/wav2vec2-lv-60-espeak-cv-ft, Apache-2.0.
  https://huggingface.co/facebook/wav2vec2-lv-60-espeak-cv-ft

## Reference voice

- Kokoro-82M weights, and the kokoro and misaki packages, hexgrad, Apache-2.0.
  https://huggingface.co/hexgrad/Kokoro-82M
- phonemizer-fork, GPL-3.0-or-later.
- eSpeak NG (through espeakng-loader), GPL-3.0-or-later.
- spaCy and the en_core_web_sm model, Explosion, MIT.

## Backend libraries

- PyTorch (BSD-3-Clause, with bundled third-party components under their own licences),
  NumPy, SciPy, scikit-learn, Uvicorn: BSD-3-Clause.
- FastAPI: MIT.
- python-multipart: Apache-2.0.
- soundfile: BSD-3-Clause; its wheel bundles libsndfile, LGPL-2.1-or-later.
- Transformers: Apache-2.0.
- librosa: ISC.
- FFmpeg, run as an external program: LGPL / GPL.

## Frontend

- Geist, (c) Vercel, SIL Open Font License 1.1.
- Noto Sans, (c) The Noto Project Authors, SIL Open Font License 1.1.
- React, React Router, Base UI, Tailwind CSS, tw-animate-css, clsx, tailwind-merge,
  vite-plugin-pwa, Workbox: MIT.
- Lucide icons: ISC.

## Mouth diagrams (`frontend/public/diagrams/`)

- 23 diagrams by Richard Wright and Dan McCloy, University of Washington, public domain (CC0 1.0).
  https://github.com/drammock/phonetics-teaching-assets
  Cropped to the mouth, with darker lines and fills.
- `sound-r.svg` ("Bunched r") and `sound-w.svg` ("Voiced labial-velar approximant") by Tavin and
  Nardog, Wikimedia Commons, CC BY-SA 4.0, unchanged.
  https://commons.wikimedia.org/wiki/File:Bunched_r.svg
  https://commons.wikimedia.org/wiki/File:Voiced_labial-velar_approximant.svg
  https://creativecommons.org/licenses/by-sa/4.0/
