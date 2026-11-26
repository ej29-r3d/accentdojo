import { useEffect, useState, type DependencyList } from "react"

/** Tiny async loader: re-runs when deps change, ignores stale responses. */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true })
  // The caller owns the dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true
    setState((s) => ({ data: s.data, loading: true }))
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (error) => live && setState({ error, loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
