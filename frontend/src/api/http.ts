// AccentDojoApi over HTTP: the FastAPI backend in backend/, same origin under /api
// (Vite proxies /api to it in dev). Shapes follow spec/openapi.yaml.

import type { AccentDojoApi } from "./client"
import { ApiError, type Attempt, type Level, type Phrase, type ReferenceAudio, type ScoreResult, type Topic } from "./types"

const BASE = "/api"
export const UNAUTHORIZED = "accentdojo:unauthorized"

/** Is a password needed, and does this browser already have a session? */
export async function getSession(): Promise<{ required: boolean; authenticated: boolean }> {
  const res = await fetch(`${BASE}/session`)
  return res.ok ? res.json() : { required: false, authenticated: true }
}

export async function login(password: string): Promise<"ok" | "wrong" | "wait"> {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
  return res.ok ? "ok" : res.status === 429 ? "wait" : "wrong"
}

async function call<T>(path: string, init?: RequestInit, retries = 6): Promise<T> {
  const res = await fetch(BASE + path, init)
  // 503 while models warm up or the inference lane is busy: wait and retry.
  if (res.status === 503 && retries > 0) {
    const after = Number(res.headers.get("Retry-After")) || 2
    await new Promise((r) => setTimeout(r, Math.min(after, 5) * 1000))
    return call(path, init, retries - 1)
  }
  if (res.status === 401) {
    // The shared password is missing or changed: the gate in App.tsx shows the password screen.
    window.dispatchEvent(new Event(UNAUTHORIZED))
    throw new ApiError("unauthorized", "Password needed.")
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    let code: ApiError["code"] = "unknown"
    try {
      const body = await res.json()
      message = body.message ?? message
      if (body.code === "not_found" || body.code === "invalid") code = body.code
    } catch {
      // not JSON
    }
    throw new ApiError(code, message)
  }
  return res.json() as Promise<T>
}

const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined))
  return s.size ? `?${s}` : ""
}
const enc = encodeURIComponent

function extension(type: string) {
  if (type.includes("mp4") || type.includes("aac")) return "m4a"
  if (type.includes("ogg")) return "ogg"
  if (type.includes("wav")) return "wav"
  return "webm"
}

export const httpBackend: AccentDojoApi = {
  listTopics: () => call<Topic[]>("/topics"),
  getTopic: (id) => call<Topic>(`/topics/${enc(id)}`),
  listPhrases: (topicId, level: Level) => call<Phrase[]>(`/topics/${enc(topicId)}/phrases${q({ level })}`),
  randomPhrase: (level, excludeId) => call<Phrase>(`/phrases/random${q({ level, exclude: excludeId })}`),
  preparePhrase: (text) =>
    call<Phrase>("/phrases/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  referenceAudio: (phrase) => call<ReferenceAudio>(`/phrases/${enc(phrase.id)}/reference`),
  scoreAttempt: (phrase, attempt: Attempt) => {
    const form = new FormData()
    form.append("audio", attempt.audio, `take.${extension(attempt.audio.type)}`)
    form.append("durationMs", String(Math.round(attempt.durationMs)))
    return call<ScoreResult>(`/phrases/${enc(phrase.id)}/score`, { method: "POST", body: form })
  },
}
