import type { FilmGrokPreflight, FilmRunnerSource } from "@/lib/film-grok-preflight"
import { filmRunnerSourceLabel } from "@/lib/film/runner"
import {
  canFilmAnalyze,
  filmGrokAuthKind,
  filmGrokAuthLabel,
  filmGrokCheckingLabel,
  filmGrokDetailText,
  filmGrokEndpointLabel,
  filmGrokMissingCheckLabel,
  filmGrokToolHints,
} from "@/lib/film-grok-preflight"

export function FilmGrokStatus({
  preflight,
  loading,
  error,
  loginMessage,
  fallbackSource,
  onRecheck,
}: {
  preflight?: FilmGrokPreflight
  loading: boolean
  error?: string
  loginMessage?: string
  /** 无 preflight 时仍展示执行端（默认 vps） */
  fallbackSource?: FilmRunnerSource
  onRecheck: () => void
}) {
  const source = preflight?.source ?? fallbackSource
  const kind = filmGrokAuthKind(preflight)
  const label = error
    ? filmGrokMissingCheckLabel(source)
    : loading && !preflight
      ? filmGrokCheckingLabel(source)
      : filmGrokAuthLabel(preflight)
  const detail = loginMessage?.trim() || error || filmGrokDetailText(preflight)
  const hints = filmGrokToolHints(preflight)
  // Checking without a result is neutral — not an auth failure.
  const tone =
    error || (!loading && !canFilmAnalyze(preflight))
      ? "is-bad"
      : loading && !preflight
        ? "is-checking"
        : canFilmAnalyze(preflight)
          ? "is-ok"
          : "is-checking"

  return (
    <div className={`film-grok-status ${tone}`} title={preflight?.bin || undefined}>
      <span className="film-grok-status-label">{label}</span>
      {source ? (
        <span className="film-grok-source" title={filmGrokEndpointLabel(source)}>
          {filmRunnerSourceLabel(source)}
        </span>
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
