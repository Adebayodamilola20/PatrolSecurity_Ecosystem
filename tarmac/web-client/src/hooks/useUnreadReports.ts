import { useEffect, useState } from 'react'
import { api } from '../services/api'

const LAST_SEEN_KEY = 'reports_last_seen'

// Reports the client hasn't opened yet. "Seen" is tracked locally: opening the
// Reports page stamps the current time, so anything sent afterwards counts as
// new and lights up the sidebar badge. Fires `reports:seen` to recompute.
export function useUnreadReports() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    const compute = async () => {
      try {
        const reports = await api.reports.list()
        const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || 0)
        if (active) setCount(reports.filter((r) => r.submittedAt > lastSeen).length)
      } catch {
        // A failed poll shouldn't blank the badge or surface an error.
      }
    }
    void compute()
    const onSeen = () => void compute()
    window.addEventListener('reports:seen', onSeen)
    window.addEventListener('focus', onSeen)
    return () => {
      active = false
      window.removeEventListener('reports:seen', onSeen)
      window.removeEventListener('focus', onSeen)
    }
  }, [])

  return count
}

// Call when the client views their reports so the badge clears.
export function markReportsSeen() {
  localStorage.setItem(LAST_SEEN_KEY, String(Date.now()))
  window.dispatchEvent(new Event('reports:seen'))
}
