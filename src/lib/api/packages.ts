import { backendFetch } from "@/lib/api/client"

export type NotePackageStatus = "draft" | "ready" | "archived"
export type NoteAssignmentStatus = "publishing" | "published" | "failed"

export type NotePackageMedia = {
  id: string
  studioAssetId?: string | null
  s3Key: string
  mimeType?: string | null
  sortOrder: number
  url: string
}

export type NoteAssignment = {
  id: string
  packageId: string
  targetXhsUserId: string
  status: NoteAssignmentStatus
  xhsNoteId?: string | null
  error?: string | null
  publishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type NotePackage = {
  id: string
  title: string
  body: string
  topics: string[]
  job?: string | null
  persona?: string | null
  isPrivate: boolean
  status: NotePackageStatus
  createdAt: string
  updatedAt: string
  media: NotePackageMedia[]
  assignments: NoteAssignment[]
}

export const PACKAGES_QUERY_KEY = ["note-packages"] as const

export async function listNotePackages() {
  return backendFetch<NotePackage[]>("/api/backend/internal/packages", {
    timeoutMs: 15_000,
  })
}

export async function createNotePackage(input: {
  title: string
  body: string
  topics: string[]
  job?: string
  persona?: string
  isPrivate?: boolean
  assetIds: string[]
}) {
  return backendFetch<NotePackage>("/api/backend/internal/packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 15_000,
  })
}

export type PackageMediaItem = {
  studioAssetId?: string
  keepMediaId?: string
}

export async function updateNotePackage(
  id: string,
  input: Partial<{
    title: string
    body: string
    topics: string[]
    job: string
    persona: string
    isPrivate: boolean
    assetIds: string[]
    mediaItems: PackageMediaItem[]
  }>,
) {
  return backendFetch<NotePackage>(`/api/backend/internal/packages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 15_000,
  })
}

export async function deleteNotePackage(id: string) {
  return backendFetch<{ ok: true }>(`/api/backend/internal/packages/${id}`, {
    method: "DELETE",
    timeoutMs: 15_000,
  })
}

export async function createPackageAssignment(packageId: string, targetXhsUserId: string) {
  return backendFetch<NoteAssignment>(
    `/api/backend/internal/packages/${packageId}/assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetXhsUserId }),
      timeoutMs: 15_000,
    },
  )
}

export async function updatePackageAssignment(
  packageId: string,
  assignmentId: string,
  input: {
    status: "published" | "failed"
    xhsNoteId?: string
    error?: string
  },
) {
  return backendFetch<NoteAssignment>(
    `/api/backend/internal/packages/${packageId}/assignments/${assignmentId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 15_000,
    },
  )
}
