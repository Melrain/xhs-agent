import { useState, type ReactNode } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { loginAccount, registerAccount } from "@/lib/auth/api"

export function CloudGate({
  ready,
  signedIn,
  children,
}: {
  ready: boolean
  signedIn: boolean
  children: ReactNode
}) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!ready) {
    return (
      <div className="cloud-gate">
        <p className="status-text">正在检查云端登录…</p>
      </div>
    )
  }

  if (signedIn) return children

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === "register") {
        await registerAccount(username, password)
      } else {
        await loginAccount(username, password)
      }
    } catch (err) {
      setError(studioErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="cloud-gate">
      <div className="login-card">
        <p className="section-label">云端工作台</p>
        <h2>{mode === "login" ? "登录 R7" : "注册 R7"}</h2>
        <p className="lead">招聘、妆造、笔记和影片走线上后端。小红书管理不用登这个号。</p>
        <div className="mode-switch">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login")
              setError(null)
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register")
              setError(null)
            }}
          >
            注册
          </button>
        </div>
        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="field">
            <label htmlFor="cloud-username">用户名</label>
            <input
              id="cloud-username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3-20 位字母、数字或下划线"
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]+"
            />
          </div>
          <div className="field">
            <label htmlFor="cloud-password">密码</label>
            <input
              id="cloud-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              required
              minLength={8}
            />
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? "提交中…" : mode === "login" ? "登录" : "注册并进入"}
          </button>
        </form>
      </div>
    </div>
  )
}
