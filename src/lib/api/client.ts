import { resolveApiUrl } from "@/lib/api-base"
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setSession,
  setTokens,
} from "@/lib/auth/tokens"

export const STUDIO_TIMEOUT_MS = 380_000
export const STUDIO_VIDEO_TIMEOUT_MS = 1_260_000
export const ACCESS_EXPIRED_CODE = "ACCESS_EXPIRED"

export class StudioApiError extends Error {
  status?: number
  code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = "StudioApiError"
    this.status = status
    this.code = code
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

export function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === "TimeoutError"
}

export function studioErrorMessage(error: unknown) {
  if (isTimeoutError(error)) return "生成超时，请重试"
  if (error instanceof StudioApiError && error.message.trim()) return error.message
  if (error instanceof Error && error.message.trim()) return error.message
  return "生成失败，请重试"
}

function stringifyField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    )
    return parts.length > 0 ? parts.join("；") : undefined
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return stringifyField(record.message) ?? stringifyField(record.detail)
  }
  return undefined
}

function parseBackendMessage(body: unknown, status: number) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    const message = stringifyField(record.message)
    const detail = stringifyField(record.detail)
    if (message && detail) {
      if (message.includes(detail) || detail.includes(message)) {
        return message.length >= detail.length ? message : detail
      }
      return `${message}：${detail}`
    }
    if (message || detail) return message ?? detail ?? `请求失败 ${status}`
  }
  return `请求失败 ${status}`
}

type BackendFetchInit = RequestInit & {
  timeoutMs?: number
  skipAuth?: boolean
}

let refreshInFlight: Promise<boolean> | null = null

export async function backendFetch<T>(
  path: string,
  init: BackendFetchInit = {},
): Promise<T> {
  const { timeoutMs = STUDIO_TIMEOUT_MS, signal: external, headers, skipAuth, ...rest } =
    init
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener("abort", onExternalAbort, { once: true })
  }

  try {
    const requestOnce = () => {
      const nextHeaders = new Headers(headers)
      nextHeaders.set("X-Client", "desktop")
      if (!skipAuth && !nextHeaders.has("Authorization")) {
        const access = getAccessToken()
        if (access) {
          nextHeaders.set("Authorization", `Bearer ${access}`)
        }
      }
      return fetch(resolveApiUrl(path), {
        ...rest,
        cache: "no-store",
        headers: nextHeaders,
        signal: controller.signal,
      })
    }

    let response: Response
    try {
      response = await requestOnce()
    } catch (error) {
      if (timedOut || isTimeoutError(error)) {
        throw new StudioApiError("生成超时，请重试")
      }
      if (external?.aborted || isAbortError(error)) {
        throw error instanceof Error ? error : new DOMException("Aborted", "AbortError")
      }
      throw new StudioApiError(error instanceof Error ? error.message : "无法连接后端")
    }

    let body = await readBody(response)
    if (
      !skipAuth &&
      response.status === 401 &&
      responseCode(body) === ACCESS_EXPIRED_CODE
    ) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        try {
          response = await requestOnce()
        } catch (error) {
          if (timedOut || isTimeoutError(error)) {
            throw new StudioApiError("生成超时，请重试")
          }
          if (external?.aborted || isAbortError(error)) {
            throw error instanceof Error ? error : new DOMException("Aborted", "AbortError")
          }
          throw new StudioApiError(error instanceof Error ? error.message : "无法连接后端")
        }
        body = await readBody(response)
      }
    }

    if (!response.ok) {
      if (!skipAuth && response.status === 401) {
        clearTokens()
      }
      throw new StudioApiError(
        parseBackendMessage(body, response.status),
        response.status,
        responseCode(body),
      )
    }

    return body as T
  } finally {
    clearTimeout(timer)
    external?.removeEventListener("abort", onExternalAbort)
  }
}

export async function backendFetchBlob(
  path: string,
  init: BackendFetchInit = {},
): Promise<Blob> {
  const { timeoutMs = STUDIO_TIMEOUT_MS, signal: external, headers, skipAuth, ...rest } =
    init
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener("abort", onExternalAbort, { once: true })
  }

  try {
    const requestOnce = () => {
      const nextHeaders = new Headers(headers)
      nextHeaders.set("X-Client", "desktop")
      if (!skipAuth && !nextHeaders.has("Authorization")) {
        const access = getAccessToken()
        if (access) {
          nextHeaders.set("Authorization", `Bearer ${access}`)
        }
      }
      return fetch(resolveApiUrl(path), {
        ...rest,
        cache: "no-store",
        headers: nextHeaders,
        signal: controller.signal,
      })
    }

    let response = await requestOnce().catch((error) => {
      if (timedOut || isTimeoutError(error)) {
        throw new StudioApiError("生成超时，请重试")
      }
      if (external?.aborted || isAbortError(error)) {
        throw error instanceof Error ? error : new DOMException("Aborted", "AbortError")
      }
      throw new StudioApiError(error instanceof Error ? error.message : "无法连接后端")
    })

    if (!skipAuth && response.status === 401) {
      const peek = await readBody(response.clone())
      if (responseCode(peek) === ACCESS_EXPIRED_CODE) {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          response = await requestOnce().catch((error) => {
            if (timedOut || isTimeoutError(error)) {
              throw new StudioApiError("生成超时，请重试")
            }
            if (external?.aborted || isAbortError(error)) {
              throw error instanceof Error ? error : new DOMException("Aborted", "AbortError")
            }
            throw new StudioApiError(error instanceof Error ? error.message : "无法连接后端")
          })
        }
      }
    }

    if (!response.ok) {
      if (!skipAuth && response.status === 401) {
        clearTokens()
      }
      const body = await readBody(response)
      throw new StudioApiError(
        parseBackendMessage(body, response.status),
        response.status,
        responseCode(body),
      )
    }

    return response.blob()
  } finally {
    clearTimeout(timer)
    external?.removeEventListener("abort", onExternalAbort)
  }
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearTokens()
      return false
    }
    try {
      const response = await fetch(resolveApiUrl("/auth/refresh"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Client": "desktop" },
        body: JSON.stringify({ refreshToken }),
      })
      const body = await readBody(response)
      if (!response.ok) {
        clearTokens()
        return false
      }
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null
      const accessToken =
        typeof record?.accessToken === "string" ? record.accessToken : ""
      const nextRefresh =
        typeof record?.refreshToken === "string" ? record.refreshToken : ""
      if (!accessToken || !nextRefresh) {
        clearTokens()
        return false
      }
      const user = record?.user && typeof record.user === "object" ? record.user as {
        id?: unknown
        username?: unknown
      } : null
      if (typeof user?.id === "string" && typeof user.username === "string") {
        setSession(accessToken, nextRefresh, { id: user.id, username: user.username })
      } else {
        setTokens(accessToken, nextRefresh)
      }
      return true
    } catch {
      clearTokens()
      return false
    }
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function responseCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const code = (body as Record<string, unknown>).code
  return typeof code === "string" && code.trim() ? code : undefined
}
