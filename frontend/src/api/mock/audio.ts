// Fake reference voice for the mock (VITE_API=mock, the demo mode that needs no models):
// a hummed melody with one note per syllable, longer and higher on stressed syllables.
// The real backend synthesises speech with Kokoro.

import type { Phrase, ReferenceAudio } from "../types"
import { VOWELS, bare } from "./lexicon"

const RATE = 22050

export function synthesize(phrase: Phrase): ReferenceAudio {
  const notes: { f: number; ms: number; amp: number }[] = []
  const syllables = phrase.words.reduce(
    (n, w) => n + Math.max(1, w.phonemes.filter((p) => VOWELS.has(bare(p))).length),
    0,
  )
  const question = phrase.text.trim().endsWith("?")
  let k = 0
  phrase.words.forEach((w) => {
    let stressNext = false
    let sylInWord = 0
    for (const p of w.phonemes) {
      if (p.startsWith("ˈ")) stressNext = true
      if (!VOWELS.has(bare(p))) continue
      const t = k / Math.max(1, syllables - 1)
      let f = 200 - 70 * t // declination
      if (question && t > 0.75) f += 90 * (t - 0.75) * 4
      const stressed = stressNext || (w.phonemes.length <= 3 && sylInWord === 0)
      notes.push({ f: stressed ? f + 28 : f, ms: stressed ? 230 : 150, amp: stressed ? 0.9 : 0.6 })
      stressNext = false
      sylInWord++
      k++
    }
    if (sylInWord === 0) notes.push({ f: 160, ms: 120, amp: 0.5 })
    notes.push({ f: 0, ms: /[,;]$/.test(w.text) ? 220 : 45, amp: 0 })
  })

  const total = Math.round(((notes.reduce((s, n) => s + n.ms, 0) + 250) * RATE) / 1000)
  const pcm = new Float32Array(total)
  let pos = Math.round(0.12 * RATE)
  let phase = 0
  for (const n of notes) {
    const len = Math.round((n.ms * RATE) / 1000)
    for (let i = 0; i < len && pos + i < total; i++) {
      if (n.f === 0) continue
      const env = Math.min(1, i / (0.02 * RATE)) * Math.min(1, (len - i) / (0.05 * RATE))
      const vib = 1 + 0.012 * Math.sin((2 * Math.PI * 5.5 * i) / RATE)
      phase += (2 * Math.PI * n.f * vib) / RATE
      const s =
        Math.sin(phase) * 0.55 +
        Math.sin(2 * phase) * 0.25 +
        Math.sin(3 * phase) * 0.12 +
        Math.sin(5 * phase) * 0.05
      pcm[pos + i] = s * env * n.amp * 0.5
    }
    pos += len
  }

  const url = URL.createObjectURL(toWav(pcm))
  return { url, durationMs: Math.round((total / RATE) * 1000), words: phrase.words.map(() => ({ startMs: null, endMs: null })) }
}

function toWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, "RIFF")
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, "WAVEfmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, "data")
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([buf], { type: "audio/wav" })
}
