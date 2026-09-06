import { create } from "zustand"
import { createFilmCard, type FilmCard, type FilmCardKind, type FilmCardPosition } from "@/lib/film-card"
import {
  onFilmClientStateCleared,
  readFilmHidden,
  readFilmLayout,
  writeFilmHidden,
  writeFilmLayout,
} from "@/lib/film-client-state"

type FilmLayoutMap = Record<string, FilmCardPosition>

type FilmStore = {
  projectId: string | null
  notes: FilmCard[]
  layouts: FilmLayoutMap
  hiddenIds: string[]
  sending: boolean
  attachProject: (projectId: string) => void
  addCard: (kind: FilmCardKind, position: FilmCardPosition) => void
  moveCard: (cardId: string, position: FilmCardPosition) => void
  removeCard: (cardId: string) => void
  revealCard: (cardId: string) => void
  setSending: (sending: boolean) => void
  reset: () => void
}

const EMPTY: Pick<FilmStore, "projectId" | "notes" | "layouts" | "hiddenIds" | "sending"> = {
  projectId: null,
  notes: [],
  layouts: {},
  hiddenIds: [],
  sending: false,
}

export const useFilmStore = create<FilmStore>((set, get) => ({
  ...EMPTY,
  attachProject: (projectId) => {
    if (get().projectId === projectId) return
    set({
      projectId,
      notes: [],
      layouts: readFilmLayout(projectId),
      hiddenIds: readFilmHidden(projectId),
      sending: false,
    })
  },
  addCard: (kind, position) => {
    if (kind !== "note") return
    set((state) => ({ notes: [...state.notes, createFilmCard(kind, position)] }))
  },
  moveCard: (cardId, position) => {
    const { projectId, notes, layouts } = get()
    if (notes.some((card) => card.id === cardId)) {
      set({
        notes: notes.map((card) => (card.id === cardId ? { ...card, position } : card)),
      })
      return
    }
    const next = { ...layouts, [cardId]: position }
    set({ layouts: next })
    if (projectId) writeFilmLayout(projectId, next)
  },
  removeCard: (cardId) => {
    const { notes, hiddenIds, projectId } = get()
    if (notes.some((card) => card.id === cardId)) {
      set({ notes: notes.filter((card) => card.id !== cardId) })
      return
    }
    if (hiddenIds.includes(cardId)) return
    const next = [...hiddenIds, cardId]
    set({ hiddenIds: next })
    if (projectId) writeFilmHidden(projectId, next)
  },
  revealCard: (cardId) => {
    const { hiddenIds, projectId } = get()
    if (!hiddenIds.includes(cardId)) return
    const next = hiddenIds.filter((id) => id !== cardId)
    set({ hiddenIds: next })
    if (projectId) writeFilmHidden(projectId, next)
  },
  setSending: (sending) => set({ sending }),
  reset: () => set(EMPTY),
}))

onFilmClientStateCleared(() => {
  useFilmStore.getState().reset()
})
