import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useUnreadReports } from '../../hooks/useUnreadReports'
import { navItems as nav, emergencyNavItem } from './navItems'
import { Wordmark } from '../Wordmark'

/**
 * The rail.
 *
 * Two deliberate moves. The active row is marked with a solid bar against the
 * rail's edge rather than a filled pill — at a glance you can see where you
 * are from the shape of the edge, without the row shouting. And Emergency
 * lives below a rule at the foot, in its own colour, because everything above
 * it is something you browse and it is something you reach for when something
 * has gone wrong.
 */
export default function Sidebar() {
  const unreadReports = useUnreadReports()

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="px-5 py-5">
        <Wordmark />
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-md py-2 pl-4 pr-3 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent font-semibold text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-colors',
                    isActive ? 'bg-primary' : 'bg-transparent',
                  )}
                />
                <Icon
                  className={cn(
                    'h-[17px] w-[17px] shrink-0',
                    isActive ? 'text-primary' : 'text-current',
                  )}
                />
                <span className="flex-1 truncate">{label}</span>
                {to === '/reports' && unreadReports > 0 ? (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                    {unreadReports > 99 ? '99+' : unreadReports}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <NavLink
          to={emergencyNavItem.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-destructive text-destructive-foreground'
                : 'text-destructive hover:bg-destructive/10',
            )
          }
        >
          <emergencyNavItem.icon className="h-[17px] w-[17px] shrink-0" />
          {emergencyNavItem.label}
        </NavLink>
      </div>
    </aside>
  )
}
