import { backendFetch } from "@/lib/api/client"
import { parseFilmGrokPreflight, parseFilmGrokThread, type FilmGrokThread, type FilmRunnerSource } from "@/lib/film-grok-preflight"
import {
  asRecord,
  parseFilmNextAction,
  parseFilmPackage,
  parseFilmPhase,
  type FilmNextAction,
  type FilmPackage,
  type FilmPhase,
} from "@/lib/film-package"

const LIST_TIMEOUT_MS = 15_000
const UPLOAD_TIMEOUT_MS = 180_000
/** 跟拍拆解可能很长；须 ≥ Nest，建议 180–380s。 */
const ANALYZE_TIMEOUT_MS = 380_000
const PREFLIGHT_TIMEOUT_MS = 90_000

export const FILM_QUERY_KEY = ["film"] as const

export function filmProjectsQueryKey(userId: string) {
  return ["film", "projects", userId] as const
}

export function filmCurrentQueryKey(userId: string) {
  return ["film", "current", userId] as const
}

export function filmGrokPreflightQueryKey() {
  return ["film", "grok-preflight"] as const
}

export type FilmProjectSummary = {
  id: string
  title: string
  phase?: FilmPhase
  updatedAt?: string
}

export type FilmExecutor = {
  source?: FilmRunnerSource
}

export type FilmProject = FilmProjectSummary & {
  brief: string
  phase: FilmPhase
  nextAction?: FilmNextAction
  package?: FilmPackage
  grok?: FilmGrokThread
  /** Nest 正在拆解的参考片 id */
  analyzingRefId?: string
  /** 执行端锁定；字段名 source："vps" | "local" */
  source?: FilmRunnerSource
  executor?: FilmExecutor
}

function unwrapProject(value: unknown): unknown {
  const record = asRecord(value)
  if (!record) return value
  if (asRecord(record.project)?.id) return record.project
  if (asRecord(record.data)?.id) return record.data
  return value
}

function parseSummary(value: unknown): FilmProjectSummary | null {
  const record = asRecord(unwrapProject(value))
  const id = typeof record?.id === "string" ? record.id : ""
  const title = typeof record?.title === "string" ? record.title : ""
  if (!id || !title) return null
  return {
    id,
    title,
    phase: parseFilmPhase(record?.phase),
    updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : undefined,
  }
}

function parseRunnerSource(value: unknown): FilmRunnerSource | undefined {
  return value === "vps" || value === "local" ? value : undefined
}

function parseExecutor(value: unknown): FilmExecutor | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const source = parseRunnerSource(record.source)
  if (!source) return undefined
  return { source }
}

function parseProject(value: unknown): FilmProject | null {
  const summary = parseSummary(value)
  if (!summary) return null
  const record = asRecord(unwrapProject(value))
  const brief = typeof record?.brief === "string" ? record.brief : ""
  const source = parseRunnerSource(record?.source)
  const executor = parseExecutor(record?.executor)
  const analyzingRefId =
    typeof record?.analyzingRefId === "string" && record.analyzingRefId.trim()
      ? record.analyzingRefId.trim()
      : undefined
  return {
    ...summary,
    brief,
    phase: parseFilmPhase(record?.phase) ?? "reference",
    nextAction: parseFilmNextAction(record?.nextAction),
    package: parseFilmPackage(record?.package),
    grok: parseFilmGrokThread(record?.grok),
    ...(analyzingRefId ? { analyzingRefId } : {}),
    ...(source ? { source } : {}),
    ...(executor ? { executor } : {}),
  }
}

function requireProject(value: unknown): FilmProject {
  const project = parseProject(value)
  if (!project) throw new Error("后端没有返回影片项目")
  return project
}

function projectPath(projectId: string, suffix = "") {
  return `/api/backend/internal/film/projects/${encodeURIComponent(projectId)}${suffix}`
}

export async function listFilmProjects(options?: { signal?: AbortSignal }) {
  const body = await backendFetch<unknown>("/api/backend/internal/film/projects", {
    timeoutMs: LIST_TIMEOUT_MS,
    signal: options?.signal,
  })
  return (Array.isArray(body) ? body : []).flatMap((item) => {
    const summary = parseSummary(item)
    return summary ? [summary] : []
  })
}

export async function getCurrentFilmProject(options?: { signal?: AbortSignal }) {
  return requireProject(
    await backendFetch<unknown>("/api/backend/internal/film/projects/current", {
      timeoutMs: LIST_TIMEOUT_MS,
      signal: options?.signal,
    }),
  )
}

