import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { studioErrorMessage } from "@/lib/api/client"
import {
  enqueueEditImage,
  enqueueGenerateImage,
  enqueueGenerateVideo,
  listMediaModels,
  listRecruitAssets,
  RECRUIT_ASSETS_QUERY_KEY,
  RECRUIT_TASKS_QUERY_KEY,
  loadOverlaySource,
  uploadOverlayAsset,
  type MediaModel,
} from "@/lib/api/recruit"
import { bakeOverlayBlob } from "@/lib/overlay-bake"
import { MODE_META } from "@/lib/recruit-mock"
import { useRecruitAssets } from "@/hooks/use-recruit-assets"
import {
  isNotFoundJobError,
  isRecruitImageMode,
  useRecruitImageJobs,
  type RecruitImageMode,
} from "@/hooks/use-recruit-tasks"
import { RecruitPromptTemplatePicker } from "@/components/RecruitPromptTemplatePicker"
import { DEFAULT_RECRUIT_PROMPT } from "@/lib/recruit-prompt-templates"
import { mediaFileName, saveMediaFile } from "@/lib/save-media"
import type {
  AspectRatio,
  Asset,
  CanvasItem,
  FontSizeToken,
  ImageQuality,
  ImageResolution,
  MediaResult,
  Mode,
  OverlayPosition,
  OverlayStyle,
  VideoAspectRatio,
  VideoDuration,
  VideoResolution,
} from "@/lib/types"

const MODES: Mode[] = ["t2i", "i2i", "text-overlay", "i2v"]
const POSITIONS: OverlayPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]

