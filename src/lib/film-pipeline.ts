import type { FilmProject } from "@/lib/api/film"
import {
  createFilmCard,
  DEFAULT_BRIEF_POSITION,
  type FilmCard,
  type FilmCardAction,
  type FilmCardPosition,
} from "@/lib/film-card"
import {
  filmLocalWorkerActionLabel,
  filmLocalWorkerHint,
  filmLocalWorkerStatusLabel,
  isFilmLocalWorkerReady,
} from "@/lib/film-local-worker"
import {
  FILM_STAGE_LABELS,
  FILM_STAGES,
  filmAnalyzingRefId,
  filmBreakdownPresentation,
  filmBreakdownStageId,
  filmPackageOf,
  filmReferenceHasParseableMedia,
  filmSourceLabel,
  filmStageKind,
  filmStatusLabel,
  inferFilmNextActionId,
  isFilmLocalGenerationStage,
  isFilmProjectBusy,
  type FilmBreakdownItem,
  type FilmPackage,
  type FilmReference,
  type FilmStage,
  type FilmStageKind,
} from "@/lib/film-package"

const STAGE_GAP_X = 360
const STAGE_Y = -40
const START_X = -160

type LayoutMap = Record<string, FilmCardPosition>

export type FilmPipelineCardOptions = {
  canAnalyze?: boolean
  canGenerate?: boolean
  analyzeGateLabel?: string
  /** 跟拍产品切片：隐藏本机/剧本/后续生成 CTA */
  followVerifyOnly?: boolean
}

function positionOf(id: string, index: number, layouts: LayoutMap): FilmCardPosition {
  return layouts[id] ?? { x: START_X + index * STAGE_GAP_X, y: STAGE_Y }
}

function fallbackStages(): FilmStage[] {
  return FILM_STAGES.map((kind) => ({
    id: kind,
    label: FILM_STAGE_LABELS[kind],
    status: "placeholder",
  }))
}

function referenceBody(item: FilmReference) {
  const lines: string[] = []
  const source = filmSourceLabel(item.source)
  if (source) lines.push(source)
  if (item.url) lines.push(item.url)
  if (item.source === "upload") {
    lines.push(
      item.mediaUrl?.trim()
        ? "上传完成，可预览。点击「解析」开始拆解。"
        : "已上传，暂无预览",
    )
  }
  if (item.status === "pending") lines.push("正在上传参考片…")
  if (item.status === "failed") lines.push("导入失败，请重新上传视频。")
  return lines.join("\n") || undefined
}

function localRunAction(
  kind: FilmStageKind,
  stageId: string,
  canGenerate: boolean,
): FilmCardAction[] {
  if (!canGenerate || !isFilmLocalWorkerReady()) return []
  const action: FilmCardAction = {
    id: "run_local",
    label: filmLocalWorkerActionLabel(),
    title: "本机执行尚未接线",
    variant: "ghost",
    disabled: true,
    stageId,
    stage: kind,
  }
  return [action]
}

function referenceActions(
  item: FilmReference,
  nextActionId: string | undefined,
  canAnalyze: boolean,
  gateLabel?: string,
  analyzingRefId?: string,
): FilmCardAction[] {
  if (item.status !== "ready" || nextActionId !== "run_breakdown") return []
  const hasMedia = filmReferenceHasParseableMedia(item)
  const blocked = !canAnalyze || !hasMedia || analyzingRefId === item.id
  const title = analyzingRefId === item.id
    ? "正在解析…"
    : !hasMedia
      ? "没有可拆解的媒体"
      : canAnalyze
        ? "上传完成。点击后开始拆解（不会自动解析）。"
        : gateLabel
  return [
    {
      id: "analyze",
      label: analyzingRefId === item.id ? "正在解析…" : "解析",
      title,
      variant: "primary",
      refId: item.id,
      disabled: blocked,
    },
  ]
}

function breakdownActions(
  pkg: FilmPackage,
  nextActionId: string | undefined,
  followVerifyOnly?: boolean,
): FilmCardAction[] {
  if (nextActionId !== "review_breakdown") return []
  const stageId = filmBreakdownStageId(pkg)
  if (!stageId) return []
  // 跟拍只核对拆解：保留通过/重拆，不引导写剧本或本机生成
  return [
    {
      id: "approve",
      label: followVerifyOnly ? "拆解没问题" : "通过拆解",
      variant: "primary",
      stageId,
    },
    { id: "reject", label: "重新拆解", variant: "ghost", stageId },
  ]
}

