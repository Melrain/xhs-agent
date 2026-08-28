import { useEffect, useRef, useState } from "react"
import type { Update } from "@tauri-apps/plugin-updater"
import { checkAppUpdate, installAppUpdate, type UpdateStatus } from "../update"

function asMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function UpdateBar() {
  const pending = useRef<Update | null>(null)
  const [status, setStatus] = useState<UpdateStatus>({ kind: "idle" })

  useEffect(() => {
    void (async () => {
      try {
        const update = await checkAppUpdate()
        if (!update) return
        pending.current = update
        setStatus({
          kind: "available",
          version: update.version,
          notes: update.body ?? "",
        })
      } catch {
        // 还没有 Release 或离线时保持静默
      }
    })()
  }, [])

  async function applyUpdate() {
    const update = pending.current
    if (!update) return
    try {
      setStatus({ kind: "downloading", version: update.version, percent: 0 })
      await installAppUpdate(update, (percent) => {
        setStatus({ kind: "downloading", version: update.version, percent })
      })
      setStatus({ kind: "installing", version: update.version })
    } catch (error) {
      setStatus({ kind: "error", message: asMessage(error) })
    }
  }

  if (status.kind === "idle" || status.kind === "checking") return null

  return (
    <div className={status.kind === "error" ? "update-bar update-error" : "update-bar"}>
      {status.kind === "available" ? (
        <>
          <p>有新版本 {status.version}，下载后会自动安装并重启。</p>
          <button type="button" className="ghost-btn" onClick={() => void applyUpdate()}>
            立即更新
          </button>
        </>
      ) : null}
      {status.kind === "downloading" ? (
        <p>
          正在下载 {status.version}… {status.percent}%
        </p>
      ) : null}
      {status.kind === "installing" ? <p>正在安装并重启…</p> : null}
      {status.kind === "error" ? <p>{status.message}</p> : null}
    </div>
  )
}
