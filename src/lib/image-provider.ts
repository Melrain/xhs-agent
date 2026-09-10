/**
 * 图片生成通路（provider），与执行端 r7.executorSource 无关。
 * Nest 妆造台路由期望请求体字段：`provider: 'grok_cli' | 'apikey'`。
 */

export const IMAGE_PROVIDERS = ["grok_cli", "apikey"] as const

export type ImageProvider = (typeof IMAGE_PROVIDERS)[number]

export const IMAGE_PROVIDER_DEFAULT: ImageProvider = "grok_cli"

export const IMAGE_PROVIDER_LABEL: Record<ImageProvider, string> = {
  grok_cli: "Imagine CLI",
  apikey: "API Key",
}

/** 全局 storage key（仅前端偏好；Nest 由妆造台路由读请求体 provider）。 */
export const IMAGE_PROVIDER_STORAGE_KEY = "r7.imageProvider"

export function isImageProvider(value: unknown): value is ImageProvider {
  return (
    typeof value === "string" &&
    (IMAGE_PROVIDERS as readonly string[]).includes(value)
  )
}

export function imageProviderLabel(provider: ImageProvider) {
  return IMAGE_PROVIDER_LABEL[provider]
}

export function readStoredImageProvider(): ImageProvider | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(IMAGE_PROVIDER_STORAGE_KEY)
    if (isImageProvider(raw)) return raw
    return undefined
  } catch {
    return undefined
  }
}

const IMAGE_PROVIDER_CHANGE_EVENT = "r7:imageProvider"

export function writeStoredImageProvider(provider: ImageProvider) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(IMAGE_PROVIDER_STORAGE_KEY, provider)
  } catch {
    // ignore quota / private mode
  }
  notifyImageProviderPreferenceChanged()
}

export function notifyImageProviderPreferenceChanged() {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new Event(IMAGE_PROVIDER_CHANGE_EVENT))
  } catch {
    // ignore
  }
}

/** Same-tab custom event + cross-tab storage event. */
export function subscribeImageProviderPreference(listener: () => void) {
  if (typeof window === "undefined") return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === IMAGE_PROVIDER_STORAGE_KEY || event.key === null) {
      listener()
    }
  }
  window.addEventListener(IMAGE_PROVIDER_CHANGE_EVENT, listener)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(IMAGE_PROVIDER_CHANGE_EVENT, listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** 本机偏好 > 默认 grok_cli。 */
export function resolveImageProvider(
  override?: ImageProvider | null,
): ImageProvider {
  if (isImageProvider(override)) return override
  return readStoredImageProvider() ?? IMAGE_PROVIDER_DEFAULT
}

/**
 * 拼进 fetch body：Nest 妆造台路由读 `provider: 'grok_cli' | 'apikey'`。
 */
export function imageProviderRequestField(
  provider?: ImageProvider | null,
): { provider: ImageProvider } {
  return { provider: resolveImageProvider(provider) }
}
