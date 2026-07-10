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
  Shield,
  ChevronLeft,
  LogOut,
  Clock,
  ClipboardCheck,
  User,
  Bot,
  Activity,
} from 'lucide-react'
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

export default function Sidebar({ collapsed, onToggle, mobile, onClose }: SidebarProps) {
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const nav = useNav()
  const openIncidentCount = useAlertStore((s) => s.openIncidentCount)

  return (
    <aside
      className={`flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        mobile ? 'w-64 h-full' : collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center gap-2 px-5 py-5 min-h-[68px]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div className="font-semibold tracking-tight">SentryPatrol</div>
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

      {(!collapsed || mobile) && (
      <div className="mx-3 mb-3 rounded-xl bg-sidebar-accent/60 px-3 py-2.5 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-info shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{user?.name || 'User'}</div>
        </div>
      </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
            {nav.map((item) => {
              const active = location.pathname === item.to
              const Icon = item.icon
              return (
                <React.Fragment key={item.to}>
                  <Link
                    to={item.to}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {(!collapsed || mobile) && <span>{item.label}</span>}
                    {(!collapsed || mobile) && item.label === "Alerts" && openIncidentCount > 0 && (
                      <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                        {openIncidentCount > 99 ? '99+' : openIncidentCount}
                      </span>
                    )}
                  </Link>
                </React.Fragment>
              )
            })}
      </nav>

      <div className="border-t border-sidebar-border">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
