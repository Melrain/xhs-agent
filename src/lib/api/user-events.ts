import { resolveApiUrl } from "@/lib/api-base"
import { desktopFetch, isTauriRuntime } from "@/lib/api/desktop-fetch"
import { consumeSseBuffer } from "@/lib/sse"

export {
  FILM_UPDATED_EVENT,
  HEARTBEAT_EVENT,
  LOOK_UPDATED_EVENT,
  parseFilmUpdatedEvent,
  parseUserEvent,
  type FilmUpdatedEvent,
  type LookUpdatedEvent,
} from "@/lib/api/user-events-parse"

/** Nest GET /internal/events/stream（桌面 EventSource / Tauri HTTP 走 ?access_token=） */
export const USER_EVENTS_STREAM_PATH = "/internal/events/stream"

/**
 * 桌面原生 EventSource 不能设 Authorization header，也没有 Next cookie proxy。
 * Nest 鉴权顺序：Bearer → Cookie → ?access_token=
 * 空 token 返回 null，调用方不要 open。
 */
export function buildUserEventsStreamUrl(accessToken: string): string | null {
  const token = accessToken.trim()
  if (!token) return null
  return resolveApiUrl(
    `${USER_EVENTS_STREAM_PATH}?access_token=${encodeURIComponent(token)}`,
  )
}

export type UserEventsStreamHandlers = {
  onLookUpdated: (data: string) => void
  onFilmUpdated: (data: string) => void
  onOpen?: () => void
  onError?: () => void
}

/**
 * Packaged WebView EventSource 走 CORS；Tauri HTTP 不吃浏览器跨域。
 * 桌面用 desktopFetch 读 SSE；浏览器 / 未注入 Tauri 时退回 EventSource。
 */
export function openUserEventsStream(
  accessToken: string,
  handlers: UserEventsStreamHandlers,
): { close: () => void } {
  const streamUrl = buildUserEventsStreamUrl(accessToken)
  if (!streamUrl) {
    return { close() {} }
  }

  if (isTauriRuntime()) {
    return openFetchUserEventsStream(streamUrl, accessToken, handlers)
  }

  if (typeof EventSource === "undefined") {
    handlers.onError?.()
    return { close() {} }
  }

  const source = new EventSource(streamUrl)
  source.addEventListener("look.updated", ((message: MessageEvent) => {
    handlers.onLookUpdated(typeof message.data === "string" ? message.data : "")
  }) as EventListener)
  source.addEventListener("film.updated", ((message: MessageEvent) => {
    handlers.onFilmUpdated(typeof message.data === "string" ? message.data : "")
  }) as EventListener)
  source.onopen = () => handlers.onOpen?.()
  source.onerror = () => handlers.onError?.()
  return {
    close() {
      source.close()
    },
  }
}

function openFetchUserEventsStream(
  streamUrl: string,
  accessToken: string,
  handlers: UserEventsStreamHandlers,
): { close: () => void } {
  const controller = new AbortController()
  let closed = false

  void (async () => {
    try {
      const response = await desktopFetch(streamUrl, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${accessToken.trim()}`,
          "X-Client": "desktop",
          "Cache-Control": "no-store",
        },
        signal: controller.signal,
      })
      if (closed) return
      if (!response.ok || !response.body) {
        handlers.onError?.()
        return
      }
      handlers.onOpen?.()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (!closed) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { frames, rest } = consumeSseBuffer(buffer)
        buffer = rest
        for (const frame of frames) {
          if (frame.event === "look.updated") handlers.onLookUpdated(frame.data)
          if (frame.event === "film.updated") handlers.onFilmUpdated(frame.data)
        }
      }
      if (!closed) handlers.onError?.()
    } catch (error) {
      if (closed || (error instanceof Error && error.name === "AbortError")) return
      handlers.onError?.()
    }
  })()

  return {
    close() {
      closed = true
      controller.abort()
    },
  }
}
