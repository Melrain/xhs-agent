export function getApiBase() {
  const raw = import.meta.env.VITE_API_BASE?.trim()
  if (raw) return raw.replace(/\/$/, "")
  return import.meta.env.DEV
    ? "http://localhost:8080"
    : "https://r7ruoxi.com/api/backend"
}

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path
  let suffix = path
  if (suffix.startsWith("/api/backend")) {
    suffix = suffix.slice("/api/backend".length) || "/"
  }
  if (!suffix.startsWith("/")) suffix = `/${suffix}`
  return `${getApiBase()}${suffix}`
}
