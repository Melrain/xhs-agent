import type { NodeProps } from "@xyflow/react"
import { FILM_CARD_LABELS, type FilmCardNode as FilmCardNodeType } from "@/lib/film-card"

export function FilmCardNode({ data }: NodeProps<FilmCardNodeType>) {
  return (
    <article className={`film-card-node ${data.kind === "brief" ? "brief" : ""}`}>
      <header>
        <span className="film-card-kind">{FILM_CARD_LABELS[data.kind]}</span>
        <h3>{data.title}</h3>
      </header>
      {data.body ? <p>{data.body}</p> : null}
    </article>
  )
}
