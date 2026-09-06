import { LocateFixed, Maximize2, ZoomIn, ZoomOut } from "lucide-react"
import { MiniMap, Panel, useReactFlow } from "@xyflow/react"

export function FilmCanvasControls() {
  const { zoomIn, zoomOut, fitView, setCenter } = useReactFlow()

  return (
    <>
      <Panel position="bottom-left" className="film-zoom-controls" role="toolbar" aria-label="缩放">
        <button type="button" title="放大" aria-label="放大" onClick={() => void zoomIn()}>
          <ZoomIn size={14} />
        </button>
        <button type="button" title="缩小" aria-label="缩小" onClick={() => void zoomOut()}>
          <ZoomOut size={14} />
        </button>
        <button type="button" title="适配全屏" aria-label="适配全屏" onClick={() => void fitView({ padding: 0.2 })}>
          <Maximize2 size={14} />
        </button>
        <button
          type="button"
          title="回到中心"
          aria-label="回到中心"
          onClick={() => void setCenter(0, 0, { zoom: 1 })}
        >
          <LocateFixed size={14} />
        </button>
      </Panel>
      <MiniMap pannable zoomable position="bottom-right" />
    </>
  )
}