export async function createFilmProject(title?: string, options?: { signal?: AbortSignal }) {
  return requireProject(
    await backendFetch<unknown>("/api/backend/internal/film/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
      timeoutMs: LIST_TIMEOUT_MS,
      signal: options?.signal,
    }),
  )
}

export async function openFilmProject(projectId: string, options?: { signal?: AbortSignal }) {
  return requireProject(
    await backendFetch<unknown>(projectPath(projectId, "/open"), {
      method: "POST",
      timeoutMs: LIST_TIMEOUT_MS,
      signal: options?.signal,
    }),
  )
}

export async function renameFilmProject(
  projectId: string,
  title: string,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(projectPath(projectId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
      timeoutMs: LIST_TIMEOUT_MS,
      signal: options?.signal,
    }),
  )
}

export async function deleteFilmProject(projectId: string, options?: { signal?: AbortSignal }) {
  await backendFetch<unknown>(projectPath(projectId), {
    method: "DELETE",
    timeoutMs: LIST_TIMEOUT_MS,
    signal: options?.signal,
  })
}

/** Nest HTTP：VPS Grok CLI preflight 运输层（GrokCli/vps 调用；非本机探测）。 */
export async function getFilmGrokPreflight(options?: { signal?: AbortSignal }) {
  return parseFilmGrokPreflight(
    await backendFetch<unknown>("/api/backend/internal/film/grok/preflight", {
      timeoutMs: PREFLIGHT_TIMEOUT_MS,
      signal: options?.signal,
    }),
  )
}

export async function addFilmReference(
  projectId: string,
  input: { url: string } | { file: File },
  options?: { signal?: AbortSignal },
) {
  if ("file" in input) {
    const form = new FormData()
    form.append("file", input.file)
    return requireProject(
      await backendFetch<unknown>(projectPath(projectId, "/references"), {
        method: "POST",
        body: form,
        timeoutMs: UPLOAD_TIMEOUT_MS,
        signal: options?.signal,
      }),
    )
  }
  return requireProject(
    await backendFetch<unknown>(projectPath(projectId, "/references"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input.url }),
      timeoutMs: LIST_TIMEOUT_MS,
      signal: options?.signal,
    }),
  )
}

/** Nest HTTP：VPS Grok CLI 拆解（GrokCli/vps 调用）。 */
export async function analyzeFilmReference(
  projectId: string,
  refId: string,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(
      projectPath(projectId, `/references/${encodeURIComponent(refId)}/analyze`),
      {
        method: "POST",
        timeoutMs: ANALYZE_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}

/** Nest PersistFilmBreakdownItemDto — 镜号/画面/对白 via title+body(+kind). */
export type FilmReferenceBreakdownItemBody = {
  id?: string
  title: string
  /** Prefer 画面：…\n对白：… for shot cards */
  body: string
  kind?: string
}

/** Nest PersistFilmAnalyzeMetaDto */
export type FilmReferenceBreakdownAnalyzeMeta = {
  mode?: "local" | "cli" | "webhook" | "stub" | string
  hadFrames?: boolean
  hadTranscript?: boolean
  blocked?: boolean
  error?: string
  at?: string
  fallbackFrom?: string
}

/** Nest PersistFilmBreakdownDto — POST .../references/:refId/breakdown */
export type FilmReferenceBreakdownBody = {
  items?: FilmReferenceBreakdownItemBody[]
  meta?: {
    analyze?: FilmReferenceBreakdownAnalyzeMeta
  }
  script?: {
    id?: string
    title?: string
    body?: string
  }
}

/**
 * Desktop local analyze writeback (Nest live).
 * POST /internal/film/projects/:id/references/:refId/breakdown
 * Persists package.breakdown + meta.analyze; does not run Grok on server.
 * Empty items only when meta.analyze.blocked=true AND error present.
 */
export async function submitFilmReferenceBreakdown(
  projectId: string,
  refId: string,
  body: FilmReferenceBreakdownBody,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(
      projectPath(projectId, `/references/${encodeURIComponent(refId)}/breakdown`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: LIST_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}

export async function approveFilmStage(
  projectId: string,
  stageId: string,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(
      projectPath(projectId, `/stages/${encodeURIComponent(stageId)}/approve`),
      {
        method: "POST",
        timeoutMs: LIST_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}

export async function rejectFilmStage(
  projectId: string,
  stageId: string,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(
      projectPath(projectId, `/stages/${encodeURIComponent(stageId)}/reject`),
      {
        method: "POST",
        timeoutMs: LIST_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}
