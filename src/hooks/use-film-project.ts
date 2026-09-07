import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFilmProject,
  deleteFilmProject,
  filmCurrentQueryKey,
  filmProjectsQueryKey,
  FILM_QUERY_KEY,
  getCurrentFilmProject,
  listFilmProjects,
  openFilmProject,
  renameFilmProject,
  type FilmProject,
} from "@/lib/api/film"
import { getStoredUser } from "@/lib/auth/tokens"
import { clearFilmHidden, clearFilmLayout } from "@/lib/film-client-state"
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
  })

  useEffect(() => {
    if (query.data?.id && userId) {
      void queryClient.invalidateQueries({ queryKey: filmProjectsQueryKey(userId) })
    }
  }, [query.data?.id, queryClient, userId])

  return query
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
