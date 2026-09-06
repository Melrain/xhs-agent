import { useEffect, useState, type ReactNode } from "react"
import { ArrowUp, Bot, ImageIcon, Paperclip, Video } from "lucide-react"
import { studioErrorMessage } from "@/lib/api/client"
import type { FilmProject } from "@/lib/api/film"
import { isAbortError, useSendFilmMessage } from "@/hooks/use-film-project"

export function FilmComposer({ project }: { project?: FilmProject }) {
  const projectId = project?.id ?? ""
  const send = useSendFilmMessage(projectId)
  const [text, setText] = useState("")
  const [agentOn, setAgentOn] = useState(true)
  const pending = send.isPending
  const canSend = Boolean(projectId) && agentOn && !pending && text.trim().length > 0
  const error =
    send.error && !isAbortError(send.error) ? studioErrorMessage(send.error) : ""

  const resetSend = send.reset
  useEffect(() => {
    setText("")
    resetSend()
  }, [projectId, resetSend])

  async function submit() {
    const next = text.trim()
    if (!canSend || !next) return
    try {
      await send.mutateAsync(next)
      setText("")
    } catch (err) {
      if (isAbortError(err)) return
    }
  }

  const placeholder = agentOn
    ? project?.brief
      ? "指挥影片代理…"
      : "先说点子，画布上会出现来源卡"
    : "代理已关闭，仅本地草稿"

  return (
    <div className="film-composer">
      <form
        className="film-composer-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <label className="sr-only" htmlFor="film-composer-input">
          指挥影片代理
        </label>
        <textarea
          id="film-composer-input"
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {error ? <p className="status-text error">{error}</p> : null}
        <div className="film-composer-bar">
          <div className="film-composer-tools">
            <ComposerIcon label="添加附件">
              <Paperclip size={14} />
            </ComposerIcon>
            <ComposerIcon label="添加图片">
              <ImageIcon size={14} />
            </ComposerIcon>
            <ComposerIcon label="添加视频">
              <Video size={14} />
            </ComposerIcon>
            <button
              type="button"
              aria-pressed={agentOn}
              title={agentOn ? "代理已开启" : "代理已关闭"}
              className={agentOn ? "film-agent-btn on" : "film-agent-btn"}
              onClick={() => setAgentOn((value) => !value)}
            >
              <Bot size={14} />
              代理
            </button>
          </div>
          <button
            type="submit"
            title={agentOn ? "发送" : "先开代理再发送"}
            aria-label="发送"
            disabled={!canSend}
            className="film-send-btn"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </form>
    </div>
  )
}

function ComposerIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} className="film-icon-btn">
      {children}
    </button>
  )
}
