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
      <div className="film-ingest-actions">
        <button
          type="button"
          className="primary-btn compact"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          上传视频
        </button>
      </div>
      <p className="film-ingest-hint">优先上传本地视频文件</p>
      <div className="film-ingest-url-secondary">
        <input
          type="text"
          inputMode="url"
          value={url}
          disabled={disabled}
          placeholder="或粘贴参考片链接（次要）"
          aria-label="参考片链接（次要）"
          className={dragSafe ? "nodrag nopan nowheel" : undefined}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button
          type="submit"
          className="ghost-btn compact"
          disabled={disabled || !url.trim()}
        >
          导入链接
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
