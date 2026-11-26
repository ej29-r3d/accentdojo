import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderState = "idle" | "requesting" | "recording" | "denied" | "unsupported"

export interface Take {
  blob: Blob
  url: string
  durationMs: number
  peakLevel: number
}

const MAX_MS = 10_000
const SILENCE_MS = 1_400
/** Before most of the phrase has been spoken, a silence is a mid-phrase pause: wait longer. */
const PAUSE_MS = 3_000
/** Share of the reference length that must be loud speech before a silence can end the take.
 * Loud frames cover roughly 60-70 % of a phrase, so 0.5 ≈ "nearly all of it said"; a speaker
 * much faster than the reference only waits PAUSE_MS instead of SILENCE_MS at the end. */
const SPOKEN_SHARE = 0.5
const SPEECH_RMS = 0.035
const SILENCE_RMS = 0.012

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"]
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m))
}

/**
 * Tap-to-start / tap-to-stop recorder. Stops itself after a pause that follows
 * speech (a longer one while less than about 60 % of the reference has been spoken),
 * or after 10 seconds. Exposes a live input level for the button ring.
 */
export function useRecorder(onTake: (take: Take) => void, expectedMs?: number) {
  const [state, setState] = useState<RecorderState>("idle")
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const stopRef = useRef<() => void>(() => {})
  const expectedRef = useRef(expectedMs)
  useEffect(() => {
    expectedRef.current = expectedMs
  }, [expectedMs])
  const onTakeRef = useRef(onTake)
  useEffect(() => {
    onTakeRef.current = onTake
  }, [onTake])

  const stop = useCallback(() => stopRef.current(), [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported")
      return
    }
    setState("requesting")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Browser noise suppression smears consonants and hurts the phone recogniser;
        // the server's quality gates catch noisy takes instead.
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      })
    } catch {
      setState("denied")
      return
    }

    const mime = pickMime()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    const ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)

    const t0 = performance.now()
    let peak = 0
    let spoke = false
    let spokenMs = 0
    let lastTick = performance.now()
    let quietSince = 0
    let raf = 0
    let done = false

    const finish = () => {
      if (done) return
      done = true
      cancelAnimationFrame(raf)
      if (rec.state !== "inactive") rec.stop()
    }
    stopRef.current = finish

    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const s of buf) sum += s * s
      const rms = Math.sqrt(sum / buf.length)
      peak = Math.max(peak, rms)
      const now = performance.now()
      setLevel(Math.min(1, rms * 9))
      setElapsed(now - t0)
      if (rms > SPEECH_RMS) {
        spoke = true
        spokenMs += now - lastTick
        quietSince = 0
      } else if (spoke && rms < SILENCE_RMS) {
        quietSince ||= now
        // Stop soon after the phrase is done, but sit through a pause in the middle of it.
        const expected = expectedRef.current
        const mostlySaid = !expected || spokenMs >= SPOKEN_SHARE * expected
        if (now - quietSince > (mostlySaid ? SILENCE_MS : PAUSE_MS)) return finish()
      }
      lastTick = now
      if (now - t0 > MAX_MS) return finish()
      raf = requestAnimationFrame(tick)
    }

    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
      setState("idle")
      setLevel(0)
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" })
      // Trim the trailing silence we waited through from the reported length.
      const durationMs = Math.max(0, performance.now() - t0 - (quietSince ? performance.now() - quietSince : 0))
      onTakeRef.current({ blob, url: URL.createObjectURL(blob), durationMs: Math.round(durationMs), peakLevel: Math.min(1, peak * 4) })
    }

    rec.start()
    setState("recording")
    setElapsed(0)
    raf = requestAnimationFrame(tick)
  }, [])

  useEffect(() => () => stopRef.current(), [])

  return { state, level, elapsed, start, stop }
}
