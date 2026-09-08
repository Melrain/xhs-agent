import { ReactFlowProvider } from "@xyflow/react"
import { studioErrorMessage } from "@/lib/api/client"
import { useFilmCurrentProject, useFilmGrokPreflight } from "@/hooks/use-film-project"
import { canFilmAnalyze, filmGrokAuthLabel } from "@/lib/film-grok-preflight"
import { filmNextActionMessage, isFilmProjectBusy } from "@/lib/film-package"
import { FilmCanvas } from "./film-canvas"
import { FilmGrokStatus } from "./film-grok-status"
import { FilmProjectSwitcher } from "./film-project-switcher"
import "@xyflow/react/dist/style.css"

export function FilmStudio() {
  const current = useFilmCurrentProject(true)
  const preflight = useFilmGrokPreflight(true)
  const project = current.data
  const error = current.error ? studioErrorMessage(current.error) : ""
  const hint = project ? filmNextActionMessage(project) : ""
  const busy = isFilmProjectBusy(project)
  const preflightError = preflight.error ? studioErrorMessage(preflight.error) : ""

  return (
    <div className="workspace film">
      <div className="film-toolbar">
        <FilmProjectSwitcher current={project} enabled />
        {hint ? <span className="film-phase">{hint}</span> : null}
        {busy ? <span className="film-phase-busy">进行中</span> : null}
        <FilmGrokStatus
          preflight={preflight.data}
          loading={preflight.isFetching}
          error={preflightError || undefined}
          onRecheck={() => {
            void preflight.refetch()
          }}
        />
      </div>
      <div className="film-stage">
        <ReactFlowProvider>
          <FilmCanvas
            project={project}
            canAnalyze={canFilmAnalyze(preflight.data)}
            analyzeGateLabel={
              preflight.isLoading && !preflight.data
                ? "正在检查本机 grok…"
                : preflightError || (canFilmAnalyze(preflight.data) ? "" : filmGrokAuthLabel(preflight.data))
            }
            refreshPreflight={async () => {
              const result = await preflight.refetch()
              if (result.error) throw result.error
              return result.data
            }}
          />
        </ReactFlowProvider>
        {error ? <p className="film-stage-error">{error}</p> : null}
      </div>
    </div>
  )
}
