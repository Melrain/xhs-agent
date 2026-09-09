import { resolveApiUrl } from "@/lib/api-base"
import { getAccessToken } from "@/lib/auth/tokens"
import { reusePresignedUrl } from "@/lib/media-url"

/** Same Nest object endpoint publish.rs / overlay already use. */
export const STUDIO_FILE_PATH = "/internal/studio/file"

export function studioFileUrl(s3Key: string): string {
  return resolveApiUrl(`${STUDIO_FILE_PATH}?s3Key=${encodeURIComponent(s3Key.trim())}`)
}

export function extractS3Key(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined
  try {
    const parsed = new URL(url, "https://r7ruoxi.com")
    const key = parsed.searchParams.get("s3Key")?.trim()
    return key || undefined
  } catch {
    return undefined
  }
}

export function isNestMediaUrl(url: string): boolean {
  const path = url.split("?")[0] ?? url
  return (
    path.includes("/internal/studio/file") ||
    path.includes("/studio/file") ||
    path.includes("/internal/media/")
  )
}

/** EventSource / <img> cannot set Authorization; Nest accepts ?access_token= after Bearer/Cookie. */
export function withAccessToken(url: string, accessToken?: string | null): string {
  if (!isNestMediaUrl(url)) return url
  const token = (accessToken ?? getAccessToken() ?? "").trim()
  if (!token) return url
  try {
    const parsed = new URL(url, "https://r7ruoxi.com")
    if (parsed.searchParams.get("access_token") === token) return url
    parsed.searchParams.set("access_token", token)
    return parsed.toString()
  } catch {
    const stripped = url.replace(/([?&])access_token=[^&]*/g, "$1").replace(/[?&]$/, "")
    const sep = stripped.includes("?") ? "&" : "?"
    return `${stripped}${sep}access_token=${encodeURIComponent(token)}`
  }
}

/**
 * Prefer the stable authenticated studio file URL when Nest gives s3Key.
 * Reuse the same display URL for the session so <img> does not refetch.
 */
export function resolveDesktopMediaUrl(
  id: string,
  url: string | null,
  s3Key?: string | null,
): string | null {
  const key = s3Key?.trim() || extractS3Key(url)
  let next = url?.trim() || null
  if (key && (!next || !isNestMediaUrl(next))) {
    next = studioFileUrl(key)
  } else if (next?.startsWith("/")) {
    next = resolveApiUrl(next)
  }
  if (!next) return reusePresignedUrl(id, null, key)
  return reusePresignedUrl(id, withAccessToken(next), key)
}
