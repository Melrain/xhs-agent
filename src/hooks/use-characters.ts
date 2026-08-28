"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { useCallback } from "react"
import {
  CHARACTERS_QUERY_KEY,
  LOOKS_QUERY_KEY,
  characterQueryKey,
  createCharacters,
  deleteCharacter,
  deleteLook,
  generateLooks,
  getCharacter,
  listCharacters,
  listLooks,
  looksQueryKey,
  renameCharacter,
  retryLook,
  saveLookAsCharacter,
  type CharacterCard,
  type CharacterDetail,
  type LookCard,
  type LookList,
  type LookRequest,
  type RenderSettings,
} from "@/lib/api/characters"
import { reusePresignedUrl } from "@/lib/media-url"

/** 有卡在生成时贴着轮询，闲下来就退回到「预签名 URL 快过期了再刷一次」。 */
const BUSY_POLL_MS = 2_000
const IDLE_REFRESH_MS = 45 * 60 * 1000

export function useCharacters() {
  return useQuery({
    queryKey: CHARACTERS_QUERY_KEY,
    queryFn: listCharacters,
    staleTime: BUSY_POLL_MS,
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((card) => card.pendingCount > 0)
        ? BUSY_POLL_MS
        : IDLE_REFRESH_MS,
    select: stabilizeCharacterUrls,
  })
}

export function useCharacter(id: string) {
  return useQuery({
    queryKey: characterQueryKey(id),
    queryFn: () => getCharacter(id),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      hasPendingLook(query.state.data) ? BUSY_POLL_MS : IDLE_REFRESH_MS,
    retry: false,
  })
}

export function useLooks(characterId?: string, enabled = true) {
  return useQuery({
    queryKey: looksQueryKey(characterId),
    queryFn: () => listLooks(characterId),
    enabled,
    staleTime: BUSY_POLL_MS,
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      hasPendingLooks(query.state.data?.looks) ? BUSY_POLL_MS : IDLE_REFRESH_MS,
    select: stabilizeLookList,
  })
}

function stabilizeCharacterUrls(cards: CharacterCard[]) {
  return cards.map((card) => ({
    ...card,
    url: reusePresignedUrl(`character:${card.id}`, card.url) ?? card.url,
  }))
}

function stabilizeLookList(list: LookList): LookList {
  return {
    looks: stabilizeLookUrls(list.looks),
    total: list.total,
  }
}

function stabilizeLookUrls(looks: LookCard[]) {
  return looks.map((look) => ({
    ...look,
    url: reusePresignedUrl(`look:${look.id}`, look.url),
  }))
}

function hasPendingLook(detail?: CharacterDetail) {
  return hasPendingLooks(detail?.looks)
}

function hasPendingLooks(looks?: LookCard[]) {
  return (looks ?? []).some((look) => look.status === "pending")
}

function prependLooks(queryClient: QueryClient, created: LookCard[]) {
  if (created.length === 0) return

  const write = (key: readonly string[], incoming: LookCard[]) => {
    queryClient.setQueryData<LookList>(key, (current) => {
      if (!current) {
        return { looks: incoming, total: incoming.length }
      }
      const seen = new Set(incoming.map((look) => look.id))
      return {
        looks: [...incoming, ...current.looks.filter((look) => !seen.has(look.id))],
        total: current.total + incoming.filter((look) =>
          current.looks.every((row) => row.id !== look.id),
        ).length,
      }
    })
  }

  write(LOOKS_QUERY_KEY, created)
  const byCharacter = new Map<string, LookCard[]>()
  for (const look of created) {
    const bucket = byCharacter.get(look.characterId) ?? []
    bucket.push(look)
    byCharacter.set(look.characterId, bucket)
  }
  for (const [characterId, looks] of byCharacter) {
    write(looksQueryKey(characterId), looks)
  }
}

/** 卡片增删改都会同时影响卡墙和详情，所以统一刷这两处。 */
export function useCharacterMutations(characterId?: string) {
  const queryClient = useQueryClient()

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CHARACTERS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: LOOKS_QUERY_KEY }),
      characterId
        ? queryClient.invalidateQueries({ queryKey: characterQueryKey(characterId) })
        : Promise.resolve(),
    ])
  }, [characterId, queryClient])

  return {
    create: useMutation({
      mutationFn: (files: File[]) => createCharacters(files),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: (input: { id: string; name: string }) =>
        renameCharacter(input.id, input.name),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteCharacter(id),
      onSuccess: refresh,
    }),
    generate: useMutation({
      mutationFn: (input: {
        characterId: string
        looks: LookRequest[]
        settings: RenderSettings
      }) => generateLooks(input.characterId, input.looks, input.settings),
      onSuccess: (created) => {
        prependLooks(queryClient, created)
        return refresh()
      },
    }),
    retry: useMutation({
      mutationFn: (input: { lookId: string; settings: RenderSettings }) =>
        retryLook(input.lookId, input.settings),
      onSuccess: refresh,
    }),
    removeLook: useMutation({
      mutationFn: (lookId: string) => deleteLook(lookId),
      onSuccess: refresh,
    }),
    promoteLook: useMutation({
      mutationFn: (lookId: string) => saveLookAsCharacter(lookId),
      onSuccess: refresh,
    }),
  }
}
