import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { FilmProject } from "@/lib/api/film"
import { useFilmPipelineActions } from "@/hooks/use-film-pipeline-actions"
import type { FilmCard, FilmCardAction, FilmCardData } from "@/lib/film-card"
import {
  canFilmAnalyze,
  filmAnalyzeGateReason,
  filmGrokAuthLabel,
  filmGrokEndpointLabel,
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
  filmNextActionMessage,
  filmPackageOf,
  filmReferenceHasParseableMedia,
  filmStageByKind,
  isFilmAnalyzeMetaStubOrBlocked,
  isFilmProjectBusy,
  type FilmReference,
} from "@/lib/film-package"
import { filmFollowCards } from "@/lib/film-pipeline"
import { ExecutorSourceSwitch } from "@/components/ExecutorSourceSwitch"
import { FilmCardArticle } from "./film-card-article"
import { FilmGrokStatus } from "./film-grok-status"
import { FilmIngestForm } from "./film-ingest-form"

const FOLLOW_ANCHORS = [
  { id: "upload" as const, name: "上传" },
  { id: "parse" as const, name: "解析" },
  { id: "breakdown" as const, name: "拆解" },
  { id: "script" as const, name: "剧本" },
]

type FollowAnchorId = (typeof FOLLOW_ANCHORS)[number]["id"]

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

function primaryReference(project?: FilmProject): FilmReference | undefined {
  return filmPackageOf(project).references[0]
}

function followDoneAnchors({
  step1Ok,
  analyzing,
  hasBreakdown,
}: {
  step1Ok: boolean
  analyzing: boolean
  hasBreakdown: boolean
}) {
  const done = new Set<FollowAnchorId>()
  if (step1Ok) done.add("upload")
  if (analyzing || hasBreakdown) done.add("parse")
  if (hasBreakdown) done.add("breakdown")
  return done
}

function inferActiveAnchor({
  step1Ok,
  analyzing,
  hasBreakdown,
}: {
  step1Ok: boolean
  analyzing: boolean
  hasBreakdown: boolean
}): FollowAnchorId {
  if (!step1Ok) return "upload"
  if (analyzing) return "parse"
  if (hasBreakdown) return "breakdown"
  return "parse"
}

function ProgressRail({
  active,
  done,
  onSelect,
}: {
  active: FollowAnchorId
  done: ReadonlySet<FollowAnchorId>
  onSelect: (id: FollowAnchorId) => void
}) {
  return (
    <div className="film-follow-progress-rail">
      <nav aria-label="跟拍进度" className="film-follow-progress-nav">
        {FOLLOW_ANCHORS.map((anchor, index) => {
          const isCurrent = anchor.id === active
          const isDone = done.has(anchor.id)
          return (
            <span key={anchor.id} className="film-follow-progress-item">
              {index > 0 ? (
                <span className="film-follow-progress-sep" aria-hidden>
                  ›
                </span>
              ) : null}
              <button
                type="button"
                className={`film-follow-progress-btn${isCurrent ? " is-current" : ""}${isDone && !isCurrent ? " is-done" : ""}`}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => onSelect(anchor.id)}
              >
                <span className="film-follow-progress-index">
                  {isCurrent ? "●" : isDone ? "✓" : index + 1}
                </span>
                <span>{anchor.name}</span>
              </button>
            </span>
          )
        })}
      </nav>
    </div>
  )
}

