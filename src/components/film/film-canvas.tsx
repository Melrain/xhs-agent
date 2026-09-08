import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react"
import type { FilmProject } from "@/lib/api/film"
import { useFilmPipelineActions } from "@/hooks/use-film-pipeline-actions"
import { type FilmGrokPreflight } from "@/lib/film-grok-preflight"
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
import "@xyflow/react/dist/style.css"

const EMPTY_CARDS: never[] = []
const EMPTY_HIDDEN: never[] = []
const EMPTY_EDGES: Edge[] = []

const NODE_TYPES = { filmCard: FilmCardNode }

export function FilmCanvas(props: {
  project?: FilmProject
  canAnalyze?: boolean
  analyzeGateLabel?: string
  refreshPreflight?: () => Promise<FilmGrokPreflight | undefined>
}) {
  return (
    <ReactFlowProvider>
      <FilmCanvasFlow {...props} />
    </ReactFlowProvider>
  )
}

function FilmCanvasFlow({
  project,
  canAnalyze = false,
  analyzeGateLabel = "",
  refreshPreflight,
}: {
  project?: FilmProject
  canAnalyze?: boolean
  analyzeGateLabel?: string
  refreshPreflight?: () => Promise<FilmGrokPreflight | undefined>
}) {
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
  const pipeline = useFilmPipelineActions({
    projectId: project?.id,
    canAnalyze,
    analyzeGateLabel,
    refreshPreflight,
  })

  const id = project?.id
  const attached = Boolean(id && projectId === id)
  const persistedLayout = useMemo(() => (id ? readFilmLayout(id) : {}), [id])
  const activeLayouts = attached ? layouts : persistedLayout
  const activeNotes = attached ? notes : EMPTY_CARDS
  const activeHidden = attached ? hiddenIds : EMPTY_HIDDEN

  const lastProjectId = useRef<string | undefined>(undefined)
  const lastRevealKey = useRef<string | undefined>(undefined)

  const { cards, pipelineIds } = useMemo(() => {
    const built = filmPipelineCards(project, activeLayouts, {
      canAnalyze,
      canGenerate: canAnalyze,
      analyzeGateLabel,
    })
    return {
      cards: visibleFilmCards([...built.cards, ...activeNotes], activeHidden),
      pipelineIds: built.pipelineIds.filter((cardId) => !activeHidden.includes(cardId)),
    }
  }, [activeHidden, activeLayouts, activeNotes, analyzeGateLabel, canAnalyze, project])

  const [nodes, setNodes] = useState<FilmCardFlowNode[]>(() => cardsToNodes(cards))
  const [edges, setEdges] = useState<Edge[]>(() => pipelineEdges(pipelineIds))
  const [menu, setMenu] = useState<FilmPaneMenuState | null>(null)

  useLayoutEffect(() => {
    if (id) attachProject(id)
  }, [attachProject, id])

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
      const busy =
        node.data.busy ||
        (node.data.kind === "reference" && (pipeline.ingestBusy || pipeline.analyzeBusy)) ||
        (node.data.kind === "breakdown" && (pipeline.analyzeBusy || pipeline.reviewBusy))
      if (node.data.kind === "reference" && node.data.ingest) {
        return {
          ...node,
          data: {
            ...node.data,
            busy,
            onIngestUrl: (url: string) => {
              void pipeline.submitUrl(url)
            },
            onIngestFile: (file: File) => {
              void pipeline.submitFile(file)
            },
          },
        }
      }
      if (node.data.actions?.length) {
        return {
          ...node,
          data: {
            ...node.data,
            busy,
            onAction: (action: FilmCardAction) => {
              void pipeline.runAction(action)
            },
          },
        }
      }
      return { ...node, data: { ...node.data, busy } }
    })
    setNodes(nextNodes)
    setEdges(pipelineIds.length > 1 ? pipelineEdges(pipelineIds) : EMPTY_EDGES)
  }, [cards, pipeline.analyzeBusy, pipeline.ingestBusy, pipeline.reviewBusy, pipelineIds])

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
      {pipeline.error ? <p className="film-stage-error">{pipeline.error}</p> : null}
    </div>
  )
}
