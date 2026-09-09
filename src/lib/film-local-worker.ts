/**
 * 兼容旧路径：本机 Grok CLI 逻辑已迁到
 * `@/lib/film/providers/grok-cli/local`（GrokCli/local FilmRunner stub）。
 */
export {
  cacheFilmLocalMediaFile,
  createGrokCliLocalRunner,
  filmLocalWorkerActionLabel,
  filmLocalWorkerHint,
  filmLocalWorkerStatusLabel,
  isFilmLocalAnalyzeReady,
  isFilmLocalWorkerReady,
  localGrokCliPreflight,
  probeLocalGrok,
  requestFilmLocalWorker,
  type FilmLocalWorkerRequest,
} from "@/lib/film/providers/grok-cli/local"
