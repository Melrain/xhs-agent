import {
  getCurrentFilmProject,
  submitFilmReferenceBreakdown,
  type FilmProject,
  type FilmReferenceBreakdownBody,
} from "@/lib/api/film"
import { isTauriRuntime } from "@/lib/api/desktop-fetch"
import {
  readFilmLocalMediaPath,
  writeFilmLocalMediaPath,
} from "@/lib/film-client-state"
import type {
  FilmAnalyzeResult,
  FilmRunner,
  FilmRunStageInput,
  FilmRunStageResult,
} from "@/lib/film/runner"
import {
  emptyFilmGrokPreflight,
  type FilmGrokPreflight,
} from "@/lib/film-grok-preflight"
import {
  isFilmLocalGenerationStage,
  type FilmBreakdownItem,
  type FilmPackage,
  type FilmStageKind,
} from "@/lib/film-package"

/**
 * GrokCli / local：本机 grok CLI。
 * preflight + analyze 经 Tauri 真实跑 ffmpeg / whisper / grok；失败明示，不静默 stub。
 */

export type FilmLocalWorkerRequest = FilmRunStageInput

export type LocalGrokProbe = {
  installed?: boolean
  bin?: string
  authFile?: boolean
  authOk?: boolean
  ffmpegOk?: boolean
  whisperOk?: boolean
  detail?: string
  analyzeReady?: boolean
}

/** 本机生成 worker 仍未接线。 */
export function isFilmLocalWorkerReady() {
  return false
}

/** 本机 analyze 已接线（桌面 Tauri 命令）。 */
export function isFilmLocalAnalyzeReady() {
  return true
}

type TauriLocalPreflight = {
  installed: boolean
  bin?: string
  authFile: boolean
  authOk: boolean
  detail: string
  ffmpegOk?: boolean
  whisperOk?: boolean
  source?: string
  analyzeReady?: boolean
}

type TauriLocalBreakdownCard = {
  id: string
  title: string
  body: string
  kind?: string
}

type TauriLocalAnalyzeResult = {
  items: TauriLocalBreakdownCard[]
  scriptTitle?: string
  scriptBody?: string
  mode: string
  hadFrames: boolean
  hadTranscript: boolean
  blocked: boolean
  error?: string
  detail: string
  mediaPath?: string
  workDir?: string
}

type TauriLocalCacheMediaResult = {
  path: string
}

