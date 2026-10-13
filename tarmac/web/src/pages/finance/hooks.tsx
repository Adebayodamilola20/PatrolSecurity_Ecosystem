/** Data-loading and saving hooks for the finance screens. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Notice } from './ui'

/**
 * Loads data when the page opens and whenever `deps` change; reload() fetches
 * again. An answer that arrives after the page has moved on (say, a slow
 * response for last month after picking this month) is ignored.
 */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  const ticket = useRef(0)
  useEffect(() => {
    loadRef.current = load
  })

  const fetchNow = useCallback((mine: number) => {
    loadRef.current().then(
      (d) => {
        if (ticket.current !== mine) return
        setData(d)
        setError(null)
        setLoading(false)
      },
      (e) => {
        if (ticket.current !== mine) return
        setError(e instanceof Error ? e.message : 'Something went wrong')
        setLoading(false)
      },
    )
  }, [])

  const reload = useCallback(async () => {
    const mine = ++ticket.current
    setLoading(true)
    fetchNow(mine)
  }, [fetchNow])

  useEffect(() => {
    fetchNow(++ticket.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload }
}

/** Runs a save; remembers the error to show it next to the form. */
export function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved')
      return false
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, setError, run }
}

/** A short "Saved" style message that clears itself. */
export function useFlash() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 6000)
    return () => window.clearTimeout(t)
  }, [message])
  const node = message ? <Notice tone="good" onClose={() => setMessage(null)}>{message}</Notice> : null
  return { flash: setMessage, node }
}
