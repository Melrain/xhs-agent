import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { studioErrorMessage } from "@/lib/api/client"
import {
  createNotePackage,
  PACKAGES_QUERY_KEY,
  updateNotePackage,
  type NotePackage,
  type PackageMediaItem,
} from "@/lib/api/packages"

export const TITLE_MAX = 20
export const BODY_MAX = 1000
export const TOPICS_MAX = 10

export type NoteMediaPick =
  | { kind: "asset"; id: string }
  | { kind: "keep"; id: string; url: string }

export type NoteDraftInput = {
  assetIds: string[]
  mediaItems?: PackageMediaItem[]
  title: string
  body: string
  topics: string[]
  job: string
  persona: string
  isPrivate: boolean
}

export type DraftSaveState = "idle" | "saving" | "saved" | "error"

type DraftPayload = {
  title: string
  body: string
  topics: string[]
  job: string
  persona: string
  isPrivate: boolean
  assetIds?: string[]
  mediaItems?: PackageMediaItem[]
}

export function hasDraftContent(input: NoteDraftInput) {
  return (
    input.assetIds.length > 0 ||
    (input.mediaItems?.length ?? 0) > 0 ||
    input.title.trim().length > 0 ||
    input.body.trim().length > 0
  )
}

export function draftMissingParts(input: NoteDraftInput): string[] {
  const imageCount = input.mediaItems?.length ?? input.assetIds.length
  const missing: string[] = []
  if (imageCount === 0) missing.push("至少一张图")
  if (!input.title.trim()) missing.push("标题")
  if (!input.body.trim()) missing.push("正文")
  return missing
}

export function picksFromPackage(pkg?: NotePackage): NoteMediaPick[] {
  if (!pkg) return []
  return pkg.media.map((item) =>
    item.studioAssetId
      ? { kind: "asset" as const, id: item.studioAssetId }
      : { kind: "keep" as const, id: item.id, url: item.url },
  )
}

export function resolvePicks(
  picks: NoteMediaPick[],
  packableIdSet: Set<string>,
  pkg?: NotePackage,
): NoteMediaPick[] {
  const next: NoteMediaPick[] = []
  for (const pick of picks) {
    if (pick.kind === "keep") {
      next.push(pick)
      continue
    }
    if (packableIdSet.has(pick.id)) {
      next.push(pick)
      continue
    }
    const media = pkg?.media.find((item) => item.studioAssetId === pick.id)
    if (media) {
      next.push({ kind: "keep", id: media.id, url: media.url })
    }
  }
  return next
}

export function draftInputFromPicks(
  picks: NoteMediaPick[],
  fields: Omit<NoteDraftInput, "assetIds" | "mediaItems">,
): NoteDraftInput {
  const allAssets = picks.every((pick) => pick.kind === "asset")
  return {
    ...fields,
    assetIds: allAssets ? picks.map((pick) => pick.id) : [],
    mediaItems: allAssets
      ? undefined
      : picks.map((pick) =>
          pick.kind === "asset"
            ? { studioAssetId: pick.id }
            : { keepMediaId: pick.id },
        ),
  }
}

export function draftInputFromPackage(pkg: NotePackage): NoteDraftInput {
  return draftInputFromPicks(picksFromPackage(pkg), {
    title: pkg.title,
    body: pkg.body,
    topics: pkg.topics,
    job: pkg.job ?? "",
    persona: pkg.persona ?? "",
    isPrivate: pkg.isPrivate,
  })
}

export function toDraftPayload(
  input: NoteDraftInput,
  includeMedia = true,
): DraftPayload {
  const payload: DraftPayload = {
    title: input.title.trim().slice(0, TITLE_MAX),
    body: input.body.trim().slice(0, BODY_MAX),
    topics: input.topics.slice(0, TOPICS_MAX),
    job: input.job.trim(),
    persona: input.persona.trim(),
    isPrivate: input.isPrivate,
  }
  if (includeMedia) {
    if (input.mediaItems) {
      payload.mediaItems = input.mediaItems
    } else {
      payload.assetIds = input.assetIds
    }
  }
  return payload
}

