// Shapes shared by the UI and the API client. They mirror spec/openapi.yaml;
// change both together.

/** CEFR-like bands: beginner A1–A2, intermediate B1–B2, advanced C1–C2. */
export type Level = "beginner" | "intermediate" | "advanced"

export const LEVELS: readonly Level[] = ["beginner", "intermediate", "advanced"]

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
}

export type TopicGroup = "situations" | "pairs" | "sounds"

export interface Topic {
  id: string
  /** situations: everyday phrases; pairs: contrasting-pair drills; sounds: phrases loaded with one American sound. */
  group: TopicGroup
  /** IPA symbol of a sound topic; null elsewhere. */
  symbol: string | null
  /** Heading a sound topic is listed under (Vowels, Diphthongs, Vowels with R, Consonants, American T); null elsewhere. */
  section: string | null
  name: string
  blurb: string
  /** Number of phrases per level. */
  counts: Record<Level, number>
}

export interface Word {
  /** The word as written in the phrase, punctuation included. */
  text: string
  /** Phonemes of the reference pronunciation, e.g. ["ˈs", "t", "eɪ", ...]. */
  phonemes: string[]
}

export interface Phrase {
  id: string
  text: string
  /** Null for phrases the user typed. */
  level: Level | null
  topicId: string | null
  words: Word[]
}

/** Where a word sits in a clip; nulls when unknown. */
export interface WordTime {
  startMs: number | null
  endMs: number | null
}

export interface ReferenceAudio {
  url: string
  durationMs: number
  /** One per phrase.words item. */
  words: WordTime[]
}

/** Four-step band, one scale for every level. 1 is weakest. */
export type Band = 1 | 2 | 3 | 4

export const BAND_LABEL: Record<Band, string> = {
  1: "Hard to follow",
  2: "Getting there",
  3: "Clear",
  4: "Very clear",
}

export interface SoundIssue {
  /** Index into the word's phonemes. */
  at: number
  expected: string
  /** null when the sound was dropped. */
  heard: string | null
}

export type IssueKind = "sound" | "swallowed" | "stress" | "unclear"

export interface WordIssue extends WordTime {
  /** Index into phrase.words. */
  index: number
  severity: "minor" | "major"
  kinds: IssueKind[]
  sounds: SoundIssue[]
  /** Phoneme indexes of the vowel that should carry the stress and the one that did. */
  stress: { expectedAt: number; heardAt: number } | null
  /** Sounds heard in this word (no stress marks). */
  heard: string[]
}

export interface Intonation {
  flat: boolean
  /** Pitch points (semitones from the speaker's median); null = unvoiced. */
  you: (number | null)[]
  reference: (number | null)[]
}

export type ScoreResult =
  | {
      status: "scored"
      phraseId: string
      /** 100 = as clear as the reference voice, minus points per problem found. */
      score: number
      band: Band
      /** Every word with a problem, weakest first. */
      words: WordIssue[]
      /** Long pauses: after word `after`. */
      pauses: { after: number; ms: number }[]
      pace: "slow" | null
      intonation: Intonation
    }
  | {
      status: "unscorable"
      phraseId: string
      reason: "too_short" | "too_quiet" | "noisy" | "off_phrase"
    }

export interface Attempt {
  audio: Blob
  durationMs: number
  /** Peak input level 0..1 seen while recording; only the mock reads it (the server measures the audio). */
  peakLevel: number
}

export class ApiError extends Error {
  code: "not_found" | "invalid" | "unauthorized" | "unknown"
  constructor(code: ApiError["code"], message: string) {
    super(message)
    this.code = code
  }
}
