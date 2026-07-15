import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ScanLine,
  MapPin,
  FileText,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useUnreadReports } from '../../hooks/useUnreadReports'

const nav = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/guards', label: 'My Guards', icon: Users },
  { to: '/scans', label: 'Patrol Activity', icon: ScanLine },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/reports', label: 'Reports', icon: FileText },
]

export default function Sidebar() {
  const unreadReports = useUnreadReports()
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Client Portal</p>
          <p className="truncate text-xs text-muted-foreground">PatrolSecurity</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
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
    </aside>
  )
}