function textKey(payload: DraftPayload) {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    topics: payload.topics,
    job: payload.job,
    persona: payload.persona,
    isPrivate: payload.isPrivate,
  })
}

function payloadKey(payload: DraftPayload) {
  return JSON.stringify(payload)
}

function isUnchanged(last: DraftPayload | null, payload: DraftPayload, includeMedia: boolean) {
  if (!last) return false
  if (!includeMedia) return textKey(last) === textKey(payload)
  return payloadKey(last) === payloadKey(payload)
}

export function useNoteDraft(options?: {
  initialId?: string | null
  initialInput?: NoteDraftInput | null
  ready?: boolean
  onCreated?: (pkg: NotePackage) => void
}) {
  const queryClient = useQueryClient()
  const [draftId, setDraftId] = useState<string | null>(options?.initialId ?? null)
  const [saveState, setSaveState] = useState<DraftSaveState>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<NoteDraftInput | null>(null)
  const draftIdRef = useRef(options?.initialId ?? null)
  const onCreatedRef = useRef(options?.onCreated)
  const readyRef = useRef(options?.ready ?? true)
  const saveChainRef = useRef(Promise.resolve())
  const lastSavedRef = useRef<DraftPayload | null>(
    options?.initialInput ? toDraftPayload(options.initialInput) : null,
  )
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  useEffect(() => {
    onCreatedRef.current = options?.onCreated
  }, [options?.onCreated])

  useEffect(() => {
    readyRef.current = options?.ready ?? true
  }, [options?.ready])

  const flushSave = useCallback(async (input?: NoteDraftInput) => {
    const next = input ?? pendingRef.current
    if (!next || !hasDraftContent(next)) return

    const includeMedia = readyRef.current
    const payload = toDraftPayload(next, includeMedia)
    if (isUnchanged(lastSavedRef.current, payload, includeMedia)) return

    const run = async () => {
      if (isUnchanged(lastSavedRef.current, payload, includeMedia)) return
      setSaveState("saving")
      setSaveError(null)
      try {
        if (!draftIdRef.current) {
          const created = await createNotePackage(payload)
          draftIdRef.current = created.id
          setDraftId(created.id)
          onCreatedRef.current?.(created)
        } else {
          await updateNotePackage(draftIdRef.current, payload)
        }
        lastSavedRef.current = includeMedia
          ? payload
          : { ...(lastSavedRef.current ?? payload), ...payload }
        await queryClientRef.current.invalidateQueries({
          queryKey: PACKAGES_QUERY_KEY,
        })
        setSaveState("saved")
      } catch (err) {
        setSaveState("error")
        setSaveError(studioErrorMessage(err))
        throw err
      }
    }

    saveChainRef.current = saveChainRef.current.then(run, run)
    return saveChainRef.current
  }, [])

  const scheduleSave = useCallback((input: NoteDraftInput) => {
    pendingRef.current = input
    if (!hasDraftContent(input)) return
    const includeMedia = readyRef.current
    const payload = toDraftPayload(input, includeMedia)
    if (isUnchanged(lastSavedRef.current, payload, includeMedia)) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void flushSave(input).catch(() => undefined)
    }, 1500)
  }, [flushSave])

  const retrySave = useCallback(() => {
    if (pendingRef.current) void flushSave(pendingRef.current).catch(() => undefined)
  }, [flushSave])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return
      void flushSave().catch(() => undefined)
    }
    document.addEventListener("visibilitychange", onHide)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void flushSave().catch(() => undefined)
    }
  }, [flushSave])

  return {
    draftId,
    saveState,
    saveError,
    scheduleSave,
    flushSave,
    retrySave,
  }
}
