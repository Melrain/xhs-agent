import { backendFetch } from "@/lib/api/client"
import { imageProviderRequestField, type ImageProvider } from "@/lib/image-provider"

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
    provider?: ImageProvider
  },
  options?: { signal?: AbortSignal },
) {
  return backendFetch<CopyPayload>("/api/backend/internal/media/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job: input.job,
      persona: input.persona,
      assetIds: input.assetIds,
      ...imageProviderRequestField(input.provider),
    }),
    timeoutMs: 120_000,
    signal: options?.signal,
  })
}
