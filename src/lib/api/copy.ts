import { backendFetch } from "@/lib/api/client"

export type CopyPayload = {
  title: string
  body: string
  tags: string[]
}

export async function generateRecruitCopy(input: { job: string; persona?: string }) {
  return backendFetch<CopyPayload>("/api/backend/internal/media/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 120_000,
  })
}
