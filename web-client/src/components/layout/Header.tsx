import { LogOut } from 'lucide-react'
import { useClientAuthStore } from '../../stores/useClientAuthStore'

export default function Header() {
  const user = useClientAuthStore((s) => s.user)
  const logout = useClientAuthStore((s) => s.logout)

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {user?.clientName || 'Your Organization'}
        </p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </header>
  )
}
