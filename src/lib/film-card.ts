import type { Node } from "@xyflow/react"

export const FILM_CARD_KINDS = ["brief", "note"] as const

export type FilmCardKind = (typeof FILM_CARD_KINDS)[number]

export type FilmCardPosition = {
  x: number
  y: number
}

export type FilmCard = {
  id: string
  kind: FilmCardKind
  title: string
  body?: string
  locked?: boolean
  position: FilmCardPosition
}

export type FilmCardData = {
  kind: FilmCardKind
  title: string
  body?: string
  locked?: boolean
}

export type FilmCardNode = Node<FilmCardData, "filmCard">

export const DEFAULT_BRIEF_POSITION: FilmCardPosition = { x: -140, y: -200 }

export const FILM_CARD_LABELS: Record<FilmCardKind, string> = {
  brief: "点子",
  note: "卡片",
}

export function createFilmCard(
  kind: FilmCardKind,
  position: FilmCardPosition,
  extras?: {
    id?: string
    title?: string
    body?: string
    locked?: boolean
  },
): FilmCard {
  return {
    id: extras?.id ?? crypto.randomUUID(),
    kind,
    title: extras?.title?.trim() || FILM_CARD_LABELS[kind],
    body: extras?.body?.trim() || undefined,
    locked: extras?.locked,
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
    },
    style: { width: card.kind === "brief" ? 280 : 220 },
  }))
}

export function visibleFilmCards(cards: FilmCard[], hiddenIds: string[]) {
  if (hiddenIds.length === 0) return cards
  const hidden = new Set(hiddenIds)
  return cards.filter((card) => !hidden.has(card.id))
}
