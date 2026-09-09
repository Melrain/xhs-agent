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
import {
  asLookCards,
  mergeCharacterCards,
  mergeLookList,
  pendingCharacterIdsFromLooks,
} from "@/lib/look-cache"
import { resolveDesktopMediaUrl } from "@/lib/media-src"

/** 有卡在生成时贴着轮询，闲下来就退回到「预签名 URL 快过期了再刷一次」。 */
const BUSY_POLL_MS = 2_000
const IDLE_REFRESH_MS = 45 * 60 * 1000

export function useCharacters() {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: CHARACTERS_QUERY_KEY,
    queryFn: async () => {
      const previous = queryClient.getQueryData<CharacterCard[]>(CHARACTERS_QUERY_KEY)
      const incoming = await listCharacters()
      const pendingIds = pendingCharacterIdsFromLooks(
        queryClient
          .getQueriesData<LookList>({ queryKey: LOOKS_QUERY_KEY })
          .map(([, list]) => list),
      )
      return mergeCharacterCards(previous, incoming, pendingIds)
    },
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
    select: stabilizeCharacterDetail,
  })
}

export function useLooks(characterId?: string, enabled = true) {
  const queryClient = useQueryClient()
  const key = looksQueryKey(characterId)
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const previous = queryClient.getQueryData<LookList>(key)
      const incoming = await listLooks(characterId)
      return mergeLookList(previous, incoming)
    },
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
    url: resolveDesktopMediaUrl(`character:${card.id}`, card.url, card.s3Key) ?? card.url,
  }))
}

function stabilizeCharacterDetail(detail: CharacterDetail): CharacterDetail {
  return {
    ...detail,
    url: resolveDesktopMediaUrl(`character:${detail.id}`, detail.url, detail.s3Key) ?? detail.url,
    looks: stabilizeLookUrls(detail.looks),
  }
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
    url: resolveDesktopMediaUrl(`look:${look.id}`, look.url, look.s3Key),
  }))
}

function hasPendingLook(detail?: CharacterDetail) {
  return hasPendingLooks(detail?.looks)
}

function hasPendingLooks(looks?: LookCard[]) {
  return (looks ?? []).some((look) => look.status === "pending")
}

/**
 * 入队成功后立刻把 pending 卡塞进 looks 缓存。
 * 必须写 ["looks"] 和 ["looks", characterId]，妆造台默认按当前底图订阅后者。
 */
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
        total:
          current.total +
          incoming.filter((look) =>
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

/** 人物卡墙的 pendingCount 也要立刻 +N，否则 SSE/2s poll 的开关读不到 pending。 */
function bumpCharacterPendingCounts(queryClient: QueryClient, created: LookCard[]) {
  const pendingByCharacter = new Map<string, number>()
  for (const look of created) {
    if (look.status !== "pending") continue
    pendingByCharacter.set(
      look.characterId,
      (pendingByCharacter.get(look.characterId) ?? 0) + 1,
    )
  }
  if (pendingByCharacter.size === 0) return

  queryClient.setQueryData<CharacterCard[]>(CHARACTERS_QUERY_KEY, (cards) => {
    if (!cards) return cards
    return cards.map((card) => {
      const delta = pendingByCharacter.get(card.id)
      if (!delta) return card
      return {
        ...card,
        lookCount: card.lookCount + delta,
        pendingCount: card.pendingCount + delta,
      }
    })
  })
}

/** retry 把已有卡打回 pending，并反映到卡墙计数。 */
function markLookPendingInCache(queryClient: QueryClient, look: LookCard) {
  const pending: LookCard = { ...look, status: "pending", error: null, url: null }

  const write = (key: readonly unknown[]) => {
    queryClient.setQueryData<LookList>(key, (current) => {
      if (!current) {
        return { looks: [pending], total: 1 }
      }
      const exists = current.looks.some((row) => row.id === pending.id)
      return {
        looks: exists
          ? current.looks.map((row) => (row.id === pending.id ? pending : row))
          : [pending, ...current.looks],
        total: exists ? current.total : current.total + 1,
      }
    })
  }

  write(LOOKS_QUERY_KEY)
  write(looksQueryKey(look.characterId))

  queryClient.setQueryData<CharacterCard[]>(CHARACTERS_QUERY_KEY, (cards) => {
    if (!cards) return cards
    return cards.map((card) =>
      card.id === look.characterId
        ? {
            ...card,
            pendingCount: card.pendingCount + (look.status === "pending" ? 0 : 1),
          }
        : card,
    )
  })
}

/**
 * 取消进行中的 looks/characters 请求，避免「入队前发出的旧列表」在 prepend 之后才返回、
 * 把 pending 乐观更新盖掉 → CTA 解锁、2s poll/SSE 都关、只能整页刷新才看见成片。
 */
async function cancelStaleListFetches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: CHARACTERS_QUERY_KEY }),
    queryClient.cancelQueries({ queryKey: LOOKS_QUERY_KEY }),
  ])
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
      onSuccess: async (created) => {
        const looks = asLookCards<LookCard>(created)
        await cancelStaleListFetches(queryClient)
        prependLooks(queryClient, looks)
        bumpCharacterPendingCounts(queryClient, looks)
        // Do not await refetch: an in-flight/stale list must not replace optimistic pending.
        // SSE + 2s poll (and mergeLookList) bring the ready row in.
        void refresh()
      },
    }),
    retry: useMutation({
      mutationFn: (input: { lookId: string; settings: RenderSettings }) =>
        retryLook(input.lookId, input.settings),
      onSuccess: async (look) => {
        await cancelStaleListFetches(queryClient)
        markLookPendingInCache(queryClient, look)
        void refresh()
      },
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
