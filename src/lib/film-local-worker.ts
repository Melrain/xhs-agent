import {
  isFilmLocalGenerationStage,
  type FilmStageKind,
} from "@/lib/film-package"

/**
 * 生成类阶段的本机入口。
 * 另一条线会接到本机已登录的 Grok Build CLI：`grok -p`（无界面）。
 * 不要在这里或影片 UI 里假设 Nest / 云端 XAI_API_KEY。
 *
 * 本切片只提供类型和禁用态 CTA。`isFilmLocalWorkerReady` 为 false 时不要开跑。
 * 之后非 stub 的拆解也走这里：把 `breakdown` 加进 `FILM_LOCAL_GENERATION_STAGES` 即可。
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
  if (stage === "script") return "可在桌面跑。通过拆解后，在本机写剧本。"
  if (stage === "assets") return "可在桌面跑。剧本定了再在本机备素材。"
  if (stage === "shots") return "可在桌面跑。素材齐了再在本机排分镜。"
  if (stage === "keyframes") return "可在桌面跑。分镜定了再在本机出关键帧。"
  if (stage === "clips") return "可在桌面跑。关键帧过了再在本机生成片段。"
  if (stage === "audio") return "可在桌面跑。片段齐了再在本机配声音。"
  if (stage === "cut") return "可在桌面跑。声音过了再在本机出成片。"
  if (stage === "breakdown") return "完整拆解以后可在桌面跑。本切片先走接口占位。"
  return "可在桌面跑。"
}

export function filmLocalWorkerActionLabel() {
  return "等本机执行"
}

/** 本机 worker 未接线时不要调用。 */
export async function requestFilmLocalWorker(_input: FilmLocalWorkerRequest): Promise<void> {
  if (!isFilmLocalWorkerReady()) return
  if (!isFilmLocalGenerationStage(_input.stage) && _input.stage !== "breakdown") return
}
