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

/** 后端制作包字段随导演对话演进；桌面端先透传，不在本地再造一份。 */
export type FilmPackage = Record<string, unknown>
