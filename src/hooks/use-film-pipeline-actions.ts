import { useEffect, useState } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { useFilmPipelineMutations } from "@/hooks/use-film-project"
import type { FilmCardAction } from "@/lib/film-card"
import {
  canFilmAnalyze,
  filmAnalyzeGateReason,
  filmGrokAuthLabel,
  filmGrokMissingCheckLabel,
  type FilmGrokPreflight,
  type FilmRunnerSource,
} from "@/lib/film-grok-preflight"
import {
  DEFAULT_FILM_RUNNER_SOURCE,
  filmLocalRunnerUnavailableLabel,
  selectFilmRunner,
} from "@/lib/film/runner"
import { cacheFilmLocalMediaFile } from "@/lib/film/providers/grok-cli/local"
import { isTauriRuntime } from "@/lib/api/desktop-fetch"
import { isFilmStageKind, isFilmVideoFile } from "@/lib/film-package"

/** Nest 无媒体等错误原样透出；缺媒体时强调先上传。 */
function filmPipelineErrorMessage(error: unknown) {
  const message = studioErrorMessage(error)
  if (message.includes("需上传视频文件")) {
    return "需上传视频文件。请优先用「上传视频」，不要只贴链接。"
  }
  return message
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function useFilmPipelineActions({
  projectId,
  canAnalyze,
  analyzeGateLabel,
  refreshPreflight,
  runnerSource = DEFAULT_FILM_RUNNER_SOURCE,
}: {
  projectId?: string
  canAnalyze: boolean
  analyzeGateLabel: string
  refreshPreflight?: () => Promise<FilmGrokPreflight | undefined>
  runnerSource?: FilmRunnerSource
}) {
  const pipeline = useFilmPipelineMutations()
  const [localError, setLocalError] = useState("")
  const effectiveSource = runnerSource

  const mutationError = pipeline.addReference.error
    ? filmPipelineErrorMessage(pipeline.addReference.error)
    : pipeline.analyze.error
      ? filmPipelineErrorMessage(pipeline.analyze.error)
      : pipeline.approve.error
        ? filmPipelineErrorMessage(pipeline.approve.error)
        : pipeline.reject.error
          ? filmPipelineErrorMessage(pipeline.reject.error)
          : ""
  const error = localError || mutationError

  useEffect(() => {
    setLocalError("")
  }, [projectId])

  async function submitUrl(raw: string) {
    if (!projectId) return
    const url = raw.trim()
    if (!isHttpUrl(url)) {
      setLocalError("请贴有效的视频链接")
      return
    }
    setLocalError("")
    try {
      await pipeline.addReference.mutateAsync({ projectId, url })
    } catch {
      // 页面/卡片下方会显示接口错误
    }
  }

  async function submitFile(file: File) {
    if (!projectId) return
    if (!isFilmVideoFile(file)) {
      setLocalError("请上传视频文件（上传优先）。")
      return
    }
    setLocalError("")
    try {
      // Ingest only (Nest → R2 + mediaUrl). Do NOT chain analyze/breakdown here —
      // user clicks「解析」on the reference card when nextAction is run_breakdown.
      const project = await pipeline.addReference.mutateAsync({ projectId, file })
      // Optional: cache a local disk copy for source=local analyze. Nest mediaUrl
      // (R2 presign) is enough for preview + VPS analyze; local runner prefers disk.
      if (isTauriRuntime()) {
        const uploads = [...(project.package?.references ?? [])]
          .filter((row) => row.source === "upload" && row.status === "ready")
          .reverse()
        const newest = uploads[0]
        if (newest?.id) {
          try {
            await cacheFilmLocalMediaFile(projectId, newest.id, file)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            // Soft warning: R2 mediaUrl still allows preview / VPS; local path only needed for local.
            setLocalError(`本机缓存视频失败：${message}（云端预览仍可用；本机拆解前请重试上传）`)
          }
        }
      }
    } catch {
      // 页面/卡片下方会显示接口错误
    }
  }

  async function runAction(action: FilmCardAction) {
    if (!projectId) return
    setLocalError("")
    try {
      if (action.id === "analyze" && action.refId) {
        if (refreshPreflight) {
          try {
            const latest = await refreshPreflight()
            if (!canFilmAnalyze(latest)) {
              setLocalError(
                analyzeGateLabel ||
                  filmAnalyzeGateReason(latest) ||
                  filmGrokAuthLabel(latest),
              )
              return
            }
          } catch {
            setLocalError(filmGrokMissingCheckLabel(effectiveSource))
            return
          }
        } else if (!canAnalyze) {
          setLocalError(analyzeGateLabel || filmGrokAuthLabel())
          return
        }
        const analyzed = await pipeline.analyze.mutateAsync({
          projectId,
          refId: action.refId,
        })
        if (analyzed.writebackError) {
          setLocalError(
            `拆解写回失败（未持久化到 Nest）：${analyzed.writebackError}`,
          )
        }
        return
      }
      if (action.id === "approve" && action.stageId) {
        await pipeline.approve.mutateAsync({ projectId, stageId: action.stageId })
        return
      }
      if (action.id === "reject" && action.stageId) {
        await pipeline.reject.mutateAsync({ projectId, stageId: action.stageId })
        return
      }
      if (action.id === "run_local") {
        if (action.disabled || !action.stageId || !isFilmStageKind(action.stage)) {
          setLocalError(filmLocalRunnerUnavailableLabel())
          return
        }
        // 本机执行按钮固定走 GrokCli/local；未接线时 runner 会显式 throw。
        await selectFilmRunner("local").runStage({
          projectId,
          stageId: action.stageId,
          stage: action.stage,
        })
        return
      }
    } catch {
      // 页面/卡片下方会显示接口错误
    }
  }

  return {
    error,
    ingestBusy: pipeline.addReference.isPending,
    analyzeBusy: pipeline.analyze.isPending,
    reviewBusy: pipeline.approve.isPending || pipeline.reject.isPending,
    submitUrl,
    submitFile,
    runAction,
    runnerSource: effectiveSource,
  }
}
