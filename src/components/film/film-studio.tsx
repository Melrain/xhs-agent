import { lazy, Suspense, useState } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { useFilmCurrentProject, useFilmGrokPreflight } from "@/hooks/use-film-project"
import {
  canFilmAnalyze,
  filmGrokAuthLabel,
  filmGrokCheckingLabel,
  mergeFilmGrokStatus,
} from "@/lib/film-grok-preflight"
import { resolveFilmRunnerSource } from "@/lib/film/runner"
import { filmNextActionMessage, isFilmProjectBusy } from "@/lib/film-package"
import { FilmFollowPage } from "./film-follow-page"
import { FilmGrokStatus } from "./film-grok-status"
import { FilmProjectSwitcher } from "./film-project-switcher"

const FilmCanvas = lazy(async () => {
  const mod = await import("./film-canvas")
  return { default: mod.FilmCanvas }
})

export function FilmStudio() {
  const [view, setView] = useState<"follow" | "canvas">("follow")
  const current = useFilmCurrentProject(true)
  const project = current.data
  const preflight = useFilmGrokPreflight(true, project)
  const error = current.error ? studioErrorMessage(current.error) : ""
  const hint = project ? filmNextActionMessage(project) : ""
  const busy = isFilmProjectBusy(project)
  const grokStatus = mergeFilmGrokStatus(preflight.data, project?.grok)
  const runnerSource = resolveFilmRunnerSource(project)
  const canAnalyze = canFilmAnalyze(grokStatus)
  const loginHint = project?.nextAction?.id === "grok_login" ? project.nextAction.message : ""
  const preflightError = preflight.error ? studioErrorMessage(preflight.error) : ""
  const analyzeGateLabel =
    preflight.isLoading && !grokStatus
      ? filmGrokCheckingLabel(runnerSource)
      : loginHint || preflightError || (canAnalyze ? "" : filmGrokAuthLabel(grokStatus))

  async function refreshPreflight() {
    const result = await preflight.refetch()
    if (result.error) throw result.error
    return result.data
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
          preflight={grokStatus}
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
