import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { generateRecruitCopy } from "@/lib/api/copy"
import {
  createPackageAssignment,
  PACKAGES_QUERY_KEY,
  updatePackageAssignment,
  type NotePackage,
} from "@/lib/api/packages"
import { studioErrorMessage } from "@/lib/api/client"
import { getAccessToken } from "@/lib/auth/tokens"
import { useNotePackageMutations, useNotePackages } from "@/hooks/use-note-packages"
import { xhsPublishNote } from "@/lib/publish-note"
import type { Asset } from "@/lib/types"
import { accountLabel, sessionSnapshot, type StoredAccount } from "@/session"

const MAX_IMAGES = 9

type Props = {
  assets: Asset[]
  active?: boolean
  onNeedLogin: () => void
}

type SelectedEntry =
  | { kind: "asset"; assetId: string }
  | { kind: "orphan"; mediaId: string; url: string; s3Key: string }

type PendingWriteback = {
  packageId: string
  assignmentId: string
  status: "published" | "failed"
  xhsNoteId?: string
  error?: string
}

type DisplayItem = {
  key: string
  url: string
  label: string
  orphan: boolean
}

function sameTopics(left: string[], right: string[]) {
  return left.join("\0") === right.join("\0")
}

function accountReady(account?: StoredAccount) {
  return Boolean(account?.hasSession && account.sessionOk)
}

