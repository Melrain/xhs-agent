import { backendFetch } from "@/lib/api/client"
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
const ANALYZE_TIMEOUT_MS = 60_000

export const FILM_QUERY_KEY = ["film"] as const

export function filmProjectsQueryKey(userId: string) {
  return ["film", "projects", userId] as const
}

export function filmCurrentQueryKey(userId: string) {
  return ["film", "current", userId] as const
}

export type FilmProjectSummary = {
  id: string
  title: string
  phase?: FilmPhase
  updatedAt?: string
}

export type FilmProject = FilmProjectSummary & {
  brief: string
  phase: FilmPhase
  nextAction?: FilmNextAction
  package?: FilmPackage
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

function parseProject(value: unknown): FilmProject | null {
  const summary = parseSummary(value)
  if (!summary) return null
  const record = asRecord(unwrapProject(value))
  const brief = typeof record?.brief === "string" ? record.brief : ""
  return {
    ...summary,
    brief,
    phase: parseFilmPhase(record?.phase) ?? "reference",
    nextAction: parseFilmNextAction(record?.nextAction),
    package: parseFilmPackage(record?.package),
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
