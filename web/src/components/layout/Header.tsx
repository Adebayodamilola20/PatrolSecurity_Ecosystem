import { useEffect, useState } from 'react'
import { Search, Bell } from 'lucide-react'
import { api } from '../../services/api'

export default function Header() {
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    api.incidents.list({ status: 'open' }).then(i => setAlertCount(i.length)).catch(() => {})
  }, [])

  return (
    <header className="flex items-center gap-3 border-b border-border bg-card/40 px-5 py-3">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search officers, checkpoints, patrols..."
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <button className="relative rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground">
        <Bell className="h-4 w-4" />
        {alertCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
            {alertCount}
          </span>
        )}
      </button>
    </header>
  )
}
