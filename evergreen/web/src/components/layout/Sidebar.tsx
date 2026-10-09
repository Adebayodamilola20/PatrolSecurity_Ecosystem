import { Link, useLocation } from 'react-router-dom'
import React from 'react'
import {
  LayoutDashboard,
  MapPin,
  Users,
  Building2,
  ClipboardList,
  FileText,
  Bell,
  Settings,
  ChevronLeft,
  LogOut,
  Clock,
  ClipboardCheck,
  User,
  Bot,
  Activity,
  BarChart3,
} from 'lucide-react'
import { Wordmark } from '../Wordmark'
import { useAuthStore, useCanManageUsers, useCanViewAlerts } from '../../stores/useAuthStore'
import { useAlertStore } from '../../stores/useAlertStore'

function useNav() {
  const role = useAuthStore((s) => s.user?.role)
  const canManageUsers = useCanManageUsers()
  const canViewAlerts = useCanViewAlerts()

  if (role === 'guard') {
    return [
      { to: '/profile', label: 'Profile', icon: User },
      { to: '/scans', label: 'My Scan History', icon: ClipboardList },
      { to: '/timesheets', label: 'My Timesheets', icon: Clock },
      { to: '/ai-assistant', label: 'AI Assistant', icon: Bot },
    ]
  }

  const items = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
  ]

  items.push({ to: '/monitoring', label: 'Live Monitoring', icon: MapPin })

  if (canManageUsers) {
    items.push({ to: '/users', label: 'Personnel', icon: Users })
  }

  // Client accounts own the whole hierarchy now: everything that used to
  // live on the flat Checkpoints page is managed inside a client account
  // (Client -> Locations -> Sub-locations with QR codes).
  if (role === 'admin' || role === 'supervisor') {
    items.push({ to: '/clients', label: 'Clients', icon: Building2 })
  }
  items.push({ to: '/scans', label: 'Patrol History', icon: ClipboardList })
  items.push({ to: '/timesheets', label: 'Timesheets', icon: Clock })
  items.push({ to: '/post-orders', label: 'Post Orders', icon: ClipboardList })
  items.push({ to: '/handovers', label: 'Handovers', icon: ClipboardCheck })
  items.push({ to: '/pass-on-logs', label: 'Pass-On Logs', icon: ClipboardList })
  items.push({ to: '/activity-summary', label: 'Activity Summary', icon: Activity })
  if (role === 'admin' || role === 'supervisor') {
    items.push({ to: '/analytics', label: 'Analytics', icon: BarChart3 })
  }
  items.push({ to: '/ai-assistant', label: 'AI Assistant', icon: Bot })

  if (role === 'admin' || role === 'main_account') {
    items.push({ to: '/reports', label: 'Reports', icon: FileText })
  }

  if (canViewAlerts) {
    items.push({ to: '/alerts', label: 'Alerts', icon: Bell })
  }

  if (role === 'admin') {
    items.push({ to: '/settings', label: 'Settings', icon: Settings })
  }

  return items
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobile?: boolean
  onClose?: () => void
}

/** Initials, so the chip says who you are rather than being a coloured blob. */
function Initials({ name }: { name?: string }) {
  const letters = (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase text-primary-foreground">
      {letters}
    </div>
  )
}

export default function Sidebar({ collapsed, onToggle, mobile, onClose }: SidebarProps) {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const nav = useNav()
  const openIncidentCount = useAlertStore((s) => s.openIncidentCount)

  return (
    <aside
      className={`flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${
        mobile ? 'w-64 h-full' : collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center gap-2 px-5 py-5 min-h-[68px]">
        {collapsed && !mobile ? (
          <Wordmark compact />
        ) : (
          <Wordmark />
        )}
        {mobile ? (
          <button onClick={onClose} className="ml-auto p-1 hover:bg-sidebar-accent rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-sidebar-foreground/60" />
          </button>
        ) : (
          <button onClick={onToggle} className={`${collapsed ? 'mx-auto' : 'ml-auto'} p-1 hover:bg-sidebar-accent rounded-lg transition-colors`}>
            <ChevronLeft className={`w-4 h-4 text-sidebar-foreground/60 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {nav.map((item) => {
              const active = location.pathname === item.to
              const Icon = item.icon
              return (
                <React.Fragment key={item.to}>
                  <Link
                    to={item.to}
                    className={`group relative flex items-center gap-3 rounded-lg py-2 pl-4 pr-3 text-sm transition-colors ${
                      active
                        ? "bg-sidebar-accent font-bold text-sidebar-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }`}
                  >
                    {/* The marker sits on the rail's edge. You read where you
                        are from the shape of the edge, without the row
                        shouting an answer you already have. */}
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-colors ${
                        active ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                    <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-primary" : ""}`} />
                    {(!collapsed || mobile) && <span>{item.label}</span>}
                    {(!collapsed || mobile) && item.label === "Alerts" && openIncidentCount > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold tabular-nums text-destructive-foreground">
                        {openIncidentCount > 99 ? '99+' : openIncidentCount}
                      </span>
                    )}
                  </Link>
                </React.Fragment>
              )
            })}
      </nav>

      {/* Who you are signed in as, at the foot. It had been a filled box
          directly under the wordmark, which made the loudest thing on the rail
          a fact nobody needs during a shift — and put it in competition with
          the row telling you where you are. */}
      <div className="border-t border-sidebar-border p-2">
        {collapsed && !mobile ? (
          <div className="flex justify-center py-1" title={user?.name || 'User'}>
            <Initials name={user?.name} />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <Initials name={user?.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.name || 'User'}</div>
              {user?.role && (
                <div className="truncate text-[11px] capitalize opacity-60">{user.role}</div>
              )}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm opacity-60 transition-colors hover:bg-sidebar-accent/50 hover:text-destructive hover:opacity-100"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {(!collapsed || mobile) && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