function StageBlock({
  id,
  title,
  meta,
  highlight,
  children,
}: {
  id: string
  title: string
  meta?: string
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className={`film-follow-stage is-dense${highlight ? " is-ring" : ""}`}
    >
      <div className="film-follow-stage-head">
        <h2>{title}</h2>
        {meta ? <span className="film-follow-stage-meta">{meta}</span> : null}
      </div>
      {children}
    </section>
  )
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

  const reference = primaryReference(project)
  const hasReference = Boolean(reference)
  const hasMedia = Boolean(reference && filmReferenceHasParseableMedia(reference))
  const pipelineError = Boolean(actions.error?.trim())
  const step1Ok =
    Boolean(reference) &&
    reference?.status === "ready" &&
    hasMedia &&
    !pipelineError
  const hasBreakdown = pkg.breakdown.length > 0
  const preflightReady = canAnalyze && !preflightError && !checkingGrok

  const briefCards = cards.filter((card) => card.kind === "brief")
  const breakdownCards = cards.filter((card) => card.kind === "breakdown")

  const [swapOpen, setSwapOpen] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(hasBreakdown)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [ringId, setRingId] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrolledToBreakdown = useRef(false)

  const done = followDoneAnchors({
    step1Ok,
    analyzing: analyzeRunning,
    hasBreakdown,
  })
  const active = inferActiveAnchor({
    step1Ok,
    analyzing: analyzeRunning,
    hasBreakdown,
  })

  useEffect(() => {
    if (hasBreakdown) setBreakdownOpen(true)
  }, [hasBreakdown])

  useEffect(() => {
    scrolledToBreakdown.current = false
  }, [project?.id])

  useEffect(() => {
    if (!hasBreakdown || scrolledToBreakdown.current) return
    scrolledToBreakdown.current = true
    const t = setTimeout(() => {
      document
        .getElementById("breakdown")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 120)
    return () => clearTimeout(t)
  }, [hasBreakdown])

  useEffect(
    () => () => {
      if (ringTimer.current) clearTimeout(ringTimer.current)
    },
    [],
  )

  function scrollToAnchor(id: FollowAnchorId | "preview") {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
    if (ringTimer.current) clearTimeout(ringTimer.current)
    setRingId(id)
    ringTimer.current = setTimeout(() => setRingId(null), 900)
  }

  function selectSource(next: FilmRunnerSource) {
    if (sourceLocked || next === source) return
    onRunnerSourceChange?.(next)
  }

  function renderBreakdownCard(card: FilmCard) {
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
          onAction: (action) => {
            void actions.runAction(action)
          },
        })}
      />
    )
  }

  const readyBar = Boolean(reference && step1Ok && hasMedia && !swapOpen)
  const canStartAnalyze =
    step1Ok &&
    hasMedia &&
    preflightReady &&
    canAnalyze &&
    !analyzeRunning &&
    !pipelineError &&
    !actions.ingestBusy &&
    Boolean(reference?.id)

  let analyzeDisabledReason = ""
  if (analyzeRunning) {
    analyzeDisabledReason = ""
  } else if (!step1Ok || !reference) {
    analyzeDisabledReason = "请先上传参考视频。"
  } else if (!hasMedia) {
    analyzeDisabledReason = "需上传视频文件后才能解析。"
  } else if (pipelineError) {
    analyzeDisabledReason = actions.error?.trim() || "参考未就绪，请修复后再解析。"
  } else if (checkingGrok || preflightRunning) {
    analyzeDisabledReason = "预检进行中，稍候再解析。"
  } else if (preflightError || !preflightReady || !canAnalyze) {
    analyzeDisabledReason = "预检未通过，暂不能解析（不跳页，修好后再点）。"
  }

  const primaryLabel = analyzeRunning
    ? "解析中…"
    : hasBreakdown
      ? "重新解析"
      : "解析"

  function runPrimaryAnalyze() {
    if (!reference?.id || !canStartAnalyze) return
    const action: FilmCardAction = {
      id: "analyze",
      label: primaryLabel,
      variant: "primary",
      refId: reference.id,
    }
    void actions.runAction(action)
  }

  const guidance = resolveGuidance({
    project,
    step1Ok,
    hasReference,
    hasMedia,
    pipelineError,
    pipelineErrorMessage: actions.error,
    hasBreakdown,
    analyzing: analyzeRunning,
  })

  const preflightTone = preflightError
    ? "bad"
    : preflightReady
      ? "ok"
      : checkingGrok || preflightRunning
        ? "warn"
        : "bad"
  const preflightSummary = preflightError
    ? "查不到预检"
    : checkingGrok || preflightRunning
      ? "预检中"
      : preflightReady
        ? "可过"
        : needsLogin
          ? "未登录"
          : gateReason || filmGrokAuthLabel(grokStatus) || "未就绪"

  const statusSummary = (
    <div className="film-follow-status-inner">
      <div className={`film-follow-status-card${preflightTone === "warn" ? " is-warn" : ""}`}>
        <div className="film-follow-status-card-head">
          <h3>预检</h3>
          <span className={`film-follow-status-pill is-${preflightTone}`}>
            {preflightSummary}
          </span>
        </div>
        <dl className="film-follow-preflight-layers">
          <div>
            <dt>综合结论</dt>
            <dd className={`is-${preflightTone}`}>{preflightSummary}</dd>
          </div>
          <div>
            <dt>调度策略</dt>
            <dd className="is-muted">{filmRunnerSourceLabel(source)}</dd>
          </div>
          <div>
            <dt>解析放行</dt>
            <dd className={analyzeRunning ? "is-warn" : preflightReady ? "is-ok" : "is-muted"}>
              {analyzeRunning ? "正在解析影片…" : preflightReady ? "待命" : "未放行"}
            </dd>
          </div>
        </dl>
        <p className="film-follow-status-note">
          预检只挡解析，不挡参考读入。主操作在中部预览下的「解析」。
        </p>
        <ExecutorSourceSwitch
          className="film-follow-source-pin"
          value={source}
          locked={sourceLocked}
          platform="desktop"
          onChange={selectSource}
        />
        <FilmGrokStatus
          preflight={grokStatus ? { ...grokStatus, source } : grokStatus}
          loading={preflightLoading}
          error={preflightError}
          loginMessage={!canAnalyze ? loginMessage : undefined}
          fallbackSource={source}
          onRecheck={onRecheck}
        />
      </div>

      <div className="film-follow-status-card">
        <div className="film-follow-status-card-head">
          <h3>下一步指引</h3>
        </div>
        <p className="film-follow-guidance">{guidance}</p>
        {analyzeRunning ? (
          <p className="film-follow-running" role="status">
            正在解析影片…
            {analyzingRefId ? `（ref ${analyzingRefId}）` : ""}
          </p>
        ) : null}
        {packageBusy && !analyzeRunning && !actions.ingestBusy ? (
          <p className="film-follow-running" role="status">
            制作包处理中…
          </p>
        ) : null}
        {(!step1Ok || !hasMedia) && (hasReference || pipelineError) ? (
          <p className="film-follow-status-warn">
            {!hasMedia && hasReference
              ? "当前参考没有可解析媒体，请上传视频文件。"
              : "参考未就绪时不要进入拆解，请先上传视频。"}
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
        {hasBreakdown ? (
          <button
            type="button"
            className="film-follow-link"
            onClick={() => {
              setStatusOpen(false)
              scrollToAnchor("breakdown")
            }}
          >
            去看拆解
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="film-follow">
      <div className="film-follow-layout">
        <div className="film-follow-main">
          <ProgressRail
            active={active}
            done={done}
            onSelect={(anchor) => scrollToAnchor(anchor)}
          />
          <div className="film-follow-center">
            <div
              className={`film-follow-river${hasBreakdown ? " is-wide" : ""}`}
            >
              <header className="film-follow-intro">
                <p className="film-follow-kicker">爆款复制 · 跟拍核对</p>
                <h2>跟拍参考片</h2>
                <p>
                  {`只验证拆解：上传 → 预览 → 检查 ${endpointLabel}（${filmRunnerSourceLabel(source)}）→ 点击预览下的「解析」→ 核对镜号 / 画面 / 对白。上传后不会自动解析。剧本与后续生成先收起。`}
                </p>
              </header>

              {briefCards.map((card) => (
                <FilmCardArticle
                  key={card.id}
                  data={toCardData(card, { busy: false })}
                />
              ))}

              {readyBar && reference ? (
                <section
                  id="upload"
                  className={`film-follow-upload-bar${ringId === "upload" ? " is-ring" : ""}`}
                >
                  <div className="film-follow-upload-bar-row">
                    <p className="film-follow-upload-title film-follow-upload-bar-title">
                      已读入 · {reference.title?.trim() || "参考片"}
                    </p>
                    <button
                      type="button"
                      className="ghost-btn compact film-follow-upload-bar-swap"
                      onClick={() => setSwapOpen(true)}
                    >
                      换源
                    </button>
                  </div>
                  {actions.ingestBusy ? (
                    <p className="film-follow-upload-bar-note" role="status">
                      正在上传参考片…
                    </p>
                  ) : null}
                </section>
              ) : (
                <StageBlock
                  id="upload"
                  title="上传"
                  meta="上传后可预览，再解析"
                  highlight={ringId === "upload"}
                >
                  <div className={step1Ok && hasMedia ? "film-follow-swap" : undefined}>
                    <FilmIngestForm
                      disabled={actions.ingestBusy || analyzeRunning}
                      onUrl={(url) => {
                        void actions.submitUrl(url)
                      }}
                      onFile={(file) => {
                        void actions.submitFile(file)
                      }}
                    />
                    {swapOpen && step1Ok && hasMedia ? (
                      <button
                        type="button"
                        className="film-follow-link"
                        onClick={() => setSwapOpen(false)}
                      >
                        收起换源
                      </button>
                    ) : null}
                  </div>
                  {actions.ingestBusy ? (
                    <p className="film-follow-running" role="status">
                      正在上传参考片…
                    </p>
                  ) : null}
                </StageBlock>
              )}

              {hasBreakdown ? (
                <div className="film-follow-split">
                  <div className="film-follow-split-left">
                    <StageBlock
                      id="preview"
                      title="预览"
                      meta={
                        reference
                          ? reference.title?.trim() || "参考片"
                          : "上传后在此预览"
                      }
                      highlight={ringId === "preview"}
                    >
                      <div className="film-follow-preview">
                        <div className="film-follow-preview-frame">
                          {reference?.mediaUrl?.trim() ? (
                            <video
                              className="film-follow-preview-video"
                              src={reference.mediaUrl}
                              controls
                              muted
                              playsInline
                            />
                          ) : (
                            <div className="film-follow-preview-empty">暂无预览</div>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`film-follow-parse-cta${hasBreakdown && !analyzeRunning ? " is-secondary" : ""}`}
                          disabled={!canStartAnalyze}
                          onClick={runPrimaryAnalyze}
                        >
                          {primaryLabel}
                        </button>
                        {analyzeDisabledReason ? (
                          <p className="film-follow-analyze-disabled">
                            {analyzeDisabledReason}
                          </p>
                        ) : null}
                      </div>
                    </StageBlock>

                    <section
                      id="parse"
                      className={`film-follow-parse-strip${ringId === "parse" ? " is-ring" : ""}`}
                    >
                      {!analyzeRunning &&
                      !hasBreakdown &&
                      !actions.error?.trim() ? (
                        <p className="film-follow-parse-line">
                          点上方「解析」开始。进度会显示在这里。
                        </p>
                      ) : null}
                      {analyzeRunning ? (
                        <p className="film-follow-parse-line is-running" role="status">
                          正在解析影片…
                          {analyzingRefId ? `（ref ${analyzingRefId}）` : ""}
                        </p>
                      ) : null}
                      {!analyzeRunning && actions.error?.trim() ? (
                        <div className="film-follow-parse-error">
                          <p className="film-follow-parse-line is-error" role="alert">
                            {actions.error}
                          </p>
                          <button
                            type="button"
                            className="primary-btn compact film-follow-parse-retry"
                            disabled={!canStartAnalyze}
                            onClick={runPrimaryAnalyze}
                          >
                            重试
                          </button>
                        </div>
                      ) : null}
                      {!analyzeRunning &&
                      hasBreakdown &&
                      !actions.error?.trim() ? (
                        <p className="film-follow-parse-line">解析完成</p>
                      ) : null}
                    </section>
                  </div>

                  <section
                    id="breakdown"
                    className={`film-follow-stage is-dense film-follow-breakdown-stage is-side${ringId === "breakdown" ? " is-ring" : ""}`}
                  >
                    <button
                      type="button"
                      className="film-follow-collapse-head"
                      aria-expanded={breakdownOpen}
                      onClick={() => {
                        if (hasBreakdown) setBreakdownOpen((v) => !v)
                      }}
                    >
                      <h2>
                        拆解
                        {hasBreakdown ? (
                          <span className="film-follow-stage-meta">
                            · {pkg.breakdown.length}
                          </span>
                        ) : null}
                      </h2>
                      <span className="film-follow-stage-meta">
                        {!hasBreakdown
                          ? "解析后展开"
                          : breakdownOpen
                            ? "收起"
                            : "展开"}
                      </span>
                    </button>
                    {breakdownOpen ? (
                      <div className="film-follow-breakdown is-scroll">
                        {analyzeStubOrBlocked ? (
                          <p className="film-follow-analyze-warn">
                            当前为演示或已阻塞结果，请勿当作完整真实拆解。
                          </p>
                        ) : null}
                        {breakdownCards.map(renderBreakdownCard)}
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : (
                <>
                  <StageBlock
                    id="preview"
                    title="预览"
                    meta={
                      reference
                        ? reference.title?.trim() || "参考片"
                        : "上传后在此预览"
                    }
                    highlight={ringId === "preview"}
                  >
                    <div className="film-follow-preview">
                      <div className="film-follow-preview-frame">
                        {reference?.mediaUrl?.trim() ? (
                          <video
                            className="film-follow-preview-video"
                            src={reference.mediaUrl}
                            controls
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="film-follow-preview-empty">暂无预览</div>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`film-follow-parse-cta${hasBreakdown && !analyzeRunning ? " is-secondary" : ""}`}
                        disabled={!canStartAnalyze}
                        onClick={runPrimaryAnalyze}
                      >
                        {primaryLabel}
                      </button>
                      {analyzeDisabledReason ? (
                        <p className="film-follow-analyze-disabled">
                          {analyzeDisabledReason}
                        </p>
                      ) : null}
                    </div>
                  </StageBlock>

                  <section
                    id="parse"
                    className={`film-follow-parse-strip${ringId === "parse" ? " is-ring" : ""}`}
                  >
                    {!analyzeRunning &&
                    !hasBreakdown &&
                    !actions.error?.trim() ? (
                      <p className="film-follow-parse-line">
                        点上方「解析」开始。进度会显示在这里。
                      </p>
                    ) : null}
                    {analyzeRunning ? (
                      <p className="film-follow-parse-line is-running" role="status">
                        正在解析影片…
                        {analyzingRefId ? `（ref ${analyzingRefId}）` : ""}
                      </p>
                    ) : null}
                    {!analyzeRunning && actions.error?.trim() ? (
                      <div className="film-follow-parse-error">
                        <p className="film-follow-parse-line is-error" role="alert">
                          {actions.error}
                        </p>
                        <button
                          type="button"
                          className="primary-btn compact film-follow-parse-retry"
                          disabled={!canStartAnalyze}
                          onClick={runPrimaryAnalyze}
                        >
                          重试
                        </button>
                      </div>
                    ) : null}
                    {!analyzeRunning &&
                    hasBreakdown &&
                    !actions.error?.trim() ? (
                      <p className="film-follow-parse-line">解析完成</p>
                    ) : null}
                  </section>

                  <section
                    id="breakdown"
                    className={`film-follow-stage is-dense film-follow-breakdown-stage${ringId === "breakdown" ? " is-ring" : ""}`}
                  >
                    <button
                      type="button"
                      className="film-follow-collapse-head"
                      aria-expanded={breakdownOpen}
                      onClick={() => {
                        if (hasBreakdown) setBreakdownOpen((v) => !v)
                      }}
                    >
                      <h2>
                        拆解
                        {hasBreakdown ? (
                          <span className="film-follow-stage-meta">
                            · {pkg.breakdown.length}
                          </span>
                        ) : null}
                      </h2>
                      <span className="film-follow-stage-meta">
                        {!hasBreakdown
                          ? "解析后展开"
                          : breakdownOpen
                            ? "收起"
                            : "展开"}
                      </span>
                    </button>
                    {!hasBreakdown ? (
                      <p className="film-follow-upload-sub">
                        解析完成后会自动展开镜号、画面与对白。
                      </p>
                    ) : breakdownOpen ? (
                      <div className="film-follow-breakdown is-scroll">
                        {analyzeStubOrBlocked ? (
                          <p className="film-follow-analyze-warn">
                            当前为演示或已阻塞结果，请勿当作完整真实拆解。
                          </p>
                        ) : null}
                        {breakdownCards.map(renderBreakdownCard)}
                      </div>
                    ) : null}
                  </section>
                </>
              )}

              <section
                id="script"
                className={`film-follow-stage is-dense${ringId === "script" ? " is-ring" : ""}`}
              >
                <button
                  type="button"
                  className="film-follow-collapse-head"
                  aria-expanded={scriptOpen}
                  onClick={() => setScriptOpen((v) => !v)}
                >
                  <h2>剧本</h2>
                  <span className="film-follow-stage-meta">
                    {scriptOpen ? "收起" : "展开"}
                  </span>
                </button>
                {scriptOpen ? (
                  <p className="film-follow-upload-sub">
                    写剧本暂未开放。本页只验证影片解析。
                  </p>
                ) : (
                  <p className="film-follow-upload-sub">
                    默认收起。本页以验证解析为主。
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>

        <aside className="film-follow-status" aria-label="预检与指引">
          {statusSummary}
        </aside>
      </div>

      {!statusOpen ? (
        <div className="film-follow-status-trigger">
          <button
            type="button"
            className="ghost-btn compact"
            onClick={() => setStatusOpen(true)}
          >
            状态
          </button>
        </div>
      ) : null}
      {statusOpen ? (
        <div className="film-follow-status-sheet">
          <button
            type="button"
            className="film-follow-status-backdrop"
            aria-label="关闭状态"
            onClick={() => setStatusOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="状态"
            className="film-follow-status-panel"
          >
            <div className="film-follow-status-panel-head">
              <h2>状态</h2>
              <button
                type="button"
                className="ghost-btn compact"
                onClick={() => setStatusOpen(false)}
              >
                关闭
              </button>
            </div>
            {statusSummary}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function resolveGuidance({
  project,
  step1Ok,
  hasReference,
  hasMedia,
  pipelineError,
  pipelineErrorMessage,
  hasBreakdown,
  analyzing,
}: {
  project?: FilmProject
  step1Ok: boolean
  hasReference: boolean
  hasMedia: boolean
  pipelineError: boolean
  pipelineErrorMessage?: string
  hasBreakdown: boolean
  analyzing: boolean
}) {
  const err = pipelineErrorMessage?.trim()
  if (pipelineError) {
    return err || "参考未就绪。请上传视频文件后再继续。"
  }
  if (!step1Ok || !hasReference) {
    return "请先上传参考视频。"
  }
  if (!hasMedia) {
    return "需上传视频文件后才能解析，请上传后再拆解。"
  }
  if (analyzing) {
    return "正在解析影片，完成后会展开拆解。"
  }
  if (hasBreakdown) {
    return "拆解已就绪。可在预览下重新解析，或滚动查看拆解。"
  }
  const next = project ? filmNextActionMessage(project) : ""
  if (project?.nextAction?.id === "run_breakdown") {
    return next || "上传完成，可预览。点击预览下的「解析」开始拆解。"
  }
  return next || "上传完成，可预览。点击预览下的「解析」开始拆解。"
}
