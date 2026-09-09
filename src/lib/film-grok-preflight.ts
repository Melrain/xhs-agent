import { asRecord } from "@/lib/film-package"

export type FilmRunnerSource = "vps" | "local"

/** GET /api/backend/internal/film/grok/preflight — 最终字段；runner 会补上 source。 */
export type FilmGrokPreflight = {
  installed: boolean
  bin?: string
  authFile: boolean
  authOk: boolean
  detail: string
  ffmpegOk?: boolean
  whisperOk?: boolean
  source: FilmRunnerSource
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

function asSource(value: unknown): FilmRunnerSource | undefined {
  return value === "vps" || value === "local" ? value : undefined
}

export function emptyFilmGrokPreflight(
  source: FilmRunnerSource = "vps",
): FilmGrokPreflight {
  return {
    installed: false,
    authFile: false,
    authOk: false,
    detail: "",
    source,
  }
}

/** Nest 响应解析；未带 source 时默认 vps（HTTP 本身就是 VPS 运输）。 */
export function parseFilmGrokPreflight(value: unknown): FilmGrokPreflight {
  const record = asRecord(value)
  const nested = asRecord(record?.data) ?? asRecord(record?.preflight)
  const row = nested ?? record
  if (!row) return emptyFilmGrokPreflight("vps")
  return {
    installed: asBool(row.installed),
    bin: asOptionalString(row.bin),
    authFile: asBool(row.authFile),
    authOk: asBool(row.authOk),
    detail: asDisplay(row.detail),
    ffmpegOk: asOptionalBool(row.ffmpegOk),
    whisperOk: asOptionalBool(row.whisperOk),
    source: asSource(row.source) ?? "vps",
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
      source: preflight.source,
    }
  }
  if (!thread) return undefined
  return {
    installed: true,
    authFile: thread.authOk,
    authOk: thread.authOk,
    detail: thread.detail,
    source: "vps",
  }
}

export function filmGrokAuthKind(preflight?: FilmGrokPreflight): FilmGrokAuthKind {
  if (!preflight || !preflight.installed) return "missing"
  if (!preflight.authFile) return "unsigned"
  if (!preflight.authOk) return "expired"
  return "ok"
}

/** stub / 明确阻塞：不假装可以真实拆解（local 本身可选；看 detail 是否仍未接线）。 */
export function isFilmGrokStubOrBlocked(preflight?: FilmGrokPreflight) {
  if (!preflight) return false
  const detail = preflight.detail.toLowerCase()
  return (
    detail.includes("stub") ||
    detail.includes("尚未接线") ||
    detail.includes("尚未实现") ||
    detail.includes("暂不可用")
  )
}

/**
 * 拆解门槛：authOk，且 ffmpeg 未明确失败。
 * ffmpegOk === false 时不开放真实拆解；undefined 视为 Nest 未报，不额外拦截。
 */
export function canFilmAnalyze(preflight?: FilmGrokPreflight) {
  if (!preflight?.authOk) return false
  if (preflight.ffmpegOk === false) return false
  if (isFilmGrokStubOrBlocked(preflight)) return false
  return true
}

/** 诚实门禁文案（中文）；可拆解时返回空串。 */
export function filmAnalyzeGateReason(preflight?: FilmGrokPreflight) {
  if (!preflight) return "尚未检查执行端 grok"
  if (isFilmGrokStubOrBlocked(preflight)) {
    return preflight.detail.trim() || "执行端暂不可用（stub），不能假装拆解"
  }
  if (!preflight.authOk) return filmGrokAuthLabel(preflight)
  if (preflight.ffmpegOk === false) return "ffmpeg 不可用，无法做真实拆解"
  if (preflight.whisperOk === false) {
    // whisper 软提示：不挡拆解，但调用方也可拼进说明
    return ""
  }
  return ""
}

/** UI 短名：local→本机 grok，vps（默认）→VPS grok */
export function filmGrokEndpointLabel(source?: FilmRunnerSource | null) {
  return source === "local" ? "本机 grok" : "VPS grok"
}

export function filmGrokCheckingLabel(source?: FilmRunnerSource | null) {
  return `正在检查${filmGrokEndpointLabel(source)}…`
}

export function filmGrokMissingCheckLabel(source?: FilmRunnerSource | null) {
  return `未检查到${filmGrokEndpointLabel(source)}`
}

export function filmGrokReadyLabel(source?: FilmRunnerSource | null) {
  return `${filmGrokEndpointLabel(source)} 已就绪`
}

export function filmGrokAuthLabel(preflight?: FilmGrokPreflight) {
  if (isFilmGrokStubOrBlocked(preflight) && preflight?.source === "local") {
    // 本机 stub/阻塞时仍展示真实 auth 态；门禁用 filmAnalyzeGateReason。
    if (preflight.installed && preflight.authOk) {
      return `${filmGrokEndpointLabel("local")} / grok bot`
    }
  }
  switch (filmGrokAuthKind(preflight)) {
    case "missing":
      return "未安装"
    case "unsigned":
      return "未登录（grok login）"
    case "expired":
      return "登录失效（再 grok login）"
    case "ok":
      return `${filmGrokEndpointLabel(preflight?.source)} / grok bot`
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
  if (preflight.ffmpegOk === false) hints.push("ffmpeg 还没好 · 不能真实拆解")
  else if (preflight.ffmpegOk === true) hints.push("ffmpeg 可用")
  if (preflight.whisperOk === false) hints.push("whisper 还没好 · 对白可能不完整")
  else if (preflight.whisperOk === true) hints.push("whisper 可用")
  if (isFilmGrokStubOrBlocked(preflight)) hints.push("执行端为 stub / 已阻塞")
  return hints
}
