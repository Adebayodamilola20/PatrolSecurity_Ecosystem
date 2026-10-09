import { useCallback, useEffect, useState } from 'react'

/*
 * v2: the old key was written on every mount, not just on an explicit toggle,
 * so every existing session has "dark" stored whether or not anyone chose it.
 * A new key retires those values and lets the light default actually reach them.
 */
const STORAGE_KEY = 'patrol_theme_v2'

function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return 'light'
}

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = e.newValue as 'dark' | 'light' | null
        if (next === 'dark' || next === 'light') setThemeState(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const setTheme = useCallback((t: 'dark' | 'light') => {
    setThemeState(t)
  }, [])

  return { theme, toggleTheme, setTheme }
}

export function initTheme() {
  applyTheme(getInitialTheme())
}
