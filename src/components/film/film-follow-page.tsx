import { useMemo } from "react"
import type { FilmProject } from "@/lib/api/film"
import { useFilmPipelineActions } from "@/hooks/use-film-pipeline-actions"
import type { FilmCard, FilmCardData } from "@/lib/film-card"
import {
  canFilmAnalyze,
  filmGrokAuthLabel,
  type FilmGrokPreflight,
} from "@/lib/film-grok-preflight"
import { filmFollowCards } from "@/lib/film-pipeline"
import { FilmCardArticle } from "./film-card-article"
import { FilmGrokStatus } from "./film-grok-status"

function cardBusy(
  card: FilmCard,
  ingestBusy: boolean,
  analyzeBusy: boolean,
  reviewBusy: boolean,
) {
  return (
    Boolean(card.busy) ||
    (card.kind === "reference" && (ingestBusy || analyzeBusy)) ||
    (card.kind === "breakdown" && (analyzeBusy || reviewBusy))
  )
}

function toCardData(
  card: FilmCard,
  extras: Pick<FilmCardData, "busy" | "onIngestUrl" | "onIngestFile" | "onAction">,
): FilmCardData {
  return {
    kind: card.kind,
    title: card.title,
    body: card.body,
    locked: card.locked,
    placeholder: card.placeholder,
    ingest: card.ingest,
    statusLabel: card.statusLabel,
    badge: card.badge,
    mediaUrl: card.mediaUrl,
    actions: card.actions,
    ...extras,
  }
}

export function FilmFollowPage({
  project,
  canAnalyze = false,
  analyzeGateLabel = "",
  grokStatus,
  preflightLoading,
  preflightError,
  loginMessage,
  onRecheck,
  refreshPreflight,
}: {
  project?: FilmProject
  canAnalyze?: boolean
  analyzeGateLabel?: string
  grokStatus?: FilmGrokPreflight
  preflightLoading: boolean
  preflightError?: string
  loginMessage?: string
  onRecheck: () => void
  refreshPreflight?: () => Promise<FilmGrokPreflight | undefined>
}) {
  const actions = useFilmPipelineActions({
    projectId: project?.id,
    canAnalyze,
    analyzeGateLabel,
    refreshPreflight,
  })
  const cards = useMemo(
    () =>
      filmFollowCards(project, {}, {
        canAnalyze,
        canGenerate: canAnalyze,
        analyzeGateLabel,
      }).cards,
    [analyzeGateLabel, canAnalyze, project],
  )
  const grokLogin = project?.nextAction?.id === "grok_login"
  const checkingGrok = preflightLoading && !grokStatus
  const needsLogin = !checkingGrok && (grokLogin || !canFilmAnalyze(grokStatus))

  const briefCards = cards.filter((card) => card.kind === "brief")
  const referenceCards = cards.filter((card) => card.kind === "reference")
  const breakdownCards = cards.filter((card) => card.kind === "breakdown")
  const scriptCards = cards.filter((card) => card.kind === "script")

  function renderCard(card: FilmCard) {
    const busy = cardBusy(card, actions.ingestBusy, actions.analyzeBusy, actions.reviewBusy)
    return (
      <FilmCardArticle
        key={card.id}
        data={toCardData(card, {
          busy,
          onIngestUrl: (url) => {
            void actions.submitUrl(url)
          },
          onIngestFile: (file) => {
            void actions.submitFile(file)
          },
          onAction: (action) => {
            void actions.runAction(action)
          },
        })}
      />
    )
  }

  return (
    <div className="film-follow">
      <div className="film-follow-stack">
        <header className="film-follow-intro">
          <p className="film-follow-kicker">爆款复制</p>
          <h2>跟拍参考片</h2>
          <p>先导入参考片、检查本机 grok，再核对拆解。剧本先占位。无限画布是入口，不挡这条跟拍。</p>
        </header>

        {briefCards.map(renderCard)}
        {referenceCards.map(renderCard)}

        <section className="film-follow-preflight" aria-label="本机 grok">
          <div className="film-card-meta">
            <span className="film-card-kind">本机 grok</span>
            {grokLogin ? <span className="film-card-status">请先 grok login</span> : null}
          </div>
          <h3>
            {checkingGrok ? "正在检查本机 grok…" : needsLogin ? "先登录再拆解" : "本机 grok 已就绪"}
          </h3>
          <p>
            {loginMessage ||
              (preflightLoading && !grokStatus
                ? "正在检查本机 grok…"
                : preflightError ||
                  (canAnalyze ? "可以拆解参考片。" : analyzeGateLabel || filmGrokAuthLabel(grokStatus)))}
          </p>
          <FilmGrokStatus
            preflight={grokStatus}
            loading={preflightLoading}
            error={preflightError}
            loginMessage={!canAnalyze ? loginMessage : undefined}
            onRecheck={onRecheck}
          />
        </section>

        {breakdownCards.map(renderCard)}
        {scriptCards.map(renderCard)}
      </div>
      {actions.error ? <p className="film-stage-error">{actions.error}</p> : null}
    </div>
  )
}
