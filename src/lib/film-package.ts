export const FILM_PHASES = ["intake", "script", "assets", "shots", "generate"] as const

export type FilmPhase = (typeof FILM_PHASES)[number]

export const FILM_PHASE_LABELS: Record<FilmPhase, string> = {
  intake: "收集点子",
  script: "写剧本",
  assets: "定妆",
  shots: "分镜",
  generate: "生成",
}

export function isFilmPhase(value: unknown): value is FilmPhase {
  return typeof value === "string" && (FILM_PHASES as readonly string[]).includes(value)
}

export function filmPhaseLabel(phase: unknown) {
  return isFilmPhase(phase) ? FILM_PHASE_LABELS[phase] : ""
}

export const FILM_NEXT_ACTIONS = ["collect_brief", "write_script"] as const

export type FilmNextActionId = (typeof FILM_NEXT_ACTIONS)[number]

export type FilmNextAction = {
  id: FilmNextActionId
  message: string
}

export function isFilmNextAction(value: unknown): value is FilmNextAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as { id?: unknown; message?: unknown }
  return (
    typeof row.id === "string" &&
    (FILM_NEXT_ACTIONS as readonly string[]).includes(row.id) &&
    typeof row.message === "string" &&
    row.message.trim().length > 0
  )
}

export function filmNextActionMessage(project: {
  phase?: unknown
  nextAction?: FilmNextAction
}) {
  const message = project.nextAction?.message.trim()
  return message || filmPhaseLabel(project.phase)
}

/** 后端制作包字段随导演对话演进；桌面端先透传，不在本地再造一份。 */
export type FilmPackage = Record<string, unknown>
