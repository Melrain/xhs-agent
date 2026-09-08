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
  filmBreakdownStageId,
  filmPackageOf,
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
  if (item.source === "upload" && !item.mediaUrl) lines.push("已上传，暂无预览")
  if (item.status === "pending") lines.push("正在导入参考片…")
  if (item.status === "failed") lines.push("导入失败，请换一条链接或重新上传。")
  return lines.join("\n") || undefined
}

function localRunAction(
  kind: FilmStageKind,
  stageId: string,
  canGenerate: boolean,
): FilmCardAction[] {
  return [
    {
      id: "run_local",
      label: filmLocalWorkerActionLabel(),
      variant: "ghost",
      disabled: !isFilmLocalWorkerReady() || !canGenerate,
      stageId,
      stage: kind,
    },
  ]
}

function referenceActions(
  item: FilmReference,
  nextActionId: string | undefined,
  canAnalyze: boolean,
  gateLabel?: string,
): FilmCardAction[] {
  if (item.status !== "ready" || nextActionId !== "run_breakdown") return []
  return [
    {
      id: "analyze",
      label: "拆解这段参考片",
      title: canAnalyze ? undefined : gateLabel,
      variant: "primary",
      refId: item.id,
      disabled: !canAnalyze,
    },
  ]
}

function breakdownActions(pkg: FilmPackage, nextActionId: string | undefined): FilmCardAction[] {
  if (nextActionId !== "review_breakdown") return []
  const stageId = filmBreakdownStageId(pkg)
  if (!stageId) return []
  return [
    { id: "approve", label: "通过拆解，下一步本机执行", variant: "primary", stageId },
    { id: "reject", label: "重新拆解", variant: "ghost", stageId },
  ]
}

function placeholderCard(
  stage: FilmStage,
  kind: FilmStageKind,
  index: number,
  layouts: LayoutMap,
  extras?: { body?: string; cardKind?: FilmCard["kind"]; actions?: FilmCardAction[]; canGenerate?: boolean },
): FilmCard {
  const id = `stage:${kind}`
  const local = isFilmLocalGenerationStage(kind)
  return createFilmCard(extras?.cardKind ?? (kind === "script" ? "script" : "stage"), positionOf(id, index, layouts), {
    id,
    title: stage.label || FILM_STAGE_LABELS[kind],
    body: extras?.body ?? (local ? filmLocalWorkerHint(kind) : "这一步还没开始。"),
    locked: true,
    placeholder: true,
    statusLabel: local ? filmLocalWorkerStatusLabel() : filmStatusLabel(stage.status) || undefined,
    actions: extras?.actions ?? (local ? localRunAction(kind, stage.id, extras?.canGenerate !== false) : undefined),
  })
}

export function filmPipelineCards(
  project: FilmProject | undefined,
  layouts: LayoutMap,
  options?: { canAnalyze?: boolean; canGenerate?: boolean; analyzeGateLabel?: string },
): { cards: FilmCard[]; pipelineIds: string[] } {
  const cards: FilmCard[] = []
  const pipelineIds: string[] = []
  const pkg = filmPackageOf(project)
  const nextActionId = inferFilmNextActionId(project)
  const canAnalyze = options?.canAnalyze === true
  const canGenerate = options?.canGenerate === true
  const analyzeGateLabel = options?.analyzeGateLabel
  const stages = pkg.stages.length > 0 ? pkg.stages : fallbackStages()
  const hasReference = pkg.references.length > 0
  const showPipeline = pkg.stages.length > 0 || hasReference || nextActionId !== "ingest_reference"

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
            body: "贴一条参考片链接，或上传视频。导入后会出现在这里。",
            locked: true,
            ingest: true,
            busy: isFilmProjectBusy(project) || stage.status === "running",
            statusLabel: filmStatusLabel(stage.status !== "placeholder" ? stage.status : undefined),
          }),
        )
        pipelineIds.push(id)
        return
      }
      pkg.references.forEach((item, refIndex) => {
        const id = `reference:${item.id}`
        cards.push(
          createFilmCard("reference", positionOf(id, index, layouts), {
            id,
            title: item.title || stage.label || "参考片",
            body: referenceBody(item),
            locked: true,
            ingest: item.status === "failed",
            busy: item.status === "pending" || stage.status === "running",
            statusLabel: filmStatusLabel(item.status),
            mediaUrl: item.mediaUrl,
            actions: referenceActions(item, nextActionId, canAnalyze, analyzeGateLabel),
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
          cards.push(breakdownCard(item, stage, index, layouts, pkg, nextActionId))
          if (itemIndex === 0) pipelineIds.push(id)
        })
        return
      }
      const card = placeholderCard(stage, kind, index, layouts, {
        cardKind: "breakdown",
        canGenerate,
        body:
          nextActionId === "run_breakdown"
            ? "参考片已就绪，点参考片上的按钮开始拆解。完整拆解以后本机 grok / grok bot 执行。"
            : filmLocalWorkerHint("breakdown"),
      })
      cards.push(card)
      pipelineIds.push(card.id)
      return
    }

    const card = placeholderCard(stage, kind, index, layouts, { canGenerate })
    cards.push(card)
    pipelineIds.push(card.id)
  })

  return { cards, pipelineIds }
}

const FOLLOW_CARD_KINDS = new Set(["brief", "reference", "breakdown", "script"])

/** 跟拍页只展示参考片 → 拆解 → 剧本，后面的本机阶段留在画布。 */
export function filmFollowCards(
  project: FilmProject | undefined,
  layouts: LayoutMap,
  options?: { canAnalyze?: boolean; canGenerate?: boolean; analyzeGateLabel?: string },
) {
  const built = filmPipelineCards(project, layouts, options)
  return {
    cards: built.cards.filter((card) => FOLLOW_CARD_KINDS.has(card.kind)),
    pipelineIds: built.pipelineIds.filter((id) =>
      built.cards.some((card) => card.id === id && FOLLOW_CARD_KINDS.has(card.kind)),
    ),
  }
}

function breakdownCard(
  item: FilmBreakdownItem,
  stage: FilmStage,
  index: number,
  layouts: LayoutMap,
  pkg: FilmPackage,
  nextActionId: string | undefined,
): FilmCard {
  const id = `breakdown:${item.id}`
  return createFilmCard("breakdown", positionOf(id, index, layouts), {
    id,
    title: item.title,
    body: item.body || undefined,
    locked: true,
    busy: stage.status === "running",
    statusLabel: filmStatusLabel(stage.status),
    badge: item.kind,
    actions: breakdownActions(pkg, nextActionId),
  })
}
