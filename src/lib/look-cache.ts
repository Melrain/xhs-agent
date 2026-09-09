/** Merge optimistic pending looks/cards so a stale list refetch cannot wipe them. */

export type LookLike = {
  id: string
  characterId: string
  status: string
}

export type LookListLike<T extends LookLike = LookLike> = {
  looks: T[]
  total: number
}

export type CharacterLike = {
  id: string
  lookCount: number
  pendingCount: number
}

export function isLookCardLike(value: unknown): value is LookLike {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.characterId === "string" &&
    row.characterId.length > 0
  )
}

/** POST /looks 可能是数组、单卡，或 { looks } / { look } 包一层。 */
export function asLookCards<T extends LookLike>(created: unknown): T[] {
  if (!created) return []
  if (Array.isArray(created)) return created.filter(isLookCardLike) as T[]
  if (typeof created !== "object") return []
  const row = created as Record<string, unknown>
  if (Array.isArray(row.looks)) return row.looks.filter(isLookCardLike) as T[]
  if (isLookCardLike(row.look)) return [row.look as T]
  if (isLookCardLike(row)) return [row as T]
  return []
}

/**
 * Keep optimistic pending rows that the incoming list has not caught up with.
 * Known ids always take the server row (ready/failed/pending).
 */
export function mergeLookList<T extends LookLike>(
  previous: LookListLike<T> | undefined,
  incoming: LookListLike<T>,
): LookListLike<T> {
  if (!previous?.looks.length) return incoming
  const incomingIds = new Set(incoming.looks.map((look) => look.id))
  const orphans = previous.looks.filter(
    (look) => look.status === "pending" && !incomingIds.has(look.id),
  )
  if (orphans.length === 0) return incoming
  return {
    looks: [...orphans, ...incoming.looks],
    total: incoming.total + orphans.length,
  }
}

export function pendingCharacterIdsFromLooks<T extends LookLike>(
  lists: Array<LookListLike<T> | undefined>,
): Set<string> {
  const ids = new Set<string>()
  for (const list of lists) {
    for (const look of list?.looks ?? []) {
      if (look.status === "pending") ids.add(look.characterId)
    }
  }
  return ids
}

/**
 * If looks cache still has pending for a character, do not let a stale card wall
 * drop pendingCount (that would unlock CTA / close SSE).
 */
export function mergeCharacterCards<T extends CharacterLike>(
  previous: T[] | undefined,
  incoming: T[],
  pendingCharacterIds: Set<string>,
): T[] {
  if (!previous?.length || pendingCharacterIds.size === 0) return incoming
  return incoming.map((card) => {
    if (!pendingCharacterIds.has(card.id)) return card
    const prev = previous.find((row) => row.id === card.id)
    if (!prev || prev.pendingCount <= card.pendingCount) return card
    return {
      ...card,
      pendingCount: prev.pendingCount,
      lookCount: Math.max(card.lookCount, prev.lookCount),
    }
  })
}
