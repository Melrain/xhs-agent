import type { FilmGrokPreflight } from "@/lib/film-grok-preflight"
import { filmRunnerSourceLabel } from "@/lib/film/runner"
import {
  canFilmAnalyze,
  filmGrokAuthKind,
  filmGrokAuthLabel,
  filmGrokDetailText,
  filmGrokToolHints,
} from "@/lib/film-grok-preflight"

export function FilmGrokStatus({
  preflight,
  loading,
  error,
  loginMessage,
  onRecheck,
}: {
  preflight?: FilmGrokPreflight
  loading: boolean
  error?: string
  loginMessage?: string
  onRecheck: () => void
}) {
  const kind = filmGrokAuthKind(preflight)
  const label = error ? "未检查到本机 grok" : loading && !preflight ? "正在检查本机 grok…" : filmGrokAuthLabel(preflight)
  const detail = loginMessage?.trim() || error || filmGrokDetailText(preflight)
  const hints = filmGrokToolHints(preflight)
  const tone = error || !canFilmAnalyze(preflight) ? "is-bad" : "is-ok"

  return (
    <div className={`film-grok-status ${tone}`} title={preflight?.bin || undefined}>
      <span className="film-grok-status-label">{label}</span>
      {preflight?.source ? (
        <span className="film-grok-source">{filmRunnerSourceLabel(preflight.source)}</span>
      ) : null}
      {kind === "ok" ? null : (
        <span className="sr-only">
          {kind === "missing" ? "请先安装 grok" : "请在终端执行 grok login"}
        </span>
      )}
      {detail ? <span className="film-grok-status-detail">{detail}</span> : null}
      {hints.map((hint) => (
        <span key={hint} className="film-grok-hint">
          {hint}
        </span>
      ))}
      <button type="button" className="film-grok-recheck" disabled={loading} onClick={onRecheck}>
        再检查
      </button>
    </div>
  )
}