async function invokeFilmLocalGrokPreflight(
  options?: { signal?: AbortSignal },
): Promise<TauriLocalPreflight | null> {
  if (!isTauriRuntime()) return null
  if (options?.signal?.aborted) {
    const err = new Error("Aborted")
    err.name = "AbortError"
    throw err
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<TauriLocalPreflight>("film_local_grok_preflight")
}

async function invokeFilmLocalGrokAnalyze(
  input: {
    projectId: string
    refId: string
    mediaPath?: string
    mediaUrl?: string
    title?: string
    referenceSource?: string
    referenceUrl?: string
  },
  options?: { signal?: AbortSignal },
): Promise<TauriLocalAnalyzeResult> {
  if (!isTauriRuntime()) {
    throw new Error("本机拆解需桌面端（Tauri）")
  }
  if (options?.signal?.aborted) {
    const err = new Error("Aborted")
    err.name = "AbortError"
    throw err
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<TauriLocalAnalyzeResult>("film_local_grok_analyze", { input })
}

/** 上传后把视频落到本机磁盘，供 source=local analyze 使用。 */
export async function cacheFilmLocalMediaFile(
  projectId: string,
  refId: string,
  file: File,
): Promise<string | null> {
  if (!isTauriRuntime()) return null
  const { invoke } = await import("@tauri-apps/api/core")
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
  const result = await invoke<TauriLocalCacheMediaResult>("film_local_cache_media", {
    input: {
      projectId,
      refId,
      filename: file.name || "upload.mp4",
      bytes,
    },
  })
  if (result?.path) {
    writeFilmLocalMediaPath(projectId, refId, result.path)
    return result.path
  }
  return null
}

/** 桌面端经 Tauri 探测本机 grok；非桌面返回 null（勿伪造 Nest 状态）。 */
export async function probeLocalGrok(
  options?: { signal?: AbortSignal },
): Promise<LocalGrokProbe | null> {
  try {
    const result = await invokeFilmLocalGrokPreflight(options)
    if (!result) return null
    return {
      installed: result.installed,
      bin: result.bin,
      authFile: result.authFile,
      authOk: result.authOk,
      ffmpegOk: result.ffmpegOk,
      whisperOk: result.whisperOk,
      detail: result.detail,
      analyzeReady: result.analyzeReady === true,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    const message = error instanceof Error ? error.message : String(error)
    return {
      installed: false,
      authFile: false,
      authOk: false,
      detail: `本机 grok 探测失败：${message}`,
      analyzeReady: false,
    }
  }
}

export function filmLocalWorkerHint(stage: FilmStageKind) {
  if (stage === "script") return "本机 grok / grok bot。出剧本并写回制作包。"
  if (stage === "assets") return "本机执行。出素材并写回制作包。"
  if (stage === "shots") return "本机执行。出分镜并写回制作包。"
  if (stage === "keyframes") return "本机执行。出关键帧画面并写回制作包。"
  if (stage === "clips") return "本机执行。出视频片段并写回制作包。"
  if (stage === "audio") return "本机执行。出声音并写回制作包。"
  if (stage === "cut") return "本机执行。合成成片视频并写回制作包。"
  if (stage === "breakdown") return "本机拆解：ffmpeg 抽帧 + whisper 对白 + grok，产物写回制作包视图。"
  return "本机执行。成片和中间素材都会写回制作包。"
}

export function filmLocalWorkerActionLabel() {
  return "本机执行"
}

export function filmLocalWorkerStatusLabel() {
  return "本机执行"
}

export async function localGrokCliPreflight(
  options?: { signal?: AbortSignal },
): Promise<FilmGrokPreflight> {
  const probe = await probeLocalGrok(options)
  if (!probe) {
    return {
      ...emptyFilmGrokPreflight("local"),
      detail: "本机探测需桌面端（Tauri）；当前环境无法检查本地 grok。",
    }
  }

  const installed = Boolean(probe.installed)
  const authFile = Boolean(probe.authFile)
  const authOk = Boolean(probe.authOk)
  const analyzeReady = probe.analyzeReady === true && isFilmLocalAnalyzeReady()
  const baseDetail = (probe.detail ?? "").trim()
  const detail = analyzeReady
    ? baseDetail || "本机 grok 已就绪，可真实拆解"
    : baseDetail || "本机 grok 未就绪"

  return {
    installed,
    bin: probe.bin,
    authFile,
    authOk,
    detail,
    ffmpegOk: probe.ffmpegOk,
    whisperOk: probe.whisperOk,
    source: "local",
  }
}

/** 本机 worker 未接线时不要调用。 */
export async function requestFilmLocalWorker(_input: FilmLocalWorkerRequest): Promise<void> {
  if (!isFilmLocalWorkerReady()) return
  if (!isFilmLocalGenerationStage(_input.stage) && _input.stage !== "breakdown") return
}

function withLocalAnalyzePackage(
  project: FilmProject,
  _refId: string,
  result: TauriLocalAnalyzeResult,
): FilmProject {
  const pkg: FilmPackage = {
    ...(project.package ?? { stages: [], references: [], breakdown: [] }),
  }
  const breakdown: FilmBreakdownItem[] = (result.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    ...(item.kind ? { kind: item.kind } : {}),
  }))
  const stages = (pkg.stages.length > 0 ? pkg.stages : []).map((stage) => {
    if (stage.id === "breakdown" || stage.label === "拆解") {
      return {
        ...stage,
        status: result.blocked ? stage.status : ("ready" as const),
      }
    }
    return stage
  })
  // 若没有 stages，补一份最小可见阶段，便于跟拍页渲染。
  const ensuredStages =
    stages.length > 0
      ? stages
      : [
          { id: "reference", label: "参考片", status: "ready" as const },
          {
            id: "breakdown",
            label: "拆解",
            status: result.blocked ? ("pending" as const) : ("ready" as const),
          },
        ]

  const nextPkg: FilmPackage = {
    ...pkg,
    stages: ensuredStages,
    breakdown,
    meta: {
      ...(pkg.meta ?? {}),
      analyze: {
        mode: result.blocked ? result.mode || "stub" : result.mode || "local",
        hadFrames: result.hadFrames,
        hadTranscript: result.hadTranscript,
        ...(result.blocked ? { blocked: true } : {}),
        ...(result.error ? { fallbackFrom: undefined } : {}),
      },
    },
  }
  delete (nextPkg as { analyzingRefId?: string }).analyzingRefId

  return {
    ...project,
    analyzingRefId: undefined,
    package: nextPkg,
    phase: result.blocked ? project.phase : project.phase,
    source: "local",
    executor: { source: "local" },
    grok: result.blocked
      ? { authOk: false, detail: result.detail || result.error || "本机拆解失败" }
      : { authOk: true, detail: result.detail || "本机 grok 拆解完成" },
  }
}

async function runLocalAnalyze(
  projectId: string,
  refId: string,
  options?: { signal?: AbortSignal },
): Promise<FilmAnalyzeResult> {
  if (!isTauriRuntime()) {
    throw new Error("本机 Grok CLI analyze 需桌面端（Tauri）")
  }

  const project = await getCurrentFilmProject(options)
  if (project.id !== projectId) {
    // 仍尝试用当前包里的参考片；id 不一致时以入参为准继续。
  }
  const pkg = project.package
  const reference = pkg?.references.find((row) => row.id === refId)
  if (!reference) {
    throw new Error("参考片不存在")
  }

  const cachedPath = readFilmLocalMediaPath(projectId, refId)
  const mediaPath = cachedPath || undefined
  const mediaUrl = reference.mediaUrl || undefined
  const referenceUrl = reference.url || undefined

  if (!mediaPath && !mediaUrl && !referenceUrl && reference.source !== "upload") {
    throw new Error("需上传视频文件")
  }
  if (!mediaPath && reference.source === "upload" && !mediaUrl) {
    throw new Error(
      "需上传视频文件。本机拆解需要本地磁盘或云端 mediaUrl：请在桌面端重新上传（会缓存到本机；Nest R2 也会回传预览地址）。",
    )
  }

  const result = await invokeFilmLocalGrokAnalyze(
    {
      projectId,
      refId,
      mediaPath,
      mediaUrl,
      title: reference.title,
      referenceSource: reference.source,
      referenceUrl,
    },
    options,
  )

  if (result.mediaPath) {
    writeFilmLocalMediaPath(projectId, refId, result.mediaPath)
  }

  const localMerged = withLocalAnalyzePackage(project, refId, result)
  const writebackBody = buildLocalBreakdownWritebackBody(result)

  try {
    const serverProject = await submitFilmReferenceBreakdown(
      projectId,
      refId,
      writebackBody,
      options,
    )
    // Prefer Nest FilmProjectThreadView as source of truth for react-query.
    return { ...serverProject, source: "local" as const }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    const message = error instanceof Error ? error.message : String(error)
    // Local merge is UI fallback only — writebackError must be surfaced; do not pretend persisted.
    return {
      ...localMerged,
      source: "local" as const,
      writebackError: message,
      grok: {
        authOk: !result.blocked,
        detail: `${localMerged.grok?.detail ?? "本机拆解完成"}；写回 Nest 失败（未持久化）：${message}`,
      },
    }
  }
}

/** Nest PersistFilmBreakdownDto from Tauri local analyze result. */
function buildLocalBreakdownWritebackBody(
  result: TauriLocalAnalyzeResult,
): FilmReferenceBreakdownBody {
  const blocked = result.blocked === true
  const error =
    typeof result.error === "string" && result.error.trim()
      ? result.error.trim()
      : blocked
        ? (result.detail || "本机拆解失败").trim() || "本机拆解失败"
        : undefined

  const items = (result.items ?? [])
    .filter((item) => typeof item?.title === "string" && typeof item?.body === "string")
    .map((item) => ({
      ...(typeof item.id === "string" && item.id.trim() ? { id: item.id.trim() } : {}),
      title: item.title,
      body: item.body,
      ...(typeof item.kind === "string" && item.kind.trim() ? { kind: item.kind.trim() } : {}),
    }))

  // Nest rule: empty items ONLY when blocked=true AND error present (else Nest 400 → fallback).
  const mode = blocked
    ? result.mode || "stub"
    : result.mode || "local"

  const body: FilmReferenceBreakdownBody = {
    items,
    meta: {
      analyze: {
        mode,
        hadFrames: result.hadFrames === true,
        hadTranscript: result.hadTranscript === true,
        ...(blocked ? { blocked: true } : {}),
        ...(error ? { error } : {}),
        at: new Date().toISOString(),
      },
    },
  }

  const scriptTitle =
    typeof result.scriptTitle === "string" ? result.scriptTitle.trim() : ""
  const scriptBody =
    typeof result.scriptBody === "string" ? result.scriptBody.trim() : ""
  if (scriptTitle || scriptBody) {
    body.script = {
      ...(scriptTitle ? { title: scriptTitle } : {}),
      ...(scriptBody ? { body: scriptBody } : {}),
    }
  }

  return body
}

export function createGrokCliLocalRunner(): FilmRunner {
  const source = "local" as const
  return {
    source,

    async preflight(options?: { signal?: AbortSignal }): Promise<FilmGrokPreflight> {
      return localGrokCliPreflight(options)
    },

    async analyze(
      projectId: string,
      refId: string,
      options?: { signal?: AbortSignal },
    ): Promise<FilmAnalyzeResult> {
      return runLocalAnalyze(projectId, refId, options)
    },

    async runStage(
      input: FilmRunStageInput,
      _options?: { signal?: AbortSignal },
    ): Promise<FilmRunStageResult> {
      await requestFilmLocalWorker(input)
      if (!isFilmLocalWorkerReady()) {
        throw new Error("本机 Grok CLI runStage 尚未实现")
      }
      return { source }
    },
  }
}
