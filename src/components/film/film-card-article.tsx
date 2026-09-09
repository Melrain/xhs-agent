import { FILM_CARD_LABELS, type FilmCardData } from "@/lib/film-card"
import { FilmIngestForm } from "./film-ingest-form"

function isLikelyImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|avif)(\?|#|$)/i.test(url) || /\/frames?\//i.test(url)
}

function BreakdownBody({ body }: { body: string }) {
  const lines = body.split("\n").map((line) => line.trimEnd())
  const visual = lines.find((line) => line.startsWith("画面："))
  const dialogue = lines.find((line) => line.startsWith("对白："))
  const rest = lines.filter((line) => !line.startsWith("画面：") && !line.startsWith("对白："))

  if (!visual && !dialogue) {
    return <p>{body}</p>
  }

  return (
    <div className="film-breakdown-body">
      {visual ? (
        <p className="film-breakdown-visual">
          <span className="film-breakdown-label">画面</span>
          <span>{visual.replace(/^画面：/, "") || "（无）"}</span>
        </p>
      ) : null}
      {dialogue ? (
        <p className="film-breakdown-dialogue">
          <span className="film-breakdown-label">对白</span>
          <span>{dialogue.replace(/^对白：/, "") || "（无）"}</span>
        </p>
      ) : null}
      {rest.length > 0 ? <p className="film-breakdown-rest">{rest.join("\n")}</p> : null}
    </div>
  )
}

export function FilmCardArticle({
  data,
  dragSafe = false,
}: {
  data: FilmCardData
  dragSafe?: boolean
}) {
  const kindLabel = FILM_CARD_LABELS[data.kind] || "卡片"
  const dragClass = dragSafe ? " nodrag nopan" : ""
  const showAsFrame =
    Boolean(data.mediaUrl) &&
    (data.kind === "breakdown" || isLikelyImageUrl(data.mediaUrl ?? ""))

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
        showAsFrame ? (
          <img
            className={`film-card-media film-card-frame${dragSafe ? " nodrag nopan nowheel" : ""}`}
            src={data.mediaUrl}
            alt=""
            onPointerDown={dragSafe ? (event) => event.stopPropagation() : undefined}
          />
        ) : (
          <video
            className={`film-card-media${dragSafe ? " nodrag nopan nowheel" : ""}`}
            src={data.mediaUrl}
            controls
            muted
            playsInline
            onPointerDown={dragSafe ? (event) => event.stopPropagation() : undefined}
          />
        )
      ) : null}
      {data.body ? (
        data.kind === "breakdown" ? <BreakdownBody body={data.body} /> : <p>{data.body}</p>
      ) : null}
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
