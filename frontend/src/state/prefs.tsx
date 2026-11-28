import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { LEVELS, type Level } from "@/api/client"

export type Theme = "dark" | "light" | "system"

interface Prefs {
  theme: Theme
  setTheme: (t: Theme) => void
  level: Level
  setLevel: (l: Level) => void
}

const Ctx = createContext<Prefs | null>(null)

/** Earlier level names, so a saved choice survives the rename. */
const RENAMED: Record<string, string> = { medium: "intermediate", difficult: "advanced" }

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key)
  const v = raw && RENAMED[raw] ? RENAMED[raw] : raw
  return allowed.includes(v as T) ? (v as T) : fallback
}

function usePersisted<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [v, setV] = useState<T>(() => read(key, allowed, fallback))
  const set = useCallback(
    (next: T) => {
      setV(next)
      localStorage.setItem(key, next)
    },
    [key],
  )
  return [v, set] as const
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersisted<Theme>("accentdojo.theme", ["dark", "light", "system"], "dark")
  const [level, setLevel] = usePersisted<Level>("accentdojo.level", LEVELS, "beginner")

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#ffffff")
    }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [theme])

  return (
    <Ctx.Provider value={{ theme, setTheme, level, setLevel }}>{children}</Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrefs() {
  const v = useContext(Ctx)
  if (!v) throw new Error("usePrefs outside PrefsProvider")
  return v
}