export function RecruitWorkspace() {
  const queryClient = useQueryClient()
  const { assets: historyAssets, isPending: historyPending, error: historyError } =
    useRecruitAssets()
  const imageJobs = useRecruitImageJobs()
  const [mode, setMode] = useState<Mode>("t2i")
  const [localUploads, setLocalUploads] = useState<Asset[]>([])
  const [itemsByMode, setItemsByMode] = useState<Partial<Record<Mode, CanvasItem[]>>>({})
  const [preview, setPreview] = useState<CanvasItem | null>(null)
  const [selectedCanvasId, setSelectedCanvasId] = useState<string>()
  const [missingJobError, setMissingJobError] = useState<Partial<Record<RecruitImageMode, string>>>({})
  const [dismissedFailed, setDismissedFailed] = useState<Partial<Record<RecruitImageMode, string>>>({})
  const [elapsed, setElapsed] = useState(0)
  const [models, setModels] = useState<MediaModel[]>([])

  const [t2iPrompt, setT2iPrompt] = useState(DEFAULT_RECRUIT_PROMPT)
  const [count, setCount] = useState(1)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4")
  const [quality, setQuality] = useState<ImageQuality>("low")
  const [resolution, setResolution] = useState<ImageResolution>("auto")
  const [imageModel, setImageModel] = useState("")
  const [videoModel, setVideoModel] = useState("")
  const [i2iPrompt, setI2iPrompt] = useState("把场景改成明亮办公室，保留人物站位")
  const [i2iSource, setI2iSource] = useState<Asset | null>(null)
  const [overlayText, setOverlayText] = useState("你的下一站\n欢迎投递")
  const [overlaySource, setOverlaySource] = useState<Asset | null>(null)
  const [position, setPosition] = useState<OverlayPosition>("bottom-center")
  const [fontSize, setFontSize] = useState<FontSizeToken>("md")
  const [color, setColor] = useState("#FFFFFF")
  const [stroke, setStroke] = useState(true)
  const [backdrop, setBackdrop] = useState(false)
  const [i2vPrompt, setI2vPrompt] = useState("镜头缓慢推进，人物轻微转头")
  const [i2vSource, setI2vSource] = useState<Asset | null>(null)
  const [duration, setDuration] = useState<VideoDuration>(5)
  const [videoAspect, setVideoAspect] = useState<VideoAspectRatio>("source")
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("720p")
  const [overlayPinned, setOverlayPinned] = useState(false)
  const [overlayBusy, setOverlayBusy] = useState(false)
  const [overlayError, setOverlayError] = useState<string>()
  const [overlayStartedAt, setOverlayStartedAt] = useState<number>()
  const [saving, setSaving] = useState(false)
  const [saveHint, setSaveHint] = useState<string | null>(null)

  const appliedTaskIds = useRef<Partial<Record<RecruitImageMode, string>>>({})
  const handledMissing = useRef<Set<string>>(new Set())
  const enqueuePrompts = useRef<Partial<Record<RecruitImageMode, string>>>({})
  const blobUrls = useRef<string[]>([])
  const overlayRequestId = useRef(0)

  const overlayStyle = useMemo<OverlayStyle>(
    () => ({ text: overlayText, position, fontSize, color, stroke, backdrop }),
    [backdrop, color, fontSize, overlayText, position, stroke],
  )
  const assets = useMemo(
    () => [...localUploads, ...historyAssets],
    [historyAssets, localUploads],
  )
  const items = itemsByMode[mode] ?? []
  const imageBusy = isRecruitImageMode(mode) ? imageJobs.isBusy(mode) : false
  const activeJob = isRecruitImageMode(mode) ? imageJobs.jobFor(mode) : undefined
  const imageError = isRecruitImageMode(mode)
    ? resolveImageError({
        mode,
        job: activeJob?.data,
        queryError: activeJob?.error,
        missing: missingJobError[mode],
        dismissedTaskId: dismissedFailed[mode],
      })
    : overlayError
  const busy = imageBusy || overlayBusy
  const hasCanvasItem = items.length > 0 || (mode === "text-overlay" && Boolean(overlaySource))
  const status = hasCanvasItem
    ? "ready"
    : busy
      ? "loading"
      : imageError
        ? "error"
        : "empty"

  useEffect(() => {
    return () => {
      for (const url of blobUrls.current) URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    void listMediaModels().then((res) => setModels(res.models)).catch(() => undefined)
  }, [])

  useEffect(() => {
    for (const imageMode of imageJobs.modes) {
      const job = imageJobs.jobFor(imageMode).data
      if (job?.status !== "succeeded") continue
      if (appliedTaskIds.current[imageMode] === job.taskId) continue
      const outputs = job.result?.outputs
      if (!hasUsableOutputs(outputs)) continue
      appliedTaskIds.current[imageMode] = job.taskId
      applyGenerated(outputs, imageMode, enqueuePrompts.current[imageMode] ?? "")
      setMissingJobError((current) => {
        const { [imageMode]: _removed, ...rest } = current
        return rest
      })
      void queryClient.invalidateQueries({ queryKey: RECRUIT_ASSETS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: RECRUIT_TASKS_QUERY_KEY })
    }
  }, [imageJobs, imageJobs.i2iJob.data, imageJobs.i2vJob.data, imageJobs.t2iJob.data, queryClient])

  useEffect(() => {
    const ids = { t2i: imageJobs.t2iId, i2i: imageJobs.i2iId, i2v: imageJobs.i2vId }
    for (const imageMode of imageJobs.modes) {
      const taskId = ids[imageMode]
      if (!taskId || !isNotFoundJobError(imageJobs.jobFor(imageMode).error)) continue
      if (appliedTaskIds.current[imageMode] === taskId) {
        imageJobs.clearLocal(imageMode)
        continue
      }
      if (handledMissing.current.has(taskId)) continue
      handledMissing.current.add(taskId)
      void (async () => {
        await queryClient.invalidateQueries({ queryKey: RECRUIT_ASSETS_QUERY_KEY })
        const records = await queryClient.fetchQuery({
          queryKey: RECRUIT_ASSETS_QUERY_KEY,
          queryFn: listRecruitAssets,
        })
        const latest = records.find((record) => record.origin === imageMode)
        if (latest?.url && latest.s3Key) {
          applyGenerated(
            [{ url: latest.url, s3Key: latest.s3Key, mimeType: latest.mimeType ?? "image/png" }],
            imageMode,
            latest.prompt,
          )
        } else {
          setMissingJobError((current) => ({ ...current, [imageMode]: "任务已失效" }))
        }
        imageJobs.clearLocal(imageMode)
      })()
    }
  }, [imageJobs, imageJobs.i2iId, imageJobs.i2iJob.error, imageJobs.i2vId, imageJobs.i2vJob.error, imageJobs.t2iId, imageJobs.t2iJob.error, queryClient])

  useEffect(() => {
    for (const imageMode of imageJobs.modes) {
      if (imageJobs.isBusy(imageMode)) continue
      const latest = historyAssets.find((asset) => asset.origin === imageMode)
      if (!latest) continue
      setItemsByMode((current) => {
        if ((current[imageMode]?.length ?? 0) > 0) return current
        return {
          ...current,
          [imageMode]: [
            {
              id: latest.id,
              kind: latest.kind,
              url: latest.url,
              s3Key: latest.s3Key,
              prompt: latest.prompt,
            },
          ],
        }
      })
    }
  }, [historyAssets, imageJobs])

  useEffect(() => {
    if (overlayBusy) return
    const latest = historyAssets.find((asset) => asset.origin === "text-overlay")
    if (!latest) return
    setItemsByMode((current) => {
      if ((current["text-overlay"]?.length ?? 0) > 0) return current
      return {
        ...current,
        "text-overlay": [
          {
            id: latest.id,
            kind: "image",
            url: latest.url,
            s3Key: latest.s3Key,
            prompt: latest.prompt,
          },
        ],
      }
    })
  }, [historyAssets, overlayBusy])

  const startedAt = overlayBusy
    ? overlayStartedAt
    : isRecruitImageMode(mode)
      ? imageJobs.startedAtFor(mode)
      : undefined
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const start = startedAt ?? Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [busy, startedAt])

  function applyGenerated(outputs: MediaResult[], requestMode: Mode, prompt: string) {
    const nextItems: CanvasItem[] = outputs.map((output) => ({
      id: crypto.randomUUID(),
      kind: requestMode === "i2v" || output.mimeType?.startsWith("video/") ? "video" : "image",
      url: output.url,
      s3Key: output.s3Key,
      prompt,
    }))
    setItemsByMode((current) => ({ ...current, [requestMode]: nextItems }))
    setSelectedCanvasId(nextItems[0]?.id)
  }

  function addLocalFile(file: File, target: Mode) {
    const url = URL.createObjectURL(file)
    blobUrls.current.push(url)
    const asset: Asset = {
      id: crypto.randomUUID(),
      kind: "image",
      url,
      origin: "upload",
      createdAt: Date.now(),
    }
    setLocalUploads((current) => [asset, ...current])
    applySource(asset, target)
  }

  function applySource(asset: Asset, target = mode) {
    const needsImage = target === "i2i" || target === "text-overlay" || target === "i2v"
    if (isRecruitImageMode(target)) {
      const job = imageJobs.jobFor(target).data
      if (job?.status === "failed") {
        setDismissedFailed((current) => ({ ...current, [target]: job.taskId }))
      }
    }
    setSelectedCanvasId(asset.id)
    setItemsByMode((current) => ({
      ...current,
      [target]: [{ id: asset.id, kind: asset.kind, url: asset.url, s3Key: asset.s3Key, prompt: asset.prompt }],
    }))
    if (needsImage && asset.kind !== "image") return
    if (target === "i2i") setI2iSource(asset)
    if (target === "text-overlay") {
      setOverlaySource(asset)
      setOverlayPinned(false)
      setOverlayError(undefined)
    }
    if (target === "i2v") setI2vSource(asset)
  }

  function chainTo(next: Mode, item: CanvasItem) {
    const asset =
      assets.find((entry) => entry.id === item.id) ??
      ({
        id: item.id,
        kind: item.kind,
        url: item.url,
        s3Key: item.s3Key,
        origin: mode,
        prompt: item.prompt,
        createdAt: Date.now(),
      } satisfies Asset)
    setMode(next)
    applySource(asset, next)
  }

  async function downloadCurrent(item: CanvasItem) {
    if (saving) return
    setSaving(true)
    setSaveHint(null)
    let bakedUrl: string | undefined
    try {
      let url = item.url
      if (item.overlay) {
        const blob = await bakeOverlayBlob(await loadOverlaySource(item), item.overlay)
        bakedUrl = URL.createObjectURL(blob)
        url = bakedUrl
      }
      const path = await saveMediaFile({
        url,
        fileName: mediaFileName({
          kind: item.kind,
          url: item.overlay ? "overlay.png" : item.url,
          prompt: item.prompt,
          s3Key: item.overlay ? undefined : item.s3Key,
        }),
      })
      setSaveHint(path ? `已保存到 ${path}` : null)
    } catch (error) {
      setSaveHint(studioErrorMessage(error))
    } finally {
      if (bakedUrl) URL.revokeObjectURL(bakedUrl)
      setSaving(false)
    }
  }

  const currentSource = mode === "i2i" ? i2iSource : mode === "text-overlay" ? overlaySource : i2vSource
  const currentPrompt =
    mode === "t2i" ? t2iPrompt : mode === "i2i" ? i2iPrompt : mode === "i2v" ? i2vPrompt : overlayText
  const canGenerate =
    !busy && (mode === "t2i" || Boolean(currentSource)) && Boolean(currentPrompt.trim())

  async function generate() {
    const source = currentSource
    const prompt = currentPrompt
    if (mode !== "t2i" && !source) return
    if (!prompt.trim()) return

    if (mode === "text-overlay" && source) {
      if (overlayBusy) return
      const requestId = overlayRequestId.current + 1
      overlayRequestId.current = requestId
      setOverlayBusy(true)
      setOverlayStartedAt(Date.now())
      setOverlayError(undefined)
      setSaveHint(null)
      try {
        const blob = await bakeOverlayBlob(await loadOverlaySource(source), overlayStyle)
        if (requestId !== overlayRequestId.current) return
        const file = new File([blob], "overlay.png", { type: "image/png" })
        const result = await uploadOverlayAsset({ file, prompt })
        if (requestId !== overlayRequestId.current) return
        applyGenerated(result.outputs, "text-overlay", prompt)
        setOverlayPinned(true)
        void queryClient.invalidateQueries({ queryKey: RECRUIT_ASSETS_QUERY_KEY })
      } catch (error) {
        if (requestId !== overlayRequestId.current) return
        setOverlayError(studioErrorMessage(error))
      } finally {
        if (requestId === overlayRequestId.current) {
          setOverlayBusy(false)
          setOverlayStartedAt(undefined)
        }
      }
      return
    }

    if (!isRecruitImageMode(mode)) return
    enqueuePrompts.current[mode] = prompt
    setDismissedFailed((current) => {
      const next = { ...current }
      delete next[mode]
      return next
    })
    try {
      await imageJobs.enqueue(mode, () =>
        mode === "t2i"
          ? enqueueGenerateImage({
              prompt,
              count,
              aspectRatio,
              quality,
              resolution,
              model: imageModel,
            })
          : mode === "i2v"
            ? enqueueGenerateVideo({
                prompt,
                source: source!,
                duration,
                aspectRatio: videoAspect,
                resolution: videoResolution,
                model: videoModel,
              })
            : enqueueEditImage({
                prompt,
                source: source!,
                quality,
                resolution,
                model: imageModel,
              }),
      )
    } catch (error) {
      setMissingJobError((current) => ({ ...current, [mode]: studioErrorMessage(error) }))
    }
  }

  const liveOverlay = mode === "text-overlay" && overlaySource && overlayText.trim() && !overlayPinned
  const displayItem =
    liveOverlay && overlaySource
      ? {
          id: overlaySource.id,
          kind: "image" as const,
          url: overlaySource.url,
          overlay: overlayStyle,
        }
      : items.find((item) => item.id === selectedCanvasId) ?? items[0]
  const modelOptions = models.filter((model) =>
    mode === "i2v" ? model.caps.includes("i2v") : model.caps.includes(mode === "i2i" ? "i2i" : "t2i"),
  )

  return (
    <div className="workspace studio">
      <aside className="panel stack">
        <div className="mode-tabs">
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? "active" : ""}
              onClick={() => setMode(item)}
            >
              {MODE_META[item].label}
            </button>
          ))}
        </div>
        <p className="status-text">{MODE_META[mode].hint}</p>
        {mode !== "text-overlay" && modelOptions.length > 0 ? (
          <label className="field">
            <span>模型</span>
            <select
              value={mode === "i2v" ? videoModel : imageModel}
              onChange={(event) =>
                mode === "i2v" ? setVideoModel(event.target.value) : setImageModel(event.target.value)
              }
            >
              <option value="">默认</option>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === "t2i" ? (
          <>
            <div className="field">
              <span className="field-head">
                提示词
                <RecruitPromptTemplatePicker onFill={setT2iPrompt} />
              </span>
              <textarea value={t2iPrompt} onChange={(event) => setT2iPrompt(event.target.value)} />
            </div>
            <div className="row">
              <label className="field">
                <span>数量</span>
                <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>比例</span>
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatio)}>
                  {["3:4", "1:1", "4:3", "16:9"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}
        {mode === "i2i" || mode === "i2v" || mode === "text-overlay" ? (
          <>
            {mode === "i2i" ? (
              <div className="field">
                <span className="field-head">
                  输入图
                  <RecruitPromptTemplatePicker onFillImage={(file) => addLocalFile(file, "i2i")} />
                </span>
                <ImageDrop
                  source={currentSource}
                  onFile={(file) => addLocalFile(file, mode)}
                  onClear={() => setI2iSource(null)}
                />
              </div>
            ) : (
              <ImageDrop
                source={currentSource}
                onFile={(file) => addLocalFile(file, mode)}
                onClear={() => {
                  if (mode === "text-overlay") {
                    setOverlaySource(null)
                    setOverlayPinned(false)
                    setOverlayError(undefined)
                  }
                  if (mode === "i2v") setI2vSource(null)
                }}
              />
            )}
            {mode === "text-overlay" ? (
              <>
                <label className="field">
                  <span>文字</span>
                  <textarea
                    value={overlayText}
                    onChange={(event) => {
                      setOverlayText(event.target.value)
                      setOverlayPinned(false)
                    }}
                  />
                </label>
                <div className="pos-grid">
                  {POSITIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={position === item ? "active" : ""}
                      onClick={() => {
                        setPosition(item)
                        setOverlayPinned(false)
                      }}
                    />
                  ))}
                </div>
                <div className="row">
                  <label className="field">
                    <span>字号</span>
                    <select
                      value={fontSize}
                      onChange={(event) => {
                        setFontSize(event.target.value as FontSizeToken)
                        setOverlayPinned(false)
                      }}
                    >
                      <option value="sm">小</option>
                      <option value="md">中</option>
                      <option value="lg">大</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>颜色</span>
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => {
                        setColor(event.target.value)
                        setOverlayPinned(false)
                      }}
                    />
                  </label>
                </div>
                <div className="row">
                  <label>
                    <input
                      type="checkbox"
                      checked={stroke}
                      onChange={(event) => {
                        setStroke(event.target.checked)
                        setOverlayPinned(false)
                      }}
                    />{" "}
                    描边
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={backdrop}
                      onChange={(event) => {
                        setBackdrop(event.target.checked)
                        setOverlayPinned(false)
                      }}
                    />{" "}
                    底条
                  </label>
                </div>
              </>
            ) : (
              <div className="field">
                <span className="field-head">
                  提示词
                </span>
                <textarea
                  value={mode === "i2i" ? i2iPrompt : i2vPrompt}
                  onChange={(event) =>
                    mode === "i2i" ? setI2iPrompt(event.target.value) : setI2vPrompt(event.target.value)
                  }
                />
              </div>
            )}
          </>
        ) : null}
        {mode === "i2v" ? (
          <div className="row">
            <label className="field">
              <span>时长</span>
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value) as VideoDuration)}>
                {[3, 5, 10, 15].map((value) => (
                  <option key={value} value={value}>
                    {value}s
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>清晰度</span>
              <select
                value={videoResolution}
                onChange={(event) => setVideoResolution(event.target.value as VideoResolution)}
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>
            <label className="field">
              <span>比例</span>
              <select
                value={videoAspect}
                onChange={(event) => setVideoAspect(event.target.value as VideoAspectRatio)}
              >
                <option value="source">跟随原图</option>
                <option value="3:4">3:4</option>
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
              </select>
            </label>
          </div>
        ) : null}
        {mode === "t2i" || mode === "i2i" ? (
          <div className="row">
            <label className="field">
              <span>画质</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value as ImageQuality)}>
                <option value="auto">自动</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
            <label className="field">
              <span>分辨率</span>
              <select value={resolution} onChange={(event) => setResolution(event.target.value as ImageResolution)}>
                <option value="auto">自动</option>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </label>
          </div>
        ) : null}
        <button
          type="button"
          className="primary-btn"
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          {busy ? `${mode === "text-overlay" ? "合成中" : "生成中"} ${elapsed}s` : MODE_META[mode].action}
        </button>
      </aside>

      <section className="canvas">
        <header className="canvas-head">
          <div>
            <p className="section-label">画布</p>
            {displayItem?.prompt ? <p className="canvas-caption">{displayItem.prompt}</p> : null}
            {busy && status === "ready" ? (
              <p className="canvas-caption">{mode === "text-overlay" ? "正在合成文字…" : "正在生成…"} {elapsed}s</p>
            ) : null}
            {imageError && status === "ready" ? <p className="canvas-caption error">{imageError}</p> : null}
            {saveHint ? <p className="canvas-caption">{saveHint}</p> : null}
          </div>
          {displayItem ? (
            <div className="canvas-actions">
              <button
                type="button"
                className="ghost-btn compact"
                disabled={saving}
                onClick={() => void downloadCurrent(displayItem)}
              >
                {saving ? "保存中…" : "下载"}
              </button>
              <button type="button" className="ghost-btn compact" onClick={() => setPreview(displayItem)}>
                放大
              </button>
              {displayItem.kind === "image" ? (
                <>
                  <button type="button" className="ghost-btn compact" onClick={() => chainTo("i2i", displayItem)}>
                    图生图
                  </button>
                  <button
                    type="button"
                    className="ghost-btn compact"
                    onClick={() => chainTo("text-overlay", displayItem)}
                  >
                    加文字
                  </button>
                  <button type="button" className="ghost-btn compact" onClick={() => chainTo("i2v", displayItem)}>
                    转视频
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </header>
        <div
          className={status === "ready" ? "canvas-stage is-ready" : "canvas-stage"}
          onClick={() => {
            if (status === "ready" && displayItem) setPreview(displayItem)
          }}
        >
          {status === "loading" ? (
            <p className="canvas-empty">
              {mode === "text-overlay" ? "正在合成文字…" : "正在生成…"} {elapsed}s
              <span>完成后会出现在这里</span>
            </p>
          ) : null}
          {status === "error" ? (
            <p className="canvas-empty">
              {imageError}
              <span>{mode === "text-overlay" ? "改一下文字或位置再合成一次" : "改一下左侧参数再生成一次"}</span>
            </p>
          ) : null}
          {status === "empty" ? (
            <p className="canvas-empty">
              还没有结果
              <span>
                {mode === "text-overlay" ? "选一张图，写上文字后点合成" : "左侧填写提示词后点生成"}
              </span>
            </p>
          ) : null}
          {status === "ready" && displayItem ? <CanvasPreview item={displayItem} /> : null}
        </div>
        {items.length > 1 ? (
          <div className="canvas-strip">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === displayItem?.id ? "active" : ""}
                onClick={() => setSelectedCanvasId(item.id)}
              >
                {item.kind === "video" ? <video src={item.url} muted /> : <img src={item.url} alt="" />}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <aside className="rail">
        <p className="section-label">资产</p>
        {historyPending ? <p className="status-text">加载中…</p> : null}
        {historyError ? <p className="status-text error">{studioErrorMessage(historyError)}</p> : null}
        <div className="asset-grid">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={asset.id === selectedCanvasId ? "asset-item active" : "asset-item"}
              onClick={() => applySource(asset)}
            >
              {asset.kind === "video" ? (
                <video className="thumb" src={asset.url} muted />
              ) : (
                <img className="thumb" src={asset.url} alt="" />
              )}
            </button>
          ))}
        </div>
      </aside>

      {preview ? (
        <button type="button" className="lightbox" onClick={() => setPreview(null)}>
          {preview.kind === "video" ? (
            <video src={preview.url} controls autoPlay />
          ) : (
            <div className="lightbox-preview">
              <img src={preview.url} alt="" />
              {preview.overlay ? <OverlayLayer overlay={preview.overlay} /> : null}
            </div>
          )}
        </button>
      ) : null}
    </div>
  )
}

