import { backendFetch, StudioApiError } from "@/lib/api/client"
import {
  clearTokens,
  getRefreshToken,
  setSession,
  setStoredUser,
} from "@/lib/auth/tokens"

export type AuthUser = {
  id: string
  username: string
}

export type AuthTokenPair = {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export function parseAuthTokenPair(body: unknown): AuthTokenPair | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const accessToken =
    typeof record.accessToken === "string" ? record.accessToken.trim() : ""
  const refreshToken =
    typeof record.refreshToken === "string" ? record.refreshToken.trim() : ""
  const userRaw = record.user
  if (!userRaw || typeof userRaw !== "object") return null
  const user = userRaw as Record<string, unknown>
  const id = typeof user.id === "string" ? user.id : ""
  const username = typeof user.username === "string" ? user.username : ""
  if (!accessToken || !refreshToken || !id || !username) return null
  return { accessToken, refreshToken, user: { id, username } }
}

export async function registerAccount(username: string, password: string) {
  const pair = requireAuthTokenPair(
    await backendFetch<unknown>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      skipAuth: true,
      timeoutMs: 15_000,
    }),
  )
  persistSession(pair)
  return pair.user
}

export async function loginAccount(username: string, password: string) {
  const pair = requireAuthTokenPair(
    await backendFetch<unknown>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      skipAuth: true,
      timeoutMs: 15_000,
    }),
  )
  persistSession(pair)
  return pair.user
}

export async function fetchCurrentUser() {
  try {
    const user = await backendFetch<AuthUser>("/auth/me", {
      timeoutMs: 10_000,
    })
    if (!user?.id || !user.username) {
      throw new Error("无法读取登录用户")
    }
    setStoredUser(user)
    return user
  } catch (error) {
    if (error instanceof StudioApiError && error.status === 401) {
      clearTokens()
    }
    throw error
  }
}

export async function logoutAccount() {
  const refreshToken = getRefreshToken()
  try {
    if (refreshToken) {
      await backendFetch<{ ok: true }>("/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        timeoutMs: 10_000,
      })
    }
  } finally {
    clearTokens()
  }
}

function requireAuthTokenPair(body: unknown): AuthTokenPair {
  const pair = parseAuthTokenPair(body)
  if (!pair) {
    throw new StudioApiError("登录响应无效")
  }
  return pair
}

function persistSession(pair: AuthTokenPair) {
  setSession(pair.accessToken, pair.refreshToken, pair.user)
}
