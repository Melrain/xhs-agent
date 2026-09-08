import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react"
import { studioErrorMessage } from "@/lib/api/client"
import type { FilmProject } from "@/lib/api/film"
import { useFilmPipelineMutations } from "@/hooks/use-film-project"
import {
  cardsToNodes,
  pipelineEdges,
  visibleFilmCards,
  type FilmCardAction,
  type FilmCardNode as FilmCardFlowNode,
} from "@/lib/film-card"
import { readFilmLayout } from "@/lib/film-client-state"
import { filmPipelineCards } from "@/lib/film-pipeline"
import { useFilmStore } from "@/lib/film-store"
import { FilmCanvasControls } from "./film-canvas-controls"
import { FilmCardNode } from "./nodes/card-node"
import { FilmPaneMenu, type FilmPaneMenuState } from "./pane-menu"

const EMPTY_CARDS: never[] = []
const EMPTY_HIDDEN: never[] = []
const EMPTY_EDGES: Edge[] = []

const NODE_TYPES = { filmCard: FilmCardNode }

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function FilmCanvas({ project }: { project?: FilmProject }) {
  const { screenToFlowPosition } = useReactFlow()
  const projectId = useFilmStore((state) => state.projectId)
  const notes = useFilmStore((state) => state.notes)
  const layouts = useFilmStore((state) => state.layouts)
  const hiddenIds = useFilmStore((state) => state.hiddenIds)
  const attachProject = useFilmStore((state) => state.attachProject)
  const addCard = useFilmStore((state) => state.addCard)
  const moveCard = useFilmStore((state) => state.moveCard)
  const removeCard = useFilmStore((state) => state.removeCard)
  const revealCard = useFilmStore((state) => state.revealCard)
  const pipeline = useFilmPipelineMutations()

  const id = project?.id
  const attached = Boolean(id && projectId === id)
  const persistedLayout = useMemo(() => (id ? readFilmLayout(id) : {}), [id])
  const activeLayouts = attached ? layouts : persistedLayout
  const activeNotes = attached ? notes : EMPTY_CARDS
  const activeHidden = attached ? hiddenIds : EMPTY_HIDDEN
  const [localError, setLocalError] = useState("")

  const lastProjectId = useRef<string | undefined>(undefined)
  const lastRevealKey = useRef<string | undefined>(undefined)

  const { cards, pipelineIds } = useMemo(() => {
    const built = filmPipelineCards(project, activeLayouts)
    return {
      cards: visibleFilmCards([...built.cards, ...activeNotes], activeHidden),
      pipelineIds: built.pipelineIds.filter((cardId) => !activeHidden.includes(cardId)),
    }
  }, [activeHidden, activeLayouts, activeNotes, project])

  const [nodes, setNodes] = useState<FilmCardFlowNode[]>(() => cardsToNodes(cards))
  const [edges, setEdges] = useState<Edge[]>(() => pipelineEdges(pipelineIds))
  const [menu, setMenu] = useState<FilmPaneMenuState | null>(null)

  const mutationError = pipeline.addReference.error
    ? studioErrorMessage(pipeline.addReference.error)
    : pipeline.analyze.error
      ? studioErrorMessage(pipeline.analyze.error)
      : pipeline.approve.error
        ? studioErrorMessage(pipeline.approve.error)
        : pipeline.reject.error
          ? studioErrorMessage(pipeline.reject.error)
          : ""
  const error = localError || mutationError
  const busy =
    pipeline.addReference.isPending ||
    pipeline.analyze.isPending ||
    pipeline.approve.isPending ||
    pipeline.reject.isPending

  useLayoutEffect(() => {
    if (id) attachProject(id)
  }, [attachProject, id])

  useEffect(() => {
    setLocalError("")
  }, [id])

  useEffect(() => {
    if (!id) {
      lastProjectId.current = undefined
      lastRevealKey.current = undefined
      return
    }
    const revealKey = pipelineIds.join("|")
    if (lastProjectId.current !== id) {
      lastProjectId.current = id
      lastRevealKey.current = revealKey
      return
    }
    if (lastRevealKey.current !== revealKey) {
      lastRevealKey.current = revealKey
      for (const cardId of pipelineIds) revealCard(cardId)
    }
  }, [id, pipelineIds, revealCard])

  useEffect(() => {
    const nextNodes = cardsToNodes(cards).map((node) => {
      if (node.data.kind === "reference" && node.data.ingest) {
        return {
          ...node,
          data: {
            ...node.data,
            busy: node.data.busy || busy,
            onIngestUrl: (url: string) => {
              void submitUrl(url)
            },
            onIngestFile: (file: File) => {
              void submitFile(file)
            },
          },
        }
      }
      if (node.data.actions?.length) {
        return {
          ...node,
          data: {
            ...node.data,
            busy: node.data.busy || busy,
            onAction: (action: FilmCardAction) => {
              void runAction(action)
            },
          },
        }
      }
      return { ...node, data: { ...node.data, busy: node.data.busy || busy } }
    })
    setNodes(nextNodes)
    setEdges(pipelineIds.length > 1 ? pipelineEdges(pipelineIds) : EMPTY_EDGES)
  }, [busy, cards, pipelineIds])

  async function submitUrl(raw: string) {
    if (!id) return
    const url = raw.trim()
    if (!isHttpUrl(url)) {
      setLocalError("请贴有效的视频链接")
      return
    }
    setLocalError("")
    try {
      await pipeline.addReference.mutateAsync({ projectId: id, url })
    } catch {
      // 卡片下方会显示接口错误
    }
  }

  async function submitFile(file: File) {
    if (!id) return
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv)$/i.test(file.name)) {
      setLocalError("请选择视频文件")
      return
    }
    setLocalError("")
    try {
      await pipeline.addReference.mutateAsync({ projectId: id, file })
    } catch {
      // 卡片下方会显示接口错误
    }
  }

  async function runAction(action: FilmCardAction) {
    if (!id) return
    setLocalError("")
    try {
      if (action.id === "analyze" && action.refId) {
        await pipeline.analyze.mutateAsync({ projectId: id, refId: action.refId })
        return
      }
      if (action.id === "approve" && action.stageId) {
        await pipeline.approve.mutateAsync({ projectId: id, stageId: action.stageId })
        return
      }
      if (action.id === "reject" && action.stageId) {
        await pipeline.reject.mutateAsync({ projectId: id, stageId: action.stageId })
      }
    } catch {
      // 卡片下方会显示接口错误
    }
  }

  function onNodesChange(changes: NodeChange<FilmCardFlowNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current))
  }

  return (
    <div className="film-canvas" onContextMenu={(event) => event.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_event, node) => {
          moveCard(node.id, node.position)
        }}
        onPaneClick={() => setMenu(null)}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          setMenu({
            kind: "pane",
            screen: { x: event.clientX, y: event.clientY },
            flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          })
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          if (node.data.kind !== "note") return
          setMenu({
            kind: "card",
            screen: { x: event.clientX, y: event.clientY },
            cardId: node.id,
          })
        }}
        nodeTypes={NODE_TYPES}
        colorMode="light"
        minZoom={0.2}
        maxZoom={2}
        panOnScroll
        nodesConnectable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep", animated: false }}
        onInit={(instance) => {
          instance.setCenter(0, 0, { zoom: 1 })
        }}
      >
        <Background gap={22} size={1} />
        <FilmCanvasControls />
      </ReactFlow>
      <FilmPaneMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onCreate={() => {
          if (menu?.kind === "pane") addCard("note", menu.flow)
          setMenu(null)
        }}
        onRemove={() => {
          if (menu?.kind === "card") removeCard(menu.cardId)
          setMenu(null)
        }}
      />
      {error ? <p className="film-stage-error">{error}</p> : null}
    </div>
  )
}