function placeholderCard(
  stage: FilmStage,
  kind: FilmStageKind,
  index: number,
  layouts: LayoutMap,
  extras?: {
    body?: string
    cardKind?: FilmCard["kind"]
    actions?: FilmCardAction[]
    canGenerate?: boolean
    followVerifyOnly?: boolean
    busy?: boolean
    statusLabel?: string
  },
): FilmCard {
  const id = `stage:${kind}`
  const local = isFilmLocalGenerationStage(kind)
  const hideLocal = extras?.followVerifyOnly || !extras?.canGenerate
  return createFilmCard(extras?.cardKind ?? (kind === "script" ? "script" : "stage"), positionOf(id, index, layouts), {
    id,
    title: stage.label || FILM_STAGE_LABELS[kind],
    body:
      extras?.body ??
      (extras?.followVerifyOnly && kind === "script"
        ? "剧本与后续生成稍后开放。"
        : local
          ? hideLocal
            ? "本机生成阶段尚未接线。"
            : filmLocalWorkerHint(kind)
          : "这一步还没开始。"),
    locked: true,
    placeholder: true,
    busy: extras?.busy,
    statusLabel:
      extras?.statusLabel ??
      (local
        ? hideLocal
          ? "尚未接线"
          : filmLocalWorkerStatusLabel()
        : filmStatusLabel(stage.status) || undefined),
    actions:
      extras?.actions ??
      (local && !hideLocal ? localRunAction(kind, stage.id, extras?.canGenerate !== false) : undefined),
  })
}

