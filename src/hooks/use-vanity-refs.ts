"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  deleteVanityUserRef,
  listVanityUserRefs,
  renameVanityUserRef,
  toVanityUserRef,
  uploadVanityUserRef,
} from "@/lib/api/vanity-refs"
import { reusePresignedUrl } from "@/lib/media-url"
import type { VanityKind, VanityRef } from "@/lib/vanity-refs"

export const VANITY_USER_REFS_KEY = ["vanity-user-refs"] as const

export function vanityUserRefsKey(kind: VanityKind) {
  return [...VANITY_USER_REFS_KEY, kind] as const
}

const IDLE_REFRESH_MS = 45 * 60 * 1000

export function useVanityUserRefs(kind: VanityKind) {
  return useQuery({
    queryKey: vanityUserRefsKey(kind),
    queryFn: () => listVanityUserRefs(kind),
    staleTime: 2_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: IDLE_REFRESH_MS,
    select: (cards) =>
      cards.map((card) =>
        toVanityUserRef({
          ...card,
          url:
            reusePresignedUrl(`vanity-ref:${card.id}`, card.url) ?? card.url,
        }),
      ),
  })
}

export function useVanityUserRefMutations(kind: VanityKind) {
  const queryClient = useQueryClient()
  const key = vanityUserRefsKey(kind)

  return {
    upload: useMutation({
      mutationFn: (file: File) => uploadVanityUserRef(kind, file),
      onSuccess: (card) => {
        queryClient.setQueryData(key, (current: unknown) => {
          const list = Array.isArray(current) ? current : []
          return [card, ...list.filter((item) => item.id !== card.id)]
        })
        return toVanityUserRef(card)
      },
    }),
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) =>
        renameVanityUserRef(id, title),
      onSuccess: (card) => {
        queryClient.setQueryData(key, (current: unknown) => {
          const list = Array.isArray(current) ? current : []
          return list.map((item: { id: string }) =>
            item.id === card.id ? card : item,
          )
        })
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteVanityUserRef(id),
      onSuccess: (_ok, id) => {
        queryClient.setQueryData(key, (current: unknown) => {
          const list = Array.isArray(current) ? current : []
          return list.filter((item: { id: string }) => item.id !== id)
        })
      },
    }),
  }
}

export function allUserRefs(makeup?: VanityRef[], wardrobe?: VanityRef[]) {
  return [...(makeup ?? []), ...(wardrobe ?? [])]
}
