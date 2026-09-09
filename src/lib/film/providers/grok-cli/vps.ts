import { analyzeFilmReference, getFilmGrokPreflight } from "@/lib/api/film"
import type {
  FilmAnalyzeResult,
  FilmRunner,
  FilmRunStageInput,
  FilmRunStageResult,
} from "@/lib/film/runner"
import type { FilmGrokPreflight } from "@/lib/film-grok-preflight"

/**
 * GrokCli / VPS：经 Nest HTTP 调 VPS 上的 Grok CLI。
 * 默认执行端；勿命名为 ApiKey。
 */
export function createGrokCliVpsRunner(): FilmRunner {
  const source = "vps" as const
  return {
    source,

    async preflight(options?: { signal?: AbortSignal }): Promise<FilmGrokPreflight> {
      const result = await getFilmGrokPreflight(options)
      return { ...result, source }
    },

    async analyze(
      projectId: string,
      refId: string,
      options?: { signal?: AbortSignal },
    ): Promise<FilmAnalyzeResult> {
      const project = await analyzeFilmReference(projectId, refId, options)
      return { ...project, source }
    },

    async runStage(
      _input: FilmRunStageInput,
      _options?: { signal?: AbortSignal },
    ): Promise<FilmRunStageResult> {
      // 生成类阶段目前仍走本机入口；VPS 侧未接线。
      throw new Error("VPS Grok CLI 尚未实现 runStage")
    },
  }
}
