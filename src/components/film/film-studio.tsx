import { ReactFlowProvider } from "@xyflow/react"
import { studioErrorMessage } from "@/lib/api/client"
import { useFilmCurrentProject } from "@/hooks/use-film-project"
import { filmNextActionMessage, isFilmProjectBusy } from "@/lib/film-package"
import { FilmCanvas } from "./film-canvas"
import { FilmProjectSwitcher } from "./film-project-switcher"
import "@xyflow/react/dist/style.css"

export function FilmStudio() {
  const current = useFilmCurrentProject(true)
  const project = current.data
  const error = current.error ? studioErrorMessage(current.error) : ""
  const hint = project ? filmNextActionMessage(project) : ""
  const busy = isFilmProjectBusy(project)

  return (
    <div className="workspace film">
      <div className="film-toolbar">
        <FilmProjectSwitcher current={project} enabled />
        {hint ? <span className="film-phase">{hint}</span> : null}
        {busy ? <span className="film-phase-busy">进行中</span> : null}
      </div>
      <div className="film-stage">
        <ReactFlowProvider>
          <FilmCanvas project={project} />
        </ReactFlowProvider>
        {error ? <p className="film-stage-error">{error}</p> : null}
      </div>
    </div>
  )
}
