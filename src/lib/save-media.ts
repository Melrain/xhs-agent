import { invoke } from "@tauri-apps/api/core"

export async function saveMediaFile(input: {
  url: string
  fileName: string
}): Promise<string | null> {
  const fileName = input.fileName.trim() || "r7-media.png"
  if ("__TAURI_INTERNALS__" in window) {
    if (/^https?:\/\//.test(input.url)) {
      return invoke<string | null>("save_media", {
        url: input.url,
        bytes: null,
        fileName,
      })
    }
    const response = await fetch(input.url)
    if (!response.ok) throw new Error("无法读取要保存的文件")
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()))
    return invoke<string | null>("save_media", {
      url: null,
      bytes,
      fileName,
    })
  }

  const response = await fetch(input.url)
  if (!response.ok) throw new Error("无法读取要保存的文件")
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = fileName
  link.click()
  URL.revokeObjectURL(objectUrl)
  return fileName
}

export function mediaFileName(input: {
  kind?: "image" | "video"
  url: string
  prompt?: string
  title?: string
  s3Key?: string
}) {
  const fromUrl = extensionFromUrl(input.url)
  const ext =
    fromUrl ||
    (input.kind === "video" ? "mp4" : "png")
  const raw =
    input.title?.trim() ||
    input.prompt?.trim() ||
    fileStemFromUrl(input.s3Key) ||
    fileStemFromUrl(input.url) ||
    "r7-media"
  const stem = raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
  return `${stem || "r7-media"}.${ext}`
}

function extensionFromUrl(url: string) {
  const path = url.split("?")[0] ?? url
  const match = path.match(/\.([a-zA-Z0-9]{2,5})$/)
  return match?.[1]?.toLowerCase()
}

function fileStemFromUrl(url?: string) {
  if (!url) return undefined
  const path = url.split("?")[0] ?? url
  const name = path.split("/").pop()
  if (!name) return undefined
  return name.replace(/\.[a-zA-Z0-9]{2,5}$/, "")
}
