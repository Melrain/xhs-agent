import { FILM_CARD_LABELS, type FilmCardData } from "@/lib/film-card"
import { FilmIngestForm } from "./film-ingest-form"

export function FilmCardArticle({
  data,
  dragSafe = false,
}: {
  data: FilmCardData
  dragSafe?: boolean
}) {
  const kindLabel = FILM_CARD_LABELS[data.kind] || "卡片"
  const dragClass = dragSafe ? " nodrag nopan" : ""

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
      <header>
        <div className="film-card-meta">
          <span className="film-card-kind">{kindLabel}</span>
          {data.badge ? <span className="film-card-status">{data.badge}</span> : null}
          {data.statusLabel ? <span className="film-card-status">{data.statusLabel}</span> : null}
        </div>
        <h3>{data.title}</h3>
      </header>
      {data.busy ? (
        <div className="film-card-progress" role="progressbar" aria-label={data.statusLabel || "进行中"}>
          <span />
        </div>
      ) : null}
      {data.mediaUrl ? (
        <video
          className={`film-card-media${dragSafe ? " nodrag nopan nowheel" : ""}`}
          src={data.mediaUrl}
          controls
          muted
          playsInline
          onPointerDown={dragSafe ? (event) => event.stopPropagation() : undefined}
        />
      ) : null}
      {data.body ? <p>{data.body}</p> : null}
      {data.ingest ? (
        <FilmIngestForm
          disabled={Boolean(data.busy)}
          dragSafe={dragSafe}
          onUrl={data.onIngestUrl}
          onFile={data.onIngestFile}
        />
      ) : null}
      {data.actions && data.actions.length > 0 ? (
        <div className="film-card-actions">
          {data.actions.map((action) => (
            <button
              key={`${action.id}-${action.refId ?? action.stageId ?? ""}`}
              type="button"
              className={`${action.variant === "danger" ? "danger-btn" : action.variant === "ghost" ? "ghost-btn" : "primary-btn"} compact${dragClass}`}
              disabled={data.busy || action.disabled}
              title={action.title ?? (action.disabled ? action.label : undefined)}
              onPointerDown={dragSafe ? (event) => event.stopPropagation() : undefined}
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
