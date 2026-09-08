/** 影片复制流水线。与 web 共用同一套字段名；解析时尽量宽松。 */

export const FILM_STAGES = [
  "reference",
  "breakdown",
  "script",
  "assets",
  "shots",
  "keyframes",
  "clips",
  "audio",
  "cut",
] as const

export type FilmStageKind = (typeof FILM_STAGES)[number]

/** 项目 phase 与流水线 stage 同一套 id。 */
export const FILM_PHASES = FILM_STAGES
export type FilmPhase = FilmStageKind

export const FILM_STAGE_LABELS: Record<FilmStageKind, string> = {
  reference: "参考片",
  breakdown: "拆解",
  script: "剧本",
  assets: "素材",
  shots: "分镜",
  keyframes: "关键帧",
  clips: "片段",
  audio: "声音",
  cut: "成片",
}

export const FILM_PHASE_LABELS = FILM_STAGE_LABELS

const LEGACY_PHASE_MAP: Record<string, FilmStageKind> = {
  intake: "reference",
  generate: "cut",
}

export function isFilmStageKind(value: unknown): value is FilmStageKind {
  return typeof value === "string" && (FILM_STAGES as readonly string[]).includes(value)
}

export function isFilmPhase(value: unknown): value is FilmPhase {
  return isFilmStageKind(value)
}

export function parseFilmPhase(value: unknown): FilmPhase | undefined {
  if (isFilmStageKind(value)) return value
  if (typeof value === "string" && value in LEGACY_PHASE_MAP) return LEGACY_PHASE_MAP[value]
  return undefined
}

export function filmStageLabel(kind: unknown) {
  return isFilmStageKind(kind) ? FILM_STAGE_LABELS[kind] : ""
}

export function filmPhaseLabel(phase: unknown) {
  const mapped = parseFilmPhase(phase)
  return mapped ? FILM_STAGE_LABELS[mapped] : ""
}

export const FILM_NEXT_ACTIONS = [
  "ingest_reference",
  "run_breakdown",
  "review_breakdown",
  "write_script",
] as const

export type FilmNextActionId = (typeof FILM_NEXT_ACTIONS)[number]

export type FilmNextAction = {
  id: string
  message: string
}

export const FILM_NEXT_ACTION_LABELS: Record<FilmNextActionId, string> = {
  ingest_reference: "贴参考片链接，或上传视频",
  run_breakdown: "拆解参考片",
  review_breakdown: "看看拆解对不对",
  write_script: "开始写剧本",
}

export function isFilmNextActionId(value: unknown): value is FilmNextActionId {
  return typeof value === "string" && (FILM_NEXT_ACTIONS as readonly string[]).includes(value)
}

export function isFilmNextAction(value: unknown): value is FilmNextAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as { id?: unknown; message?: unknown }
  return typeof row.id === "string" && row.id.trim().length > 0 && typeof row.message === "string"
}

export function parseFilmNextAction(value: unknown): FilmNextAction | undefined {
  if (!isFilmNextAction(value)) return undefined
  return { id: value.id.trim(), message: value.message.trim() }
}

export function filmNextActionMessage(project: {
  phase?: unknown
  nextAction?: FilmNextAction
  package?: FilmPackage
}) {
  const message = project.nextAction?.message.trim()
  if (message) return message
  if (isFilmNextActionId(project.nextAction?.id)) {
    return FILM_NEXT_ACTION_LABELS[project.nextAction.id]
  }
  const inferred = inferFilmNextActionId(project)
  if (inferred) return FILM_NEXT_ACTION_LABELS[inferred]
  return filmPhaseLabel(project.phase)
}

export type FilmArtifactStatus =
  | "pending"
  | "ingesting"
  | "uploading"
  | "running"
  | "analyzing"
  | "processing"
  | "ready"
  | "approved"
  | "rejected"
  | "failed"
  | "stub"
  | string

