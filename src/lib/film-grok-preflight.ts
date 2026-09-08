import { asRecord } from "@/lib/film-package"

/** GET /api/backend/internal/film/grok/preflight — 最终字段。 */
export type FilmGrokPreflight = {
  installed: boolean
  bin?: string
  authFile: boolean
  authOk: boolean
  detail: string
  ffmpegOk?: boolean
  whisperOk?: boolean
}

/** 项目/对话线程上的可选摘要，给顶栏用。 */
export type FilmGrokThread = {
  authOk: boolean
  detail: string
}

export type FilmGrokAuthKind = "ok" | "missing" | "unsigned" | "expired"

function asBool(value: unknown): boolean {
  return value === true
}

function asOptionalBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
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
    ffmpegOk: asOptionalBool(row.ffmpegOk),
    whisperOk: asOptionalBool(row.whisperOk),
  }
}

export function parseFilmGrokThread(value: unknown): FilmGrokThread | undefined {
  const record = asRecord(value)
  if (!record || typeof record.authOk !== "boolean") return undefined
  return {
    authOk: record.authOk,
    detail: asDisplay(record.detail),
  }
}

export function mergeFilmGrokStatus(
  preflight?: FilmGrokPreflight,
  thread?: FilmGrokThread,
): FilmGrokPreflight | undefined {
  if (preflight) {
    return {
      installed: preflight.installed,
      bin: preflight.bin,
      authFile: preflight.authFile,
      authOk: preflight.authOk,
      detail: preflight.detail.trim() ? preflight.detail : thread?.detail ?? "",
      ffmpegOk: preflight.ffmpegOk,
      whisperOk: preflight.whisperOk,
    }
  }
  if (!thread) return undefined
  return {
    installed: true,
    authFile: thread.authOk,
    authOk: thread.authOk,
    detail: thread.detail,
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
  if (preflight.ffmpegOk === false) hints.push("ffmpeg 还没好")
  if (preflight.whisperOk === false) hints.push("whisper 还没好")
  return hints
}
