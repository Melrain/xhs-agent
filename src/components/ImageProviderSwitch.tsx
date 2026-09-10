import { useEffect, useState } from "react"
import {
  IMAGE_PROVIDERS,
  imageProviderLabel,
  resolveImageProvider,
  subscribeImageProviderPreference,
  writeStoredImageProvider,
  type ImageProvider,
} from "@/lib/image-provider"

const HINT = "出图通路：Imagine CLI（VPS）或 API Key"

/**
 * Global image provider switch (Imagine CLI / API Key).
 * Reads/writes `r7.imageProvider` only — does not touch executorSource.
 */
export function ImageProviderSwitch({
  className,
  value,
  onChange,
  showTip = false,
}: {
  className?: string
  /** Controlled value; omit to read storage / default grok_cli. */
  value?: ImageProvider
  onChange?: (next: ImageProvider) => void
  showTip?: boolean
}) {
  const controlled = value !== undefined
  const [active, setActive] = useState<ImageProvider>(() =>
    resolveImageProvider(value),
  )

  useEffect(() => {
    if (controlled) {
      setActive(resolveImageProvider(value))
      return
    }
    const sync = () => setActive(resolveImageProvider())
    sync()
    return subscribeImageProviderPreference(sync)
  }, [controlled, value])

  function pick(next: ImageProvider) {
    if (next === active) return
    setActive(next)
    writeStoredImageProvider(next)
    onChange?.(next)
  }

  return (
    <p
      className={["image-provider-switch", className].filter(Boolean).join(" ")}
      aria-label="出图通路"
      title={HINT}
    >
      {IMAGE_PROVIDERS.map((id) => (
        <button
          key={id}
          type="button"
          className={`image-provider-chip${active === id ? " is-active" : ""}`}
          aria-pressed={active === id}
          title={imageProviderLabel(id)}
          onClick={() => pick(id)}
        >
          {imageProviderLabel(id)}
        </button>
      ))}
      {showTip ? <span className="image-provider-tip">{HINT}</span> : null}
    </p>
  )
}