export type FilmStage = {
  id: string
  kind?: FilmStageKind
  status?: string
  label?: string
  error?: string
}

export type FilmReference = {
  id: string
  url?: string
  sourceType?: string
  status?: string
  title?: string
  fileName?: string
  thumbnailUrl?: string
  durationMs?: number
  progress?: number
  error?: string
}

export type FilmBreakdownSegment = {
  id?: string
  startMs?: number
  endMs?: number
  title?: string
  text?: string
}

export type FilmBreakdownItem = {
  id: string
  referenceId?: string
  stageId?: string
  status?: string
  title?: string
  summary?: string
  segments: FilmBreakdownSegment[]
  error?: string
}

export type FilmScript = {
  title?: string
  body?: string
  status?: string
}

export type FilmPackage = {
  stages: FilmStage[]
  references: FilmReference[]
  breakdown: FilmBreakdownItem[]
  script?: FilmScript
}

const BUSY_STATUSES = new Set([
  "pending",
  "ingesting",
  "uploading",
  "running",
  "analyzing",
  "processing",
])

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record[key])
    if (value) return value
  }
  return undefined
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function parseProgress(value: unknown): number | undefined {
  const raw = asNumber(value)
  if (raw === undefined) return undefined
  if (raw < 0) return 0
  if (raw <= 1) return raw
  if (raw <= 100) return raw / 100
  return 1
}

export function parseFilmStageKind(value: unknown): FilmStageKind | undefined {
  if (isFilmStageKind(value)) return value
  return parseFilmPhase(value)
}

function parseStage(value: unknown): FilmStage | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  if (!record || !id) return null
  return {
    id,
    kind: parseFilmStageKind(record.kind ?? record.key ?? record.name ?? record.type),
    status: asString(record.status),
    label: asString(record.label),
    error: firstString(record, ["error", "message"]),
  }
}

function parseReference(value: unknown): FilmReference | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  if (!record || !id) return null
  return {
    id,
    url: asString(record.url),
    sourceType: asString(record.sourceType),
    status: asString(record.status),
    title: asString(record.title),
    fileName: firstString(record, ["fileName", "filename", "name"]),
    thumbnailUrl: firstString(record, ["thumbnailUrl", "thumbnail"]),
    durationMs: firstNumber(record, ["durationMs", "duration"]),
    progress: parseProgress(record.progress),
    error: firstString(record, ["error", "message"]),
  }
}

function parseSegment(value: unknown, index: number): FilmBreakdownSegment | null {
  if (typeof value === "string" && value.trim()) {
    return { id: `seg-${index}`, text: value.trim() }
  }
  const record = asRecord(value)
  if (!record) return null
  const text = firstString(record, ["text", "description", "body", "summary"])
  const title = asString(record.title)
  if (!text && !title) return null
  return {
    id: asString(record.id) ?? `seg-${index}`,
    startMs: firstNumber(record, ["startMs", "start"]),
    endMs: firstNumber(record, ["endMs", "end"]),
    title,
    text,
  }
}

function parseBreakdownItem(value: unknown): FilmBreakdownItem | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  if (!record || !id) return null
  const rawSegments = Array.isArray(record.segments) ? record.segments : []
  return {
    id,
    referenceId: firstString(record, ["referenceId", "refId"]),
    stageId: asString(record.stageId),
    status: asString(record.status),
    title: asString(record.title),
    summary: firstString(record, ["summary", "text", "body"]),
    segments: rawSegments.flatMap((item, index) => {
      const segment = parseSegment(item, index)
      return segment ? [segment] : []
    }),
    error: firstString(record, ["error", "message"]),
  }
}

function parseScript(value: unknown): FilmScript | undefined {
  if (typeof value === "string" && value.trim()) return { body: value.trim() }
  const record = asRecord(Array.isArray(value) ? value[0] : value)
  if (!record) return undefined
  const title = asString(record.title)
  const body = firstString(record, ["body", "text"])
  const status = asString(record.status)
  if (!title && !body && !status) return undefined
  return { title, body, status }
}

