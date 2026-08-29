import { useCallback, useEffect, useState } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { useNotePackageMutations, useNotePackages } from "@/hooks/use-note-packages"
import { usePublishNotePackage } from "@/hooks/use-publish-note-package"
import type { NoteAssignment, NotePackage } from "@/lib/api/packages"
import { CreateNoteWizard } from "@/workspaces/CreateNoteWizard"
import { accountLabel, sessionSnapshot, type StoredAccount } from "@/session"

type Props = {
  active?: boolean
  onNeedLogin?: () => void
}

function statusLabel(status: NotePackage["status"]) {
  if (status === "ready") return "已完成"
  if (status === "draft") return "草稿"
  if (status === "archived") return "已归档"
  return status
}

function assignmentText(assignment: NoteAssignment) {
  if (assignment.status === "published") {
    return assignment.xhsNoteId ? `已发布 · ${assignment.xhsNoteId}` : "已发布"
  }
  if (assignment.status === "publishing") return "发布中"
  if (assignment.status === "failed") {
    return assignment.error ? `失败 · ${assignment.error}` : "发布失败"
  }
  return assignment.status
}

function formatNoteDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function NotesWorkspace({ active = true, onNeedLogin }: Props) {
  const packagesQuery = useNotePackages({ enabled: active })
  const mut = useNotePackageMutations()
  const { publishingPackageId, pendingWriteback, publishPackage, retryWriteback } =
    usePublishNotePackage()

  const [editingPackage, setEditingPackage] = useState<NotePackage | null | undefined>(undefined)
  const [accounts, setAccounts] = useState<StoredAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState("")
  const [hint, setHint] = useState<string | null>(null)

  const refreshSession = useCallback(() => {
    if (!("__TAURI_INTERNALS__" in window)) return
    void sessionSnapshot()
      .then((snapshot) => {
        setAccounts(snapshot.accounts)
        setActiveAccountId((current) => {
          if (current && snapshot.accounts.some((account) => account.xhsUserId === current)) {
            return current
          }
          return snapshot.activeAccountId ?? snapshot.accounts[0]?.xhsUserId ?? ""
        })
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!active) return
    refreshSession()
  }, [active, refreshSession])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && active) {
        refreshSession()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [active, refreshSession])

  const selectedAccount = accounts.find((account) => account.xhsUserId === activeAccountId)
  const packages = packagesQuery.data ?? []

  async function handlePublish(pkg: NotePackage) {
    setHint(null)
    const message = await publishPackage({
      pkg,
      accountId: activeAccountId,
      selectedAccount,
      onNeedLogin,
    })
    setHint(message)
  }

  async function handleDelete(pkg: NotePackage) {
    if (!window.confirm(`确定删除笔记「${pkg.title || "未命名"}」？`)) {
      return
    }
    setHint(null)
    try {
      await mut.remove.mutateAsync(pkg.id)
      setHint("已删除")
    } catch (error) {
      setHint(studioErrorMessage(error))
    }
  }

  if (editingPackage !== undefined) {
    return (
      <CreateNoteWizard
        initial={editingPackage ?? undefined}
        onCancel={() => setEditingPackage(undefined)}
        onDone={(message) => {
          setEditingPackage(undefined)
          setHint(message ?? "已保存")
        }}
      />
    )
  }

  return (
    <div className="workspace notes">
      <header className="notes-toolbar">
        <div className="notes-toolbar-meta">
          <p className={hint ? "status-text" : "status-text notes-toolbar-hint"}>
            {hint ?? "组好的笔记会保存在云端，选好账号后一键发到小红书。"}
          </p>
          {pendingWriteback ? (
            <button
              type="button"
              className="ghost-btn compact"
              disabled={Boolean(publishingPackageId)}
              onClick={() => void retryWriteback().then(setHint)}
            >
              重试写回云端状态
            </button>
          ) : null}
        </div>
        <div className="notes-toolbar-actions">
          <label className="field notes-account-field">
            <span>发布账号</span>
            <select
              value={activeAccountId}
              onChange={(event) => setActiveAccountId(event.target.value)}
              disabled={Boolean(publishingPackageId)}
            >
              {accounts.length === 0 ? <option value="">还没有本机账号</option> : null}
              {accounts.map((account) => (
                <option key={account.xhsUserId} value={account.xhsUserId}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary-btn" onClick={() => setEditingPackage(null)}>
            创建笔记
          </button>
        </div>
      </header>

      {packagesQuery.isLoading && packages.length === 0 ? (
        <div className="notes-state">
          <p className="status-text">加载中…</p>
        </div>
      ) : null}
      {packagesQuery.error && packages.length === 0 ? (
        <div className="notes-state">
          <p className="status-text error">{studioErrorMessage(packagesQuery.error)}</p>
        </div>
      ) : null}

      {!packagesQuery.isLoading && packages.length === 0 && !packagesQuery.error ? (
        <div className="notes-state">
          <p className="notes-empty-title">还没有笔记</p>
          <p className="status-text">从素材库选图，生成文案后就能发到小红书。</p>
          <button type="button" className="primary-btn" onClick={() => setEditingPackage(null)}>
            创建笔记
          </button>
        </div>
      ) : null}

      {packages.length > 0 ? (
        <ul className="notes-library">
          {packages.map((pkg) => {
            const cover = pkg.media[0]
            const extra = Math.max(0, pkg.media.length - 1)
            const latest = pkg.assignments[0]
            return (
              <li key={pkg.id} className="note-card">
                <button
                  type="button"
                  className="note-card-open"
                  onClick={() => setEditingPackage(pkg)}
                >
                  <div className="note-card-cover">
                    {cover ? <img src={cover.url} alt="" /> : <span>无图</span>}
                    <span className={`note-status is-${pkg.status}`}>{statusLabel(pkg.status)}</span>
                    {extra > 0 ? <span className="note-card-count">+{extra}</span> : null}
                  </div>
                  <div className="note-card-copy">
                    <strong>{pkg.title || "未命名"}</strong>
                    <p>{pkg.body || "还没写正文"}</p>
                    {pkg.topics.length > 0 ? (
                      <div className="note-topic-row">
                        {pkg.topics.slice(0, 3).map((topic) => (
                          <span key={topic}>#{topic}</span>
                        ))}
                      </div>
                    ) : null}
                    <p className="note-card-meta">
                      {formatNoteDate(pkg.updatedAt)}
                      {latest ? ` · ${assignmentText(latest)}` : ""}
                    </p>
                  </div>
                </button>
                <div className="note-card-actions">
                  <button
                    type="button"
                    className="primary-btn compact"
                    disabled={
                      Boolean(publishingPackageId) ||
                      Boolean(pendingWriteback) ||
                      pkg.status !== "ready"
                    }
                    onClick={() => void handlePublish(pkg)}
                  >
                    {pkg.status !== "ready"
                      ? "草稿未完成"
                      : publishingPackageId === pkg.id
                        ? "发布中…"
                        : "发到小红书"}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn compact"
                    disabled={mut.remove.isPending}
                    onClick={() => void handleDelete(pkg)}
                  >
                    删除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
