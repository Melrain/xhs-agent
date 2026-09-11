import { useMemo } from "react"
import type { FilmProject } from "@/lib/api/film"
import { useFilmPipelineActions } from "@/hooks/use-film-pipeline-actions"
import type { FilmCard, FilmCardData } from "@/lib/film-card"
import {
  canFilmAnalyze,
  filmAnalyzeGateReason,
  filmGrokAuthLabel,
  filmGrokCheckingLabel,
  filmGrokEndpointLabel,
  filmGrokReadyLabel,
  type FilmGrokPreflight,
  type FilmRunnerSource,
} from "@/lib/film-grok-preflight"
import {
  DEFAULT_FILM_RUNNER_SOURCE,
  filmRunnerSourceLabel,
} from "@/lib/film/runner"
import {
  filmAnalyzeMetaOf,
  filmAnalyzeMetaStatusLines,
  filmAnalyzingRefId,
  filmStageByKind,
  filmPackageOf,
  isFilmAnalyzeMetaStubOrBlocked,
  isFilmProjectBusy,
} from "@/lib/film-package"
import { filmFollowCards } from "@/lib/film-pipeline"
import { ExecutorSourceSwitch } from "@/components/ExecutorSourceSwitch"
import { FilmCardArticle } from "./film-card-article"
import { FilmGrokStatus } from "./film-grok-status"

