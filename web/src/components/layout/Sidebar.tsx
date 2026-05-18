import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  MapPin,
  Users,
  QrCode,
  ClipboardList,
  FileText,
  Bell,
  Settings,
  Shield,
  ChevronLeft,
  LogOut,
  Clock,
  ClipboardCheck,
} from 'lucide-react'
import { useAuthStore } from '../../stores/useAuthStore'

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/monitoring', label: 'Live Monitoring', icon: MapPin },
  { to: '/users', label: 'Officers', icon: Users },
  { to: '/checkpoints', label: 'Checkpoints', icon: QrCode },
  { to: '/scans', label: 'Patrol History', icon: ClipboardList },
  { to: '/timesheets', label: 'Timesheets', icon: Clock },
  { to: '/post-orders', label: 'Post Orders', icon: ClipboardList },
  { to: '/handovers', label: 'Handovers', icon: ClipboardCheck },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const { user, logout } = useAuthStore()

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center gap-2 px-5 py-5 min-h-[68px]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        {!collapsed && <div className="font-semibold tracking-tight">SentryPatrol</div>}
        <button onClick={onToggle} className={`${collapsed ? 'mx-auto' : 'ml-auto'} p-1 hover:bg-sidebar-accent rounded-lg transition-colors`}>
          <ChevronLeft className={`w-4 h-4 text-sidebar-foreground/60 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {!collapsed && (
        <div className="mx-3 mb-3 rounded-xl bg-sidebar-accent/60 px-3 py-2.5 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-info shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name || 'User'}</div>
            <div className="text-[11px] text-muted-foreground capitalize">{user?.role || 'User'} · Control</div>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {nav.map((item) => {
          const active = location.pathname === item.to
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <Icon className={`${collapsed ? 'mx-auto' : ''} h-4 w-4 shrink-0`} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.label === "Alerts" && (
                <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                  3
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className={`${collapsed ? 'mx-auto' : ''} h-4 w-4 shrink-0`} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
