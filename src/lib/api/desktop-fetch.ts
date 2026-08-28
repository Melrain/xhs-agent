export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/** 桌面 WebView 的 fetch 会走 CORS；打包后 Origin 是 tauri.localhost，线上预检会失败。Tauri HTTP 不吃浏览器跨域。 */
export async function desktopFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isTauriRuntime()) {
    return fetch(input, init)
  }
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http")
  const { cache: _cache, ...safe } = init ?? {}
  return tauriFetch(input, safe)
}
