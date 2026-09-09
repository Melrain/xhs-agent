"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import {
  CHARACTERS_QUERY_KEY,
  LOOKS_QUERY_KEY,
  characterQueryKey,
} from "@/lib/api/characters"
import { FILM_QUERY_KEY } from "@/lib/api/film"
import {
  buildUserEventsStreamUrl,
  openUserEventsStream,
  parseFilmUpdatedEvent,
  parseUserEvent,
  type FilmUpdatedEvent,
  type LookUpdatedEvent,
} from "@/lib/api/user-events"
import { getAccessToken, subscribeAuthStorage } from "@/lib/auth/tokens"

/** 手动重开前的轻退避上限；浏览器自己也会自动重连，这里只在 close 后补一刀。 */
const REOPEN_BACKOFF_MS = [1_000, 2_000, 5_000] as const

type Options = {
  /** 有 pending look / VPS analyzing film 才订流；闲着别占连接。 */
  enabled: boolean
  onLookUpdated?: (event: LookUpdatedEvent) => void
  onFilmUpdated?: (event: FilmUpdatedEvent) => void
}

/**
 * 用户事件推送：look.updated / film.updated → invalidate 对应 query。
 * heartbeat（约 20s 有名事件）故意不听；断线只标状态，不关 poll。
 * poll 仍是 fallback；SSE 只是加速。
 *
 * 桌面：不能靠 EventSource 设 header → URL 带 ?access_token=；Tauri 用 HTTP 插件读流。
 * token 变化时重开。
 */
export function useUserEvents({
  enabled,
  onLookUpdated,
  onFilmUpdated,
}: Options) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const [accessToken, setAccessToken] = useState(() => getAccessToken() ?? "")
  const onLookUpdatedRef = useRef(onLookUpdated)
  onLookUpdatedRef.current = onLookUpdated
  const onFilmUpdatedRef = useRef(onFilmUpdated)
  onFilmUpdatedRef.current = onFilmUpdated

  useEffect(() => {
    return subscribeAuthStorage(() => {
      setAccessToken(getAccessToken() ?? "")
    })
  }, [])

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      return
    }

    const streamUrl = buildUserEventsStreamUrl(accessToken)
    if (!streamUrl) {
      setConnected(false)
      return
    }

    let closed = false
    let session: { close: () => void } | null = null
    let reopenTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0

    const tearDown = () => {
      if (reopenTimer !== undefined) {
        clearTimeout(reopenTimer)
        reopenTimer = undefined
      }
      if (session) {
        session.close()
        session = null
      }
    }

    const handleLookUpdated = (raw: string) => {
      const event = parseUserEvent(raw)
      if (!event) return

      void queryClient.invalidateQueries({
        queryKey: CHARACTERS_QUERY_KEY,
        refetchType: "active",
      })
      void queryClient.invalidateQueries({
        queryKey: LOOKS_QUERY_KEY,
        refetchType: "active",
      })
      void queryClient.invalidateQueries({
        queryKey: characterQueryKey(event.characterId),
        refetchType: "active",
      })
      onLookUpdatedRef.current?.(event)
    }

    const handleFilmUpdated = (raw: string) => {
      const event = parseFilmUpdatedEvent(raw)
      if (!event) return

      // filmProjectsQueryKey / filmCurrentQueryKey 按 user 分片；根 invalidate 即可
      void queryClient.invalidateQueries({ queryKey: FILM_QUERY_KEY })
      onFilmUpdatedRef.current?.(event)
    }

    const open = () => {
      if (closed) return
      tearDown()

      session = openUserEventsStream(accessToken, {
        onLookUpdated: handleLookUpdated,
        onFilmUpdated: handleFilmUpdated,
        onOpen: () => {
          if (closed) return
          attempt = 0
          setConnected(true)
        },
        onError: () => {
          if (closed) return
          setConnected(false)
          session?.close()
          session = null
          const delay =
            REOPEN_BACKOFF_MS[Math.min(attempt, REOPEN_BACKOFF_MS.length - 1)]
          attempt += 1
          reopenTimer = setTimeout(open, delay)
        },
      })
    }

    open()

    return () => {
      closed = true
      setConnected(false)
      tearDown()
    }
  }, [accessToken, enabled, queryClient])

  return { connected }
}
