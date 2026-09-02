import {
  backendFetch,
  backendFetchBlob,
  isAbortError,
  STUDIO_TIMEOUT_MS,
  STUDIO_VIDEO_TIMEOUT_MS,
  StudioApiError,
} from "@/lib/api/client"
import type {
  AspectRatio,
  Asset,
  ImageQuality,
  ImageResolution,
  MediaResult,
  VideoAspectRatio,
  VideoDuration,
  VideoResolution,
} from "@/lib/types"

export type RecruitImageResponse = {
  ok: true
  provider?: string
  model?: string
  outputs: MediaResult[]
}

export type EnqueueResponse = {
  ok: true
  taskId: string
}

export type RecruitAssetRecord = {
  id: string
  kind: string
  origin: string
  s3Key: string
  prompt: string
  mimeType?: string | null
  createdAt: string
  url: string
}

export const RECRUIT_ASSETS_QUERY_KEY = ["recruit-assets"] as const
export const RECRUIT_TASKS_QUERY_KEY = ["recruit-tasks"] as const

export type TaskStatus = "queued" | "running" | "succeeded" | "failed"

export type RecruitTaskRecord = {
  taskId: string
  origin: "t2i" | "i2i" | "i2v"
  prompt: string
  status: "queued" | "running"
  createdAt: string
}

export type MediaModelCap = "t2i" | "i2i" | "i2v" | "copy"

export type MediaModel = {
  id: string
  label: string
  caps: MediaModelCap[]
}

export type MediaModelsResponse = {
  engine: "apikey" | "openclaw"
  models: MediaModel[]
}

export type JobResponse = {
  taskId: string
  kind?: string
  status: TaskStatus
  result?: RecruitImageResponse
  error?: string
}

const POLL_INTERVAL_MS = 2_000
const ENQUEUE_TIMEOUT_MS = 15_000

function mediaPath(path: string) {
  return `/api/backend/internal/media${path}`
}

/** 后端把缺省字段当作「未指定」，所以 auto 直接省略不发。 */
function explicit<T extends string>(value?: T | "auto") {
  return value && value !== "auto" ? value : undefined
}

export async function listRecruitAssets() {
  return backendFetch<RecruitAssetRecord[]>("/api/backend/internal/studio/assets", {
    timeoutMs: ENQUEUE_TIMEOUT_MS,
  })
}

export async function fetchStudioObject(s3Key: string, options?: { signal?: AbortSignal }) {
  const query = `s3Key=${encodeURIComponent(s3Key)}`
  return backendFetchBlob(`/api/backend/internal/studio/file?${query}`, {
    timeoutMs: 60_000,
    signal: options?.signal,
  })
}

export async function fetchTemplatePreview(s3Key: string, options?: { signal?: AbortSignal }) {
  const query = `s3Key=${encodeURIComponent(s3Key)}`
  return backendFetchBlob(`/api/backend/internal/media/template-preview?${query}`, {
    timeoutMs: 60_000,
    signal: options?.signal,
  })
}

export async function loadOverlaySource(
  source: { url: string; s3Key?: string },
  options?: { signal?: AbortSignal },
) {
  if (source.s3Key && !isLocalMediaUrl(source.url)) {
    return fetchStudioObject(source.s3Key, options)
  }
  const response = await fetch(source.url, { signal: options?.signal })
  if (!response.ok) throw new Error("无法读取输入图")
  return response.blob()
}

function isLocalMediaUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:")
}

export async function uploadOverlayAsset(
  input: { file: File; prompt: string },
  options?: { signal?: AbortSignal },
) {
  const form = new FormData()
  form.append("file", input.file)
  form.append("prompt", input.prompt)
  form.append("origin", "text-overlay")
  return backendFetch<RecruitImageResponse>("/api/backend/internal/studio/assets", {
    method: "POST",
    body: form,
    timeoutMs: 60_000,
    signal: options?.signal,
  })
}

export async function listRecruitTasks() {
  return backendFetch<RecruitTaskRecord[]>("/api/backend/internal/studio/tasks", {
    timeoutMs: ENQUEUE_TIMEOUT_MS,
  })
}

export async function getRecruitJob(taskId: string) {
  return backendFetch<JobResponse>(`/api/backend/internal/jobs/${taskId}`, {
    timeoutMs: ENQUEUE_TIMEOUT_MS,
  })
}

export async function listMediaModels(cap?: MediaModelCap) {
  const query = cap ? `?cap=${encodeURIComponent(cap)}` : ""
  return backendFetch<MediaModelsResponse>(`/api/backend/internal/media/models${query}`, {
    timeoutMs: ENQUEUE_TIMEOUT_MS,
  })
}

export async function enqueueGenerateImage(
  input: {
    prompt: string
    count?: number
    aspectRatio?: AspectRatio
    quality?: ImageQuality
    resolution?: ImageResolution
    model?: string
  },
  options?: { signal?: AbortSignal },
) {
  return backendFetch<EnqueueResponse>(mediaPath("/image/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      count: input.count,
      aspectRatio: input.aspectRatio,
      quality: explicit(input.quality),
      resolution: explicit(input.resolution),
      model: input.model,
    }),
    timeoutMs: ENQUEUE_TIMEOUT_MS,
    signal: options?.signal,
  })
}

