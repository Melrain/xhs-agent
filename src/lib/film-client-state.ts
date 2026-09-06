const LAYOUT_PREFIX = "film-layout:"
const HIDDEN_PREFIX = "film-hidden:"

type FilmLayoutMap = Record<string, { x: number; y: number }>

let onCleared: (() => void) | undefined

export function onFilmClientStateCleared(listener: () => void) {
  onCleared = listener
}

export function clearFilmClientState() {
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith("film-")) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // ignore quota / private mode
  }
  onCleared?.()
}

export function clearFilmLayout(projectId: string) {
  try {
    window.localStorage.removeItem(`${LAYOUT_PREFIX}${projectId}`)
  } catch {
    // ignore
  }
}

export function clearFilmHidden(projectId: string) {
  try {
    window.localStorage.removeItem(`${HIDDEN_PREFIX}${projectId}`)
  } catch {
    // ignore
  }
}

export function readFilmLayout(projectId: string): FilmLayoutMap {
  try {
    const raw = window.localStorage.getItem(`${LAYOUT_PREFIX}${projectId}`)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const next: FilmLayoutMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as { x?: unknown }).x === "number" &&
        typeof (value as { y?: unknown }).y === "number"
      ) {
        next[id] = { x: (value as { x: number }).x, y: (value as { y: number }).y }
      }
    }
    return next
  } catch {
    return {}
  }
}

export function writeFilmLayout(projectId: string, layout: FilmLayoutMap) {
  try {
    window.localStorage.setItem(`${LAYOUT_PREFIX}${projectId}`, JSON.stringify(layout))
  } catch {
    // ignore
  }
}

export function readFilmHidden(projectId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${HIDDEN_PREFIX}${projectId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
  } catch {
    return []
  }
}

export function writeFilmHidden(projectId: string, hiddenIds: string[]) {
  try {
    window.localStorage.setItem(`${HIDDEN_PREFIX}${projectId}`, JSON.stringify(hiddenIds))
  } catch {
    // ignore
  }
}
