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
  type FilmStageKind,
} from "@/lib/film-package"

/**
 * GrokCli / local：本机 grok CLI stub。
 * preflight 形状与 VPS 对齐（source: "local"）；analyze / runStage 尚未接线。
 * 探测诚实：不假装 Nest preflight 是本机结果。
 */

export type FilmLocalWorkerRequest = FilmRunStageInput

export function isFilmLocalWorkerReady() {
  return false
}

/** 桌面以后在这里看本机 grok 是否真的在；现在返回 null，不伪造 Nest 状态。 */
export async function probeLocalGrok(): Promise<{ installed?: boolean; bin?: string } | null> {
  return null
}

export function filmLocalWorkerHint(stage: FilmStageKind) {
  if (stage === "script") return "本机 grok / grok bot。出剧本并写回制作包。"
  if (stage === "assets") return "本机执行。出素材并写回制作包。"
  if (stage === "shots") return "本机执行。出分镜并写回制作包。"
  if (stage === "keyframes") return "本机执行。出关键帧画面并写回制作包。"
  if (stage === "clips") return "本机执行。出视频片段并写回制作包。"
  if (stage === "audio") return "本机执行。出声音并写回制作包。"
  if (stage === "cut") return "本机执行。合成成片视频并写回制作包。"
  if (stage === "breakdown") return "完整拆解以后本机执行，产物写回制作包。本切片先走接口占位。"
  return "本机执行。成片和中间素材都会写回制作包。"
}

export function filmLocalWorkerActionLabel() {
  return "本机执行"
}

export function filmLocalWorkerStatusLabel() {
  return "本机执行"
}

export async function localGrokCliPreflight(
  _options?: { signal?: AbortSignal },
): Promise<FilmGrokPreflight> {
  const probe = await probeLocalGrok()
  if (!probe) {
    return {
      ...emptyFilmGrokPreflight("local"),
      detail: "本机 Grok CLI 尚未接线（stub）",
    }
  }
  return {
    installed: Boolean(probe.installed),
    bin: probe.bin,
    authFile: false,
    authOk: false,
    detail: "本机 Grok CLI 探测未完成",
    source: "local",
  }
}

/** 本机 worker 未接线时不要调用。 */
export async function requestFilmLocalWorker(_input: FilmLocalWorkerRequest): Promise<void> {
  if (!isFilmLocalWorkerReady()) return
  if (!isFilmLocalGenerationStage(_input.stage) && _input.stage !== "breakdown") return
}

export function createGrokCliLocalRunner(): FilmRunner {
  const source = "local" as const
  return {
    source,

    async preflight(options?: { signal?: AbortSignal }): Promise<FilmGrokPreflight> {
      return localGrokCliPreflight(options)
    },

    async analyze(
      _projectId: string,
      _refId: string,
      _options?: { signal?: AbortSignal },
    ): Promise<FilmAnalyzeResult> {
      throw new Error("本机 Grok CLI analyze 尚未实现")
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
