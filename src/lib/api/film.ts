import { backendFetch } from "@/lib/api/client"
import { isFilmPhase, type FilmPackage, type FilmPhase } from "@/lib/film-package"

const LIST_TIMEOUT_MS = 15_000
const MESSAGE_TIMEOUT_MS = 120_000

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
  package?: FilmPackage
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseSummary(value: unknown): FilmProjectSummary | null {
  const record = asRecord(value)
  const id = typeof record?.id === "string" ? record.id : ""
  const title = typeof record?.title === "string" ? record.title : ""
  if (!id || !title) return null
  return {
    id,
    title,
    phase: isFilmPhase(record?.phase) ? record.phase : undefined,
    updatedAt: typeof record?.updatedAt === "string" ? record.updatedAt : undefined,
  }
}

function parseProject(value: unknown): FilmProject | null {
  const summary = parseSummary(value)
  if (!summary) return null
  const record = asRecord(value)
  const brief = typeof record?.brief === "string" ? record.brief : ""
  const pkg = asRecord(record?.package) ?? undefined
  return {
    ...summary,
    brief,
    phase: isFilmPhase(record?.phase) ? record.phase : "intake",
    package: pkg,
  }
}

function requireProject(value: unknown): FilmProject {
  const project = parseProject(value)
  if (!project) throw new Error("后端没有返回影片项目")
  return project
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
    await backendFetch<unknown>(
      `/api/backend/internal/film/projects/${encodeURIComponent(projectId)}/open`,
      {
        method: "POST",
        timeoutMs: LIST_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}

export async function renameFilmProject(
  projectId: string,
  title: string,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(
      `/api/backend/internal/film/projects/${encodeURIComponent(projectId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        timeoutMs: LIST_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}

export async function deleteFilmProject(projectId: string, options?: { signal?: AbortSignal }) {
  await backendFetch<unknown>(
    `/api/backend/internal/film/projects/${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      timeoutMs: LIST_TIMEOUT_MS,
      signal: options?.signal,
    },
  )
}

export async function sendFilmMessage(
  projectId: string,
  text: string,
  options?: { signal?: AbortSignal },
) {
  return requireProject(
    await backendFetch<unknown>(
      `/api/backend/internal/film/projects/${encodeURIComponent(projectId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        timeoutMs: MESSAGE_TIMEOUT_MS,
        signal: options?.signal,
      },
    ),
  )
}
