import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUnreadReports } from '../../hooks/useUnreadReports'
import { Wordmark } from '../Wordmark'
import { navItems, emergencyNavItem } from './navItems'

/** The sidebar is `hidden md:flex`, so below 768px the portal had no way to
 *  reach Analytics, Reports or Locations at all — Overview's three shortcuts
 *  were the only navigation on a phone. This is the missing half: a hamburger
 *  in the header that pulls out the same six destinations. */
export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const unreadReports = useUnreadReports()
  const { pathname } = useLocation()

  // Tapping a link changes the route but would leave the drawer sitting on top
  // of the page it just opened, so close on every path change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    // Without this the page behind the drawer scrolls under your finger.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="relative -ml-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
        {/* The unread count lives on the Reports row inside the drawer, which
            is invisible while closed — a dot on the button is the only hint
            a phone user gets that something new arrived. */}
        {unreadReports > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="nav-backdrop-in absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            className="nav-slide-in relative flex h-full w-64 max-w-[80%] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl"
          >
            <div className="flex items-center gap-2 px-5 py-5">
              <div className="min-w-0 flex-1">
                <Wordmark />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="-mr-1.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
              {navItems.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {to === '/reports' && unreadReports > 0 ? (
                    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                      {unreadReports > 99 ? '99+' : `+${unreadReports}`}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </nav>

            {/* Same separation as the desktop rail: browsing above, the
                alarm below a rule in its own colour. */}
            <div className="border-t border-sidebar-border p-3">
              <NavLink
                to={emergencyNavItem.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-destructive text-destructive-foreground'
                      : 'text-destructive hover:bg-destructive/10',
                  )
                }
              >
                <emergencyNavItem.icon className="h-4 w-4 shrink-0" />
                {emergencyNavItem.label}
              </NavLink>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
