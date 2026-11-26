import type { KoleApi } from "../client"
import { ApiError, LEVELS, type Level, type Phrase, type ReferenceAudio, type Topic } from "../types"
import { synthesize } from "./audio"
import { phonemesFor } from "./lexicon"
import { TOPICS } from "./phrases"
import { score } from "./scoring"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toPhrase(id: string, text: string, level: Level | null, topicId: string | null): Phrase {
  const words = text
    .split(/\s+/)
    .filter((t) => /[a-z]/i.test(t))
    .map((t) => ({ text: t, phonemes: phonemesFor(t) }))
  return { id, text, level, topicId, words }
}

const ALL: Phrase[] = TOPICS.flatMap((t) =>
  LEVELS.flatMap((level) => t.phrases[level].map((text, i) => toPhrase(`${t.id}.${level}.${i}`, text, level, t.id))),
)

function topicOf(id: string): Topic {
  const t = TOPICS.find((x) => x.id === id)
  if (!t) throw new ApiError("not_found", `No topic ${id}`)
  return {
    id: t.id,
    group: t.group === "sounds" || t.group === "pairs" ? t.group : "situations",
    symbol: t.symbol ?? null,
    name: t.name,
    blurb: t.blurb,
    counts: { beginner: t.phrases.beginner.length, intermediate: t.phrases.intermediate.length, advanced: t.phrases.advanced.length },
  }
}

const audioCache = new Map<string, ReferenceAudio>()

export const mockBackend: KoleApi = {
  async listTopics() {
    await wait(120)
    return TOPICS.map((t) => topicOf(t.id))
  },
  async getTopic(id) {
    await wait(60)
    return topicOf(id)
  },
  async listPhrases(topicId, level) {
    await wait(120)
    topicOf(topicId)
    return ALL.filter((p) => p.topicId === topicId && p.level === level)
  },
  async randomPhrase(level, excludeId) {
    await wait(150)
    const pool = ALL.filter((p) => p.level === level && p.id !== excludeId)
    return pool[Math.floor(Math.random() * pool.length)]
  },
  async preparePhrase(text) {
    await wait(200)
    const clean = text.trim().replace(/\s+/g, " ")
    return toPhrase(`custom.${clean.toLowerCase()}`, clean, null, null)
  },
  async referenceAudio(phrase) {
    let a = audioCache.get(phrase.id)
    if (!a) {
      await wait(250)
      a = synthesize(phrase)
      audioCache.set(phrase.id, a)
    }
    return a
  },
  async scoreAttempt(phrase, attempt) {
    await wait(700 + Math.random() * 500)
    return score(phrase, attempt)
  },
}
