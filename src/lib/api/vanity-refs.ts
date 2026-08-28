import { backendFetch } from "@/lib/api/client"
import {
  vanityUserRefChange,
  type VanityKind,
  type VanityRef,
} from "@/lib/vanity-refs"

export type VanityUserRefCard = {
  id: string
  kind: VanityKind
  title: string
  url: string
  createdAt: string
}

const TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

function path(suffix = "") {
  return `/api/backend/internal/refs${suffix}`
}

export function listVanityUserRefs(kind: VanityKind) {
  return backendFetch<VanityUserRefCard[]>(
    `${path()}?kind=${encodeURIComponent(kind)}`,
    { timeoutMs: TIMEOUT_MS },
  )
}

export function uploadVanityUserRef(kind: VanityKind, file: File) {
  const form = new FormData()
  form.append("file", file)
  form.append("kind", kind)
  return backendFetch<VanityUserRefCard>(path(), {
    method: "POST",
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  })
}

export function renameVanityUserRef(id: string, title: string) {
  return backendFetch<VanityUserRefCard>(path(`/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
    timeoutMs: TIMEOUT_MS,
  })
}

export function deleteVanityUserRef(id: string) {
  return backendFetch<{ ok: true }>(path(`/${id}`), {
    method: "DELETE",
    timeoutMs: TIMEOUT_MS,
  })
}

export function toVanityUserRef(card: VanityUserRefCard): VanityRef {
  return {
    id: card.id,
    kind: card.kind,
    title: card.title,
    blurb: "自己上传的参考",
    change: vanityUserRefChange(card.kind),
    category: card.kind === "makeup" ? "创意" : "日常",
    src: card.url,
    source: "user",
  }
}
