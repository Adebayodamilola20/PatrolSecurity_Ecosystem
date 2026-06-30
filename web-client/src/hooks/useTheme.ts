import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'patrol_theme'

function getInitialTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
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
  const stored = localStorage.getItem(STORAGE_KEY)
  const theme = stored === 'light' || stored === 'dark' ? stored : 'dark'
  applyTheme(theme)
}
