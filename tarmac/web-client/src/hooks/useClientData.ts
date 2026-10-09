import { useCallback, useEffect, useRef, useState } from 'react'

// Tiny fetch hook so each page doesn't reinvent loading/error state.
// `fetcher` should be a stable reference (wrap in useCallback at the call site).

/*
 * Every request to the backend costs the best part of a second from Nigeria, and
 * each page threw its data away on unmount. Navigating Overview → Scans →
 * Overview therefore paid that second three times and showed an empty page each
 * time, which is what made some screens feel slow and others instant depending
 * on whether they happened to be cached by the browser.
 *
 * Results are kept per fetcher key and served immediately on return, while a
 * fresh copy loads in the background. The screen is never blank for data that
 * has already been seen, and the numbers still converge on the server's within a
 * second of arriving.
 */
interface CacheEntry {
  value: unknown
  storedAt: number
}

const cache = new Map<string, CacheEntry>()

/** Past this, show the spinner rather than something visibly out of date. */
const MAX_SERVE_AGE_MS = 60_000

export function clearClientDataCache() {
  cache.clear()
}

export function useClientData<T>(fetcher: () => Promise<T>, cacheKey?: string) {
  // Defaults to the fetcher's identity, which is stable when the call site wraps
  // it in useCallback as documented above.
  const key = cacheKey ?? fetcher.toString()

  const cached = cache.get(key)
  const fresh =
    cached !== undefined && Date.now() - cached.storedAt < MAX_SERVE_AGE_MS

  const [data, setData] = useState<T | null>(
    fresh ? (cached!.value as T) : null,
  )
  const [loading, setLoading] = useState(!fresh)
  const [error, setError] = useState<string | null>(null)

  // Guards against a slow response from a previous page overwriting this one.
  const activeKey = useRef(key)
  activeKey.current = key

  const load = useCallback(async () => {
    const requestKey = key
    // Only show the spinner when there is nothing to show; a background refresh
    // must not blank out data the user is already reading.
    if (!cache.has(requestKey)) setLoading(true)
    setError(null)
    try {
      const value = await fetcher()
      cache.set(requestKey, { value, storedAt: Date.now() })
      if (activeKey.current !== requestKey) return
      setData(value)
    } catch (e) {
      if (activeKey.current !== requestKey) return
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      if (activeKey.current === requestKey) setLoading(false)
    }
  }, [fetcher, key])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(async () => {
    // An explicit reload is the user asking for current data, so drop the cached
    // copy first rather than serving it again.
    cache.delete(key)
    await load()
  }, [key, load])

  return { data, loading, error, reload }
}
