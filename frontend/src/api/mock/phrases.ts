import type { Level } from "../types"
import content from "../../../../content/topics.json"

export interface TopicSeed {
  id: string
  group: string
  name: string
  blurb: string
  symbol?: string
  phrases: Record<Level, string[]>
}

// The phrase set lives in content/topics.json, shared with the backend.
export const TOPICS: TopicSeed[] = content.topics
