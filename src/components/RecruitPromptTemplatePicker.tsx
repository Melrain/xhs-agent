import { useEffect, useRef, useState } from "react"
import { isAbortError } from "@/lib/api/client"
import { fetchTemplatePreview } from "@/lib/api/recruit"
import {
  RECRUIT_PROMPT_GROUPS,
  RECRUIT_PROMPT_TEMPLATES,
} from "@/lib/recruit-prompt-templates"

type PreviewEntry = {
  refs: number
  controller: AbortController
  promise: Promise<string>
  url?: string
}

const previewCache = new Map<string, PreviewEntry>()

function retainPreview(s3Key: string) {
  const hit = previewCache.get(s3Key)
  if (hit) {
    hit.refs += 1
    return hit.promise
  }
  const controller = new AbortController()
  const entry: PreviewEntry = {
    refs: 1,
    controller,
    promise: fetchTemplatePreview(s3Key, { signal: controller.signal })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        entry.url = url
        return url
      })
      .catch((error) => {
        if (previewCache.get(s3Key) === entry) previewCache.delete(s3Key)
        throw error
      }),
  }
  previewCache.set(s3Key, entry)
  return entry.promise
}

function releasePreview(s3Key: string) {
  const entry = previewCache.get(s3Key)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  previewCache.delete(s3Key)
  entry.controller.abort()
  if (entry.url) URL.revokeObjectURL(entry.url)
}

function TemplatePreview({
  s3Key,
  className,
  alt,
  eager = false,
}: {
  s3Key: string
  className: string
  alt: string
  eager?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (eager) setVisible(true)
  }, [eager])

  useEffect(() => {
    if (visible) return
    const node = hostRef.current
    if (!node) return
    const root = node.closest(".brief-body")
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setVisible(true)
        io.disconnect()
      },
      { root: root instanceof Element ? root : null, rootMargin: "160px" },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let alive = true
    setUrl(undefined)
    setFailed(false)
    retainPreview(s3Key)
      .then((next) => {
        if (alive) setUrl(next)
      })
      .catch((error) => {
        if (!alive || isAbortError(error)) return
        setFailed(true)
      })
    return () => {
      alive = false
      releasePreview(s3Key)
    }
  }, [s3Key, visible])

  if (failed) {
    return (
      <div className={`${className} is-failed`} title="预览加载失败">
        加载失败
      </div>
    )
  }
  if (!visible || !url) {
    return <div ref={hostRef} className={`${className} is-pending`} />
  }
  return <img src={url} alt={alt} className={className} />
}

type PickerProps =
  | { onFill: (prompt: string) => void; onFillImage?: never }
  | { onFillImage: (file: File) => void; onFill?: never }

function previewFile(s3Key: string, blob: Blob, id: string) {
  const name = s3Key.split("/").pop() ?? `${id}.png`
  return new File([blob], name, { type: blob.type || "image/png" })
}

export function RecruitPromptTemplatePicker(props: PickerProps) {
  const fillImage = "onFillImage" in props && props.onFillImage
  const catalog = fillImage
    ? RECRUIT_PROMPT_TEMPLATES.filter((item) => item.previewS3Keys?.[0])
    : RECRUIT_PROMPT_TEMPLATES
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(catalog[0]?.id)
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState<string>()
  const fillAbort = useRef<AbortController | null>(null)
  const selected = catalog.find((item) => item.id === selectedId)

  function close() {
    fillAbort.current?.abort()
    setFilling(false)
    setFillError(undefined)
    setOpen(false)
  }

  async function fill() {
    if (!selected) return
    if (fillImage) {
      const key = selected.previewS3Keys?.[0]
      if (!key) return
      fillAbort.current?.abort()
      const controller = new AbortController()
      fillAbort.current = controller
      setFilling(true)
      setFillError(undefined)
      try {
        const blob = await fetchTemplatePreview(key, { signal: controller.signal })
        fillImage(previewFile(key, blob, selected.id))
        close()
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return
        setFillError("效果图加载失败")
        setFilling(false)
      }
      return
    }
    if (props.onFill) props.onFill(selected.prompt)
    close()
  }

  return (
    <>
      <button type="button" className="ghost-btn compact" onClick={() => setOpen(true)}>
        模板选择
      </button>
      {open ? (
        <div className="brief-layer">
          <button type="button" className="brief-backdrop" onClick={close} />
          <div
            className="brief-card brief-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recruit-template-title"
          >
            <header className="brief-head">
              <div>
                <h2 id="recruit-template-title">模板选择</h2>
                <p>{fillImage ? "点选模板，再一键填入输入图" : "点选模板，再一键填入"}</p>
                {fillError ? <p className="brief-template-blurb">{fillError}</p> : null}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="primary-btn compact"
                  onClick={() => void fill()}
                  disabled={!selected || filling || (Boolean(fillImage) && !selected.previewS3Keys?.[0])}
                >
                  {filling ? "填入中…" : "一键填入"}
                </button>
                <button type="button" className="ghost-btn compact" onClick={close}>
                  关闭
                </button>
              </div>
            </header>
            <div className="brief-body">
              {RECRUIT_PROMPT_GROUPS.map((group) => {
                const items = catalog.filter((item) => item.group === group.id)
                if (items.length === 0) return null
                const hasPreviews = items.some((item) => item.previewS3Keys?.length)
                return (
                  <section key={group.id}>
                    <h3>{group.label}</h3>
                    <div
                      className={
                        hasPreviews
                          ? "brief-template-list brief-template-list-preview"
                          : "brief-template-list"
                      }
                    >
                      {items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            item.id === selectedId ? "ghost-btn compact active" : "ghost-btn compact"
                          }
                          onClick={() => setSelectedId(item.id)}
                        >
                          {item.previewS3Keys?.[0] ? (
                            <TemplatePreview
                              s3Key={item.previewS3Keys[0]}
                              className="brief-template-thumb"
                              alt=""
                            />
                          ) : null}
                          <span>{item.label}</span>
                          {item.blurb ? <small>{item.blurb}</small> : null}
                        </button>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