export function RecruitPackagesPanel({ assets, active = true, onNeedLogin }: Props) {
  const queryClient = useQueryClient()
  const packagesQuery = useNotePackages()
  const mut = useNotePackageMutations()

  const [accounts, setAccounts] = useState<StoredAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string>("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedEntry[]>([])
  const [mediaDirty, setMediaDirty] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [topicsText, setTopicsText] = useState("")
  const [job, setJob] = useState("")
  const [persona, setPersona] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)

  const [copyBusy, setCopyBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [pendingWriteback, setPendingWriteback] = useState<PendingWriteback | null>(null)

  const publishLock = useRef(false)

  const packableAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "image" && asset.s3Key),
    [assets],
  )

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

  const topics = useMemo(
    () =>
      topicsText
        .split(/[,，\s]+/)
        .map((item) => item.trim().replace(/^#+/, ""))
        .filter(Boolean),
    [topicsText],
  )

  const selectedAccount = accounts.find((account) => account.xhsUserId === activeAccountId)

  function entriesFromPackage(pkg: NotePackage): SelectedEntry[] {
    return pkg.media.map((item) => {
      const byId = item.studioAssetId
        ? packableAssets.find((asset) => asset.id === item.studioAssetId)
        : undefined
      const byKey = packableAssets.find((asset) => asset.s3Key && asset.s3Key === item.s3Key)
      const match = byId ?? byKey
      if (match) {
        return { kind: "asset" as const, assetId: match.id }
      }
      return {
        kind: "orphan" as const,
        mediaId: item.id,
        url: item.url,
        s3Key: item.s3Key,
      }
    })
  }

  function resetForm() {
    setEditingId(null)
    setSelected([])
    setMediaDirty(false)
    setTitle("")
    setBody("")
    setTopicsText("")
    setJob("")
    setPersona("")
    setIsPrivate(false)
    setHint(null)
  }

  function loadPackage(pkg: NotePackage) {
    setEditingId(pkg.id)
    setTitle(pkg.title)
    setBody(pkg.body)
    setTopicsText(pkg.topics.join(" "))
    setJob(pkg.job ?? "")
    setPersona(pkg.persona ?? "")
    setIsPrivate(pkg.isPrivate)
    const entries = entriesFromPackage(pkg)
    setSelected(entries)
    setMediaDirty(false)
    setHint(
      entries.some((item) => item.kind === "orphan")
        ? "部分图片已不在素材库，仍可只改文案保存，或移除后换成新图"
        : null,
    )
  }

  function isDirtyAgainst(pkg: NotePackage) {
    if (editingId !== pkg.id) return false
    return (
      title.trim() !== pkg.title ||
      body.trim() !== pkg.body ||
      !sameTopics(topics, pkg.topics) ||
      (job.trim() || "") !== (pkg.job ?? "") ||
      (persona.trim() || "") !== (pkg.persona ?? "") ||
      isPrivate !== pkg.isPrivate ||
      mediaDirty
    )
  }

  function toggleAsset(assetId: string) {
    const exists = selected.some((item) => item.kind === "asset" && item.assetId === assetId)
    if (exists) {
      setMediaDirty(true)
      setSelected(selected.filter((item) => !(item.kind === "asset" && item.assetId === assetId)))
      return
    }
    if (selected.length >= MAX_IMAGES) {
      setHint(`最多选 ${MAX_IMAGES} 张图`)
      return
    }
    setMediaDirty(true)
    setSelected([...selected, { kind: "asset", assetId }])
  }

  function removeOrphan(mediaId: string) {
    setMediaDirty(true)
    setSelected((current) =>
      current.filter((item) => !(item.kind === "orphan" && item.mediaId === mediaId)),
    )
  }

  function moveSelected(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= selected.length) return
    const next = [...selected]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setMediaDirty(true)
    setSelected(next)
  }

  async function generateCopy() {
    const trimmedJob = job.trim()
    if (!trimmedJob) {
      setHint("先填岗位，才能生成文案")
      return
    }
    setCopyBusy(true)
    setHint(null)
    try {
      const copy = await generateRecruitCopy({
        job: trimmedJob,
        persona: persona.trim() || undefined,
      })
      setTitle(copy.title)
      setBody(copy.body)
      setTopicsText(copy.tags.join(" "))
      setHint("文案已生成，可再改几句")
    } catch (error) {
      setHint(studioErrorMessage(error))
    } finally {
      setCopyBusy(false)
    }
  }

  async function savePackage() {
    if (selected.length === 0) {
      setHint("至少选一张图")
      return
    }
    setSaveBusy(true)
    setHint(null)
    try {
      const payload = {
        title,
        body,
        topics,
        job: job.trim(),
        persona: persona.trim(),
        isPrivate,
      }
      if (editingId) {
        const updated = await mut.update.mutateAsync({
          id: editingId,
          ...payload,
          ...(mediaDirty
            ? {
                mediaItems: selected.map((item) =>
                  item.kind === "asset"
                    ? { studioAssetId: item.assetId }
                    : { keepMediaId: item.mediaId },
                ),
              }
            : {}),
        })
        setSelected(entriesFromPackage(updated))
        setMediaDirty(false)
        setHint("发布包已更新")
      } else {
        const assetIds = selected
          .filter((item): item is Extract<SelectedEntry, { kind: "asset" }> => item.kind === "asset")
          .map((item) => item.assetId)
        if (assetIds.length === 0) {
          setHint("新建发布包需要从素材库选图")
          return
        }
        const created = await mut.create.mutateAsync({ ...payload, assetIds })
        setEditingId(created.id)
        setSelected(entriesFromPackage(created))
        setMediaDirty(false)
        setHint("发布包已保存")
      }
    } catch (error) {
      setHint(studioErrorMessage(error))
    } finally {
      setSaveBusy(false)
    }
  }

  async function writeAssignment(pending: PendingWriteback) {
    await updatePackageAssignment(pending.packageId, pending.assignmentId, {
      status: pending.status,
      xhsNoteId: pending.xhsNoteId,
      error: pending.error,
    })
    setPendingWriteback(null)
    await queryClient.invalidateQueries({ queryKey: PACKAGES_QUERY_KEY })
  }

  async function retryWriteback() {
    if (!pendingWriteback) return
    setPublishBusy(true)
    try {
      await writeAssignment(pendingWriteback)
      setHint(pendingWriteback.status === "published" ? "云端状态已写回" : "失败状态已写回")
    } catch (error) {
      setHint(`写回仍失败：${studioErrorMessage(error)}`)
    } finally {
      setPublishBusy(false)
    }
  }

  async function publishPackage(pkg: NotePackage) {
    if (publishLock.current || publishBusy) return
    if (pkg.status !== "ready") {
      setHint("这个包还没就绪，先补全标题、正文和图片")
      return
    }
    if (isDirtyAgainst(pkg)) {
      setHint("这个包有未保存的修改，请先保存再发布")
      return
    }
    if (!("__TAURI_INTERNALS__" in window)) {
      setHint("发布需要在桌面应用里操作")
      return
    }
    const accountId = activeAccountId.trim()
    if (!accountId) {
      setHint("先选要发帖的小红书账号")
      onNeedLogin()
      return
    }
    if (!accountReady(selectedAccount)) {
      setHint("当前所选账号未登录或已过期，请先到「小红书管理」扫码")
      onNeedLogin()
      return
    }
    const token = getAccessToken()
    if (!token) {
      setHint("请先登录 R7 云端")
      return
    }

    publishLock.current = true
    setPublishBusy(true)
    setHint("正在发布到所选账号…")
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
      const pending: PendingWriteback = result.ok
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
        await writeAssignment(pending)
        setHint(result.ok ? result.message : result.message)
      } catch (error) {
        setPendingWriteback(pending)
        setHint(
          result.ok
            ? `已发到小红书，但云端状态没写上：${studioErrorMessage(error)}。请点「重试写回」。`
            : `发布失败，且云端状态没写上：${studioErrorMessage(error)}。请点「重试写回」。`,
        )
      }
    } catch (error) {
      const message = studioErrorMessage(error)
      if (assignmentId) {
        const pending: PendingWriteback = {
          packageId: pkg.id,
          assignmentId,
          status: "failed",
          error: message,
        }
        try {
          await writeAssignment(pending)
        } catch {
          setPendingWriteback(pending)
        }
      }
      setHint(message)
    } finally {
      publishLock.current = false
      setPublishBusy(false)
    }
  }

  async function removePackage(pkg: NotePackage) {
    if (!window.confirm(`确定删除发布包「${pkg.title || "未命名"}」？`)) {
      return
    }
    try {
      await mut.remove.mutateAsync(pkg.id)
      if (editingId === pkg.id) {
        resetForm()
      }
    } catch (error) {
      setHint(studioErrorMessage(error))
    }
  }

  const displayItems = selected
    .map((item, index): DisplayItem | null => {
      if (item.kind === "orphan") {
        return {
          key: item.mediaId,
          url: item.url,
          label: index === 0 ? "封面 · 库里已删除" : `第 ${index + 1} 张 · 库里已删除`,
          orphan: true,
        }
      }
      const asset = packableAssets.find((entry) => entry.id === item.assetId)
      if (!asset) return null
      return {
        key: asset.id,
        url: asset.url,
        label: index === 0 ? "封面" : `第 ${index + 1} 张`,
        orphan: false,
      }
    })
    .filter((item): item is DisplayItem => item !== null)

  const selectedAssetIds = new Set(
    selected
      .filter((item): item is Extract<SelectedEntry, { kind: "asset" }> => item.kind === "asset")
      .map((item) => item.assetId),
  )

  return (
    <div className="workspace packages">
      <aside className="panel stack">
        <p className="section-label">组包</p>
        <p className="status-text">勾选图片并排顺序，第一张是封面。只有已落云的图能进包。</p>

        <label className="field">
          <span>岗位（生成文案用）</span>
          <input value={job} onChange={(event) => setJob(event.target.value)} placeholder="运营 / 主播…" />
        </label>
        <label className="field">
          <span>人设（可选）</span>
          <input value={persona} onChange={(event) => setPersona(event.target.value)} />
        </label>
        <button type="button" className="ghost-btn" disabled={copyBusy} onClick={() => void generateCopy()}>
          {copyBusy ? "生成文案中…" : "AI 生成文案"}
        </button>

        <label className="field">
          <span>标题（≤20字）</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={20} />
        </label>
        <label className="field">
          <span>正文（≤1000字）</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} />
        </label>
        <label className="field">
          <span>话题（空格或逗号分隔，最多10个）</span>
          <input
            value={topicsText}
            onChange={(event) => setTopicsText(event.target.value)}
            placeholder="招聘 运营 上海"
          />
        </label>
        <label className="field row-inline">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
          />
          <span>仅自己可见</span>
        </label>

        <p className="section-label">已选图片（{displayItems.length}/{MAX_IMAGES}）</p>
        {displayItems.length === 0 ? (
          <p className="status-text">从右侧资产栏点选图片</p>
        ) : (
          <ul className="package-selected-list">
            {displayItems.map((item, index) => (
              <li key={item.key} className="package-selected-item">
                <img src={item.url} alt="" />
                <div>
                  <p>{item.label}</p>
                  {item.orphan ? <p className="package-orphan-note">仅可发布，素材库里已不在</p> : null}
                  <div className="row">
                    <button type="button" className="ghost-btn compact" disabled={index === 0} onClick={() => moveSelected(index, -1)}>
                      上移
                    </button>
                    <button
                      type="button"
                      className="ghost-btn compact"
                      disabled={index === displayItems.length - 1}
                      onClick={() => moveSelected(index, 1)}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      className="ghost-btn compact"
                      onClick={() => {
                        const entry = selected[index]
                        if (!entry) return
                        if (entry.kind === "orphan") {
                          removeOrphan(entry.mediaId)
                          return
                        }
                        toggleAsset(entry.assetId)
                      }}
                    >
                      移除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="row">
          <button type="button" className="primary-btn" disabled={saveBusy} onClick={() => void savePackage()}>
            {saveBusy ? "保存中…" : editingId ? "更新发布包" : "保存发布包"}
          </button>
          <button type="button" className="ghost-btn" onClick={resetForm}>清空</button>
        </div>
        {hint ? <p className="status-text">{hint}</p> : null}
        {pendingWriteback ? (
          <button type="button" className="ghost-btn" disabled={publishBusy} onClick={() => void retryWriteback()}>
            重试写回云端状态
          </button>
        ) : null}
      </aside>

      <section className="canvas stack">
        <header className="canvas-head">
          <div>
            <p className="section-label">可选素材</p>
            <p className="canvas-caption">点一下加入发布包，视频和未上传的图不能选</p>
          </div>
          <label className="field package-account-field">
            <span>发布账号</span>
            <select
              value={activeAccountId}
              onChange={(event) => setActiveAccountId(event.target.value)}
              disabled={publishBusy}
            >
              {accounts.length === 0 ? <option value="">还没有本机账号</option> : null}
              {accounts.map((account) => (
                <option key={account.xhsUserId} value={account.xhsUserId}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="asset-grid pack-grid">
          {packableAssets.map((asset) => {
            const isSelected = selectedAssetIds.has(asset.id)
            const atLimit = !isSelected && selected.length >= MAX_IMAGES
            return (
              <button
                key={asset.id}
                type="button"
                className={isSelected ? "asset-item is-selected" : "asset-item"}
                disabled={atLimit}
                onClick={() => toggleAsset(asset.id)}
              >
                <img className="thumb" src={asset.url} alt="" />
                {isSelected ? <span className="asset-check">已选</span> : null}
              </button>
            )
          })}
        </div>

        <p className="section-label">已保存的发布包</p>
        {packagesQuery.isPending ? <p className="status-text">加载中…</p> : null}
        {packagesQuery.error ? (
          <p className="status-text error">{studioErrorMessage(packagesQuery.error)}</p>
        ) : null}
        <ul className="package-list">
          {(packagesQuery.data ?? []).map((pkg) => (
            <li key={pkg.id} className="package-card">
              <div className="package-card-head">
                <strong>{pkg.title}</strong>
                <span className="package-status">{pkg.status}</span>
              </div>
              <p className="package-card-body">{pkg.body.slice(0, 80)}{pkg.body.length > 80 ? "…" : ""}</p>
              <div className="package-thumb-row">
                {pkg.media.slice(0, 4).map((item) => (
                  <img key={item.id} src={item.url} alt="" />
                ))}
                {pkg.media.length > 4 ? <span>+{pkg.media.length - 4}</span> : null}
              </div>
              <div className="row">
                <button type="button" className="ghost-btn compact" onClick={() => loadPackage(pkg)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="primary-btn compact"
                  disabled={publishBusy || pkg.status !== "ready"}
                  onClick={() => void publishPackage(pkg)}
                >
                  {publishBusy ? "发布中…" : "发到小红书"}
                </button>
                <button
                  type="button"
                  className="ghost-btn compact"
                  disabled={mut.remove.isPending}
                  onClick={() => void removePackage(pkg)}
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
      </section>
    </div>
  )
}
