import { backendFetch } from "@/lib/api/client"

export type CopyPayload = {
  title: string
  body: string
  tags: string[]
}

export async function generateRecruitCopy(
  input: {
    job?: string
    persona?: string
    assetIds?: string[]
  },
  options?: { signal?: AbortSignal },
) {
  return backendFetch<CopyPayload>("/api/backend/internal/media/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 120_000,
    signal: options?.signal,
  })
}
