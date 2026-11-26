// The only module the UI talks to. By default every call goes to the FastAPI
// backend over HTTP; set VITE_API=mock to run the UI against the in-browser mock.

import { httpBackend } from "./http"
import { mockBackend } from "./mock"
import type { Attempt, Level, Phrase, ReferenceAudio, ScoreResult, Topic } from "./types"

export interface KoleApi {
  listTopics(): Promise<Topic[]>
  getTopic(topicId: string): Promise<Topic>
  listPhrases(topicId: string, level: Level): Promise<Phrase[]>
  randomPhrase(level: Level, excludeId?: string): Promise<Phrase>
  /** Turn free text typed by the user into a practisable phrase. */
  preparePhrase(text: string): Promise<Phrase>
  referenceAudio(phrase: Phrase): Promise<ReferenceAudio>
  scoreAttempt(phrase: Phrase, attempt: Attempt): Promise<ScoreResult>
}

const backend: KoleApi = import.meta.env.VITE_API === "mock" ? mockBackend : httpBackend

export const api: KoleApi = backend

export * from "./types"
