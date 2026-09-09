import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { studioErrorMessage } from "@/lib/api/client"
import { filmGrokPreflightQueryKey } from "@/lib/api/film"
import {
  currentFilmUserId,
  useFilmCurrentProject,
  useFilmGrokPreflight,
} from "@/hooks/use-film-project"
import { useUserEvents } from "@/hooks/use-user-events"
import {
  subscribeExecutorSourcePreference,
  writeExecutorSourcePreference,
} from "@/lib/executor-source"
import {
  canFilmAnalyze,
  filmAnalyzeGateReason,
  filmGrokAuthLabel,
  filmGrokCheckingLabel,
  mergeFilmGrokStatus,
  type FilmRunnerSource,
} from "@/lib/film-grok-preflight"
import { resolveFilmRunnerSource } from "@/lib/film/runner"
import {
  filmIsAnalyzing,
  filmNextActionMessage,
  isFilmProjectBusy,
} from "@/lib/film-package"
import { FilmFollowPage } from "./film-follow-page"
import { FilmGrokStatus } from "./film-grok-status"
import { FilmProjectSwitcher } from "./film-project-switcher"

const FilmCanvas = lazy(async () => {
  const mod = await import("./film-canvas")
  return { default: mod.FilmCanvas }
})

export function FilmStudio() {
  const [view, setView] = useState<"follow" | "canvas">("follow")
  const [sourceEpoch, setSourceEpoch] = useState(0)
  const queryClient = useQueryClient()

  useEffect(() => {
    return subscribeExecutorSourcePreference(() => {
      setSourceEpoch((value) => value + 1)
      void queryClient.invalidateQueries({ queryKey: filmGrokPreflightQueryKey() })
    })
  }, [queryClient])
  const current = useFilmCurrentProject(true)
  const project = current.data
  const preflight = useFilmGrokPreflight(true, project)
  const error = current.error ? studioErrorMessage(current.error) : ""
  const hint = project ? filmNextActionMessage(project) : ""
  const busy = isFilmProjectBusy(project)
  const grokStatus = mergeFilmGrokStatus(preflight.data, project?.grok)
  const runnerSource = useMemo(
    () => resolveFilmRunnerSource(project),
    // sourceEpoch：偏好写入后强制重读 localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, sourceEpoch],
  )
  const canAnalyze = canFilmAnalyze(grokStatus)
  const loginHint = project?.nextAction?.id === "grok_login" ? project.nextAction.message : ""
  const preflightError = preflight.error ? studioErrorMessage(preflight.error) : ""
  const analyzeGateLabel =
    preflight.isLoading && !grokStatus
      ? filmGrokCheckingLabel(runnerSource)
      : loginHint ||
        preflightError ||
        filmAnalyzeGateReason(grokStatus) ||
        (canAnalyze ? "" : filmGrokAuthLabel(grokStatus))
  const projectLocksSource = Boolean(
    project?.source || project?.executor?.source || project?.package?.source || project?.package?.executorSource,
  )
  const ready = Boolean(currentFilmUserId())
  // VPS 解析中才订 Nest SSE；本机 analyze 不订（断线仍靠 2s poll）
  useUserEvents({
    enabled: ready && filmIsAnalyzing(project) && runnerSource === "vps",
  })

  async function refreshPreflight() {
    const result = await preflight.refetch()
    if (result.error) throw result.error
    return result.data
  }

  function handleRunnerSourceChange(next: FilmRunnerSource) {
    writeExecutorSourcePreference(next)
  }

  return (
    <div className="workspace film">
      <div className="film-toolbar">
        <FilmProjectSwitcher current={project} enabled />
        {hint ? <span className="film-phase">{hint}</span> : null}
        {busy ? <span className="film-phase-busy">进行中</span> : null}
        {view === "follow" ? (
          <button
            type="button"
            className="ghost-btn compact film-view-toggle"
            onClick={() => setView("canvas")}
          >
            打开画布
          </button>
        ) : (
          <button
            type="button"
            className="ghost-btn compact film-view-toggle"
            onClick={() => setView("follow")}
          >
            返回跟拍
          </button>
        )}
        <FilmGrokStatus
          preflight={grokStatus ? { ...grokStatus, source: runnerSource } : grokStatus}
          loading={preflight.isFetching}
          error={preflightError || undefined}
          loginMessage={!canAnalyze ? loginHint : undefined}
          fallbackSource={runnerSource}
          onRecheck={() => {
            void preflight.refetch()
          }}
        />
      </div>
      <div className="film-stage">
        {view === "canvas" ? (
          <Suspense fallback={<p className="film-canvas-fallback">正在打开画布…</p>}>
            <FilmCanvas
              project={project}
              canAnalyze={canAnalyze}
              analyzeGateLabel={analyzeGateLabel}
              refreshPreflight={refreshPreflight}
            />
          </Suspense>
        ) : (
          <FilmFollowPage
            project={project}
            canAnalyze={canAnalyze}
            analyzeGateLabel={analyzeGateLabel}
            grokStatus={grokStatus}
            preflightLoading={preflight.isFetching}
            preflightError={preflightError || undefined}
            loginMessage={loginHint || undefined}
            runnerSource={runnerSource}
            sourceLocked={projectLocksSource}
            onRunnerSourceChange={handleRunnerSourceChange}
            onRecheck={() => {
              void preflight.refetch()
            }}
            refreshPreflight={refreshPreflight}
          />
        )}
        {error ? <p className="film-stage-error">{error}</p> : null}
      </div>
    </div>
  )
}
