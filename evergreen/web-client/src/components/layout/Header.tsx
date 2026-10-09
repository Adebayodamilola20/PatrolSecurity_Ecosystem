import { LogOut, Moon, Sun } from 'lucide-react'
import { useClientAuthStore } from '../../stores/useClientAuthStore'
import { useTheme } from '../../hooks/useTheme'
import MobileNav from './MobileNav'

export default function Header() {
  const user = useClientAuthStore((s) => s.user)
  const logout = useClientAuthStore((s) => s.logout)
  // The portal was black for everyone with no way to change it: the theme
  // existed but nothing ever offered the switch.
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {user?.clientName || 'Your Organization'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
