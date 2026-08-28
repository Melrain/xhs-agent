const URL_TTL_MS = 40 * 60 * 1000

type CachedUrl = { url: string; path: string; at: number }

const urlCache = new Map<string, CachedUrl>()

/** 预签名 URL 每次轮询都会换 query，路径没变就沿用旧地址，避免 <img> 闪一下。 */
export function reusePresignedUrl(id: string, next: string | null): string | null {
  if (!next) {
    urlCache.delete(id)
    return next
  }

  const path = mediaPath(next)
  const cached = urlCache.get(id)
  const now = Date.now()
  if (cached && cached.path === path && now - cached.at < URL_TTL_MS) {
    return cached.url
  }

  urlCache.set(id, { url: next, path, at: now })
  return next
}

export function mediaPath(url: string) {
  const query = url.indexOf("?")
  return query === -1 ? url : url.slice(0, query)
}

export function resetPresignedUrlCache() {
  urlCache.clear()
}
