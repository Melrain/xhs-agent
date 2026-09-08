import { useRef, useState } from "react"

export function FilmIngestForm({
  disabled,
  dragSafe = false,
  onUrl,
  onFile,
}: {
  disabled: boolean
  dragSafe?: boolean
  onUrl?: (url: string) => void
  onFile?: (file: File) => void
}) {
  const [url, setUrl] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const dragClass = dragSafe ? " nodrag nopan" : ""

  return (
    <form
      className={`film-ingest${dragClass}`}
      onPointerDown={dragSafe ? (event) => event.stopPropagation() : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        const next = url.trim()
        if (!next || disabled) return
        onUrl?.(next)
      }}
    >
      <input
        type="text"
        inputMode="url"
        value={url}
        disabled={disabled}
        placeholder="粘贴参考片链接"
        aria-label="参考片链接"
        className={dragSafe ? "nodrag nopan nowheel" : undefined}
        onChange={(event) => setUrl(event.target.value)}
      />
      <div className="film-ingest-actions">
        <button type="submit" className="primary-btn compact" disabled={disabled || !url.trim()}>
          导入链接
        </button>
        <button
          type="button"
          className="ghost-btn compact"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          上传视频
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onFile?.(file)
        }}
      />
    </form>
  )
}
