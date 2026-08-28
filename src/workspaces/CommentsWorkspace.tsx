import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { SetupDialog } from "../SetupDialog"
import { ensureRuntimeOnce, subscribeSetupProgress, type SetupReport } from "../setup"
import {
  exportComments,
  storeListComments,
  storeListNotes,
  xhsSyncNoteComments,
  xhsSyncNotes,
  type StoredComment,
  type StoredNote,
  type XhsNotePullResult,
} from "../notes"
import {
  accountLabel,
  sessionAdopt,
  sessionBoot,
  sessionRemove,
  sessionSwitch,
  type SessionSnapshot,
  type StoredAccount,
} from "../session"
import {
  isLoginActive,
  kindLabel,
  loginMessage,
  xhsLoginCancel,
  xhsLoginStart,
  xhsLoginStatus,
  type XhsProbe,
  type XhsQrSessionView,
} from "../xhs"
import "../comments.css"

export function CommentsWorkspace() {
  const [probe, setProbe] = useState<XhsProbe | null>(null)
  const [accounts, setAccounts] = useState<StoredAccount[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [login, setLogin] = useState<XhsQrSessionView | null>(null)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [comments, setComments] = useState<StoredComment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [notesBusy, setNotesBusy] = useState(false)
  const [pullingId, setPullingId] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<XhsNotePullResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [invokeError, setInvokeError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [exportHint, setExportHint] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [booting, setBooting] = useState(true)
  const [appReady, setAppReady] = useState(false)
  const [setup, setSetup] = useState<SetupReport | null>(null)
  const [setupBusy, setSetupBusy] = useState(true)
  const setupRef = useRef(false)
  const workspaceGen = useRef(0)
  const finishingLogin = useRef(false)
  const bootingRef = useRef(false)

  const kind = probe?.kind ?? "idle"
  const loggingIn = isLoginActive(login?.phase)
  const loggedIn = kind === "logged_in"
  const active = accounts.find((account) => account.xhsUserId === activeAccountId) ?? null
  const selected = notes.find((note) => note.id === selectedId) ?? null
  const missingCli = kind === "missing_cli"
  const message =
    invokeError ||
    loginMessage(login) ||
    (booting ? "正在打开工作区…" : "") ||
    probe?.message ||
    "同步笔记并拉评论后，这里列出谁在你笔记下留了言。"

  const scopedComments = useMemo(() => {
    const text = query.trim().toLowerCase()
    return comments.filter((comment) => {
      if (selectedId && comment.noteId !== selectedId) return false
      if (!text) return true
      const hay = [
        comment.nickname,
        comment.authorId,
        comment.content,
        comment.ipLocation ?? "",
        comment.noteTitle ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(text)
    })
  }, [comments, query, selectedId])

  const commenterCount = useMemo(
    () => new Set(scopedComments.map((comment) => comment.authorId)).size,
    [scopedComments],
  )

  const noteStats = useMemo(() => {
    const map = new Map<string, { comments: number; people: number }>()
    const people = new Map<string, Set<string>>()
    for (const comment of comments) {
      const authors = people.get(comment.noteId) ?? new Set<string>()
      authors.add(comment.authorId)
      people.set(comment.noteId, authors)
      map.set(comment.noteId, {
        comments: (map.get(comment.noteId)?.comments ?? 0) + 1,
        people: authors.size,
      })
    }
    return map
  }, [comments])

  function applySnapshot(snapshot: SessionSnapshot) {
    setAccounts(snapshot.accounts)
    setActiveAccountId(snapshot.activeAccountId ?? null)
    setProbe(snapshot.probe)
  }

  async function loadWorkspace(nextSelected?: string | null) {
    const gen = ++workspaceGen.current
    const nextNotes = await storeListNotes()
    const nextComments = await storeListComments()
    if (gen !== workspaceGen.current) return
    setNotes(nextNotes)
    setComments(nextComments)
    setSelectedId((current) => {
      if (nextSelected === null) return null
      const keep = nextSelected ?? current
      return keep && nextNotes.some((note) => note.id === keep) ? keep : null
    })
  }

  async function syncNotes() {
    setNotesBusy(true)
    setInvokeError(null)
    try {
      await xhsSyncNotes()
      await loadWorkspace()
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      setNotesBusy(false)
    }
  }

  async function pullComments(noteId: string) {
    setPullingId(noteId)
    setInvokeError(null)
    try {
      const result = await xhsSyncNoteComments(noteId)
      setPullResult(result)
      if (!result.verificationRequired && result.message.startsWith("已写入")) {
        await loadWorkspace(noteId)
      }
    } catch (error) {
      const text = asMessage(error)
      setPullResult({
        noteId,
        pulled: 0,
        upserted: 0,
        message: text,
        verificationRequired: text.includes("Captcha") || text.includes("verification"),
      })
    } finally {
      setPullingId(null)
    }
  }

  async function pullAllComments() {
    if (notes.length === 0) return
    setPullingId("all")
    setInvokeError(null)
    let pulled = 0
    let upserted = 0
    try {
      for (const [index, note] of notes.entries()) {
        setPullResult({
          noteId: note.id,
          pulled,
          upserted,
          message: `正在拉「${note.title}」(${index + 1}/${notes.length})…`,
          verificationRequired: false,
        })
        const result = await xhsSyncNoteComments(note.id)
        pulled += result.pulled
        upserted += result.upserted
        if (result.verificationRequired || !result.message.startsWith("已写入")) {
          setPullResult({
            ...result,
            message: `停在「${note.title}」：${result.message}`,
          })
          await loadWorkspace(note.id)
          return
        }
      }
      await loadWorkspace(null)
      setPullResult({
        noteId: "",
        pulled,
        upserted,
        message: `已写入 ${upserted} 条评论，来自 ${notes.length} 篇笔记`,
        verificationRequired: false,
      })
    } catch (error) {
      const text = asMessage(error)
      setPullResult({
        noteId: "",
        pulled,
        upserted,
        message: text,
        verificationRequired: text.includes("Captcha") || text.includes("verification"),
      })
    } finally {
      setPullingId(null)
    }
  }

  async function exportCurrent() {
    if (scopedComments.length === 0) return
    setExporting(true)
    setExportHint(null)
    setInvokeError(null)
    try {
      const stamp = new Date().toLocaleDateString("sv-SE")
      const scope = selected?.title || "全部笔记"
      const who = active ? accountLabel(active) : "评论用户"
      const path = await exportComments(scopedComments, `${who}-${scope}-${stamp}`)
      if (path) setExportHint(`已导出 ${scopedComments.length} 条到 ${path}`)
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      setExporting(false)
    }
  }

  async function copyAuthorId(authorId: string) {
    try {
      await navigator.clipboard.writeText(authorId)
      setCopiedId(authorId)
      window.setTimeout(() => {
        setCopiedId((current) => (current === authorId ? null : current))
      }, 1500)
    } catch {
      setInvokeError("复制用户 ID 失败")
    }
  }

  async function startLogin() {
    setBusy(true)
    setInvokeError(null)
    try {
      setLogin(await xhsLoginStart())
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function cancelLogin() {
    setBusy(true)
    try {
      applySnapshot(await xhsLoginCancel())
      setLogin(null)
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const finishLogin = useCallback(async () => {
    if (finishingLogin.current) return
    finishingLogin.current = true
    try {
      let lastError = "登录尚未写入，请稍后再试"
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          applySnapshot(await sessionAdopt())
          setLogin(null)
          await syncNotes()
          return
        } catch (error) {
          lastError = asMessage(error)
          await wait(400)
        }
      }
      setLogin(null)
      setInvokeError(lastError)
    } finally {
      finishingLogin.current = false
    }
  }, [])

  async function switchAccount(accountId: string) {
    if (!accountId || accountId === activeAccountId) return
    setBusy(true)
    setInvokeError(null)
    try {
      applySnapshot(await sessionSwitch(accountId))
      setPullResult(null)
      setExportHint(null)
      await loadWorkspace(null)
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount() {
    if (!activeAccountId) return
    if (!window.confirm("移出后这个号的 session 会删掉，笔记还在。确定？")) return
    setBusy(true)
    setInvokeError(null)
    try {
      applySnapshot(await sessionRemove(activeAccountId))
      setPullResult(null)
      setExportHint(null)
      await loadWorkspace(null)
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function prepareEnv() {
    if (setupRef.current) return
    setupRef.current = true
    setSetupBusy(true)
    setInvokeError(null)
    const stopProgress = subscribeSetupProgress(setSetup)
    try {
      const result = await ensureRuntimeOnce()
      setSetup(result)
      if (!result.ready) return
      await bootApp()
      setAppReady(true)
    } catch (error) {
      setInvokeError(asMessage(error))
      setSetup((current) => ({
        ready: false,
        message: asMessage(error),
        steps: current?.steps ?? [],
      }))
    } finally {
      stopProgress()
      setupRef.current = false
      setSetupBusy(false)
    }
  }

  async function bootApp() {
    if (bootingRef.current) return
    bootingRef.current = true
    setBooting(true)
    setInvokeError(null)
    try {
      applySnapshot(await sessionBoot())
      await loadWorkspace(null)
    } catch (error) {
      setInvokeError(asMessage(error))
    } finally {
      bootingRef.current = false
      setBooting(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!("__TAURI_INTERNALS__" in window)) {
        setSetup({
          ready: false,
          message: "小红书管理需要在桌面应用里运行，浏览器没有本机 CLI 环境。",
          steps: [],
        })
        setSetupBusy(false)
        return
      }
      if (cancelled) return
      await prepareEnv()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLoginActive(login?.phase)) return
    const timer = window.setInterval(() => {
      void xhsLoginStatus()
        .then(async (next) => {
          setLogin(next)
          if (next.phase === "confirmed") await finishLogin()
        })
        .catch(() => undefined)
    }, 800)
    return () => window.clearInterval(timer)
  }, [finishLogin, login?.phase, login?.sessionId])

  if (!appReady) {
    return (
      <div className="comments-workspace">
        <SetupDialog report={setup} busy={setupBusy} onRetry={() => void prepareEnv()} />
      </div>
    )
  }

  return (
    <div className="comments-workspace">
      <div className="chrome">
        <header className="comments-topbar">
          <label className="search search-inline">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜昵称、用户 ID、评论、地区"
            />
          </label>
          <div className="top-account">
            <span className={`dot status-${loggingIn ? login?.phase : kind}`} />
            <select
              value={activeAccountId ?? ""}
              disabled={busy || loggingIn || pullingId !== null || accounts.length === 0}
              onChange={(event) => void switchAccount(event.target.value)}
            >
              {accounts.length === 0 || !activeAccountId ? (
                <option value="">{accounts.length === 0 ? "还没有账号" : "未选择"}</option>
              ) : null}
              {accounts.map((account) => (
                <option key={account.xhsUserId} value={account.xhsUserId}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
            <span className="top-status">{loggingIn ? phaseLabel(login?.phase) : kindLabel(kind)}</span>
          </div>
        </header>

        <div className="toolbar">
          <p className="message">{message}</p>
          <div className="actions">
            {missingCli ? (
              <button
                type="button"
                className="primary-btn"
                disabled={busy || booting}
                onClick={() => {
                  setAppReady(false)
                  void prepareEnv()
                }}
              >
                再次检查环境
              </button>
            ) : loggingIn ? (
              <button type="button" className="danger-btn" disabled={busy} onClick={() => void cancelLogin()}>
                取消扫码
              </button>
            ) : (
              <button
                type="button"
                className="ghost-btn"
                disabled={busy || pullingId !== null}
                onClick={() => void startLogin()}
              >
                {busy ? "正在打开浏览器…" : accounts.length === 0 ? "登录" : "添加账号"}
              </button>
            )}
            <button
              type="button"
              className="ghost-btn"
              disabled={busy || loggingIn || pullingId !== null || !activeAccountId}
              onClick={() => void startLogin()}
            >
              重新登录
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={busy || loggingIn || pullingId !== null || !activeAccountId}
              onClick={() => void removeAccount()}
            >
              移出
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={busy || notesBusy || loggingIn || pullingId !== null || !loggedIn}
              onClick={() => void syncNotes()}
            >
              {notesBusy ? "同步中…" : "同步笔记"}
            </button>
          </div>
        </div>

        {login?.qrUrl && loggingIn ? (
          <div className="qr-wrap">
            <div className="qr">
              <QRCodeSVG value={login.qrUrl} size={156} marginSize={2} />
              <p>手机扫码登录后，即可拉取笔记下的评论用户</p>
            </div>
          </div>
        ) : null}

        <div className="stats">
          <span>
            <strong>{notes.length}</strong> 篇笔记
          </span>
          <span>
            <strong>{commenterCount}</strong> 位评论用户
          </span>
          <span>
            <strong>{scopedComments.length}</strong> 条评论
          </span>
          {active?.redId ? <span className="muted">小红书号 {active.redId}</span> : null}
        </div>
      </div>

      <div className="comments-body">
        <aside className="comments-rail">
          <div className="pane-head">
            <p className="section-label">笔记</p>
          </div>
          <button
            type="button"
            className={!selectedId ? "note-item active" : "note-item"}
            onClick={() => {
              setSelectedId(null)
              setPullResult(null)
            }}
          >
            <strong>全部笔记</strong>
            <p>
              {new Set(comments.map((comment) => comment.authorId)).size} 人 · {comments.length} 条
            </p>
          </button>
          {notes.length === 0 ? (
            <p className="empty">还没有笔记。登录后点「同步笔记」。</p>
          ) : (
            <ul className="note-list">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className={note.id === selectedId ? "note-item active" : "note-item"}
                    onClick={() => {
                      setSelectedId(note.id)
                      setPullResult(null)
                    }}
                  >
                    <strong>{note.title}</strong>
                    <p>
                      {noteStats.get(note.id)?.people ?? 0} 人 · 已拉 {note.storedComments}/
                      {note.commentsCount}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="comments-main">
          <div className="pane-head">
            <div>
              <p className="section-label">评论用户</p>
              <h2>{selected ? selected.title : "全部笔记下的留言"}</h2>
            </div>
            <div className="pane-actions">
              <button
                type="button"
                className="ghost-btn compact"
                disabled={exporting || scopedComments.length === 0}
                onClick={() => void exportCurrent()}
              >
                {exporting ? "导出中…" : "导出 Excel"}
              </button>
              <button
                type="button"
                className="ghost-btn compact"
                disabled={
                  busy ||
                  notesBusy ||
                  loggingIn ||
                  !loggedIn ||
                  pullingId !== null ||
                  (selected ? false : notes.length === 0)
                }
                onClick={() => (selected ? void pullComments(selected.id) : void pullAllComments())}
              >
                {pullingId ? "拉取中…" : selected ? "拉这篇评论" : "拉全部评论"}
              </button>
            </div>
          </div>
          {exportHint ? <p className="note-ok">{exportHint}</p> : null}
          {showPullResult(pullResult, selectedId, pullingId) ? (
            <p className={pullTone(pullResult)}>{pullResult?.message}</p>
          ) : null}
          {scopedComments.length === 0 ? (
            <p className="empty empty-main">
              {selected
                ? "这篇还没有本地评论。点右上角「拉这篇评论」。"
                : "还没有评论用户。先同步笔记，再点「拉全部评论」。"}
            </p>
          ) : (
            <ul className="people-list">
              {scopedComments.map((comment) => (
                <li key={comment.id} className="person">
                  <Avatar name={comment.nickname} src={comment.avatarUrl} />
                  <div className="person-body">
                    <div className="person-head">
                      <strong>{comment.nickname || "匿名用户"}</strong>
                      {comment.ipLocation ? <span className="chip">{comment.ipLocation}</span> : null}
                      {comment.likeCount > 0 ? <span className="chip">赞 {comment.likeCount}</span> : null}
                    </div>
                    <dl className="person-meta">
                      <div>
                        <dt>用户 ID</dt>
                        <dd>
                          <button
                            type="button"
                            className="id-copy"
                            onClick={() => void copyAuthorId(comment.authorId)}
                          >
                            {copiedId === comment.authorId ? "已复制" : comment.authorId}
                          </button>
                        </dd>
                      </div>
                      <div>
                        <dt>评论时间</dt>
                        <dd>{formatTime(comment.commentedAt) || "未知"}</dd>
                      </div>
                      <div>
                        <dt>来自笔记</dt>
                        <dd>
                          <button type="button" className="note-link" onClick={() => setSelectedId(comment.noteId)}>
                            {comment.noteTitle || selected?.title || comment.noteId}
                          </button>
                        </dd>
                      </div>
                    </dl>
                    <p className="person-content">{comment.content || "（无正文）"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function showPullResult(
  result: XhsNotePullResult | null,
  selectedId: string | null,
  pullingId: string | null,
): result is XhsNotePullResult {
  if (!result) return false
  if (pullingId !== null) return true
  if (!selectedId) return true
  return result.noteId === selectedId
}

function pullTone(result: XhsNotePullResult | null): string {
  if (!result) return "note-ok"
  if (result.verificationRequired) return "note-error"
  if (result.message.startsWith("已写入") || result.message.startsWith("正在拉")) return "note-ok"
  return "note-error"
}

function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [src])
  const initial = (name || "?").trim().slice(0, 1)
  if (!src || failed) {
    return <span className="avatar avatar-fallback">{initial}</span>
  }
  return (
    <img className="avatar" src={src} alt={name || "评论用户"} onError={() => setFailed(true)} />
  )
}

function phaseLabel(phase?: string): string {
  switch (phase) {
    case "waiting":
      return "请扫码"
    case "scanned":
      return "已扫码"
    case "confirming":
      return "保存中"
    default:
      return "扫码中"
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function formatTime(value?: number): string {
  if (!value) return ""
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
