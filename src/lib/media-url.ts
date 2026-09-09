const URL_TTL_MS = 40 * 60 * 1000

type CachedUrl = { url: string; path: string; at: number }

const urlCache = new Map<string, CachedUrl>()

export function mediaPath(url: string) {
  const query = url.indexOf("?")
  return query === -1 ? url : url.slice(0, query)
}

/**
 * Identity for reuse: prefer s3Key, then Nest `s3Key` query, then origin+path.
 * Do not strip `?s3Key=` — `/internal/studio/file` would collapse every object.
 */
export function mediaObjectId(url: string, s3Key?: string | null): string {
  const key = s3Key?.trim()
  if (key) return `s3:${key}`
  try {
    const parsed = new URL(url, "https://r7ruoxi.com")
    const fromQuery = parsed.searchParams.get("s3Key")?.trim()
    if (fromQuery) return `s3:${fromQuery}`
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return mediaPath(url)
  }
}

/** 预签名 URL 每次轮询都会换 query；路径或 s3Key 没变就沿用旧地址，避免 <img> 闪一下。 */
export function reusePresignedUrl(
  id: string,
  next: string | null,
  s3Key?: string | null,
): string | null {
  if (!next) {
    urlCache.delete(id)
    return next
  }

  const path = mediaObjectId(next, s3Key)
  const cached = urlCache.get(id)
  const now = Date.now()
  if (cached && cached.path === path && now - cached.at < URL_TTL_MS) {
    return cached.url
  }

  urlCache.set(id, { url: next, path, at: now })
  return next
}

export function resetPresignedUrlCache() {
  urlCache.clear()
}
