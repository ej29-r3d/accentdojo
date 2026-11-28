import type { ReactNode } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { LevelChip } from "@/components/LevelChip"
import { SettingsButton } from "@/components/Settings"

// The app icon: sound bars with an acute accent, on white in both themes.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="128" fill="#fff" />
      <g fill="#0a0a0a">
        <rect x="114" y="227" width="44" height="150" rx="22" />
        <rect x="194" y="157" width="44" height="290" rx="22" />
        <rect x="274" y="202" width="44" height="200" rx="22" />
        <rect x="354" y="257" width="44" height="90" rx="22" />
      </g>
      <line x1="212" y1="118" x2="268" y2="66" stroke="#cd4100" strokeWidth="36" strokeLinecap="round" />
    </svg>
  )
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-md outline-offset-4" aria-label="Accent Dojo home">
      <LogoMark className="size-6 rounded-[6px] ring-1 ring-border" />
      <span className="text-[17px] font-semibold tracking-tight">Accent Dojo</span>
    </Link>
  )
}

export function TopBar({
  back,
  title,
  right,
  level = true,
}: {
  /** Path to go back to; omit to show the wordmark. */
  back?: string
  title?: ReactNode
  right?: ReactNode
  /** Hide the level chip (it shows on every screen by default). */
  level?: boolean
}) {
  const navigate = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-20 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4 md:px-8 lg:max-w-6xl">
        {back ? (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(back))}
            aria-label="Back"
            className="-ml-2 grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <Wordmark />
        )}
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
        <div className="flex items-center gap-2">
          {right}
          {level && <LevelChip />}
          <SettingsButton />
        </div>
      </div>
    </header>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-sm font-medium text-muted-foreground", className)}>
      {children}
    </div>
  )
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-2xl px-5 md:px-8 lg:max-w-6xl", className)}>{children}</main>
}

/** Renders phonemes as /ˈsteɪʃən/; `mark` highlights one sound in the score colour. */
export function Ipa({ sounds, mark, className }: { sounds: string[]; mark?: number | number[]; className?: string }) {
  const marked = new Set(mark == null ? [] : Array.isArray(mark) ? mark : [mark])
  return (
    <span className={cn("font-ipa", className)}>
      <span className="text-subtle-foreground">/</span>
      {sounds.map((s, i) => (
        <span
          key={i}
          className={cn(marked.has(i) && "rounded-[3px] bg-score-soft px-px text-score underline decoration-2 underline-offset-[5px]")}
        >
          {s}
        </span>
      ))}
      <span className="text-subtle-foreground">/</span>
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-4 animate-spin rounded-full border-[1.5px] border-current border-t-transparent", className)}
      aria-hidden
    />
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="hidden h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-[10px] font-medium text-subtle-foreground md:inline-flex">
      {children}
    </kbd>
  )
}
