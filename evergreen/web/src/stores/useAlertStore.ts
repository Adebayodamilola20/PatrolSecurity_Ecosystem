import { create } from 'zustand'

interface AlertState {
  openIncidentCount: number
  setOpenIncidentCount: (count: number) => void
  incrementOpenIncidents: () => void
}

export const useAlertStore = create<AlertState>((set) => ({
  openIncidentCount: 0,
  setOpenIncidentCount: (count) => set({ openIncidentCount: Math.max(0, count) }),
  incrementOpenIncidents: () =>
    set((s) => ({ openIncidentCount: s.openIncidentCount + 1 })),
}))
