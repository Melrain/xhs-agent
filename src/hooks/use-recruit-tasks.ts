"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"
import { StudioApiError } from "@/lib/api/client"
import {
  getRecruitJob,
  listRecruitTasks,
  RECRUIT_TASKS_QUERY_KEY,
  type EnqueueResponse,
  type JobResponse,
} from "@/lib/api/recruit"
import type { Mode } from "@/lib/types"

export type RecruitImageMode = "t2i" | "i2i" | "i2v"

export function isRecruitImageMode(mode: Mode): mode is RecruitImageMode {
  return mode === "t2i" || mode === "i2i" || mode === "i2v"
}

export function isRecruitJobBusy(status?: JobResponse["status"]) {
  return status === "queued" || status === "running"
}

export function isNotFoundJobError(error: unknown) {
  return error instanceof StudioApiError && error.status === 404
}

export function useRecruitTasks() {
  return useQuery({
    queryKey: RECRUIT_TASKS_QUERY_KEY,
    queryFn: listRecruitTasks,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  })
}

export function useRecruitJob(taskId?: string) {
  return useQuery({
    queryKey: ["recruit-job", taskId],
    queryFn: () => getRecruitJob(taskId!),
    enabled: Boolean(taskId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return isRecruitJobBusy(status) ? 2_000 : false
    },
    retry: (count, error) => {
      if (isNotFoundJobError(error)) return false
      return count < 1
    },
  })
}

const JOB_MODES: RecruitImageMode[] = ["t2i", "i2i", "i2v"]

export function useRecruitImageJobs() {
  const queryClient = useQueryClient()
  const tasksQuery = useRecruitTasks()
  const [localTaskIds, setLocalTaskIds] = useState<
    Partial<Record<RecruitImageMode, string>>
  >({})
  const [enqueueing, setEnqueueing] = useState<
    Partial<Record<RecruitImageMode, boolean>>
  >({})
  const [localStartedAt, setLocalStartedAt] = useState<
    Partial<Record<RecruitImageMode, number>>
  >({})
  const enqueueingRef = useRef<Partial<Record<RecruitImageMode, boolean>>>({})

  const latestFromList = useCallback(
    (origin: RecruitImageMode) =>
      (tasksQuery.data ?? []).find((task) => task.origin === origin),
    [tasksQuery.data],
  )

  const t2iId = localTaskIds.t2i ?? latestFromList("t2i")?.taskId
  const i2iId = localTaskIds.i2i ?? latestFromList("i2i")?.taskId
  const i2vId = localTaskIds.i2v ?? latestFromList("i2v")?.taskId
  const t2iJob = useRecruitJob(t2iId)
  const i2iJob = useRecruitJob(i2iId)
  const i2vJob = useRecruitJob(i2vId)

  const jobFor = useCallback(
    (mode: RecruitImageMode) => {
      if (mode === "t2i") return t2iJob
      if (mode === "i2i") return i2iJob
      return i2vJob
    },
    [i2iJob, i2vJob, t2iJob],
  )

  const idFor = useCallback(
    (mode: RecruitImageMode) => {
      if (mode === "t2i") return t2iId
      if (mode === "i2i") return i2iId
      return i2vId
    },
    [i2iId, i2vId, t2iId],
  )

  const isBusy = useCallback(
    (mode: RecruitImageMode) => {
      if (enqueueing[mode] || enqueueingRef.current[mode]) return true
      const job = jobFor(mode)
      if (isRecruitJobBusy(job.data?.status)) return true
      const taskId = idFor(mode)
      if (taskId && !job.data && !job.error) return true
      return false
    },
    [enqueueing, idFor, jobFor],
  )

  const enqueue = useCallback(
    async (mode: RecruitImageMode, start: () => Promise<EnqueueResponse>) => {
      if (enqueueingRef.current[mode] || isBusy(mode)) return
      enqueueingRef.current[mode] = true
      setEnqueueing((current) => ({ ...current, [mode]: true }))
      try {
        const enqueued = await start()
        setLocalTaskIds((current) => ({ ...current, [mode]: enqueued.taskId }))
        setLocalStartedAt((current) => ({ ...current, [mode]: Date.now() }))
        await queryClient.invalidateQueries({ queryKey: RECRUIT_TASKS_QUERY_KEY })
        return enqueued
      } finally {
        enqueueingRef.current[mode] = false
        setEnqueueing((current) => ({ ...current, [mode]: false }))
      }
    },
    [isBusy, queryClient],
  )

  const clearLocal = useCallback((mode: RecruitImageMode) => {
    setLocalTaskIds((current) => {
      const { [mode]: _removed, ...rest } = current
      return rest
    })
    setLocalStartedAt((current) => {
      const { [mode]: _removed, ...rest } = current
      return rest
    })
  }, [])

  const startedAtFor = useCallback(
    (mode: RecruitImageMode) => {
      if (localStartedAt[mode]) return localStartedAt[mode]
      const latest = latestFromList(mode)
      const currentId = idFor(mode)
      if (!latest || latest.taskId !== currentId) return undefined
      const createdAt = Date.parse(latest.createdAt)
      return Number.isNaN(createdAt) ? undefined : createdAt
    },
    [idFor, latestFromList, localStartedAt],
  )

  return {
    tasksQuery,
    modes: JOB_MODES,
    t2iId,
    i2iId,
    i2vId,
    t2iJob,
    i2iJob,
    i2vJob,
    jobFor,
    idFor,
    isBusy,
    enqueue,
    enqueueing,
    clearLocal,
    latestFromList,
    startedAtFor,
  }
}
