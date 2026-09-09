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
  write_script: "剧本（稍后）",
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
  /** 镜号；Nest 可能给 shotIndex / index */
  shotIndex?: number
  /** 画面帧 URL（若 Nest 挂在条目上） */
  frameUrl?: string
  mediaUrl?: string
  /** 对白；缺省时用 body（spoken）或与 title/body 映射 */
  dialogue?: string
}

/** Nest package.meta.analyze — 拆解诚实状态，勿另造字段名。 */
export type FilmAnalyzeMeta = {
  mode?: string
  hadFrames?: boolean
  hadTranscript?: boolean
  blocked?: boolean
  fallbackFrom?: string
}

export type FilmPackageMeta = {
  analyze?: FilmAnalyzeMeta
}

export type FilmPackage = {
  stages: FilmStage[]
  references: FilmReference[]
  breakdown: FilmBreakdownItem[]
  /** Nest 正在拆解的参考片 id；有值时跟拍页应显示进行中 */
  analyzingRefId?: string
  /** 可选画面帧列表（与 breakdown 镜号对齐或按 ref/shot 挂载） */
  frames?: FilmFrame[]
  meta?: FilmPackageMeta
  /** 执行端锁定；字段名 source，值 "vps" | "local" */
  source?: "vps" | "local"
  /** 兼容别名；解析时与 source 同契约 */
  executorSource?: "vps" | "local"
}

export type FilmFrame = {
  id?: string
  refId?: string
  url?: string
  mediaUrl?: string
  shotIndex?: number
  breakdownId?: string
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
  const shotIndex =
    typeof record.shotIndex === "number"
      ? record.shotIndex
      : typeof record.index === "number"
        ? record.index
        : undefined
  return {
    id,
    title,
    body: typeof record.body === "string" ? record.body : "",
    kind: asString(record.kind),
    ...(typeof shotIndex === "number" && Number.isFinite(shotIndex) ? { shotIndex } : {}),
    frameUrl: asString(record.frameUrl),
    mediaUrl: asString(record.mediaUrl) ?? asString(record.imageUrl),
    dialogue: asString(record.dialogue) ?? asString(record.spoken),
  }
}

function parseFrame(value: unknown): FilmFrame | null {
  const record = asRecord(value)
  if (!record) return null
  const url = asString(record.url) ?? asString(record.mediaUrl) ?? asString(record.frameUrl)
  if (!url && !asString(record.id)) return null
  const shotIndex = typeof record.shotIndex === "number" ? record.shotIndex : undefined
  return {
    id: asString(record.id),
    refId: asString(record.refId),
    url: asString(record.url),
    mediaUrl: asString(record.mediaUrl) ?? url,
    ...(typeof shotIndex === "number" && Number.isFinite(shotIndex) ? { shotIndex } : {}),
    breakdownId: asString(record.breakdownId),
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


function parseAnalyzeMeta(value: unknown): FilmAnalyzeMeta | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const mode = asString(record.mode)
  const fallbackFrom = asString(record.fallbackFrom)
  const hadFrames = typeof record.hadFrames === "boolean" ? record.hadFrames : undefined
  const hadTranscript = typeof record.hadTranscript === "boolean" ? record.hadTranscript : undefined
  const blocked = typeof record.blocked === "boolean" ? record.blocked : undefined
  if (
    mode === undefined &&
    fallbackFrom === undefined &&
    hadFrames === undefined &&
    hadTranscript === undefined &&
    blocked === undefined
  ) {
    return undefined
  }
  return {
    ...(mode ? { mode } : {}),
    ...(fallbackFrom ? { fallbackFrom } : {}),
    ...(hadFrames !== undefined ? { hadFrames } : {}),
    ...(hadTranscript !== undefined ? { hadTranscript } : {}),
    ...(blocked !== undefined ? { blocked } : {}),
  }
}

function parsePackageMeta(value: unknown): FilmPackageMeta | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const analyze = parseAnalyzeMeta(record.analyze)
  if (!analyze) return undefined
  return { analyze }
}

