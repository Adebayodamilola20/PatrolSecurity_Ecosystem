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
  // Last, and its own entry: an alarm is not something to stumble into
  // while reading patrol numbers.
  { to: '/emergency', label: 'Emergency', icon: ShieldAlert },
]
