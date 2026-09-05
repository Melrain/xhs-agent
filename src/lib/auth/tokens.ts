import { clearFilmClientState } from "@/lib/film-client-state"

const ACCESS_KEY = "xhs.accessToken"
const REFRESH_KEY = "xhs.refreshToken"
const USER_KEY = "xhs.user"
const AUTH_SYNC_KEY = "xhs.auth.sync"

type AuthStorageListener = () => void
const listeners = new Set<AuthStorageListener>()

export function subscribeAuthStorage(listener: AuthStorageListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyAuthListeners() {
  for (const listener of listeners) listener()
}

function emitAuthStorage() {
  notifyAuthListeners()
  try {
    window.localStorage.setItem(AUTH_SYNC_KEY, String(Date.now()))
  } catch {
    // ignore quota / private mode
  }
}

export type StoredAuthUser = {
  id: string
  username: string
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  window.localStorage.setItem(key, value)
}

function deleteStorage(key: string) {
  window.localStorage.removeItem(key)
}

function parseUser(raw: string | null): StoredAuthUser | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthUser>
    if (typeof parsed.id === "string" && typeof parsed.username === "string") {
      return { id: parsed.id, username: parsed.username }
    }
  } catch {
    return null
  }
  return null
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_SYNC_KEY) notifyAuthListeners()
  })
}

export function getAccessToken(): string | null {
  return readStorage(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return readStorage(REFRESH_KEY)
}

export function getStoredUser(): StoredAuthUser | null {
  return parseUser(readStorage(USER_KEY))
}

export function setTokens(accessToken: string, refreshToken: string) {
  writeStorage(ACCESS_KEY, accessToken)
  writeStorage(REFRESH_KEY, refreshToken)
  emitAuthStorage()
}

export function setStoredUser(user: StoredAuthUser) {
  writeStorage(USER_KEY, JSON.stringify(user))
  emitAuthStorage()
}

export function setSession(
  accessToken: string,
  refreshToken: string,
  user: StoredAuthUser,
) {
  writeStorage(ACCESS_KEY, accessToken)
  writeStorage(REFRESH_KEY, refreshToken)
  writeStorage(USER_KEY, JSON.stringify(user))
  emitAuthStorage()
}

export function clearTokens() {
  deleteStorage(ACCESS_KEY)
  deleteStorage(REFRESH_KEY)
  deleteStorage(USER_KEY)
  clearFilmClientState()
  emitAuthStorage()
}

export function hasAuthTokens() {
  return Boolean(getAccessToken() && getRefreshToken())
}