export function parseFilmPackage(value: unknown): FilmPackage | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const source = parseExecutorSource(record.source)
  const executorSource = parseExecutorSource(record.executorSource)
  const analyzingRefId = asString(record.analyzingRefId)
  const frames = parseList(record.frames, parseFrame)
  const meta = parsePackageMeta(record.meta)
  return {
    stages: parseList(record.stages, parseStage),
    references: parseList(record.references, parseReference),
    breakdown: parseList(record.breakdown, parseBreakdownItem),
    ...(analyzingRefId ? { analyzingRefId } : {}),
    ...(frames.length > 0 ? { frames } : {}),
    ...(meta ? { meta } : {}),
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

export function filmAnalyzingRefId(project?: {
  analyzingRefId?: string
  package?: FilmPackage
}) {
  const fromProject = typeof project?.analyzingRefId === "string" ? project.analyzingRefId.trim() : ""
  if (fromProject) return fromProject
  const fromPkg = project?.package?.analyzingRefId?.trim() ?? ""
  return fromPkg || undefined
}

/** 跟拍解析中：analyzingRefId 有值，或 breakdown stage === running。 */
export function filmIsAnalyzing(project?: {
  analyzingRefId?: string
  package?: FilmPackage
}) {
  if (!project) return false
  if (filmAnalyzingRefId(project)) return true
  const pkg = filmPackageOf(project)
  return pkg.stages.some(
    (stage) => (stage.id === "breakdown" || stage.label === "拆解") && stage.status === "running",
  )
}

export function isFilmProjectBusy(project?: {
  analyzingRefId?: string
  package?: FilmPackage
}) {
  const pkg = filmPackageOf(project)
  return (
    Boolean(filmAnalyzingRefId(project)) ||
    pkg.references.some((item) => item.status === "pending") ||
    pkg.stages.some((item) => item.status === "running")
  )
}

/** 参考片是否有可拆解媒体（上传就绪或带 url/mediaUrl）。 */
export function filmReferenceHasParseableMedia(item: FilmReference) {
  if (item.status !== "ready") return false
  if (item.source === "upload") return true
  return Boolean(item.mediaUrl || item.url)
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


/** 镜号展示：优先 shotIndex，否则用列表序号（1-based）。 */
export function filmBreakdownShotLabel(item: FilmBreakdownItem, index: number) {
  const n =
    typeof item.shotIndex === "number" && Number.isFinite(item.shotIndex)
      ? item.shotIndex
      : index + 1
  return `镜号 ${n}`
}

/**
 * Nest 契约：title = `镜号 N`；body 含 `画面：` / `对白：`。
 * 已符合契约则原样展示；否则按 kind/title/body 补全，不另造字段名。
 */
export function filmBreakdownPresentation(item: FilmBreakdownItem, index: number, pkg?: FilmPackage) {
  const kind = (item.kind ?? "").trim().toLowerCase()
  const rawTitle = item.title.trim()
  const rawBody = item.body.trim()
  const titleLooksLikeShot = /^镜号\s*\d+/u.test(rawTitle)
  const bodyHasVisual = rawBody.includes("画面：")
  const bodyHasDialogue = rawBody.includes("对白：")
  const shotLabel = titleLooksLikeShot ? rawTitle : filmBreakdownShotLabel(item, index)

  let body = rawBody
  if (!bodyHasVisual || !bodyHasDialogue) {
    let visual = ""
    let dialogue = (item.dialogue ?? "").trim()

    if (bodyHasVisual || bodyHasDialogue) {
      // 半契约：保留已有行，补缺的一侧
      const visualMatch = rawBody.match(/画面：([^\n]*)/)
      const dialogueMatch = rawBody.match(/对白：([^\n]*)/)
      visual = visualMatch?.[1]?.trim() ?? ""
      dialogue = dialogue || dialogueMatch?.[1]?.trim() || ""
      if (!bodyHasVisual) {
        if (kind === "shot") visual = visual || rawTitle
        else if (!titleLooksLikeShot) visual = visual || rawTitle
      }
      if (!bodyHasDialogue && kind === "spoken") {
        dialogue = dialogue || rawBody || rawTitle
      }
    } else if (kind === "shot") {
      visual = rawBody || (!titleLooksLikeShot ? rawTitle : "")
    } else if (kind === "spoken") {
      dialogue = dialogue || rawBody || (!titleLooksLikeShot ? rawTitle : "")
    } else {
      if (!titleLooksLikeShot) visual = rawTitle
      dialogue = dialogue || rawBody
    }

    const lines: string[] = []
    lines.push(`画面：${visual || "（无）"}`)
    lines.push(`对白：${dialogue || "（无）"}`)
    body = lines.join("\n")
  }

  const frameFromItem = item.frameUrl || item.mediaUrl
  const frameFromPkg = pkg?.frames?.find((frame) => {
    if (frame.breakdownId && frame.breakdownId === item.id) return true
    if (
      typeof frame.shotIndex === "number" &&
      typeof item.shotIndex === "number" &&
      frame.shotIndex === item.shotIndex
    ) {
      return true
    }
    if (typeof frame.shotIndex === "number" && frame.shotIndex === index + 1) return true
    return false
  })
  const mediaUrl = frameFromItem || frameFromPkg?.mediaUrl || frameFromPkg?.url

  return {
    title: shotLabel,
    body: body || undefined,
    badge: kind === "spoken" ? "对白" : kind === "shot" ? "画面" : "拆解",
    mediaUrl,
  }
}


/** 读取 Nest package.meta.analyze */
export function filmAnalyzeMetaOf(project?: { package?: FilmPackage }): FilmAnalyzeMeta | undefined {
  return project?.package?.meta?.analyze
}

/**
 * 诚实拆解状态文案：
 * - mode 含 stub / 演示 → 演示
 * - blocked → 已阻塞，不假装真实拆解
 * - 否则汇报帧/对白与 fallback
 */
export function filmAnalyzeMetaStatusLines(meta?: FilmAnalyzeMeta): string[] {
  if (!meta) return []
  const lines: string[] = []
  const mode = (meta.mode ?? "").trim()
  const modeLower = mode.toLowerCase()
  const isStub =
    modeLower.includes("stub") ||
    mode.includes("演示") ||
    modeLower === "demo" ||
    modeLower.includes("fallback")

  if (meta.blocked === true) {
    lines.push("拆解已阻塞（blocked），结果不可当作真实拆解")
  }
  if (isStub) {
    lines.push(mode ? `演示拆解（${mode}）` : "演示拆解（stub）")
  } else if (mode) {
    lines.push(`拆解模式：${mode}`)
  }
  if (meta.fallbackFrom) {
    lines.push(`回退自：${meta.fallbackFrom}`)
  }
  if (meta.hadFrames === true) lines.push("含画面帧")
  else if (meta.hadFrames === false) lines.push("无画面帧")
  if (meta.hadTranscript === true) lines.push("含对白转录")
  else if (meta.hadTranscript === false) lines.push("无对白转录")
  return lines
}

export function isFilmAnalyzeMetaStubOrBlocked(meta?: FilmAnalyzeMeta) {
  if (!meta) return false
  if (meta.blocked === true) return true
  const mode = (meta.mode ?? "").toLowerCase()
  return (
    mode.includes("stub") ||
    mode.includes("demo") ||
    (meta.mode ?? "").includes("演示") ||
    Boolean(meta.fallbackFrom && mode.includes("fallback"))
  )
}

export function filmBreakdownStageId(pkg: FilmPackage): string | undefined {
  return filmStageByKind(pkg, "breakdown")?.id
}
