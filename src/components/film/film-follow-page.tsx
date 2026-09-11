import { useEffect, useMemo, useRef, useState } from "react"
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
  filmBreakdownPresentation,
  filmNextActionMessage,
  filmPackageOf,
  filmReferenceHasParseableMedia,
  filmStageByKind,
  isFilmAnalyzeMetaStubOrBlocked,
  isFilmProjectBusy,
  type FilmBreakdownItem,
  type FilmReference,
} from "@/lib/film-package"
import { filmFollowCards } from "@/lib/film-pipeline"
import { ExecutorSourceSwitch } from "@/components/ExecutorSourceSwitch"
import { FilmCardArticle } from "./film-card-article"
import { FilmGrokStatus } from "./film-grok-status"
import { FilmIngestForm } from "./film-ingest-form"

const FOLLOW_WIDE_MQ = "(min-width: 1100px)"

const FOLLOW_ANCHORS = [
  { id: "upload" as const, name: "上传" },
  { id: "parse" as const, name: "解析" },
  { id: "breakdown" as const, name: "拆解" },
  { id: "script" as const, name: "剧本" },
]

type FollowAnchorId = (typeof FOLLOW_ANCHORS)[number]["id"]

function useFollowWideLayout() {
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(FOLLOW_WIDE_MQ).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(FOLLOW_WIDE_MQ)
    const apply = () => setWide(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])
  return wide
}

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
  hasScript,
}: {
  step1Ok: boolean
  analyzing: boolean
  hasBreakdown: boolean
  hasScript: boolean
}) {
  const done = new Set<FollowAnchorId>()
  if (step1Ok) done.add("upload")
  if (analyzing || hasBreakdown) done.add("parse")
  if (hasBreakdown) done.add("breakdown")
  if (hasScript) done.add("script")
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

/** Prefer spoken → hook → shot visuals; keep 2–5 short sentences. */
function buildParseContentDescription(breakdown: FilmBreakdownItem[]): string | null {
  const sentences: string[] = []

  const pushText = (raw: string | undefined) => {
    const cleaned = collapseDigestText(raw)
    if (!cleaned) return
    const chunks = cleaned
      .split(/(?<=[。！？!?；;])\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const chunk of chunks) {
      if (sentences.length >= 5) return
      if (sentences.some((s) => s === chunk)) continue
      sentences.push(chunk)
    }
  }

  const spoken = breakdown.find((item) => item.kind === "spoken")
  const hook = breakdown.find((item) => item.kind === "hook")
  const shots = breakdown.filter((item) => item.kind === "shot")

  pushText(spoken?.body)
  pushText(hook?.body)
  for (const [index, shot] of shots.entries()) {
    if (sentences.length >= 5) break
    const presented = filmBreakdownPresentation(shot, index)
    const visualMatch = presented.body?.match(/画面：([^\n]*)/)
    pushText(visualMatch?.[1]?.trim() || presented.body)
  }

  if (sentences.length === 0) {
    for (const item of breakdown) {
      if (item.kind === "meta" || item.kind === "duration" || item.kind === "note") {
        continue
      }
      pushText(item.body)
      if (sentences.length >= 5) break
    }
  }
  if (sentences.length === 0) {
    for (const item of breakdown.slice(0, 4)) {
      pushText(item.body)
      if (sentences.length >= 5) break
    }
  }

  if (sentences.length === 0) return null
  return sentences.slice(0, 5).join(sentences.some((s) => /[。！？!?]$/.test(s)) ? "" : " ")
}

function collapseDigestText(raw: string | undefined): string {
  if (!raw) return ""
  return raw
    .replace(/^(画面|对白)\s*[:：]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

function countDigestShots(breakdown: FilmBreakdownItem[]): number {
  const shots = breakdown.filter((item) => item.kind === "shot")
  if (shots.length > 0) return shots.length
  return breakdown.length
}

function scriptBodyPreviewLines(body: string, max = 6): string[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  const kept: string[] = []
  for (const line of lines) {
    kept.push(line)
    if (kept.length >= max) break
  }
  while (kept.length > 0 && !kept[kept.length - 1]!.trim()) kept.pop()
  return kept
}

function isLongScriptBody(body: string): boolean {
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  if (lines.length > 6) return true
  return body.trim().length > 280
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

function FollowParseDigest({
  project,
  scriptAnchor = false,
}: {
  project: FilmProject
  scriptAnchor?: boolean
}) {
  const pkg = filmPackageOf(project)
  const breakdown = pkg.breakdown
  const script = pkg.script
  const shotCount = countDigestShots(breakdown)
  const description =
    buildParseContentDescription(breakdown) ??
    `已拆解 ${breakdown.length} 条，详见中栏拆解`
  const [scriptOpen, setScriptOpen] = useState(false)
  const previewLines = script?.body ? scriptBodyPreviewLines(script.body, 6) : []
  const metaHint = collapseDigestText(
    breakdown.find((item) => item.kind === "meta")?.body,
  )
  const showScriptSection = Boolean(script?.body?.trim()) || Boolean(metaHint)

  return (
    <div className="film-follow-digest">
      <div className="film-follow-digest-block">
        <p className="film-follow-digest-title">
          解析完成
          {shotCount > 0 ? (
            <span className="film-follow-digest-muted"> · {shotCount} 镜头</span>
          ) : null}
        </p>
      </div>
      <div className="film-follow-digest-block">
        <p className="film-follow-digest-label">内容描述</p>
        <p className="film-follow-digest-body">{description}</p>
      </div>
      {showScriptSection ? (
        <div
          id={scriptAnchor ? "script" : undefined}
          className="film-follow-digest-block"
        >
          <p className="film-follow-digest-label">剧本结构摘要</p>
          {script?.body?.trim() ? (
            <div className="film-follow-digest-script">
              {script.title?.trim() ? (
                <p className="film-follow-digest-script-title">{script.title.trim()}</p>
              ) : null}
              <p className="film-follow-digest-body is-pre">
                {scriptOpen
                  ? script.body
                  : previewLines.join("\n") || script.body}
              </p>
              {script.body.replace(/\r\n/g, "\n").split("\n").length >
              previewLines.length ? (
                <button
                  type="button"
                  className="film-follow-link"
                  onClick={() => setScriptOpen((v) => !v)}
                >
                  {scriptOpen ? "收起" : "展开全部"}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="film-follow-digest-hint">
              {metaHint || "暂无剧本草稿。"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function FollowScriptFold({
  project,
}: {
  project: FilmProject
}) {
  const [open, setOpen] = useState(false)
  const script = filmPackageOf(project).script
  const body = script?.body?.trim() ?? ""
  if (!body || !isLongScriptBody(body)) return null
  return (
    <div className="film-follow-script-fold">
      <button
        type="button"
        className="film-follow-link"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "收起完整剧本" : "查看完整剧本"}
      </button>
      {open ? (
        <div className="film-follow-script-fold-body">
          {script?.title?.trim() ? (
            <p className="film-follow-digest-script-title">{script.title.trim()}</p>
          ) : null}
          <p className="film-follow-digest-body is-pre">{body}</p>
        </div>
      ) : null}
    </div>
  )
}

function FlatBreakdownList({
  items,
  pkg,
  analyzeStubOrBlocked,
  reviewActions,
  reviewBusy,
  onReview,
}: {
  items: FilmBreakdownItem[]
  pkg: ReturnType<typeof filmPackageOf>
  analyzeStubOrBlocked: boolean
  reviewActions?: FilmCardAction[]
  reviewBusy?: boolean
  onReview?: (action: FilmCardAction) => void
}) {
  return (
    <div className="film-follow-flat-breakdown">
      {reviewActions && reviewActions.length > 0 ? (
        <div className="film-follow-review-bar">
          {reviewActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={
                action.variant === "primary"
                  ? "primary-btn compact"
                  : "ghost-btn compact"
              }
              disabled={reviewBusy}
              onClick={() => onReview?.(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {analyzeStubOrBlocked ? (
        <p className="film-follow-analyze-warn">
          当前为演示或已阻塞结果，请勿当作完整真实拆解。
        </p>
      ) : null}
      <ul className="film-follow-flat-list">
        {items.map((item, index) => {
          const presented = filmBreakdownPresentation(item, index, pkg)
          const lines = (presented.body ?? "").split("\n").map((line) => line.trimEnd())
          const visual = lines.find((line) => line.startsWith("画面："))
          const dialogue = lines.find((line) => line.startsWith("对白："))
          const rest = lines.filter(
            (line) => !line.startsWith("画面：") && !line.startsWith("对白："),
          )
          return (
            <li key={item.id} className="film-follow-flat-row">
              <div className="film-follow-flat-row-head">
                <span className="film-follow-flat-shot">{presented.title}</span>
                {presented.badge ? (
                  <span className="film-follow-flat-badge">{presented.badge}</span>
                ) : null}
              </div>
              {presented.mediaUrl ? (
                <img
                  className="film-follow-flat-frame"
                  src={presented.mediaUrl}
                  alt=""
                />
              ) : null}
              {visual || dialogue ? (
                <div className="film-breakdown-body">
                  {visual ? (
                    <p className="film-breakdown-visual">
                      <span className="film-breakdown-label">画面</span>
                      <span>{visual.replace(/^画面：/, "") || "（无）"}</span>
                    </p>
                  ) : null}
                  {dialogue ? (
                    <p className="film-breakdown-dialogue">
                      <span className="film-breakdown-label">对白</span>
                      <span>{dialogue.replace(/^对白：/, "") || "（无）"}</span>
                    </p>
                  ) : null}
                  {rest.length > 0 ? (
                    <p className="film-breakdown-rest">{rest.join("\n")}</p>
                  ) : null}
                </div>
              ) : presented.body ? (
                <p className="film-follow-digest-body">{presented.body}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ParseStatusStrip({
  analyzeRunning,
  hasBreakdown,
  analyzingRefId,
  error,
  canRetry,
  onRetry,
  highlight,
  hideDone,
}: {
  analyzeRunning: boolean
  hasBreakdown: boolean
  analyzingRefId?: string
  error?: string
  canRetry: boolean
  onRetry: () => void
  highlight?: boolean
  hideDone?: boolean
}) {
  return (
    <section
      id="parse"
      className={`film-follow-parse-strip is-flat${highlight ? " is-ring" : ""}`}
    >
      {!analyzeRunning && !hasBreakdown && !error?.trim() ? (
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
      {!analyzeRunning && error?.trim() ? (
        <div className="film-follow-parse-error">
          <p className="film-follow-parse-line is-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="primary-btn compact film-follow-parse-retry"
            disabled={!canRetry}
            onClick={onRetry}
          >
            重试
          </button>
        </div>
      ) : null}
      {!analyzeRunning && hasBreakdown && !error?.trim() && !hideDone ? (
        <p className="film-follow-parse-line">解析完成</p>
      ) : null}
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
  const wide = useFollowWideLayout()
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
  /** Empty until analyzable reference exists — single dropzone, no 5|5|2 / analyze. */
  const hasAnalyzableReference =
    hasReference &&
    reference?.status === "ready" &&
    hasMedia &&
    !pipelineError
  const step1Ok = hasAnalyzableReference
  const hasBreakdown = pkg.breakdown.length > 0
  const hasScript = Boolean(pkg.script?.body?.trim())
  const preflightReady = canAnalyze && !preflightError && !checkingGrok

  const briefCards = cards.filter((card) => card.kind === "brief")
  const breakdownCards = cards.filter((card) => card.kind === "breakdown")
  const reviewActions = useMemo(() => {
    const fromCards = breakdownCards.flatMap((card) => card.actions ?? [])
    const seen = new Set<string>()
    const out: FilmCardAction[] = []
    for (const action of fromCards) {
      if (action.id !== "approve" && action.id !== "reject") continue
      const key = `${action.id}:${action.stageId ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(action)
    }
    return out
  }, [breakdownCards])

  const [swapOpen, setSwapOpen] = useState(false)
  const [ringId, setRingId] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrolledToBreakdown = useRef(false)

  const done = followDoneAnchors({
    step1Ok,
    analyzing: analyzeRunning,
    hasBreakdown,
    hasScript,
  })
  const active = inferActiveAnchor({
    step1Ok,
    analyzing: analyzeRunning,
    hasBreakdown,
  })

  useEffect(() => {
    scrolledToBreakdown.current = false
  }, [project?.id])

  useEffect(() => {
    if (!hasBreakdown || scrolledToBreakdown.current) return
    scrolledToBreakdown.current = true
    if (wide) {
      setRingId("breakdown")
      if (ringTimer.current) clearTimeout(ringTimer.current)
      ringTimer.current = setTimeout(() => setRingId(null), 900)
      return
    }
    const t = setTimeout(() => {
      document
        .getElementById("breakdown")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 120)
    return () => clearTimeout(t)
  }, [hasBreakdown, wide])

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
    <div className={`film-follow-status-inner${wide ? " is-dense" : ""}`}>
      <div className={`film-follow-status-card is-flat${preflightTone === "warn" ? " is-warn" : ""}`}>
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

      <div className="film-follow-status-card is-flat">
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

  const ingestForm = (
    <FilmIngestForm
      disabled={actions.ingestBusy || analyzeRunning}
      onUrl={(url) => {
        void actions.submitUrl(url)
      }}
      onFile={(file) => {
        void actions.submitFile(file)
      }}
    />
  )

  const previewBlock = (
    <div className="film-follow-preview is-flat">
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
      {hasMedia ? (
        <>
          <button
            type="button"
            className={`film-follow-parse-cta${hasBreakdown && !analyzeRunning ? " is-secondary" : ""}`}
            disabled={!canStartAnalyze}
            onClick={runPrimaryAnalyze}
          >
            {primaryLabel}
          </button>
          {analyzeDisabledReason ? (
            <p className="film-follow-analyze-disabled">{analyzeDisabledReason}</p>
          ) : null}
          <ParseStatusStrip
            analyzeRunning={analyzeRunning}
            hasBreakdown={hasBreakdown}
            analyzingRefId={analyzingRefId}
            error={actions.error}
            canRetry={canStartAnalyze}
            onRetry={runPrimaryAnalyze}
            highlight={ringId === "parse"}
            hideDone={hasBreakdown}
          />
        </>
      ) : null}
    </div>
  )

  const sourceBar =
    readyBar && reference ? (
      <section
        id="upload"
        className={`film-follow-upload-bar is-flat${ringId === "upload" ? " is-ring" : ""}`}
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
    ) : swapOpen && step1Ok && hasMedia ? (
      <section
        id="upload"
        className={`film-follow-stage is-flat is-dense${ringId === "upload" ? " is-ring" : ""}`}
      >
        <div className="film-follow-stage-head">
          <h2>上传</h2>
          <span className="film-follow-stage-meta">上传后可预览，再解析</span>
        </div>
        <div className="film-follow-swap">
          {ingestForm}
          <button
            type="button"
            className="film-follow-link"
            onClick={() => setSwapOpen(false)}
          >
            收起换源
          </button>
        </div>
        {actions.ingestBusy ? (
          <p className="film-follow-running" role="status">
            正在上传参考片…
          </p>
        ) : null}
      </section>
    ) : null

  const emptyDropzone = (
    <div
      id="upload"
      className={`film-follow-empty${ringId === "upload" ? " is-ring" : ""}`}
    >
      <div className="film-follow-empty-card">
        {ingestForm}
        {actions.ingestBusy ? (
          <p className="film-follow-running" role="status">
            正在上传参考片…
          </p>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className={`film-follow${wide ? " is-wide" : ""}${hasAnalyzableReference ? " has-media" : " is-empty"}`}>
      <div className={`film-follow-layout${hasAnalyzableReference ? "" : " is-empty"}`}>
        <div className="film-follow-main">
          <ProgressRail
            active={active}
            done={done}
            onSelect={(anchor) => scrollToAnchor(anchor)}
          />

          {wide ? (
            <div className="film-follow-wide-shell">
              {!hasAnalyzableReference ? (
                emptyDropzone
              ) : (
                <>
                  {sourceBar}
                  <div className="film-follow-stage-river">
                    <section
                      id="preview"
                      aria-label="视频源与播放"
                      className={`film-follow-river-col is-preview${ringId === "preview" ? " is-ring" : ""}`}
                    >
                      <div className="film-follow-river-preview-top">
                        <div className="film-follow-col-head">
                          <div className="film-follow-col-head-main">
                            <span className="film-follow-col-title">预览源片</span>
                            {reference ? (
                              <span className="film-follow-col-meta">
                                {reference.title?.trim() || "参考片"}
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={`film-follow-col-status${
                              hasBreakdown
                                ? " is-ready"
                                : analyzeRunning
                                  ? " is-running"
                                  : ""
                            }`}
                          >
                            {hasBreakdown
                              ? "解析就绪"
                              : analyzeRunning
                                ? "解析中"
                                : "待解析"}
                          </span>
                        </div>
                        <div className="film-follow-river-preview-body">{previewBlock}</div>
                      </div>
                      {hasBreakdown && project ? (
                        <div className="film-follow-river-notes">
                          <div className="film-follow-col-head is-notes">
                            <span className="film-follow-col-title">内容说明</span>
                          </div>
                          <div className="film-follow-river-notes-scroll">
                            <FollowParseDigest project={project} scriptAnchor />
                            <FollowScriptFold project={project} />
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section
                      id="breakdown"
                      aria-label="分镜与钩子拆解流"
                      className={`film-follow-river-col is-breakdown${ringId === "breakdown" ? " is-ring" : ""}`}
                    >
                      <div className="film-follow-col-head">
                        <div className="film-follow-col-head-main">
                          <span className="film-follow-col-title">拆解分镜</span>
                          <span className="film-follow-col-meta">
                            {hasBreakdown
                              ? `${pkg.breakdown.length} 镜头段落`
                              : "解析后展开"}
                          </span>
                        </div>
                      </div>
                      <div className="film-follow-river-breakdown-scroll">
                        {hasBreakdown ? (
                          <FlatBreakdownList
                            items={pkg.breakdown}
                            pkg={pkg}
                            analyzeStubOrBlocked={analyzeStubOrBlocked}
                            reviewActions={reviewActions}
                            reviewBusy={actions.reviewBusy}
                            onReview={(action) => {
                              void actions.runAction(action)
                            }}
                          />
                        ) : (
                          <p className="film-follow-upload-sub">
                            解析完成后会自动展开镜号、画面与对白。
                          </p>
                        )}
                      </div>
                    </section>

                    <aside
                      aria-label="预检与下一步"
                      className="film-follow-river-col is-status"
                    >
                      {statusSummary}
                    </aside>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="film-follow-center">
              <div className="film-follow-river">
                {!hasAnalyzableReference ? (
                  emptyDropzone
                ) : (
                  <>
                    {briefCards.map((card) => (
                      <FilmCardArticle
                        key={card.id}
                        data={toCardData(card, { busy: false })}
                      />
                    ))}
                    {sourceBar}
                    {previewBlock}
                    {hasBreakdown && project ? (
                      <section
                        aria-label="内容说明"
                        className="film-follow-notes-narrow"
                      >
                        <h2>内容说明</h2>
                        <div className="film-follow-notes-narrow-scroll">
                          <FollowParseDigest project={project} />
                        </div>
                      </section>
                    ) : null}
                    <section
                      id="breakdown"
                      className={`film-follow-stage is-flat is-dense${ringId === "breakdown" ? " is-ring" : ""}`}
                    >
                      <div className="film-follow-stage-head">
                        <h2>
                          拆解
                          {hasBreakdown ? (
                            <span className="film-follow-stage-meta">
                              {" "}
                              · {pkg.breakdown.length}
                            </span>
                          ) : null}
                        </h2>
                        <span className="film-follow-stage-meta">
                          {hasBreakdown ? "已展开" : "解析后展开"}
                        </span>
                      </div>
                      {hasBreakdown ? (
                        <div className="film-follow-breakdown is-scroll">
                          {breakdownCards.length > 0
                            ? breakdownCards.map(renderBreakdownCard)
                            : (
                              <FlatBreakdownList
                                items={pkg.breakdown}
                                pkg={pkg}
                                analyzeStubOrBlocked={analyzeStubOrBlocked}
                                reviewActions={reviewActions}
                                reviewBusy={actions.reviewBusy}
                                onReview={(action) => {
                                  void actions.runAction(action)
                                }}
                              />
                            )}
                        </div>
                      ) : (
                        <p className="film-follow-upload-sub">
                          解析完成后会自动展开镜号、画面与对白。
                        </p>
                      )}
                    </section>
                    {project ? <FollowScriptFold project={project} /> : null}
                    <p className="film-follow-endpoint-note">
                      {`核对路径：上传 → 预览 → 检查 ${endpointLabel}（${filmRunnerSourceLabel(source)}）→ 点击「解析」。上传后不会自动解析。`}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {!wide && hasAnalyzableReference ? (
          <aside className="film-follow-status" aria-label="预检与指引">
            {statusSummary}
          </aside>
        ) : null}
      </div>

      {!wide && hasAnalyzableReference ? (
        <>
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
        </>
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
