import { useCallback, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  createPackageAssignment,
  PACKAGES_QUERY_KEY,
  updatePackageAssignment,
  type NotePackage,
} from "@/lib/api/packages"
import { studioErrorMessage } from "@/lib/api/client"
import { getAccessToken } from "@/lib/auth/tokens"
import { xhsPublishNote } from "@/lib/publish-note"
import { accountReady, type StoredAccount } from "@/session"

type PendingWriteback = {
  packageId: string
  assignmentId: string
  status: "published" | "failed"
  xhsNoteId?: string
  error?: string
}

export function usePublishNotePackage() {
  const queryClient = useQueryClient()
  const publishLock = useRef(false)
  const pendingRef = useRef<PendingWriteback | null>(null)
  const [publishingPackageId, setPublishingPackageId] = useState<string | null>(null)
  const [pendingWriteback, setPendingWriteback] = useState<PendingWriteback | null>(null)

  const rememberPending = useCallback((pending: PendingWriteback | null) => {
    pendingRef.current = pending
    setPendingWriteback(pending)
  }, [])

  const writeAssignment = useCallback(
    async (pending: PendingWriteback) => {
      await updatePackageAssignment(pending.packageId, pending.assignmentId, {
        status: pending.status,
        xhsNoteId: pending.xhsNoteId,
        error: pending.error,
      })
      rememberPending(null)
      await queryClient.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY })
    },
    [queryClient, rememberPending],
  )

  const publishPackage = useCallback(
    async (input: {
      pkg: NotePackage
      accountId: string
      selectedAccount?: StoredAccount
      onNeedLogin?: () => void
    }): Promise<string> => {
      if (publishLock.current || publishingPackageId) {
        return "正在发布，请稍候"
      }
      const pending = pendingRef.current
      if (pending) {
        return pending.packageId === input.pkg.id
          ? "上一笔发布的云端状态还没写上，请先点「重试写回」"
          : "有一笔发布状态还没写回云端，请先点「重试写回」"
      }
      const { pkg, accountId, selectedAccount, onNeedLogin } = input
      if (pkg.status !== "ready") {
        return "这篇笔记还没就绪，先补全标题、正文和图片"
      }
      if (!("__TAURI_INTERNALS__" in window)) {
        return "发布需要在桌面应用里操作"
      }
      if (!accountId.trim()) {
        onNeedLogin?.()
        return "先选要发帖的小红书账号"
      }
      if (!accountReady(selectedAccount)) {
        onNeedLogin?.()
        return "当前所选账号未登录或已过期，请先到「小红书管理」扫码"
      }
      const token = getAccessToken()
      if (!token) {
        return "请先登录 R7 云端"
      }

      publishLock.current = true
      setPublishingPackageId(pkg.id)
      let assignmentId: string | undefined
      try {
        const assignment = await createPackageAssignment(pkg.id, accountId)
        assignmentId = assignment.id
        const result = await xhsPublishNote({
          accessToken: token,
          targetXhsUserId: accountId,
          title: pkg.title,
          body: pkg.body,
          topics: pkg.topics,
          isPrivate: pkg.isPrivate,
          media: pkg.media.map((item) => ({
            s3Key: item.s3Key,
            mimeType: item.mimeType,
          })),
        })
        const nextPending: PendingWriteback = result.ok
          ? {
              packageId: pkg.id,
              assignmentId: assignment.id,
              status: "published",
              xhsNoteId: result.xhsNoteId ?? undefined,
            }
          : {
              packageId: pkg.id,
              assignmentId: assignment.id,
              status: "failed",
              error: result.message,
            }
        try {
          await writeAssignment(nextPending)
          return result.message
        } catch (error) {
          rememberPending(nextPending)
          return result.ok
            ? `已发到小红书，但云端状态没写上：${studioErrorMessage(error)}。请点「重试写回」。`
            : `发布失败，且云端状态没写上：${studioErrorMessage(error)}。请点「重试写回」。`
        }
      } catch (error) {
        const message = studioErrorMessage(error)
        if (assignmentId) {
          const nextPending: PendingWriteback = {
            packageId: pkg.id,
            assignmentId,
            status: "failed",
            error: message,
          }
          try {
            await writeAssignment(nextPending)
          } catch {
            rememberPending(nextPending)
          }
        }
        return message
      } finally {
        publishLock.current = false
        setPublishingPackageId(null)
      }
    },
    [publishingPackageId, rememberPending, writeAssignment],
  )

  const retryWriteback = useCallback(async (): Promise<string> => {
    const pending = pendingRef.current
    if (!pending) {
      return "没有待写回的状态"
    }
    setPublishingPackageId(pending.packageId)
    try {
      await writeAssignment(pending)
      return pending.status === "published" ? "云端状态已写回" : "失败状态已写回"
    } catch (error) {
      return `写回仍失败：${studioErrorMessage(error)}`
    } finally {
      setPublishingPackageId(null)
    }
  }, [writeAssignment])

  return {
    publishingPackageId,
    pendingWriteback,
    publishPackage,
    retryWriteback,
  }
}
