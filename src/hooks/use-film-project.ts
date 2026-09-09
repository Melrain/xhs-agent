import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  addFilmReference,
  approveFilmStage,
  createFilmProject,
  deleteFilmProject,
  filmCurrentQueryKey,
  filmGrokPreflightQueryKey,
  filmProjectsQueryKey,
  FILM_QUERY_KEY,
  getCurrentFilmProject,
  listFilmProjects,
  openFilmProject,
  rejectFilmStage,
  renameFilmProject,
  type FilmProject,
} from "@/lib/api/film"
import { getStoredUser } from "@/lib/auth/tokens"
import { clearFilmHidden, clearFilmLayout } from "@/lib/film-client-state"
import {
  getFilmRunnerForProject,
  resolveFilmRunnerSource,
  selectFilmRunner,
  type FilmRunnerSource,
} from "@/lib/film/runner"
import { isFilmProjectBusy } from "@/lib/film-package"
import { useFilmStore } from "@/lib/film-store"

export function currentFilmUserId() {
  return getStoredUser()?.id ?? ""
}

export function useFilmCurrentProject(enabled: boolean) {
  const userId = currentFilmUserId()
  const queryClient = useQueryClient()
  const ready = enabled && Boolean(userId)

  useEffect(() => {
    if (userId) return
    queryClient.removeQueries({ queryKey: FILM_QUERY_KEY })
    useFilmStore.getState().reset()
  }, [queryClient, userId])

  const query = useQuery({
    queryKey: filmCurrentQueryKey(userId),
    queryFn: ({ signal }) => getCurrentFilmProject({ signal }),
    enabled: ready,
    staleTime: 10_000,
    refetchInterval: (current) => (isFilmProjectBusy(current.state.data) ? 2000 : false),
  })

  useEffect(() => {
    if (query.data?.id && userId) {
      void queryClient.invalidateQueries({ queryKey: filmProjectsQueryKey(userId) })
    }
  }, [query.data?.id, queryClient, userId])

  return query
}

/** 经 FilmRunner / GrokCli：默认 VPS；若项目锁定 source 则跟锁定。 */
export function useFilmGrokPreflight(
  enabled: boolean,
  project?: FilmProject | null,
) {
  const source: FilmRunnerSource = resolveFilmRunnerSource(project)
  return useQuery({
    queryKey: [...filmGrokPreflightQueryKey(), source] as const,
    queryFn: ({ signal }) =>
      selectFilmRunner(source).preflight({
        signal,
      }),
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
}

export function useFilmProjects(enabled: boolean) {
  const userId = currentFilmUserId()
  return useQuery({
    queryKey: filmProjectsQueryKey(userId),
    queryFn: ({ signal }) => listFilmProjects({ signal }),
    enabled: enabled && Boolean(userId),
    staleTime: 10_000,
  })
}

export function useFilmProjectMutations() {
  const userId = currentFilmUserId()
  const queryClient = useQueryClient()

  const remember = (project: FilmProject) => {
    if (!userId) return
    queryClient.setQueryData(filmCurrentQueryKey(userId), project)
    void queryClient.invalidateQueries({ queryKey: filmProjectsQueryKey(userId) })
  }

  return {
    create: useMutation({
      mutationFn: (title?: string) => createFilmProject(title),
      onSuccess: remember,
    }),
    open: useMutation({
      mutationFn: (projectId: string) => openFilmProject(projectId),
      onSuccess: remember,
    }),
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) => renameFilmProject(id, title),
      onSuccess: (project) => {
        if (!userId) return
        const current = queryClient.getQueryData<FilmProject>(filmCurrentQueryKey(userId))
        if (current?.id === project.id) {
          queryClient.setQueryData(filmCurrentQueryKey(userId), { ...current, ...project })
        }
        void queryClient.invalidateQueries({ queryKey: filmProjectsQueryKey(userId) })
      },
    }),
    remove: useMutation({
      mutationFn: (projectId: string) => deleteFilmProject(projectId),
      onSuccess: async (_result, projectId) => {
        clearFilmLayout(projectId)
        clearFilmHidden(projectId)
        remember(await getCurrentFilmProject())
      },
    }),
  }
}

export function useFilmPipelineMutations() {
  const userId = currentFilmUserId()
  const queryClient = useQueryClient()

  const remember = (project: FilmProject) => {
    if (!userId) return
    queryClient.setQueryData(filmCurrentQueryKey(userId), project)
    void queryClient.invalidateQueries({ queryKey: filmProjectsQueryKey(userId) })
  }

  const currentProject = () =>
    userId ? queryClient.getQueryData<FilmProject>(filmCurrentQueryKey(userId)) : undefined

  return {
    addReference: useMutation({
      mutationFn: (input: { projectId: string } & ({ url: string } | { file: File })) => {
        const { projectId, ...payload } = input
        return addFilmReference(projectId, payload)
      },
      onSuccess: remember,
    }),
    analyze: useMutation({
      mutationFn: (input: { projectId: string; refId: string }) => {
        const runner = getFilmRunnerForProject(currentProject())
        return runner.analyze(input.projectId, input.refId)
      },
      onSuccess: (result) => {
        // writebackError is UI-only; do not keep it on the cached FilmProject.
        const { writebackError: _writebackError, ...project } = result
        remember(project)
      },
    }),
    approve: useMutation({
      mutationFn: (input: { projectId: string; stageId: string }) =>
        approveFilmStage(input.projectId, input.stageId),
      onSuccess: remember,
    }),
    reject: useMutation({
      mutationFn: (input: { projectId: string; stageId: string }) =>
        rejectFilmStage(input.projectId, input.stageId),
      onSuccess: remember,
    }),
  }
}
