import type { FilmProject } from "@/lib/api/film"
import {
  createFilmCard,
  DEFAULT_BRIEF_POSITION,
  type FilmCard,
  type FilmCardAction,
  type FilmCardPosition,
} from "@/lib/film-card"
import {
  FILM_STAGE_LABELS,
  FILM_STAGES,
  filmBreakdownStageId,
  filmPackageOf,
  filmSourceLabel,
  filmStageKind,
  filmStatusLabel,
  inferFilmNextActionId,
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

function laterStageBody(kind: FilmStageKind) {
  switch (kind) {
    case "script":
      return "拆解通过后，再写剧本。"
    case "assets":
      return "剧本定了再备素材。"
    case "shots":
      return "素材齐了再排分镜。"
    case "keyframes":
      return "分镜定了再出关键帧。"
    case "clips":
      return "关键帧过了再生成片段。"
    case "audio":
      return "片段齐了再配声音。"
    case "cut":
      return "声音过了再出成片。"
    default:
      return "这一步还没开始。"
  }
}

function referenceActions(
  item: FilmReference,
  nextActionId: string | undefined,
): FilmCardAction[] {
  if (item.status !== "ready" || nextActionId !== "run_breakdown") return []
  return [{ id: "analyze", label: "拆解这段参考片", variant: "primary", refId: item.id }]
}

function breakdownActions(pkg: FilmPackage, nextActionId: string | undefined): FilmCardAction[] {
  if (nextActionId !== "review_breakdown") return []
  const stageId = filmBreakdownStageId(pkg)
  if (!stageId) return []
  return [
    { id: "approve", label: "用这份拆解写剧本", variant: "primary", stageId },
    { id: "reject", label: "重新拆解", variant: "ghost", stageId },
  ]
}

function placeholderCard(
  stage: FilmStage,
  kind: FilmStageKind,
  index: number,
  layouts: LayoutMap,
  extras?: { body?: string; cardKind?: FilmCard["kind"] },
): FilmCard {
  const id = `stage:${kind}`
  return createFilmCard(extras?.cardKind ?? (kind === "script" ? "script" : "stage"), positionOf(id, index, layouts), {
    id,
    title: stage.label || FILM_STAGE_LABELS[kind],
    body: extras?.body ?? laterStageBody(kind),
    locked: true,
    placeholder: true,
    statusLabel: filmStatusLabel(stage.status) || "稍后",
  })
}

export function filmPipelineCards(
  project: FilmProject | undefined,
  layouts: LayoutMap,
): { cards: FilmCard[]; pipelineIds: string[] } {
  const cards: FilmCard[] = []
  const pipelineIds: string[] = []
  const pkg = filmPackageOf(project)
  const nextActionId = inferFilmNextActionId(project)
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
            body: "贴一条参考片链接，或上传视频。导入后会出现在画布上。",
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
            actions: referenceActions(item, nextActionId),
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
        body:
          nextActionId === "run_breakdown"
            ? "参考片已就绪，点卡片上的按钮开始拆解。"
            : "还没拆解。",
      })
      cards.push(card)
      pipelineIds.push(card.id)
      return
    }

    const card = placeholderCard(stage, kind, index, layouts)
    cards.push(card)
    pipelineIds.push(card.id)
  })

  return { cards, pipelineIds }
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
