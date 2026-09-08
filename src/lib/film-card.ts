import type { Edge, Node } from "@xyflow/react"

export const FILM_CARD_KINDS = [
  "brief",
  "note",
  "reference",
  "breakdown",
  "script",
  "stage",
] as const

export type FilmCardKind = (typeof FILM_CARD_KINDS)[number]

export type FilmCardPosition = {
  x: number
  y: number
}

export type FilmCardActionId = "analyze" | "approve" | "reject" | "run_local"

export type FilmCardAction = {
  id: FilmCardActionId
  label: string
  title?: string
  variant?: "primary" | "ghost" | "danger"
  disabled?: boolean
  refId?: string
  stageId?: string
  stage?: string
}

export type FilmCardFields = {
  kind: FilmCardKind
  title: string
  body?: string
  locked?: boolean
  placeholder?: boolean
  busy?: boolean
  ingest?: boolean
  statusLabel?: string
  badge?: string
  mediaUrl?: string
  actions?: FilmCardAction[]
}

export type FilmCard = FilmCardFields & {
  id: string
  position: FilmCardPosition
  width?: number
}

export type FilmCardData = FilmCardFields & {
  onIngestUrl?: (url: string) => void
  onIngestFile?: (file: File) => void
  onAction?: (action: FilmCardAction) => void
}

export type FilmCardNode = Node<FilmCardData, "filmCard">

export const DEFAULT_BRIEF_POSITION: FilmCardPosition = { x: -140, y: -280 }

export const FILM_CARD_LABELS: Record<FilmCardKind, string> = {
  brief: "点子",
  note: "卡片",
  reference: "参考片",
  breakdown: "拆解",
  script: "剧本",
  stage: "本机执行",
}

export const FILM_CARD_WIDTH: Record<FilmCardKind, number> = {
  brief: 280,
  note: 220,
  reference: 320,
  breakdown: 340,
  script: 240,
  stage: 200,
}

export function createFilmCard(
  kind: FilmCardKind,
  position: FilmCardPosition,
  extras?: Partial<Omit<FilmCard, "kind" | "position">>,
): FilmCard {
  return {
    id: extras?.id ?? crypto.randomUUID(),
    kind,
    title: extras?.title?.trim() || FILM_CARD_LABELS[kind],
    body: extras?.body?.trim() || undefined,
    locked: extras?.locked,
    placeholder: extras?.placeholder,
    busy: extras?.busy,
    ingest: extras?.ingest,
    statusLabel: extras?.statusLabel,
    badge: extras?.badge,
    mediaUrl: extras?.mediaUrl,
    actions: extras?.actions,
    width: extras?.width,
    position: { x: position.x, y: position.y },
  }
}

export function cardsToNodes(cards: FilmCard[]): FilmCardNode[] {
  return cards.map((card) => ({
    id: card.id,
    type: "filmCard",
    position: { x: card.position.x, y: card.position.y },
    data: {
      kind: card.kind,
      title: card.title,
      body: card.body,
      locked: card.locked,
      placeholder: card.placeholder,
      busy: card.busy,
      ingest: card.ingest,
      statusLabel: card.statusLabel,
      badge: card.badge,
      mediaUrl: card.mediaUrl,
      actions: card.actions,
    },
    style: { width: card.width ?? FILM_CARD_WIDTH[card.kind] },
  }))
}

export function visibleFilmCards(cards: FilmCard[], hiddenIds: string[]) {
  if (hiddenIds.length === 0) return cards
  const hidden = new Set(hiddenIds)
  return cards.filter((card) => !hidden.has(card.id))
}

export function pipelineEdges(cardIds: string[]): Edge[] {
  const edges: Edge[] = []
  for (let index = 0; index < cardIds.length - 1; index += 1) {
    const source = cardIds[index]
    const target = cardIds[index + 1]
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: "smoothstep",
      selectable: false,
      focusable: false,
    })
  }
  return edges
}