export async function generateImage(
  input: {
    prompt: string
    count?: number
    aspectRatio?: AspectRatio
    quality?: ImageQuality
    resolution?: ImageResolution
  },
  options?: { signal?: AbortSignal },
) {
  const enqueued = await enqueueGenerateImage(input, options)
  return waitForImageJob(enqueued.taskId, options?.signal)
}

export async function enqueueEditImage(
  input: {
    prompt: string
    source: Asset
    quality?: ImageQuality
    resolution?: ImageResolution
    model?: string
  },
  options?: { signal?: AbortSignal },
) {
  const form = new FormData()
  form.append("prompt", input.prompt)
  if (input.source.s3Key) {
    form.append("s3Key", input.source.s3Key)
  } else {
    form.append("file", await urlToFile(input.source.url, options?.signal))
  }
  const quality = explicit(input.quality)
  const resolution = explicit(input.resolution)
  if (quality) form.append("quality", quality)
  if (resolution) form.append("resolution", resolution)
  if (input.model?.trim()) form.append("model", input.model.trim())

  return backendFetch<EnqueueResponse>(mediaPath("/image/edit"), {
    method: "POST",
    body: form,
    timeoutMs: ENQUEUE_TIMEOUT_MS,
    signal: options?.signal,
  })
}

export async function editImage(
  input: {
    prompt: string
    source: Asset
    quality?: ImageQuality
    resolution?: ImageResolution
  },
  options?: { signal?: AbortSignal },
) {
  const enqueued = await enqueueEditImage(input, options)
  return waitForImageJob(enqueued.taskId, options?.signal)
}

export async function enqueueGenerateVideo(
  input: {
    prompt: string
    source: Asset
    duration?: VideoDuration
    aspectRatio?: VideoAspectRatio
    resolution?: VideoResolution
    model?: string
  },
  options?: { signal?: AbortSignal },
) {
  const form = new FormData()
  form.append("prompt", input.prompt)
  if (input.duration) form.append("duration", String(input.duration))
  if (input.aspectRatio && input.aspectRatio !== "source") {
    form.append("aspectRatio", input.aspectRatio)
  }
  if (input.resolution) form.append("resolution", input.resolution)
  if (input.model?.trim()) form.append("model", input.model.trim())
  if (input.source.s3Key) {
    form.append("s3Key", input.source.s3Key)
  } else {
    form.append("file", await urlToFile(input.source.url, options?.signal))
  }
  return backendFetch<EnqueueResponse>(mediaPath("/video/generate"), {
    method: "POST",
    body: form,
    timeoutMs: ENQUEUE_TIMEOUT_MS,
    signal: options?.signal,
  })
}

export async function waitForVideoJob(taskId: string, signal?: AbortSignal) {
  return waitForMediaJob(taskId, signal, {
    timeoutMs: STUDIO_VIDEO_TIMEOUT_MS,
    emptyMessage: "后端没有返回视频",
  })
}

export async function waitForImageJob(taskId: string, signal?: AbortSignal) {
  return waitForMediaJob(taskId, signal, {
    timeoutMs: STUDIO_TIMEOUT_MS,
    emptyMessage: "后端没有返回图片",
  })
}

async function waitForMediaJob(
  taskId: string,
  signal: AbortSignal | undefined,
  options: { timeoutMs: number; emptyMessage: string },
) {
  if (!taskId?.trim()) {
    throw new StudioApiError("后端没有返回任务")
  }

  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < options.timeoutMs) {
    throwIfAborted(signal)
    let job: JobResponse | undefined
    try {
      job = await backendFetch<JobResponse>(`/api/backend/internal/jobs/${taskId}`, {
        timeoutMs: ENQUEUE_TIMEOUT_MS,
        signal,
      })
    } catch (error) {
      if (isAbortError(error) || isClientJobError(error)) {
        throw error
      }
      lastError = error
      await sleep(POLL_INTERVAL_MS, signal)
      continue
    }
    lastError = undefined
    if (job.status === "succeeded") {
      return assertImageResponse(job.result, options.emptyMessage)
    }
    if (job.status === "failed") {
      throw new StudioApiError(job.error?.trim() || "生成失败")
    }
    await sleep(POLL_INTERVAL_MS, signal)
  }
  if (lastError instanceof StudioApiError) {
    throw lastError
  }
  throw new StudioApiError("生成超时，请重试")
}

function isClientJobError(error: unknown) {
  if (!(error instanceof StudioApiError) || error.status === undefined) {
    return false
  }
  return error.status >= 400 && error.status < 500
}

function assertImageResponse(result?: RecruitImageResponse, emptyMessage = "后端没有返回图片") {
  if (!result || !Array.isArray(result.outputs) || result.outputs.length === 0) {
    throw new StudioApiError(emptyMessage)
  }
  if (!result.outputs.every((item) => item?.url && item?.s3Key)) {
    throw new StudioApiError("后端返回的媒体缺少地址")
  }
  return result
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError()
  }
}

function abortError() {
  return new DOMException("Aborted", "AbortError")
}

async function urlToFile(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error("无法读取输入图")
  }
  const blob = await response.blob()
  const name = fileNameFromUrl(url)
  return new File([blob], name, { type: blob.type || "image/png" })
}

function fileNameFromUrl(url: string) {
  try {
    const path = new URL(url, "http://localhost").pathname
    const name = path.split("/").pop()
    if (name) return name
  } catch {
    /* blob: or malformed */
  }
  return "input.png"
}
