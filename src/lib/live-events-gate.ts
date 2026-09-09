import { create } from "zustand"

/** Makeup + film share one Nest SSE; each workspace just reports whether it needs the stream. */
type LiveEventsGate = {
  makeupPending: boolean
  filmVpsAnalyzing: boolean
  setMakeupPending: (value: boolean) => void
  setFilmVpsAnalyzing: (value: boolean) => void
}

export const useLiveEventsGate = create<LiveEventsGate>((set) => ({
  makeupPending: false,
  filmVpsAnalyzing: false,
  setMakeupPending: (makeupPending) => set({ makeupPending }),
  setFilmVpsAnalyzing: (filmVpsAnalyzing) => set({ filmVpsAnalyzing }),
}))

export function useLiveEventsWanted() {
  return useLiveEventsGate((state) => state.makeupPending || state.filmVpsAnalyzing)
}
