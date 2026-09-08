import { asRecord } from "@/lib/film-package"

/** GET /api/backend/internal/film/grok/preflight — 与 web 同一套字段。 */
export type FilmGrokPreflight = {
  installed: boolean
  bin?: string
  authFile: boolean
  authOk: boolean
  detail: string
  ffmpegOk: boolean
  whisperOk: boolean
}

export type FilmGrokAuthKind = "ok" | "missing" | "unsigned" | "expired"

function asBool(value: unknown): boolean {
  return value === true
}

function asDisplay(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function emptyFilmGrokPreflight(): FilmGrokPreflight {
  return {
    installed: false,
    authFile: false,
    authOk: false,
    detail: "",
    ffmpegOk: false,
    whisperOk: false,
  }
}

export function parseFilmGrokPreflight(value: unknown): FilmGrokPreflight {
  const record = asRecord(value)
  const nested = asRecord(record?.data) ?? asRecord(record?.preflight)
  const row = nested ?? record
  if (!row) return emptyFilmGrokPreflight()
  return {
    installed: asBool(row.installed),
    bin: asOptionalString(row.bin),
    authFile: asBool(row.authFile),
    authOk: asBool(row.authOk),
    detail: asDisplay(row.detail),
    ffmpegOk: asBool(row.ffmpegOk),
    whisperOk: asBool(row.whisperOk),
  }
}

export function filmGrokAuthKind(preflight?: FilmGrokPreflight): FilmGrokAuthKind {
  if (!preflight || !preflight.installed) return "missing"
  if (!preflight.authFile) return "unsigned"
  if (!preflight.authOk) return "expired"
  return "ok"
}

export function canFilmAnalyze(preflight?: FilmGrokPreflight) {
  return Boolean(preflight?.authOk)
}

export function filmGrokAuthLabel(preflight?: FilmGrokPreflight) {
  switch (filmGrokAuthKind(preflight)) {
    case "missing":
      return "未安装"
    case "unsigned":
      return "未登录（grok login）"
    case "expired":
      return "登录失效（再 grok login）"
    case "ok":
      return "本机 grok / grok bot"
  }
}

export function filmGrokDetailText(preflight?: FilmGrokPreflight) {
  const detail = preflight?.detail.trim() ?? ""
  if (!detail || detail.toLowerCase() === "ok") return ""
  return detail
}

export function filmGrokToolHints(preflight?: FilmGrokPreflight) {
  if (!preflight) return []
  const hints: string[] = []
  if (!preflight.ffmpegOk) hints.push("ffmpeg 还没好")
  if (!preflight.whisperOk) hints.push("whisper 还没好")
  return hints
}
