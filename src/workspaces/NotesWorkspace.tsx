import { useCallback, useEffect, useState } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { useNotePackageMutations, useNotePackages } from "@/hooks/use-note-packages"
import { usePublishNotePackage } from "@/hooks/use-publish-note-package"
import type { NotePackage } from "@/lib/api/packages"
import { CreateNoteWizard } from "@/workspaces/CreateNoteWizard"
import { accountLabel, sessionSnapshot, type StoredAccount } from "@/session"

type Props = {
  active?: boolean
  onNeedLogin?: () => void
}

function statusLabel(status: NotePackage["status"]) {
  if (status === "ready") return "已完成"
  if (status === "draft") return "草稿"
  return status
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
      <header className="notes-head">
        <div>
          <p className="section-label">笔记</p>
          <p className="status-text">组好的笔记会保存在云端，选好账号后一键发到小红书。</p>
        </div>
        <div className="row">
          <label className="field package-account-field">
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

      {hint ? <p className="status-text">{hint}</p> : null}
      {pendingWriteback ? (
        <button
          type="button"
          className="ghost-btn"
          disabled={Boolean(publishingPackageId)}
          onClick={() => void retryWriteback().then(setHint)}
        >
          重试写回云端状态
        </button>
      ) : null}

      {packagesQuery.isLoading ? <p className="status-text">加载中…</p> : null}
      {packagesQuery.error ? (
        <p className="status-text error">{studioErrorMessage(packagesQuery.error)}</p>
      ) : null}

      <ul className="package-list">
        {(packagesQuery.data ?? []).map((pkg) => (
          <li key={pkg.id} className="package-card">
            <button
              type="button"
              className="package-card-open"
              onClick={() => setEditingPackage(pkg)}
            >
              <div className="package-card-head">
                <strong>{pkg.title || "未命名"}</strong>
                <span className="package-status">{statusLabel(pkg.status)}</span>
              </div>
              <p className="package-card-body">
                {pkg.body.slice(0, 120)}
                {pkg.body.length > 120 ? "…" : ""}
              </p>
              <div className="package-thumb-row">
                {pkg.media.slice(0, 4).map((item) => (
                  <img key={item.id} src={item.url} alt="" />
                ))}
                {pkg.media.length > 4 ? <span>+{pkg.media.length - 4}</span> : null}
              </div>
            </button>
            <div className="row">
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
            {pkg.assignments[0] ? (
              <p className="status-text">
                最近投放：{pkg.assignments[0].status}
                {pkg.assignments[0].xhsNoteId ? ` · ${pkg.assignments[0].xhsNoteId}` : ""}
                {pkg.assignments[0].error ? ` · ${pkg.assignments[0].error}` : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {!packagesQuery.isLoading && (packagesQuery.data ?? []).length === 0 ? (
        <p className="status-text">还没有笔记，点「创建笔记」开始组稿。</p>
      ) : null}
    </div>
  )
}
