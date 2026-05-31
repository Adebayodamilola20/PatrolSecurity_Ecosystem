import { create } from 'zustand'
import type { Scan, DashboardStats } from '../types'
import { api } from '../services/api'
import { subscribeToScans, subscribeToShiftUpdates } from '../services/websocket'
import { useEffect } from 'react'

interface ScanStore {
  scans: Scan[]
  stats: DashboardStats
  loading: boolean
  addScan: (scan: Scan) => void
  setScans: (scans: Scan[]) => void
  setStats: (stats: DashboardStats) => void
  fetchScans: () => Promise<void>
  fetchStats: () => Promise<void>
}

const defaultStats: DashboardStats = {
  totalScans: 0,
  scansToday: 0,
  activeOfficers: 0,
  totalCheckpoints: 0,
  verifiedScans: 0,
  flaggedScans: 0,
}

export const useScanStore = create<ScanStore>((set) => ({
  scans: [],
  stats: defaultStats,
  loading: false,

  addScan: (scan) =>
    set((state) => ({
      scans: [scan, ...state.scans].slice(0, 500),
      stats: {
        ...state.stats,
        totalScans: state.stats.totalScans + 1,
        scansToday: state.stats.scansToday + 1,
        verifiedScans: scan.gpsValid
          ? state.stats.verifiedScans + 1
          : state.stats.verifiedScans,
        flaggedScans: !scan.gpsValid
          ? state.stats.flaggedScans + 1
          : state.stats.flaggedScans,
      },
    })),

  setScans: (scans) => set({ scans }),
  setStats: (stats) => set({ stats }),

  fetchScans: async () => {
    set({ loading: true })
    try {
      const scans = await api.scans.list()
      set({ scans, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  fetchStats: async () => {
    try {
      const [scans, users, checkpoints] = await Promise.all([
        api.scans.list(),
        api.users.list().catch(() => []),
        api.checkpoints.list().catch(() => []),
      ])

      const today = new Date().toISOString().slice(0, 10)
      const scansToday = scans.filter((s: Scan) =>
        s.scannedAt?.startsWith(today)
      ).length

      set({
        stats: {
          totalScans: scans.length,
          scansToday,
          activeOfficers: users.filter((u: any) => u.onDuty && (u.role === 'guard' || u.role === 'supervisor')).length,
          totalCheckpoints: checkpoints.length,
          verifiedScans: scans.filter((s: Scan) => s.gpsValid).length,
          flaggedScans: scans.filter((s: Scan) => !s.gpsValid).length,
        },
      })
    } catch {
      // ignore
    }
  },
}))

export function useScanWebSocket() {
  const addScan = useScanStore((s) => s.addScan)
  const fetchStats = useScanStore((s) => s.fetchStats)

  useEffect(() => {
    const unsubScans = subscribeToScans((data: Scan) => {
      addScan(data)
    })
    const unsubShifts = subscribeToShiftUpdates(() => {
      fetchStats()
    })
    return () => {
      unsubScans()
      unsubShifts()
    }
  }, [addScan, fetchStats])
}
