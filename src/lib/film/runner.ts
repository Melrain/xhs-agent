import type { FilmProject } from "@/lib/api/film"
import { readFilmExecutorSourcePreference } from "@/lib/film-client-state"
import type { FilmGrokPreflight, FilmRunnerSource } from "@/lib/film-grok-preflight"
import type { FilmStageKind } from "@/lib/film-package"
import {
  createGrokCliLocalRunner,
  createGrokCliVpsRunner,
} from "@/lib/film/providers/grok-cli"

export type { FilmRunnerSource }

/** 影片执行端：VPS Nest（Grok CLI）或本机 Grok CLI。 */
export type FilmRunStageInput = {
  projectId: string
  stageId: string
  stage: FilmStageKind
}

/** analyze 结果：项目 + 本次实际 source；写回失败时带 writebackError（勿当已持久化）。 */
export type FilmAnalyzeResult = FilmProject & {
  source: FilmRunnerSource
  /** Nest writeback failed; UI must surface — local merge is not persisted. */
  writebackError?: string
}

/** runStage 结果：携带同一 source 字段 */
export type FilmRunStageResult = { source: FilmRunnerSource }

export type FilmRunner = {
  readonly source: FilmRunnerSource
  preflight(options?: { signal?: AbortSignal }): Promise<FilmGrokPreflight>
  analyze(
    projectId: string,
    refId: string,
    options?: { signal?: AbortSignal },
  ): Promise<FilmAnalyzeResult>
  runStage(
    input: FilmRunStageInput,
    options?: { signal?: AbortSignal },
  ): Promise<FilmRunStageResult>
}

/** 默认走 VPS。 */
export const DEFAULT_FILM_RUNNER_SOURCE: FilmRunnerSource = "vps"

export function isFilmRunnerSource(value: unknown): value is FilmRunnerSource {
  return value === "vps" || value === "local"
}

export type FilmRunnerSourceInput = {
  source?: unknown
  executor?: { source?: unknown } | null
  package?: { source?: unknown; executorSource?: unknown } | null
} | null | undefined

/**
 * 锁定读取顺序（字段名始终为 source）：
 * project.source → executor.source → package.source / package.executorSource
 * → 本机偏好 film.executorSource → 默认 vps
 */
export function resolveFilmRunnerSource(project?: FilmRunnerSourceInput): FilmRunnerSource {
  if (isFilmRunnerSource(project?.source)) return project.source
  if (isFilmRunnerSource(project?.executor?.source)) return project.executor.source
  if (isFilmRunnerSource(project?.package?.source)) return project.package.source
  if (isFilmRunnerSource(project?.package?.executorSource)) return project.package.executorSource
  const preference = readFilmExecutorSourcePreference()
  if (preference) return preference
  return DEFAULT_FILM_RUNNER_SOURCE
}

/** UI：vps→走 VPS，local→走本机 */
export function filmRunnerSourceLabel(source?: FilmRunnerSource | null) {
  if (source === "local") return "走本机"
  return "走 VPS"
}

/** 本机 worker / analyze 未接线时的明示文案（勿当静默成功）。 */
export function filmLocalRunnerUnavailableLabel() {
  return "本机执行尚未接线"
}

export function selectFilmRunner(
  source: FilmRunnerSource = DEFAULT_FILM_RUNNER_SOURCE,
): FilmRunner {
  if (source === "local") return createGrokCliLocalRunner()
  return createGrokCliVpsRunner()
}

export function getDefaultFilmRunner(): FilmRunner {
  return selectFilmRunner(resolveFilmRunnerSource())
}

export function getFilmRunnerForProject(project?: FilmRunnerSourceInput): FilmRunner {
  return selectFilmRunner(resolveFilmRunnerSource(project))
}
