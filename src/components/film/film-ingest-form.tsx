import { useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import { Upload } from "lucide-react"
import { FILM_VIDEO_ACCEPT, FILM_VIDEO_FORMAT_LABEL } from "@/lib/film-package"

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
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragClass = dragSafe ? " nodrag nopan" : ""

  function pickFile(file: File | undefined) {
    if (file) onFile?.(file)
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (disabled) return
    setDragging(true)
  }

  function onDragLeave() {
    setDragging(false)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    pickFile(event.dataTransfer.files?.[0])
  }

  function openPicker() {
    if (disabled) return
    fileRef.current?.click()
  }

  function onDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openPicker()
    }
  }

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
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="点击或拖拽上传参考视频"
        className={`film-ingest-dropzone${dragging ? " is-dragging" : ""}${disabled ? " is-busy" : ""}`}
        onClick={openPicker}
        onKeyDown={onDropzoneKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <Upload
          className={`film-ingest-dropzone-icon${dragging ? " is-dragging" : ""}`}
          aria-hidden
        />
        <p className="film-ingest-dropzone-primary">
          {disabled ? "上传中…" : "点击或拖拽上传"}
        </p>
        <p className="film-ingest-hint">
          {`${FILM_VIDEO_FORMAT_LABEL} · ≤50MB`}
        </p>
      </div>
      <details className="film-ingest-advanced">
        <summary>高级：用链接导入</summary>
        <div className="film-ingest-url-secondary">
          <input
            type="text"
            inputMode="url"
            value={url}
            disabled={disabled}
            placeholder="https://"
            aria-label="参考片链接（高级）"
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
      </details>
      <input
        ref={fileRef}
        type="file"
        accept={FILM_VIDEO_ACCEPT}
        hidden
        aria-label="上传参考视频"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          pickFile(file)
        }}
      />
    </form>
  )
}