function parseList<T>(value: unknown, parseOne: (item: unknown) => T | null): T[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const parsed = parseOne(item)
      return parsed ? [parsed] : []
    })
  }
  const single = parseOne(value)
  return single ? [single] : []
}

export function parseFilmPackage(value: unknown): FilmPackage | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  return {
    stages: parseList(record.stages, parseStage),
    references: parseList(record.references, parseReference),
    breakdown: parseList(record.breakdown, parseBreakdownItem),
    script: parseScript(record.script),
  }
}

export function emptyFilmPackage(): FilmPackage {
  return { stages: [], references: [], breakdown: [] }
}

export function filmPackageOf(project?: { package?: FilmPackage }): FilmPackage {
  return project?.package ?? emptyFilmPackage()
}

export function isFilmStatusBusy(status: unknown) {
  return typeof status === "string" && BUSY_STATUSES.has(status)
}

export function isFilmProjectBusy(project?: { package?: FilmPackage }) {
  const pkg = filmPackageOf(project)
  return (
    pkg.references.some((item) => isFilmStatusBusy(item.status)) ||
    pkg.breakdown.some((item) => isFilmStatusBusy(item.status)) ||
    pkg.stages.some((item) => isFilmStatusBusy(item.status)) ||
    isFilmStatusBusy(pkg.script?.status)
  )
}

export function filmStatusLabel(status: unknown) {
  switch (status) {
    case "pending":
      return "等待中"
    case "ingesting":
    case "uploading":
      return "正在导入"
    case "running":
    case "analyzing":
    case "processing":
      return "正在处理"
    case "ready":
      return "已就绪"
    case "approved":
      return "已通过"
    case "rejected":
      return "未通过"
    case "failed":
      return "失败"
    case "stub":
      return "稍后"
    default:
      return typeof status === "string" && status.trim() ? status : ""
  }
}

export function filmSourceTypeLabel(sourceType: unknown) {
  if (sourceType === "url") return "链接"
  if (sourceType === "upload") return "上传"
  return typeof sourceType === "string" && sourceType.trim() ? sourceType : ""
}

export function inferFilmNextActionId(project?: {
  nextAction?: FilmNextAction
  package?: FilmPackage
}): FilmNextActionId | undefined {
  if (isFilmNextActionId(project?.nextAction?.id)) return project.nextAction.id
  const pkg = filmPackageOf(project)
  const reference = pkg.references[0]
  const breakdown = pkg.breakdown[0]
  const breakdownStage = pkg.stages.find((stage) => stage.kind === "breakdown")
  if (!reference || isFilmStatusBusy(reference.status)) return "ingest_reference"
  if (reference.status === "failed") return "ingest_reference"
  if (
    !breakdown ||
    isFilmStatusBusy(breakdown.status) ||
    breakdown.status === "failed" ||
    breakdown.status === "stub"
  ) {
    return "run_breakdown"
  }
  if (
    breakdown.status === "ready" ||
    breakdownStage?.status === "ready" ||
    breakdownStage?.status === "rejected"
  ) {
    return "review_breakdown"
  }
  if (breakdown.status === "approved" || breakdownStage?.status === "approved" || !pkg.script) {
    return "write_script"
  }
  return "write_script"
}

export function filmBreakdownStageId(pkg: FilmPackage): string | undefined {
  return (
    pkg.stages.find((stage) => stage.kind === "breakdown")?.id ??
    pkg.breakdown[0]?.stageId ??
    pkg.breakdown[0]?.id
  )
}

function asSeconds(value: number) {
  return Math.max(0, Math.round(value >= 1000 ? value / 1000 : value))
}

export function formatFilmDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) return ""
  const total = asSeconds(durationMs)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function formatFilmTimecode(ms?: number) {
  if (ms === undefined) return ""
  const total = asSeconds(ms)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
