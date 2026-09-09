import { useCallback, useEffect, useState } from "react"
import {
  resolveExecutorSourcePreference,
  subscribeExecutorSourcePreference,
  writeExecutorSourcePreference,
  type ExecutorSource,
} from "@/lib/executor-source"

/** Live preference + setter; syncs across same-tab subscribers and storage. */
export function useExecutorSource(fallback: ExecutorSource = "vps") {
  const [source, setSource] = useState<ExecutorSource>(() =>
    resolveExecutorSourcePreference(fallback),
  )

  useEffect(() => {
    return subscribeExecutorSourcePreference(() => {
      setSource(resolveExecutorSourcePreference(fallback))
    })
  }, [fallback])

  const setExecutorSource = useCallback((next: ExecutorSource) => {
    writeExecutorSourcePreference(next)
    setSource(next)
  }, [])

  return [source, setExecutorSource] as const
}
