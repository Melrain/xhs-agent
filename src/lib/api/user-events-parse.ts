export const LOOK_UPDATED_EVENT = "look.updated" as const
export const FILM_UPDATED_EVENT = "film.updated" as const
export const HEARTBEAT_EVENT = "heartbeat" as const

/** SSE event `look.updated` 的 data（与 Nest MessageEvent.data 对齐） */
export type LookUpdatedEvent = {
  type: "look.updated"
  lookId: string
  characterId: string
  status: "pending" | "ready" | "failed"
  at: string
}

/** SSE event `film.updated` 的 data（与 Nest MessageEvent.data 对齐） */
export type FilmUpdatedEvent = {
  type: "film.updated"
  projectId: string
  refId: string
  status: "analyzing" | "ready" | "failed"
  at: string
}

const LOOK_STATUSES = new Set(["pending", "ready", "failed"])
const FILM_STATUSES = new Set(["analyzing", "ready", "failed"])

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw
  if (typeof raw === "string") {
    const text = raw.trim()
    if (!text) return null
    try {
      value = JSON.parse(text)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

/**
 * 把 EventSource MessageEvent.data 收成 LookUpdatedEvent。
 * data 一般是 JSON 字符串，偶发已是对象；heartbeat / 字段不全就丢。
 */
export function parseUserEvent(raw: unknown): LookUpdatedEvent | null {
  const row = parseJsonObject(raw)
  if (!row || row.type !== "look.updated") return null

  const lookId = row.lookId
  const characterId = row.characterId
  const status = row.status
  const at = row.at
  if (typeof lookId !== "string" || !lookId) return null
  if (typeof characterId !== "string" || !characterId) return null
  if (typeof status !== "string" || !LOOK_STATUSES.has(status)) return null
  if (typeof at !== "string" || !at) return null

  return {
    type: "look.updated",
    lookId,
    characterId,
    status: status as LookUpdatedEvent["status"],
    at,
  }
}

/**
 * 把 EventSource MessageEvent.data 收成 FilmUpdatedEvent。
 * 镜像 look parser；status 仅 analyzing|ready|failed。
 */
export function parseFilmUpdatedEvent(raw: unknown): FilmUpdatedEvent | null {
  const row = parseJsonObject(raw)
  if (!row || row.type !== "film.updated") return null

  const projectId = row.projectId
  const refId = row.refId
  const status = row.status
  const at = row.at
  if (typeof projectId !== "string" || !projectId) return null
  if (typeof refId !== "string" || !refId) return null
  if (typeof status !== "string" || !FILM_STATUSES.has(status)) return null
  if (typeof at !== "string" || !at) return null

  return {
    type: "film.updated",
    projectId,
    refId,
    status: status as FilmUpdatedEvent["status"],
    at,
  }
}
