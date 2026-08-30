import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react"
import { generateRecruitCopy } from "@/lib/api/copy"
import { isAbortError, studioErrorMessage } from "@/lib/api/client"
import {
  BODY_MAX,
  draftInputFromPackage,
  draftInputFromPicks,
  draftMissingParts,
  hasDraftContent,
  picksFromPackage,
  resolvePicks,
  TITLE_MAX,
  TOPICS_MAX,
  useNoteDraft,
  type NoteMediaPick,
} from "@/hooks/use-note-draft"
import { useRecruitAssets } from "@/hooks/use-recruit-assets"
import type { NotePackage } from "@/lib/api/packages"

const MAX_IMAGES = 9

type Props = {
  initial?: NotePackage
  onDone: (message?: string) => void
  onCancel: () => void
}

export function CreateNoteWizard({ initial, onDone, onCancel }: Props) {
  const { assets, isPending, error } = useRecruitAssets()
  const { saveState, saveError, scheduleSave, flushSave, retrySave } = useNoteDraft({
    initialId: initial?.id ?? null,
    initialInput: initial ? draftInputFromPackage(initial) : null,
    ready: !isPending,
  })

  const packableAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "image" && asset.s3Key),
    [assets],
  )
  const packableIdSet = useMemo(
    () => new Set(packableAssets.map((asset) => asset.id)),
    [packableAssets],
  )

  const [picks, setPicks] = useState<NoteMediaPick[]>(() => picksFromPackage(initial))
  const copyAbort = useRef<AbortController | null>(null)

  const effectivePicks = useMemo(
    () => (isPending ? picks : resolvePicks(picks, packableIdSet, initial)),
    [initial, isPending, packableIdSet, picks],
  )
  const selectedAssetIds = useMemo(
    () => effectivePicks.filter((pick) => pick.kind === "asset").map((pick) => pick.id),
    [effectivePicks],
  )

  const [job, setJob] = useState(initial?.job ?? "")
  const [persona, setPersona] = useState(initial?.persona ?? "")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [body, setBody] = useState(initial?.body ?? "")
  const [topicsText, setTopicsText] = useState(() => initial?.topics.join(" ") ?? "")
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [completeBusy, setCompleteBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const topics = useMemo(
    () =>
      topicsText
        .split(/[,，\s]+/)
        .map((item) => item.trim().replace(/^#+/, ""))
        .filter(Boolean),
    [topicsText],
  )

  const draftSnapshot = useMemo(
    () =>
      draftInputFromPicks(effectivePicks, {
        title,
        body,
        topics,
        job,
        persona,
        isPrivate,
      }),
    [body, effectivePicks, isPrivate, job, persona, title, topics],
  )

  const displayItems = useMemo(
    () =>
      effectivePicks.map((pick) => {
        if (pick.kind === "keep") {
          return { key: `keep-${pick.id}`, url: pick.url, orphan: true }
        }
        const asset = packableAssets.find((item) => item.id === pick.id)
        const fallback = initial?.media.find((item) => item.studioAssetId === pick.id)
        return {
          key: `asset-${pick.id}`,
          url: asset?.url ?? fallback?.url ?? "",
          orphan: false,
        }
      }),
    [effectivePicks, initial, packableAssets],
  )

  useEffect(() => {
    scheduleSave(draftSnapshot)
  }, [draftSnapshot, scheduleSave])

  function toggleAsset(assetId: string) {
    setHint(null)
    if (picks.some((pick) => pick.kind === "asset" && pick.id === assetId)) {
      setPicks(picks.filter((pick) => !(pick.kind === "asset" && pick.id === assetId)))
      return
    }
    if (picks.length >= MAX_IMAGES) {
      setHint(`最多选 ${MAX_IMAGES} 张图`)
      return
    }
    setPicks([...picks, { kind: "asset", id: assetId }])
  }

  function moveSelected(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= effectivePicks.length) return
    const next = [...effectivePicks]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setPicks(next)
  }

  function removePick(index: number) {
    setPicks(effectivePicks.filter((_, itemIndex) => itemIndex !== index))
  }

  useEffect(() => {
    return () => {
      copyAbort.current?.abort()
    }
  }, [])

  const generateCopy = useCallback(async () => {
    if (selectedAssetIds.length === 0) {
      setHint("先选至少一张素材库里的图，才能生成文案")
      return
    }
    copyAbort.current?.abort()
    const controller = new AbortController()
    copyAbort.current = controller
    setCopyBusy(true)
    setHint(null)
    try {
      const copy = await generateRecruitCopy(
        {
          job: job.trim() || undefined,
          persona: persona.trim() || undefined,
          assetIds: selectedAssetIds,
        },
        { signal: controller.signal },
      )
      setTitle(copy.title.trim().slice(0, TITLE_MAX))
      setBody(copy.body.trim().slice(0, BODY_MAX))
      setTopicsText(copy.tags.slice(0, TOPICS_MAX).join(" "))
      setHint("文案已生成，可再改几句")
    } catch (err) {
      if (isAbortError(err)) return
      setHint(studioErrorMessage(err))
    } finally {
      if (copyAbort.current === controller) {
        copyAbort.current = null
        setCopyBusy(false)
      }
    }
  }, [job, persona, selectedAssetIds])

  async function completeNote() {
    if (copyBusy) {
      setHint("文案还在生成，请稍候")
      return
    }
    if (isPending) {
      setHint("素材还在加载，请稍候")
      return
    }
    if (topics.length > TOPICS_MAX) {
      setHint(`话题最多 ${TOPICS_MAX} 个`)
      return
    }
    if (!hasDraftContent(draftSnapshot)) {
      setHint("还没写内容")
      return
    }
    setCompleteBusy(true)
    setHint(null)
    try {
      await flushSave(draftSnapshot)
      const missing = draftMissingParts(draftSnapshot)
      if (missing.length > 0) {
        onDone(`草稿已保存，还差：${missing.join("、")}`)
        return
      }
      onDone("笔记已完成")
    } catch (err) {
      setHint(studioErrorMessage(err))
    } finally {
      setCompleteBusy(false)
    }
  }

  const saveHint =
    saveState === "saving"
      ? "保存中…"
      : saveState === "saved"
        ? "草稿已保存"
        : saveState === "error"
          ? saveError
          : null
  const cover = displayItems[0]
  const previewTitle = title.trim() || "标题会出现在这里"
  const previewBody = body.trim() || "正文会出现在这里"

  return (
    <div className="workspace notes-wizard">
      <header className="notes-composer-bar">
        <button type="button" className="ghost-btn" onClick={onCancel}>
          返回列表
        </button>
        <div className="notes-composer-title">
          <p className="section-label">{initial ? "编辑笔记" : "创建笔记"}</p>
          <p className={saveState === "error" ? "status-text error" : "status-text"}>
            {hint ?? saveHint ?? "左边选图，中间改文案，右边是预览。"}
            {saveState === "error" ? (
              <button type="button" className="ghost-btn compact" onClick={() => void retrySave()}>
                重试
              </button>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={completeBusy || copyBusy || isPending}
          onClick={() => void completeNote()}
        >
          {completeBusy ? "处理中…" : "完成"}
        </button>
      </header>

      <div className="notes-composer">
        <aside className="notes-col">
          <div className="notes-col-head">
            <h3>素材</h3>
            <span>
              {effectivePicks.length}/{MAX_IMAGES}
            </span>
          </div>
          <p className="status-text">第一张是封面。视频和未落云的图不能选。</p>
          {isPending ? <p className="status-text">加载素材中…</p> : null}
          {error ? <p className="status-text error">{studioErrorMessage(error)}</p> : null}
          <div className="notes-asset-grid">
            {packableAssets.map((asset) => {
              const index = selectedAssetIds.indexOf(asset.id)
              const isSelected = index >= 0
              const atLimit = !isSelected && picks.length >= MAX_IMAGES
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={isSelected ? "asset-item is-selected" : "asset-item"}
                  disabled={atLimit}
                  onClick={() => toggleAsset(asset.id)}
                >
                  <img className="thumb" src={asset.url} alt="" />
                  {isSelected ? (
                    <span className="asset-check">{index === 0 ? "封面" : index + 1}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
          {!isPending && !error && packableAssets.length === 0 ? (
            <p className="status-text">素材库还没有可组稿的图，先去招聘页生成。</p>
          ) : null}
        </aside>

        <section className="notes-col notes-editor">
          <div className="notes-col-head">
            <h3>文案</h3>
            <button
              type="button"
              className={copyBusy ? "ai-copy-btn is-busy" : "ai-copy-btn"}
              disabled={copyBusy || selectedAssetIds.length === 0}
              onClick={() => void generateCopy()}
            >
              <span className="ai-copy-btn-orbit" aria-hidden />
              <Sparkles size={13} strokeWidth={2.2} className="ai-copy-btn-icon" />
              <span className="ai-copy-btn-label">{copyBusy ? "生成中…" : "根据图片生成"}</span>
            </button>
          </div>
          <div className="notes-field-row">
            <label className="field">
              <span>岗位（可选，辅助 AI）</span>
              <input
                value={job}
                onChange={(event) => setJob(event.target.value)}
                placeholder="运营 / 主播…"
              />
            </label>
            <label className="field">
              <span>人设（可选）</span>
              <input value={persona} onChange={(event) => setPersona(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>
              标题
              <em>
                {title.length}/{TITLE_MAX}
              </em>
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              placeholder="不超过 20 字"
            />
          </label>
          <label className="field notes-body-field">
            <span>
              正文
              <em>
                {body.length}/{BODY_MAX}
              </em>
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={BODY_MAX}
              placeholder="写给求职者看的正文"
            />
          </label>
          <label className="field">
            <span>
              话题
              <em>
                {topics.length}/{TOPICS_MAX}
              </em>
            </span>
            <input
              value={topicsText}
              onChange={(event) => setTopicsText(event.target.value)}
              placeholder="空格或逗号分隔，最多 10 个"
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
        </section>

        <aside className="notes-col notes-preview">
          <div className="notes-col-head">
            <h3>预览</h3>
            {isPrivate ? <span>仅自己可见</span> : <span>公开笔记</span>}
          </div>
          <div className="note-phone">
            <div className="note-phone-cover">
              {cover?.url ? <img src={cover.url} alt="" /> : <span>选一张图当封面</span>}
              {displayItems.length > 1 ? (
                <span className="note-phone-count">1/{displayItems.length}</span>
              ) : null}
            </div>
            <div className="note-phone-copy">
              <strong className={title.trim() ? undefined : "is-placeholder"}>{previewTitle}</strong>
              <p className={body.trim() ? undefined : "is-placeholder"}>{previewBody}</p>
              {topics.length > 0 ? (
                <div className="note-topic-row">
                  {topics.slice(0, TOPICS_MAX).map((topic) => (
                    <span key={topic}>#{topic}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {displayItems.length > 0 ? (
            <ul className="note-filmstrip">
              {displayItems.map((item, index) => (
                <li key={item.key} className="note-film-item">
                  {item.url ? <img src={item.url} alt="" /> : <div className="thumb" />}
                  <span className="note-film-index">{index === 0 ? "封面" : index + 1}</span>
                  {item.orphan ? <span className="note-film-orphan">仍可发</span> : null}
                  <div className="note-film-ops">
                    <button
                      type="button"
                      className="note-icon-btn"
                      disabled={index === 0}
                      onClick={() => moveSelected(index, -1)}
                      aria-label="左移"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      className="note-icon-btn"
                      disabled={index === displayItems.length - 1}
                      onClick={() => moveSelected(index, 1)}
                      aria-label="右移"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      type="button"
                      className="note-icon-btn"
                      onClick={() => removePick(index)}
                      aria-label="移除"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status-text">点左侧素材加入组稿，可左右调整顺序。</p>
          )}
        </aside>
      </div>
    </div>
  )
}
