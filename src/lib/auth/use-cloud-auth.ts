import { useEffect, useState } from "react"
import { StudioApiError } from "@/lib/api/client"
import { fetchCurrentUser } from "@/lib/auth/api"
import {
  getStoredUser,
  hasAuthTokens,
  subscribeAuthStorage,
  type StoredAuthUser,
} from "@/lib/auth/tokens"

export function useCloudAuth() {
  const [user, setUser] = useState<StoredAuthUser | null>(() => getStoredUser())
  const [ready, setReady] = useState(false)

  useEffect(() => subscribeAuthStorage(() => setUser(getStoredUser())), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!hasAuthTokens()) {
        if (!cancelled) setReady(true)
        return
      }
      try {
        const next = await fetchCurrentUser()
        if (!cancelled) setUser(next)
      } catch (error) {
        if (cancelled) return
        if (error instanceof StudioApiError && error.status === 401) {
          setUser(null)
        } else {
          setUser(getStoredUser())
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { user, ready, signedIn: Boolean(user) }
}