function cardBusy(
  card: FilmCard,
  ingestBusy: boolean,
  analyzeBusy: boolean,
  reviewBusy: boolean,
  analyzingRefId?: string,
) {
  return (
    Boolean(card.busy) ||
    (card.kind === "reference" && (ingestBusy || analyzeBusy)) ||
    (card.kind === "breakdown" && (analyzeBusy || reviewBusy || Boolean(analyzingRefId)))
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
  runnerSource = DEFAULT_FILM_RUNNER_SOURCE,
  sourceLocked = false,
  onRunnerSourceChange,
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
  runnerSource?: FilmRunnerSource
  /** 项目锁定了 source 时，偏好切换仅作提示 */
  sourceLocked?: boolean
  onRunnerSourceChange?: (source: FilmRunnerSource) => void
  onRecheck: () => void
  refreshPreflight?: () => Promise<FilmGrokPreflight | undefined>
}) {
  const actions = useFilmPipelineActions({
    projectId: project?.id,
    canAnalyze,
    analyzeGateLabel,
    refreshPreflight,
    runnerSource,
  })
  const cards = useMemo(
    () =>
      filmFollowCards(project, {}, {
        canAnalyze,
        canGenerate: false,
        analyzeGateLabel,
        followVerifyOnly: true,
      }).cards,
    [analyzeGateLabel, canAnalyze, project],
  )
  const source = runnerSource
  const endpointLabel = filmGrokEndpointLabel(source)
  const grokLogin = project?.nextAction?.id === "grok_login"
  const checkingGrok = preflightLoading && !grokStatus
  const gateReason = analyzeGateLabel || filmAnalyzeGateReason(grokStatus)
  const needsLogin = !checkingGrok && (grokLogin || !canFilmAnalyze(grokStatus))
  const analyzingRefId = filmAnalyzingRefId(project)
  const pkg = filmPackageOf(project)
  const breakdownRunning = filmStageByKind(pkg, "breakdown")?.status === "running"
  const packageBusy = isFilmProjectBusy(project)
  const analyzeRunning =
    actions.analyzeBusy || Boolean(analyzingRefId) || breakdownRunning
  const preflightRunning = preflightLoading
  const analyzeMeta = filmAnalyzeMetaOf(project)
  const analyzeMetaLines = filmAnalyzeMetaStatusLines(analyzeMeta)
  const analyzeStubOrBlocked = isFilmAnalyzeMetaStubOrBlocked(analyzeMeta)

  const briefCards = cards.filter((card) => card.kind === "brief")
  const referenceCards = cards.filter((card) => card.kind === "reference")
  const breakdownCards = cards.filter((card) => card.kind === "breakdown")

  function renderCard(card: FilmCard) {
    const busy = cardBusy(
      card,
      actions.ingestBusy,
      analyzeRunning,
      actions.reviewBusy,
      analyzingRefId,
    )
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

  function selectSource(next: FilmRunnerSource) {
    if (sourceLocked || next === source) return
    onRunnerSourceChange?.(next)
  }

  return (
    <div className="film-follow">
      <div className="film-follow-stack">
        <header className="film-follow-intro">
          <p className="film-follow-kicker">爆款复制 · 跟拍核对</p>
          <h2>跟拍参考片</h2>
          <p>
            {`只验证拆解：上传优先：先传视频 → 检查 ${endpointLabel}（${filmRunnerSourceLabel(source)}）→ 核对镜号 / 画面 / 对白。本机可切换；走本机时用本机 grok / ffmpeg / whisper 真实拆解。剧本与后续生成先收起。`}
          </p>
          <ExecutorSourceSwitch
            className="film-follow-source-pin"
            value={source}
            locked={sourceLocked}
            platform="desktop"
            onChange={selectSource}
          />
        </header>

        {briefCards.map(renderCard)}
        {referenceCards.map(renderCard)}

        <section className="film-follow-preflight" aria-label={endpointLabel}>
          <div className="film-card-meta">
            <span className="film-card-kind">{endpointLabel}</span>
            {preflightRunning ? <span className="film-card-status">检查中</span> : null}
            {grokLogin ? <span className="film-card-status">请先 grok login</span> : null}
          </div>
          <h3>
            {checkingGrok
              ? filmGrokCheckingLabel(source)
              : needsLogin
                ? "先登录再拆解"
                : canAnalyze
                  ? filmGrokReadyLabel(source)
                  : "暂不可拆解"}
          </h3>
          <p>
            {loginMessage ||
              (checkingGrok
                ? filmGrokCheckingLabel(source)
                : preflightError ||
                  (canAnalyze
                    ? source === "local"
                      ? "可以拆解参考片（本机）。没有可拆解媒体时请先上传视频（上传优先）。"
                      : "可以拆解参考片（VPS）。没有可拆解媒体时请先上传视频（上传优先）。"
                    : gateReason || filmGrokAuthLabel(grokStatus)))}
          </p>
          {analyzeRunning ? (
            <p className="film-follow-running" role="status">
              正在拆解参考片…
              {analyzingRefId ? `（ref ${analyzingRefId}）` : ""}
              {breakdownRunning ? " · 拆解阶段 running" : ""}
              {actions.analyzeBusy ? " · 请求进行中" : ""}
            </p>
          ) : null}
          {packageBusy && !analyzeRunning && !actions.ingestBusy ? (
            <p className="film-follow-running" role="status">
              制作包处理中…
            </p>
          ) : null}
          {analyzeMetaLines.length > 0 ? (
            <div
              className={`film-follow-analyze-meta${analyzeStubOrBlocked ? " is-blocked" : ""}`}
              role="status"
            >
              <p className="film-follow-analyze-meta-title">
                {analyzeStubOrBlocked ? "拆解结果需注意（非完整真实拆解）" : "拆解状态"}
              </p>
              <ul>
                {analyzeMetaLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <FilmGrokStatus
            preflight={grokStatus ? { ...grokStatus, source } : grokStatus}
            loading={preflightLoading}
            error={preflightError}
            loginMessage={!canAnalyze ? loginMessage : undefined}
            fallbackSource={source}
            onRecheck={onRecheck}
          />
        </section>

        {breakdownCards.length > 0 ? (
          <section className="film-follow-breakdown" aria-label="拆解核对">
            <h3 className="film-follow-section-title">拆解核对 · 镜号 / 画面 / 对白</h3>
            {analyzeStubOrBlocked ? (
              <p className="film-follow-analyze-warn">
                当前为演示或已阻塞结果，请勿当作完整真实拆解。
              </p>
            ) : null}
            {breakdownCards.map(renderCard)}
          </section>
        ) : (
          breakdownCards.map(renderCard)
        )}
      </div>
      {actions.error ? (
        <p className="film-stage-error" role="alert">
          {actions.error}
        </p>
      ) : null}
    </div>
  )
}
