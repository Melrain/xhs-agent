import {
  isFilmLocalGenerationStage,
  type FilmStageKind,
} from "@/lib/film-package"

/**
 * 生成类阶段的本机入口。Grok Build 能直接出视频，不限于剧本/提示词；也可用 Grok Bot。
 * 桌面：优先调本机 `grok`（已登录，无界面 `-p`），否则 Grok Bot。产物写回 package。
 * Web/API 只负责展示、上传和制作包状态，服务端不持 API key。
 *
 * 本切片只提供文案和禁用态 CTA。`isFilmLocalWorkerReady` 为 false 时不要开跑。
 * 之后非 stub 拆解也走这里：把 `breakdown` 加进 `FILM_LOCAL_GENERATION_STAGES` 即可。
 */
export type FilmLocalWorkerRequest = {
  projectId: string
  stageId: string
  stage: FilmStageKind
}

export function isFilmLocalWorkerReady() {
  return false
}

export function filmLocalWorkerHint(stage: FilmStageKind) {
  if (stage === "script") return "本机执行。出剧本并写回制作包，不只是提示词。"
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
