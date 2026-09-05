import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  useReactFlow,
  type NodeChange,
} from "@xyflow/react"
import type { FilmProject } from "@/lib/api/film"
import {
  cardsToNodes,
  createFilmCard,
  DEFAULT_BRIEF_POSITION,
  visibleFilmCards,
  type FilmCardNode as FilmCardFlowNode,
} from "@/lib/film-card"
import { readFilmLayout } from "@/lib/film-client-state"
import { useFilmStore } from "@/lib/film-store"
import { FilmCanvasControls } from "./film-canvas-controls"
import { FilmCardNode } from "./nodes/card-node"
import { FilmPaneMenu, type FilmPaneMenuState } from "./pane-menu"

const EMPTY_CARDS: never[] = []
const EMPTY_HIDDEN: never[] = []

const NODE_TYPES = { filmCard: FilmCardNode }

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

  const id = project?.id
  const attached = Boolean(id && projectId === id)
  const persistedLayout = useMemo(() => (id ? readFilmLayout(id) : {}), [id])
  const activeLayouts = attached ? layouts : persistedLayout
  const activeNotes = attached ? notes : EMPTY_CARDS
  const activeHidden = attached ? hiddenIds : EMPTY_HIDDEN

  const lastProjectId = useRef<string | undefined>(undefined)
  const lastBrief = useRef<string | undefined>(undefined)

  const cards = useMemo(() => {
    const brief = project?.brief.trim()
    const briefCard = brief
      ? [
          createFilmCard("brief", activeLayouts.brief ?? DEFAULT_BRIEF_POSITION, {
            id: "brief",
            title: "点子",
            body: brief,
            locked: true,
          }),
        ]
      : []
    return visibleFilmCards([...briefCard, ...activeNotes], activeHidden)
  }, [activeHidden, activeLayouts.brief, activeNotes, project?.brief, project?.id])

  const [nodes, setNodes] = useState<FilmCardFlowNode[]>(() => cardsToNodes(cards))
  const [menu, setMenu] = useState<FilmPaneMenuState | null>(null)

  useLayoutEffect(() => {
    if (id) attachProject(id)
  }, [attachProject, id])

  useEffect(() => {
    if (!id) {
      lastProjectId.current = undefined
      lastBrief.current = undefined
      return
    }
    if (lastProjectId.current !== id) {
      lastProjectId.current = id
      lastBrief.current = project?.brief
      return
    }
    if (lastBrief.current !== project?.brief) {
      lastBrief.current = project?.brief
      revealCard("brief")
    }
  }, [id, project?.brief, revealCard])

  useEffect(() => {
    setNodes(cardsToNodes(cards))
  }, [cards])

  function onNodesChange(changes: NodeChange<FilmCardFlowNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current))
  }

  return (
    <div className="film-canvas" onContextMenu={(event) => event.preventDefault()}>
      <ReactFlow
        nodes={nodes}
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
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
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
    </div>
  )
}