function CanvasPreview({ item }: { item: CanvasItem }) {
  return (
    <div className="canvas-preview">
      <div className="canvas-frame">
        {item.kind === "video" ? (
          <video
            className="canvas-media"
            src={item.url}
            controls
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <img className="canvas-media" src={item.url} alt="" />
        )}
        {item.overlay ? <OverlayLayer overlay={item.overlay} /> : null}
      </div>
    </div>
  )
}

function OverlayLayer({ overlay }: { overlay: OverlayStyle }) {
  return (
    <div className="overlay-layer" data-pos={overlay.position}>
      <span
        className={`overlay-text is-${overlay.fontSize}${overlay.stroke ? " has-stroke" : ""}${overlay.backdrop ? " has-backdrop" : ""}`}
        style={{ color: overlay.color }}
      >
        {overlay.text}
      </span>
    </div>
  )
}

function ImageDrop({
  source,
  onFile,
  onClear,
}: {
  source: Asset | null
  onFile: (file: File) => void
  onClear: () => void
}) {
  return (
    <div className="stack">
      <label className="drop">
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFile(file)
            event.target.value = ""
          }}
        />
        {source ? "已选输入图，点击可替换" : "点此或从右侧资产选一张图"}
      </label>
      {source ? (
        <button type="button" className="ghost-btn" onClick={onClear}>
          清除输入图
        </button>
      ) : null}
    </div>
  )
}

function resolveImageError(input: {
  mode: RecruitImageMode
  job?: { taskId: string; status: string; error?: string; result?: { outputs?: Array<{ url?: string; s3Key?: string } | null> } }
  queryError?: unknown
  missing?: string
  dismissedTaskId?: string
}) {
  const { job } = input
  if (job?.status === "failed" && input.dismissedTaskId !== job.taskId) {
    return job.error?.trim() || "生成失败"
  }
  if (job?.status === "succeeded" && !hasUsableOutputs(job.result?.outputs)) {
    return input.mode === "i2v" ? "后端没有返回视频" : "后端没有返回图片"
  }
  if (input.queryError && !isNotFoundJobError(input.queryError)) {
    return studioErrorMessage(input.queryError)
  }
  return input.missing
}

function hasUsableOutputs(
  outputs?: Array<{ url?: string; s3Key?: string } | null>,
): outputs is MediaResult[] {
  return Boolean(outputs?.length && outputs.every((item) => item?.url && item?.s3Key))
}
