import { useEffect, useState } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { useFilmPipelineMutations } from "@/hooks/use-film-project"
import type { FilmCardAction } from "@/lib/film-card"
import {
  canFilmAnalyze,
  filmGrokAuthLabel,
  filmGrokMissingCheckLabel,
  type FilmGrokPreflight,
  type FilmRunnerSource,
} from "@/lib/film-grok-preflight"
import { DEFAULT_FILM_RUNNER_SOURCE, selectFilmRunner } from "@/lib/film/runner"
import { isFilmStageKind } from "@/lib/film-package"

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

  const mutationError = pipeline.addReference.error
    ? studioErrorMessage(pipeline.addReference.error)
    : pipeline.analyze.error
      ? studioErrorMessage(pipeline.analyze.error)
      : pipeline.approve.error
        ? studioErrorMessage(pipeline.approve.error)
        : pipeline.reject.error
          ? studioErrorMessage(pipeline.reject.error)
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
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv)$/i.test(file.name)) {
      setLocalError("请选择视频文件")
      return
    }
    setLocalError("")
    try {
      await pipeline.addReference.mutateAsync({ projectId, file })
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
              setLocalError(analyzeGateLabel || filmGrokAuthLabel(latest))
              return
            }
          } catch {
            setLocalError(filmGrokMissingCheckLabel(runnerSource))
            return
          }
        } else if (!canAnalyze) {
          setLocalError(analyzeGateLabel || filmGrokAuthLabel())
          return
        }
        await pipeline.analyze.mutateAsync({ projectId, refId: action.refId })
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
      if (action.id === "run_local" && !action.disabled && action.stageId && isFilmStageKind(action.stage)) {
        // 本机执行按钮固定走 GrokCli/local；默认拆解仍由项目 source 解析（默认 vps）
        await selectFilmRunner("local").runStage({
          projectId,
          stageId: action.stageId,
          stage: action.stage,
        })
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
  }
}
