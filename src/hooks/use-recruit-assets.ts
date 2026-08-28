"use client"

import { useQuery } from "@tanstack/react-query"
import {
  RECRUIT_ASSETS_QUERY_KEY,
  listRecruitAssets,
  type RecruitAssetRecord,
} from "@/lib/api/recruit"
import type { Asset, Mode } from "@/lib/types"

function isModeOrigin(value: string): value is Mode {
  return value === "t2i" || value === "i2i" || value === "text-overlay" || value === "i2v"
}

export function toRecruitAsset(record: RecruitAssetRecord): Asset {
  return {
    id: record.id,
    kind: record.kind === "video" ? "video" : "image",
    url: record.url,
    s3Key: record.s3Key,
    origin: isModeOrigin(record.origin) ? record.origin : "t2i",
    prompt: record.prompt,
    createdAt: Date.parse(record.createdAt) || Date.now(),
  }
}

const PREVIEW_REFRESH_MS = 45 * 60 * 1000

export function useRecruitAssets() {
  const query = useQuery({
    queryKey: RECRUIT_ASSETS_QUERY_KEY,
    queryFn: listRecruitAssets,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: PREVIEW_REFRESH_MS,
  })

  return {
    assets: (query.data ?? []).map(toRecruitAsset),
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