export function filmPipelineCards(
  project: FilmProject | undefined,
  layouts: LayoutMap,
  options?: FilmPipelineCardOptions,
): { cards: FilmCard[]; pipelineIds: string[] } {
  const cards: FilmCard[] = []
  const pipelineIds: string[] = []
  const pkg = filmPackageOf(project)
  const nextActionId = inferFilmNextActionId(project)
  const canAnalyze = options?.canAnalyze === true
  const canGenerate = options?.canGenerate === true && !options?.followVerifyOnly
  const analyzeGateLabel = options?.analyzeGateLabel
  const followVerifyOnly = options?.followVerifyOnly === true
  const analyzingRefId = filmAnalyzingRefId(project)
  const stages = pkg.stages.length > 0 ? pkg.stages : fallbackStages()
  const hasReference = pkg.references.length > 0
  const primaryReference = pkg.references[0]
  // URL ingest failed / still pending: stay on ingest — do not open breakdown step UI.
  const ingestIncomplete =
    !primaryReference ||
    primaryReference.status === "pending" ||
    primaryReference.status === "failed"
  const showPipeline =
    !ingestIncomplete &&
    (pkg.stages.length > 0 || hasReference || nextActionId !== "ingest_reference")
  const projectBusy = isFilmProjectBusy(project)

  if (project?.brief.trim()) {
    cards.push(
      createFilmCard("brief", layouts.brief ?? DEFAULT_BRIEF_POSITION, {
        id: "brief",
        title: "点子",
        body: project.brief,
        locked: true,
      }),
    )
  }

  stages.forEach((stage, index) => {
    const kind = filmStageKind(stage, index)
    if (!kind) return

    if (kind === "reference") {
      if (!hasReference) {
        const id = "reference:ingest"
        cards.push(
          createFilmCard("reference", positionOf(id, index, layouts), {
            id,
            title: stage.label || "参考片",
            body: "先上传本地视频到云端；上传后可预览，再点「解析」拆解。",
            locked: true,
            ingest: true,
            busy: projectBusy || stage.status === "running",
            statusLabel: filmStatusLabel(stage.status !== "placeholder" ? stage.status : undefined),
          }),
        )
        pipelineIds.push(id)
        return
      }
      pkg.references.forEach((item, refIndex) => {
        const id = `reference:${item.id}`
        const analyzingThis = analyzingRefId === item.id
        cards.push(
          createFilmCard("reference", positionOf(id, index, layouts), {
            id,
            title: item.title || stage.label || "参考片",
            body: referenceBody(item),
            locked: true,
            ingest: item.status === "failed",
            busy:
              item.status === "pending" ||
              stage.status === "running" ||
              analyzingThis,
            statusLabel: analyzingThis
              ? "正在拆解"
              : filmStatusLabel(item.status),
            mediaUrl: item.mediaUrl,
            actions: referenceActions(
              item,
              nextActionId,
              canAnalyze,
              analyzeGateLabel,
              analyzingRefId,
            ),
          }),
        )
        if (refIndex === 0) pipelineIds.push(id)
      })
      return
    }

    if (!showPipeline) return

    if (kind === "breakdown") {
      if (pkg.breakdown.length > 0) {
        pkg.breakdown.forEach((item, itemIndex) => {
          const id = `breakdown:${item.id}`
          cards.push(
            breakdownCard(
              item,
              itemIndex,
              stage,
              index,
              layouts,
              pkg,
              nextActionId,
              followVerifyOnly,
              Boolean(analyzingRefId) || stage.status === "running",
            ),
          )
          if (itemIndex === 0) pipelineIds.push(id)
        })
        return
      }
      const card = placeholderCard(stage, kind, index, layouts, {
        cardKind: "breakdown",
        canGenerate,
        followVerifyOnly,
        busy: Boolean(analyzingRefId) || stage.status === "running",
        statusLabel:
          analyzingRefId || stage.status === "running"
            ? "正在拆解"
            : filmStatusLabel(stage.status) || undefined,
        body:
          analyzingRefId || stage.status === "running"
            ? "正在拆解参考片，请稍候…"
            : nextActionId === "run_breakdown"
              ? "参考片已就绪。确认执行端后，点预览下的「解析」开始拆解（不会自动解析）。"
              : "还没有拆解结果。先上传参考片并完成检查。",
      })
      cards.push(card)
      pipelineIds.push(card.id)
      return
    }

    if (followVerifyOnly && kind === "script") {
      // 跟拍页不展示剧本占位；由 filmFollowCards 再滤一层
      return
    }

    if (followVerifyOnly && isFilmLocalGenerationStage(kind)) {
      return
    }

    const card = placeholderCard(stage, kind, index, layouts, {
      canGenerate,
      followVerifyOnly,
    })
    cards.push(card)
    pipelineIds.push(card.id)
  })

  return { cards, pipelineIds }
}

const FOLLOW_CARD_KINDS = new Set(["brief", "reference", "breakdown"])

/** 跟拍页只展示参考片 → 拆解核对；剧本/本机生成隐藏。 */
export function filmFollowCards(
  project: FilmProject | undefined,
  layouts: LayoutMap,
  options?: FilmPipelineCardOptions,
) {
  const built = filmPipelineCards(project, layouts, {
    ...options,
    canGenerate: false,
    followVerifyOnly: true,
  })
  return {
    cards: built.cards.filter((card) => FOLLOW_CARD_KINDS.has(card.kind)),
    pipelineIds: built.pipelineIds.filter((id) =>
      built.cards.some((card) => card.id === id && FOLLOW_CARD_KINDS.has(card.kind)),
    ),
  }
}

function breakdownCard(
  item: FilmBreakdownItem,
  itemIndex: number,
  stage: FilmStage,
  index: number,
  layouts: LayoutMap,
  pkg: FilmPackage,
  nextActionId: string | undefined,
  followVerifyOnly?: boolean,
  busy?: boolean,
): FilmCard {
  const id = `breakdown:${item.id}`
  const presented = filmBreakdownPresentation(item, itemIndex, pkg)
  return createFilmCard("breakdown", positionOf(id, index, layouts), {
    id,
    title: presented.title,
    body: presented.body,
    locked: true,
    busy: busy || stage.status === "running",
    statusLabel:
      busy || stage.status === "running"
        ? "正在拆解"
        : filmStatusLabel(stage.status),
    badge: presented.badge,
    mediaUrl: presented.mediaUrl,
    actions: breakdownActions(pkg, nextActionId, followVerifyOnly),
  })
}
