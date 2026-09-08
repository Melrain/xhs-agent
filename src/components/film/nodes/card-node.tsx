import { useRef, useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { FILM_CARD_LABELS, type FilmCardNode as FilmCardNodeType } from "@/lib/film-card"

export function FilmCardNode({ data }: NodeProps<FilmCardNodeType>) {
  const kindLabel = FILM_CARD_LABELS[data.kind] || "卡片"
  return (
    <article
      className={[
        "film-card-node",
        data.kind,
        data.placeholder ? "is-placeholder" : "",
        data.busy ? "is-busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <header>
        <div className="film-card-meta">
          <span className="film-card-kind">{kindLabel}</span>
          {data.statusLabel ? <span className="film-card-status">{data.statusLabel}</span> : null}
        </div>
        <h3>{data.title}</h3>
      </header>
      {data.busy ? (
        <div
          className="film-card-progress"
          role="progressbar"
          aria-label={data.statusLabel || "进行中"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            typeof data.progress === "number" ? Math.round(data.progress * 100) : undefined
          }
        >
          <span style={typeof data.progress === "number" ? { width: `${Math.round(data.progress * 100)}%` } : undefined} />
        </div>
      ) : null}
      {data.body ? <p>{data.body}</p> : null}
      {data.segments && data.segments.length > 0 ? (
        <ol className="film-card-segments nodrag nowheel nopan">
          {data.segments.map((segment) => (
            <li key={segment.id}>
              {segment.title ? <strong>{segment.title}</strong> : null}
              <span>{segment.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {data.ingest ? <FilmIngestForm disabled={Boolean(data.busy)} onUrl={data.onIngestUrl} onFile={data.onIngestFile} /> : null}
      {data.actions && data.actions.length > 0 ? (
        <div className="film-card-actions">
          {data.actions.map((action) => (
            <button
              key={`${action.id}-${action.refId ?? action.stageId ?? ""}`}
              type="button"
              className={`${action.variant === "danger" ? "danger-btn" : action.variant === "ghost" ? "ghost-btn" : "primary-btn"} compact nodrag nopan`}
              disabled={data.busy}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => data.onAction?.(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function FilmIngestForm({
  disabled,
  onUrl,
  onFile,
}: {
  disabled: boolean
  onUrl?: (url: string) => void
  onFile?: (file: File) => void
}) {
  const [url, setUrl] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <form
      className="film-ingest nodrag nopan"
      onPointerDown={(event) => event.stopPropagation()}
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
        className="nodrag nopan nowheel"
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
