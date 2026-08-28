import { lookCaption } from "@/lib/makeup-looks"
import {
  findVanityRef,
  getVanityRef,
  type VanityKind,
  type VanityRef,
} from "@/lib/vanity-refs"
import type { VanityLookDraft } from "@/lib/vanity-prompt"

export function vanityLookCaption(
  look: {
    dimension: string
    chipId?: string
    chipTitle: string
  },
  userRefs: VanityRef[] = [],
) {
  if (look.dimension === "vanity") {
    if (look.chipId) {
      const parsed = parseVanityChipId(look.chipId, userRefs)
      if (parsed.missing.length === 0) {
        const titles = [parsed.makeup?.title, parsed.outfit?.title].filter(Boolean)
        if (titles.length > 0) return titles.join(" · ")
      }
    }
    return look.chipTitle
  }
  return lookCaption(look.dimension, look.chipTitle)
}

export function draftFromLook(
  look: {
    dimension: string
    chipId: string
    refine: string
  },
  userRefs: VanityRef[] = [],
): VanityLookDraft & { missing: VanityKind[] } {
  const fromChip = parseVanityChipId(look.chipId, userRefs)
  if (
    fromChip.makeup ||
    fromChip.outfit ||
    look.chipId === "text" ||
    fromChip.missing.length > 0
  ) {
    return {
      makeup: fromChip.makeup,
      outfit: fromChip.outfit,
      refine: look.refine,
      missing: fromChip.missing,
    }
  }

  if (look.dimension === "wardrobe") {
    return { outfit: getVanityRef("wardrobe", look.chipId), refine: look.refine, missing: [] }
  }
  if (look.dimension === "makeup") {
    return { makeup: getVanityRef("makeup", look.chipId), refine: look.refine, missing: [] }
  }
  return { refine: look.refine, missing: [] }
}

export function parseVanityChipId(
  chipId: string,
  userRefs: VanityRef[] = [],
) {
  const draft: { makeup?: VanityRef; outfit?: VanityRef; missing: VanityKind[] } = {
    missing: [],
  }
  const mine = new Map(userRefs.map((ref) => [`${ref.kind}:${ref.id}`, ref]))
  for (const part of chipId.split("|")) {
    const [kind, first, second] = part.split(":")
    if (kind !== "makeup" && kind !== "wardrobe") continue
    if (first === "custom" && second) {
      const ref = mine.get(`${kind}:${second}`)
      if (!ref) {
        draft.missing.push(kind)
        continue
      }
      if (kind === "makeup") draft.makeup = ref
      else draft.outfit = ref
      continue
    }
    if (!first || second) continue
    const ref = getVanityRef(kind, first)
    if (kind === "makeup") draft.makeup = ref
    else draft.outfit = ref
  }
  return draft
}

export function hasCustomVanityChip(chipId: string) {
  return chipId.split("|").some((part) => {
    const [, first, second] = part.split(":")
    return first === "custom" && Boolean(second)
  })
}

export function hydrateVanityDraft(
  draft: VanityLookDraft,
  userRefs: VanityRef[],
): VanityLookDraft {
  return {
    refine: draft.refine,
    makeup: hydrateVanityRef(draft.makeup, userRefs),
    outfit: hydrateVanityRef(draft.outfit, userRefs),
  }
}

function hydrateVanityRef(ref: VanityRef | undefined, userRefs: VanityRef[]) {
  if (!ref || ref.source !== "user") return ref
  const live = userRefs.find((item) => item.id === ref.id && item.kind === ref.kind)
  return live ? { ...ref, src: live.src, title: live.title } : ref
}

export function historyDayLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "更早"
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  )
  const diff = (startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000
  if (diff === 0) return "今天"
  if (diff === 1) return "昨天"
  return "更早"
}

export function groupLooksByDay<T extends { createdAt: string }>(
  looks: T[],
  now = new Date(),
) {
  const groups: { label: string; items: T[] }[] = []
  for (const look of looks) {
    const label = historyDayLabel(look.createdAt, now)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(look)
    else groups.push({ label, items: [look] })
  }
  return groups
}

export function isVanityKind(value: string): value is VanityKind {
  return value === "makeup" || value === "wardrobe"
}

export function resolveVanityRef(kind: string, id: string) {
  return isVanityKind(kind) ? getVanityRef(kind, id) : findVanityRef(id)
}
