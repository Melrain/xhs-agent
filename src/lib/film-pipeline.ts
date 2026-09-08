import type { FilmProject } from "@/lib/api/film"
import {
  createFilmCard,
  DEFAULT_BRIEF_POSITION,
  type FilmCard,
  type FilmCardAction,
  type FilmCardPosition,
  type FilmCardSegment,
} from "@/lib/film-card"
import {
  FILM_STAGE_LABELS,
  FILM_STAGES,
  filmBreakdownStageId,
  filmPackageOf,
  filmSourceTypeLabel,
  filmStatusLabel,
  formatFilmDuration,
  formatFilmTimecode,
  inferFilmNextActionId,
  isFilmProjectBusy,
  isFilmStatusBusy,
  type FilmBreakdownItem,
  type FilmPackage,
  type FilmReference,
  type FilmStageKind,
} from "@/lib/film-package"

const STAGE_GAP_X = 360
const STAGE_Y = -40
const START_X = -160

type LayoutMap = Record<string, FilmCardPosition>

function positionOf(id: string, index: number, layouts: LayoutMap): FilmCardPosition {
  return layouts[id] ?? { x: START_X + index * STAGE_GAP_X, y: STAGE_Y }
}

function referenceBody(item: FilmReference) {
  const lines: string[] = []
  const source = filmSourceTypeLabel(item.sourceType)
  if (source) lines.push(source)
  if (item.url) lines.push(item.url)
  if (item.fileName && item.fileName !== item.title) lines.push(item.fileName)
  const duration = formatFilmDuration(item.durationMs)
  if (duration) lines.push(`时长 ${duration}`)
  if (item.error) lines.push(item.error)
  if (!lines.length && isFilmStatusBusy(item.status)) lines.push("正在导入参考片…")
  return lines.join("\n") || undefined
}

function breakdownSegments(item: FilmBreakdownItem): FilmCardSegment[] {
  return item.segments.flatMap((segment, index) => {
    const text = segment.text?.trim()
    if (!text) return []
    const start = formatFilmTimecode(segment.startMs)
    const end = formatFilmTimecode(segment.endMs)
    const time = start && end ? `${start}–${end}` : start || end
    return [
      {
        id: segment.id ?? `seg-${index}`,
        title: [segment.title, time].filter(Boolean).join(" · ") || undefined,
        text,
      },
    ]
  })
}

function breakdownBody(item: FilmBreakdownItem) {
  if (item.error) return item.error
  if (item.summary) return item.summary
  if (isFilmStatusBusy(item.status)) return "正在拆解参考片…"
  return undefined
}

function referenceActions(
  item: FilmReference,
  nextActionId: string | undefined,
): FilmCardAction[] {
  if (isFilmStatusBusy(item.status) || item.status === "failed") return []
  if (nextActionId !== "run_breakdown") return []
  return [{ id: "analyze", label: "拆解这段参考片", variant: "primary", refId: item.id }]
}

function breakdownActions(
  pkg: FilmPackage,
  item: FilmBreakdownItem,
  nextActionId: string | undefined,
): FilmCardAction[] {
  if (nextActionId !== "review_breakdown") return []
  if (isFilmStatusBusy(item.status)) return []
  const stageId = filmBreakdownStageId(pkg)
  if (!stageId) return []
  return [
    { id: "approve", label: "用这份拆解写剧本", variant: "primary", stageId },
    { id: "reject", label: "重新拆解", variant: "ghost", stageId },
  ]
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

export function filmPipelineCards(
  project: FilmProject | undefined,
  layouts: LayoutMap,
): { cards: FilmCard[]; pipelineIds: string[] } {
  const cards: FilmCard[] = []
  const pipelineIds: string[] = []
  const pkg = filmPackageOf(project)
  const nextActionId = inferFilmNextActionId(project)
  const hasReference = pkg.references.length > 0
  const showLater = hasReference || nextActionId !== "ingest_reference"

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

  if (!hasReference) {
    const id = "reference:ingest"
    cards.push(
      createFilmCard("reference", positionOf(id, 0, layouts), {
        id,
        title: "参考片",
        body: "贴一条参考片链接，或上传视频。导入后会出现在画布上。",
        locked: true,
        ingest: true,
        busy: isFilmProjectBusy(project),
        statusLabel: isFilmProjectBusy(project) ? "正在导入" : undefined,
      }),
    )
    pipelineIds.push(id)
  } else {
    pkg.references.forEach((item, index) => {
      const id = `reference:${item.id}`
      cards.push(
        createFilmCard("reference", positionOf(id, 0, layouts), {
          id,
          title: item.title || item.fileName || "参考片",
          body: referenceBody(item),
          locked: true,
          ingest: item.status === "failed" || nextActionId === "ingest_reference",
          busy: isFilmStatusBusy(item.status),
          statusLabel: filmStatusLabel(item.status) || undefined,
          progress: item.progress,
          actions: referenceActions(item, nextActionId),
        }),
      )
      if (index === 0) pipelineIds.push(id)
    })
  }

  if (showLater) {
    if (pkg.breakdown.length > 0) {
      pkg.breakdown.forEach((item, index) => {
        const id = `breakdown:${item.id}`
        cards.push(
          createFilmCard("breakdown", positionOf(id, 1, layouts), {
            id,
            title: item.title || "拆解",
            body: breakdownBody(item),
            locked: true,
            busy: isFilmStatusBusy(item.status),
            statusLabel: filmStatusLabel(item.status) || undefined,
            segments: breakdownSegments(item),
            actions: breakdownActions(pkg, item, nextActionId),
          }),
        )
        if (index === 0) pipelineIds.push(id)
      })
    } else {
      const id = "stage:breakdown"
      cards.push(
        createFilmCard("breakdown", positionOf(id, 1, layouts), {
          id,
          title: "拆解",
          body: nextActionId === "run_breakdown" ? "参考片就绪后，点卡片上的按钮开始拆解。" : "还没拆解。",
          locked: true,
          placeholder: true,
          statusLabel: "稍后",
        }),
      )
      pipelineIds.push(id)
    }

    FILM_STAGES.filter((kind) => kind !== "reference" && kind !== "breakdown").forEach(
      (kind, offset) => {
        const index = offset + 2
        if (kind === "script" && pkg.script) {
          const id = "script"
          cards.push(
            createFilmCard("script", positionOf(id, index, layouts), {
              id,
              title: pkg.script.title || "剧本",
              body: pkg.script.body || "拆解通过了，可以开始写剧本。",
              locked: true,
              statusLabel: filmStatusLabel(pkg.script.status) || (nextActionId === "write_script" ? "下一步" : undefined),
            }),
          )
          pipelineIds.push(id)
          return
        }
        const id = `stage:${kind}`
        cards.push(
          createFilmCard(kind === "script" ? "script" : "stage", positionOf(id, index, layouts), {
            id,
            title: FILM_STAGE_LABELS[kind],
            body: laterStageBody(kind),
            locked: true,
            placeholder: true,
            statusLabel: "稍后",
          }),
        )
        pipelineIds.push(id)
      },
    )
  }

  return { cards, pipelineIds }
}
