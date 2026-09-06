import { ReactFlowProvider } from "@xyflow/react"
import { studioErrorMessage } from "@/lib/api/client"
import { useFilmCurrentProject } from "@/hooks/use-film-project"
import { filmPhaseLabel } from "@/lib/film-package"
import { FilmCanvas } from "./film-canvas"
import { FilmComposer } from "./film-composer"
import { FilmProjectSwitcher } from "./film-project-switcher"
import "@xyflow/react/dist/style.css"

export function FilmStudio() {
  const current = useFilmCurrentProject(true)
  const project = current.data
  const error = current.error ? studioErrorMessage(current.error) : ""
  const phase = filmPhaseLabel(project?.phase)

  return (
    <div className="workspace film">
      <div className="film-toolbar">
        <FilmProjectSwitcher current={project} enabled />
        {phase ? <span className="film-phase">{phase}</span> : null}
      </div>
      <div className="film-stage">
        <ReactFlowProvider>
          <FilmCanvas project={project} />
        </ReactFlowProvider>
        {error ? <p className="film-stage-error">{error}</p> : null}
        <FilmComposer project={project} />
      </div>
    </div>
  )
}
