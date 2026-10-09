import {
  LayoutDashboard,
  Users,
  ScanLine,
  MapPin,
  FileText,
  BarChart3,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react'

/** The portal's destinations, shared by the desktop sidebar and the mobile
 *  drawer. They lived in Sidebar.tsx until the drawer existed; keeping one
 *  list means a new page can't appear on desktop and go missing on a phone. */
export const navItems = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/guards', label: 'My Guards', icon: Users },
  { to: '/scans', label: 'Patrol Activity', icon: ScanLine },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/pass-ons', label: 'Pass-ons', icon: MessageSquare },
]

/**
 * Kept out of the list above on purpose.
 *
 * Everything in `navItems` is something you browse. This is something you
 * reach for when something has gone wrong, and it renders below a rule, in
 * the emergency colour, at the bottom of the rail — far enough from
 * "Reports" that nobody arrives here by mis-clicking.
 */
export const emergencyNavItem = {
  to: '/emergency',
  label: 'Emergency',
  icon: ShieldAlert,
}
