/** 与 web / 后端 PR 同一套字段名。解析时丢掉未知字段，不改名。 */

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

/** 生成类阶段本机执行（优先 grok，否则 Grok Bot），产物写回 package。服务端不持 key。本切片先改文案。 */
export const FILM_LOCAL_GENERATION_STAGES = [
  "script",
  "assets",
  "shots",
  "keyframes",
  "clips",
  "audio",
  "cut",
] as const

export type FilmLocalGenerationStage = (typeof FILM_LOCAL_GENERATION_STAGES)[number]

export function isFilmLocalGenerationStage(value: unknown): value is FilmLocalGenerationStage {
  return typeof value === "string" && (FILM_LOCAL_GENERATION_STAGES as readonly string[]).includes(value)
}

export const FILM_STAGE_STATUSES = [
  "pending",
  "running",
  "ready",
  "approved",
  "rejected",
  "placeholder",
] as const

export type FilmStageStatus = (typeof FILM_STAGE_STATUSES)[number]

export const FILM_REFERENCE_SOURCES = ["url", "upload"] as const
export type FilmReferenceSource = (typeof FILM_REFERENCE_SOURCES)[number]

export const FILM_REFERENCE_STATUSES = ["pending", "ready", "failed"] as const
export type FilmReferenceStatus = (typeof FILM_REFERENCE_STATUSES)[number]

export function isFilmStageKind(value: unknown): value is FilmStageKind {
  return typeof value === "string" && (FILM_STAGES as readonly string[]).includes(value)
}

export function isFilmPhase(value: unknown): value is FilmPhase {
  return isFilmStageKind(value)
}

export function parseFilmPhase(value: unknown): FilmPhase | undefined {
  return isFilmStageKind(value) ? value : undefined
}

export function filmStageLabel(kind: unknown) {
  return isFilmStageKind(kind) ? FILM_STAGE_LABELS[kind] : ""
}

export function filmPhaseLabel(phase: unknown) {
  return filmStageLabel(phase)
}

export const FILM_NEXT_ACTIONS = [
  "ingest_reference",
  "grok_login",
  "run_breakdown",
  "review_breakdown",
  "write_script",
] as const

export type FilmNextActionId = (typeof FILM_NEXT_ACTIONS)[number]

export type FilmNextAction = {
  id: FilmNextActionId
  message: string
}

export const FILM_NEXT_ACTION_LABELS: Record<FilmNextActionId, string> = {
  ingest_reference: "贴参考片链接，或上传视频",
  grok_login: "请先 grok login",
  run_breakdown: "拆解参考片",
  review_breakdown: "看看拆解对不对",
  write_script: "下一步本机执行",
}

export function isFilmNextActionId(value: unknown): value is FilmNextActionId {
  return typeof value === "string" && (FILM_NEXT_ACTIONS as readonly string[]).includes(value)
}

export function isFilmNextAction(value: unknown): value is FilmNextAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as { id?: unknown; message?: unknown }
  return isFilmNextActionId(row.id) && typeof row.message === "string"
}

export function parseFilmNextAction(value: unknown): FilmNextAction | undefined {
  if (!isFilmNextAction(value)) return undefined
  return { id: value.id, message: value.message.trim() }
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
  return inferred ? FILM_NEXT_ACTION_LABELS[inferred] : filmPhaseLabel(project.phase)
}

export type FilmStage = {
  id: string
  label: string
  status: FilmStageStatus
}

export type FilmReference = {
  id: string
  source: FilmReferenceSource
  url?: string
  title?: string
  status: FilmReferenceStatus
  mediaUrl?: string
}

export type FilmBreakdownItem = {
  id: string
  title: string
  body: string
  kind?: string
}

export type FilmPackage = {
  stages: FilmStage[]
  references: FilmReference[]
  breakdown: FilmBreakdownItem[]
  /** 执行端锁定；字段名 source，值 "vps" | "local" */
  source?: "vps" | "local"
  /** 兼容别名；解析时与 source 同契约 */
  executorSource?: "vps" | "local"
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function parseStageStatus(value: unknown): FilmStageStatus | undefined {
  return typeof value === "string" && (FILM_STAGE_STATUSES as readonly string[]).includes(value)
    ? (value as FilmStageStatus)
    : undefined
}

function parseReferenceSource(value: unknown): FilmReferenceSource | undefined {
  return typeof value === "string" && (FILM_REFERENCE_SOURCES as readonly string[]).includes(value)
    ? (value as FilmReferenceSource)
    : undefined
}

function parseReferenceStatus(value: unknown): FilmReferenceStatus | undefined {
  return typeof value === "string" && (FILM_REFERENCE_STATUSES as readonly string[]).includes(value)
    ? (value as FilmReferenceStatus)
    : undefined
}

function parseStage(value: unknown): FilmStage | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  const label = asString(record?.label)
  const status = parseStageStatus(record?.status)
  if (!record || !id || !label || !status) return null
  return { id, label, status }
}

