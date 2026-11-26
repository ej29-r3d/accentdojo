// Fake scorer for the mock (VITE_API=mock). It never listens to the audio: it produces
// plausible, seeded results with the same shape the backend returns: a score and band,
// flagged words with at most one sound issue each, and pitch curves.

import type { Attempt, Band, Phrase, ScoreResult, WordIssue } from "../types"
import { bare } from "./lexicon"

// Common learner substitutions: expected sound -> what tends to be heard.
const SWAPS: Record<string, string> = {
  θ: "s", ð: "z", ɪ: "i", æ: "ɛ", ʊ: "u", w: "v", ŋ: "n", ɝ: "ɛ", v: "w", ʌ: "a", r: "ɾ", z: "s",
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h
}

const takes = new Map<string, number>()

export function score(phrase: Phrase, attempt: Attempt): ScoreResult {
  const take = (takes.get(phrase.id) ?? 0) + 1
  takes.set(phrase.id, take)
  const rand = rng(hash(phrase.id) ^ (take * 7919) ^ attempt.durationMs)

  if (attempt.durationMs < 600) return { status: "unscorable", phraseId: phrase.id, reason: "too_short" }
  if (attempt.peakLevel < 0.02) return { status: "unscorable", phraseId: phrase.id, reason: "too_quiet" }
  if (rand() < 0.06) return { status: "unscorable", phraseId: phrase.id, reason: "noisy" }

  // Later takes drift upward a little, like real practice.
  const r = Math.min(0.999, rand() + Math.min(0.25, (take - 1) * 0.06))
  const band: Band = r < 0.12 ? 1 : r < 0.42 ? 2 : r < 0.8 ? 3 : 4

  const candidates = phrase.words
    .map((w, i) => ({ i, w, weight: w.phonemes.length + (w.phonemes.some((p) => SWAPS[bare(p)]) ? 3 : 0) + rand() * 4 }))
    .filter((c) => c.w.phonemes.length >= 3)
    .sort((a, b) => b.weight - a.weight)
  const n = Math.min(5 - band, candidates.length)
  const words: WordIssue[] = candidates.slice(0, n).map((c, k) => {
    const at = c.w.phonemes.findIndex((p) => SWAPS[bare(p)])
    const sounds = at >= 0 ? [{ at, expected: bare(c.w.phonemes[at]), heard: SWAPS[bare(c.w.phonemes[at])] }] : []
    return {
      index: c.i,
      severity: k < 4 - band ? "major" : "minor",
      kinds: sounds.length ? ["sound"] : ["unclear"],
      sounds,
      stress: null,
      heard: c.w.phonemes.map((p) => SWAPS[bare(p)] ?? bare(p)),
      startMs: null,
      endMs: null,
    }
  })
  const total = Math.round([30, 52, 70, 84][band - 1] + rand() * 10)
  const flat = (n: number) => Array.from({ length: 48 }, (_, i) => Math.round(Math.sin(i / 7 + n) * (n ? 2 : 4) * 100) / 100)

  return {
    status: "scored",
    phraseId: phrase.id,
    score: total,
    band,
    words,
    pauses: [],
    pace: null,
    intonation: { flat: false, you: flat(1), reference: flat(0) },
  }
}
