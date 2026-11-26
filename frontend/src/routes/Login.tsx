import { useState, type ReactNode, useEffect } from "react"
import { getSession, login, UNAUTHORIZED } from "@/api/http"
import { LogoMark, Spinner } from "@/components/kit"

/** Shows the app, or a password screen when the server asks for the shared password. */
export function PasswordGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "open" | "locked">(
    import.meta.env.VITE_API === "mock" ? "open" : "checking",
  )
  useEffect(() => {
    if (state !== "checking") return
    getSession().then(
      (s) => setState(!s.required || s.authenticated ? "open" : "locked"),
      () => setState("open"),
    )
  }, [state])
  useEffect(() => {
    const lock = () => setState("locked")
    window.addEventListener(UNAUTHORIZED, lock)
    return () => window.removeEventListener(UNAUTHORIZED, lock)
  }, [])
  if (state === "checking")
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  if (state === "locked") return <Login onDone={() => setState("open")} />
  return children
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "busy" | "wrong" | "wait">("idle")
  const submit = async () => {
    if (!password.trim()) return
    setStatus("busy")
    const r = await login(password)
    if (r === "ok") onDone()
    else setStatus(r)
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5">
      <h1 className="flex items-center gap-3 text-4xl font-semibold tracking-[-0.04em]">
        <LogoMark className="size-10 rounded-[10px] ring-1 ring-border" />
        AccentDojo
      </h1>
      <form
        className="mt-10 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor="password" className="block text-sm font-medium text-muted-foreground">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (status !== "busy") setStatus("idle")
          }}
          className="h-12 w-full rounded-xl border bg-transparent px-4 text-lg outline-none focus:border-foreground"
        />
        {status === "wrong" && <p className="text-[15px] text-muted-foreground">Wrong password</p>}
        {status === "wait" && <p className="text-[15px] text-muted-foreground">Too many tries. Wait a few minutes.</p>}
        <button
          type="submit"
          disabled={status === "busy" || !password.trim()}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-foreground text-[15px] font-semibold text-background transition-opacity disabled:opacity-40"
        >
          {status === "busy" ? <Spinner /> : "Open"}
        </button>
      </form>
    </main>
  )
}
