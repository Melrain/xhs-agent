import {
  isFilmLocalGenerationStage,
  type FilmStageKind,
} from "@/lib/film-package"

/**
 * 生成类阶段的本机入口。Grok Build 能直接出视频；也可用 Grok Bot。
 * 桌面：优先调本机 `grok`（已登录，无界面 `-p`），否则 Grok Bot。产物写回 package。
 * 拆解/生成能不能跑，以 film API preflight 的 `authOk` 为准（web/桌面同一套状态）。
 * 本机真实探测以后接在 `probeLocalGrok`。
 *
 * 本切片 CTA 仍禁用。`isFilmLocalWorkerReady` 为 false 时不要开跑。
 */
export type FilmLocalWorkerRequest = {
  projectId: string
  stageId: string
  stage: FilmStageKind
}

export function isFilmLocalWorkerReady() {
  return false
}

/** 桌面以后在这里看本机 grok 是否真的在；现在仍以接口 preflight 为共享状态。 */
export async function probeLocalGrok(): Promise<{ installed?: boolean; bin?: string } | null> {
  return null
}

export function filmLocalWorkerHint(stage: FilmStageKind) {
  if (stage === "script") return "本机 grok / grok bot。出剧本并写回制作包。"
  if (stage === "assets") return "本机执行。出素材并写回制作包。"
  if (stage === "shots") return "本机执行。出分镜并写回制作包。"
  if (stage === "keyframes") return "本机执行。出关键帧画面并写回制作包。"
  if (stage === "clips") return "本机执行。出视频片段并写回制作包。"
  if (stage === "audio") return "本机执行。出声音并写回制作包。"
  if (stage === "cut") return "本机执行。合成成片视频并写回制作包。"
  if (stage === "breakdown") return "完整拆解以后本机执行，产物写回制作包。本切片先走接口占位。"
  return "本机执行。成片和中间素材都会写回制作包。"
}

export function filmLocalWorkerActionLabel() {
  return "本机执行"
}

export function filmLocalWorkerStatusLabel() {
  return "本机执行"
}

/** 本机 worker 未接线时不要调用。 */
export async function requestFilmLocalWorker(_input: FilmLocalWorkerRequest): Promise<void> {
  if (!isFilmLocalWorkerReady()) return
  if (!isFilmLocalGenerationStage(_input.stage) && _input.stage !== "breakdown") return
}
