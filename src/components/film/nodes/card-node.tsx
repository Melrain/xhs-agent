import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { FilmCardNode as FilmCardNodeType } from "@/lib/film-card"
import { FilmCardArticle } from "../film-card-article"

export function FilmCardNode({ data }: NodeProps<FilmCardNodeType>) {
  return (
    <div className="film-card-flow">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <FilmCardArticle data={data} dragSafe />
    </div>
  )
}
