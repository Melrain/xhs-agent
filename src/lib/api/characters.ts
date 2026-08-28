import { backendFetch } from "@/lib/api/client"
import type { ImageQuality, ImageResolution } from "@/lib/types"

export type LookStatus = "pending" | "ready" | "failed"

/** 一张妆照卡：某张人物卡出的一次图。 */
export type LookCard = {
  id: string
  characterId: string
  status: LookStatus
  dimension: string
  chipId: string
  chipTitle: string
  refine: string
  prompt: string
  url: string | null
  error: string | null
  createdAt: string
  updatedAt?: string
  characterName?: string
}

export type LookList = {
  looks: LookCard[]
  total: number
}

/** 一张人物卡：一张底图 + 一个名字，妆照卡都挂在它下面。 */
export type CharacterCard = {
  id: string
  name: string
  url: string
  fromLookId: string | null
  lookCount: number
  pendingCount: number
  createdAt: string
  updatedAt: string
}

export type CharacterDetail = CharacterCard & { looks: LookCard[] }

/** 出图参数，一次设好对所有人物卡生效。 */
export type RenderSettings = {
  quality?: ImageQuality
  resolution?: ImageResolution
  model?: string
}

export type LookRequest = {
  dimension: string
  chipId: string
  chipTitle: string
  refine: string
  prompt: string
}

export const CHARACTERS_QUERY_KEY = ["characters"] as const
export const LOOKS_QUERY_KEY = ["looks"] as const

export function characterQueryKey(id: string) {
  return ["characters", id] as const
}

export function looksQueryKey(characterId?: string) {
  return characterId ? ([...LOOKS_QUERY_KEY, characterId] as const) : LOOKS_QUERY_KEY
}

const TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

function path(suffix: string) {
  return `/api/backend/internal${suffix}`
}

/** 后端把缺省字段当作「未指定」，所以 auto 直接省略不发。 */
function explicit<T extends string>(value?: T | "auto") {
  return value && value !== "auto" ? value : undefined
}

function renderBody(settings: RenderSettings) {
  return {
    quality: explicit(settings.quality),
    resolution: explicit(settings.resolution),
    model: settings.model?.trim() || undefined,
  }
}

export function listCharacters() {
  return backendFetch<CharacterCard[]>(path("/characters"), {
    timeoutMs: TIMEOUT_MS,
  })
}

export function listLooks(characterId?: string) {
  const query = characterId
    ? `?characterId=${encodeURIComponent(characterId)}`
    : ""
  return backendFetch<LookList>(path(`/looks${query}`), {
    timeoutMs: TIMEOUT_MS,
  })
}

export function getCharacter(id: string) {
  return backendFetch<CharacterDetail>(path(`/characters/${id}`), {
    timeoutMs: TIMEOUT_MS,
  })
}

export function createCharacters(files: File[]) {
  const form = new FormData()
  for (const file of files) {
    form.append("files", file)
  }
  return backendFetch<CharacterCard[]>(path("/characters"), {
    method: "POST",
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })
}

export function renameCharacter(id: string, name: string) {
  return backendFetch<CharacterCard>(path(`/characters/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    timeoutMs: TIMEOUT_MS,
  })
}

export function deleteCharacter(id: string) {
  return backendFetch<{ ok: true }>(path(`/characters/${id}`), {
    method: "DELETE",
    timeoutMs: TIMEOUT_MS,
  })
}

export function generateLooks(
  characterId: string,
  looks: LookRequest[],
  settings: RenderSettings,
) {
  return backendFetch<LookCard[]>(path(`/characters/${characterId}/looks`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ looks, ...renderBody(settings) }),
    timeoutMs: TIMEOUT_MS,
  })
}

export function retryLook(lookId: string, settings: RenderSettings) {
  return backendFetch<LookCard>(path(`/looks/${lookId}/retry`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(renderBody(settings)),
    timeoutMs: TIMEOUT_MS,
  })
}

export function deleteLook(lookId: string) {
  return backendFetch<{ ok: true }>(path(`/looks/${lookId}`), {
    method: "DELETE",
    timeoutMs: TIMEOUT_MS,
  })
}

export function saveLookAsCharacter(lookId: string) {
  return backendFetch<CharacterCard>(path(`/looks/${lookId}/save-as-character`), {
    method: "POST",
    timeoutMs: TIMEOUT_MS,
  })
}