function parseReference(value: unknown): FilmReference | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  const source = parseReferenceSource(record?.source)
  const status = parseReferenceStatus(record?.status)
  if (!record || !id || !source || !status) return null
  return {
    id,
    source,
    status,
    url: asString(record.url),
    title: asString(record.title),
    mediaUrl: asString(record.mediaUrl),
  }
}

function parseBreakdownItem(value: unknown): FilmBreakdownItem | null {
  const record = asRecord(value)
  const id = asString(record?.id)
  const title = asString(record?.title)
  if (!record || !id || !title) return null
  return {
    id,
    title,
    body: typeof record.body === "string" ? record.body : "",
    kind: asString(record.kind),
  }
}

function parseList<T>(value: unknown, parseOne: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = parseOne(item)
    return parsed ? [parsed] : []
  })
}

function parseExecutorSource(value: unknown): "vps" | "local" | undefined {
  return value === "vps" || value === "local" ? value : undefined
}

export function parseFilmPackage(value: unknown): FilmPackage | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const source = parseExecutorSource(record.source)
  const executorSource = parseExecutorSource(record.executorSource)
  return {
    stages: parseList(record.stages, parseStage),
    references: parseList(record.references, parseReference),
    breakdown: parseList(record.breakdown, parseBreakdownItem),
    ...(source ? { source } : {}),
    ...(executorSource ? { executorSource } : {}),
  }
}

export function emptyFilmPackage(): FilmPackage {
  return { stages: [], references: [], breakdown: [] }
}

export function filmPackageOf(project?: { package?: FilmPackage }): FilmPackage {
  return project?.package ?? emptyFilmPackage()
}

export function filmStageKind(stage: Pick<FilmStage, "id" | "label">, index?: number): FilmStageKind | undefined {
  if (isFilmStageKind(stage.id)) return stage.id
  if (isFilmStageKind(stage.label)) return stage.label
  const byLabel = FILM_STAGES.find((kind) => FILM_STAGE_LABELS[kind] === stage.label)
  if (byLabel) return byLabel
  if (typeof index === "number") return FILM_STAGES[index]
  return undefined
}

export function filmStageByKind(pkg: FilmPackage, kind: FilmStageKind): FilmStage | undefined {
  return pkg.stages.find((stage, index) => filmStageKind(stage, index) === kind)
}

export function isFilmStatusBusy(status: unknown) {
  return status === "pending" || status === "running"
}

export function isFilmProjectBusy(project?: { package?: FilmPackage }) {
  const pkg = filmPackageOf(project)
  return (
    pkg.references.some((item) => item.status === "pending") ||
    pkg.stages.some((item) => item.status === "running")
  )
}

export function filmStatusLabel(status: unknown) {
  switch (status) {
    case "pending":
      return "等待中"
    case "running":
      return "正在处理"
    case "ready":
      return "已就绪"
    case "approved":
      return "已通过"
    case "rejected":
      return "未通过"
    case "failed":
      return "失败"
    case "placeholder":
      return "稍后"
    default:
      return typeof status === "string" && status.trim() ? status : ""
  }
}

export function filmSourceLabel(source: unknown) {
  if (source === "url") return "链接"
  if (source === "upload") return "上传"
  return ""
}

export function inferFilmNextActionId(project?: {
  phase?: unknown
  nextAction?: FilmNextAction
  package?: FilmPackage
}): FilmNextActionId | undefined {
  if (isFilmNextActionId(project?.nextAction?.id)) return project.nextAction.id
  const pkg = filmPackageOf(project)
  const reference = pkg.references[0]
  const breakdownStage = filmStageByKind(pkg, "breakdown")
  if (!reference || reference.status === "pending" || reference.status === "failed") {
    return "ingest_reference"
  }
  if (project?.phase === "script" || breakdownStage?.status === "approved") {
    return "write_script"
  }
  if (pkg.breakdown.length > 0 || breakdownStage?.status === "ready" || breakdownStage?.status === "rejected") {
    return "review_breakdown"
  }
  return "run_breakdown"
}

export function filmBreakdownStageId(pkg: FilmPackage): string | undefined {
  return filmStageByKind(pkg, "breakdown")?.id
}
