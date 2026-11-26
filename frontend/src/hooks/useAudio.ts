import { useCallback, useEffect, useRef, useState } from "react"

/** Part of a clip to play, in seconds. */
export interface Segment {
  start: number
  end: number
}

/** One shared <audio> element; only one clip plays at a time. Optionally plays just a segment. */
export function useAudio() {
  const el = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const segment = useRef<Segment | null>(null)
  const raf = useRef(0)

  useEffect(() => {
    const a = new Audio()
    a.preload = "auto"
    el.current = a
    const onTime = () => {
      const seg = segment.current
      if (seg) setProgress(Math.min(1, Math.max(0, (a.currentTime - seg.start) / (seg.end - seg.start))))
      else if (a.duration) setProgress(a.currentTime / a.duration)
    }
    const onEnd = () => {
      setPlaying(null)
      setProgress(0)
    }
    a.addEventListener("timeupdate", onTime)
    a.addEventListener("ended", onEnd)
    return () => {
      a.pause()
      a.removeEventListener("timeupdate", onTime)
      a.removeEventListener("ended", onEnd)
    }
  }, [])

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current)
    segment.current = null
    el.current?.pause()
    setPlaying(null)
    setProgress(0)
  }, [])

  const toggle = useCallback(
    async (key: string, url: string, seg?: Segment) => {
      const a = el.current
      if (!a) return
      if (playing === key) return stop()
      cancelAnimationFrame(raf.current)
      a.pause()
      setProgress(0)
      segment.current = seg ?? null
      if (a.src !== new URL(url, location.href).href) a.src = url
      if (seg && a.readyState < 1) await new Promise((r) => a.addEventListener("loadedmetadata", r, { once: true }))
      a.currentTime = seg ? seg.start : 0
      setPlaying(key)
      try {
        await a.play()
      } catch {
        setPlaying(null)
        return
      }
      if (seg) {
        // timeupdate fires only ~4 times a second: watch every frame to stop on the word.
        const tick = () => {
          if (a.paused) return
          if (a.currentTime >= seg.end) return stop()
          raf.current = requestAnimationFrame(tick)
        }
        raf.current = requestAnimationFrame(tick)
      }
    },
    [playing, stop],
  )

  return { playing, progress, toggle, stop }
}
