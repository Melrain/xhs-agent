/** Global executor preference — shared by film / makeup (and future workspaces). */

export type ExecutorSource = "vps" | "local"

export const DEFAULT_EXECUTOR_SOURCE: ExecutorSource = "vps"

/** Canonical preference key. */
export const EXECUTOR_SOURCE_KEY = "r7.executorSource"

/** Legacy film-only key; read fallback so existing prefs keep working. */
export const LEGACY_EXECUTOR_SOURCE_KEY = "film.executorSource"

const CHANGE_EVENT = "r7:executorSource"

export function isExecutorSource(value: unknown): value is ExecutorSource {
  return value === "vps" || value === "local"
}

/** Read preference: new key first, then legacy film key. */
export function readExecutorSourcePreference(): ExecutorSource | undefined {
  try {
    const raw =
      window.localStorage.getItem(EXECUTOR_SOURCE_KEY) ??
      window.localStorage.getItem(LEGACY_EXECUTOR_SOURCE_KEY)
    return isExecutorSource(raw) ? raw : undefined
  } catch {
    return undefined
  }
}

export function resolveExecutorSourcePreference(
  fallback: ExecutorSource = DEFAULT_EXECUTOR_SOURCE,
): ExecutorSource {
  return readExecutorSourcePreference() ?? fallback
}

/**
 * Write preference to `r7.executorSource`.
 * Clears legacy `film.executorSource` so stale dual values cannot diverge.
 * Pass null to clear both keys.
 */
export function writeExecutorSourcePreference(source: ExecutorSource | null) {
  try {
    if (!source) {
      window.localStorage.removeItem(EXECUTOR_SOURCE_KEY)
      window.localStorage.removeItem(LEGACY_EXECUTOR_SOURCE_KEY)
    } else {
      window.localStorage.setItem(EXECUTOR_SOURCE_KEY, source)
      window.localStorage.removeItem(LEGACY_EXECUTOR_SOURCE_KEY)
    }
  } catch {
    // ignore quota / private mode
  }
  notifyExecutorSourcePreferenceChanged()
}

export function notifyExecutorSourcePreferenceChanged() {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // ignore
  }
}

/** Same-tab custom event + cross-tab storage event. */
export function subscribeExecutorSourcePreference(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === EXECUTOR_SOURCE_KEY ||
      event.key === LEGACY_EXECUTOR_SOURCE_KEY ||
      event.key === null
    ) {
      listener()
    }
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** UI：vps→走 VPS，local→走本机 */
export function executorSourceLabel(source?: ExecutorSource | null) {
  if (source === "local") return "走本机"
  return "走 VPS"
}

/** Makeup (and similar) has no local runner yet — honest copy only. */
export function executorSourceLocalUnwiredLabel(feature = "妆造") {
  return `${feature}本机执行尚未接线，出图仍走云端`
}
