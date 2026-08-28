import { invoke } from "@tauri-apps/api/core"
import { getApiBase } from "@/lib/api-base"

export type PublishMediaInput = {
  s3Key: string
  mimeType?: string | null
}

export type PublishNoteInput = {
  apiBase: string
  accessToken: string
  targetXhsUserId: string
  title: string
  body: string
  topics: string[]
  isPrivate: boolean
  media: PublishMediaInput[]
}

export type PublishNoteResult = {
  ok: boolean
  message: string
  xhsNoteId?: string | null
}

export function xhsPublishNote(input: Omit<PublishNoteInput, "apiBase"> & { apiBase?: string }) {
  return invoke<PublishNoteResult>("xhs_publish_note", {
    input: {
      ...input,
      apiBase: input.apiBase ?? getApiBase(),
    },
  })
}
