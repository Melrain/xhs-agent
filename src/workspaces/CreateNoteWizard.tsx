import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

  return (
    <div className="workspace notes-wizard">
      <header className="notes-wizard-head">
        <div>
          <p className="section-label">{initial ? "编辑笔记" : "创建笔记"}</p>
          <p className="status-text">
            选图 → AI 文案 → 完成。编辑会自动保存草稿，发帖在列表里一键完成。
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onCancel}>
          返回列表
        </button>
      </header>

      <section className="notes-wizard-section">
        <p className="section-label">1. 选图（{picks.length}/{MAX_IMAGES}）</p>
        <p className="status-text">第一张是封面。视频和未落云的图不能选。</p>
        {isPending ? <p className="status-text">加载素材中…</p> : null}
        {error ? <p className="status-text error">{studioErrorMessage(error)}</p> : null}
        <div className="asset-grid pack-grid">
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
        {displayItems.length > 0 ? (
          <ul className="package-selected-list">
            {displayItems.map((item, index) => (
              <li key={item.key} className="package-selected-item">
                {item.url ? <img src={item.url} alt="" /> : <div className="thumb" />}
                <div>
                  <p>{index === 0 ? "封面" : `第 ${index + 1} 张`}</p>
                  {item.orphan ? <p className="status-text">素材库里已不在，仍可发布</p> : null}
                  <div className="row">
                    <button
                      type="button"
                      className="ghost-btn compact"
                      disabled={index === 0}
                      onClick={() => moveSelected(index, -1)}
                    >
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
                      onClick={() => removePick(index)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="notes-wizard-section">
        <p className="section-label">2. 文案</p>
        <label className="field">
          <span>岗位（可选，辅助 AI）</span>
          <input value={job} onChange={(event) => setJob(event.target.value)} placeholder="运营 / 主播…" />
        </label>
        <label className="field">
          <span>人设（可选）</span>
          <input value={persona} onChange={(event) => setPersona(event.target.value)} />
        </label>
        <button
          type="button"
          className="ghost-btn"
          disabled={copyBusy || selectedAssetIds.length === 0}
          onClick={() => void generateCopy()}
        >
          {copyBusy ? "生成文案中…" : "根据图片 AI 生成文案"}
        </button>
        <label className="field">
          <span>标题（≤20字）</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_MAX} />
        </label>
        <label className="field">
          <span>正文（≤1000字）</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={BODY_MAX} />
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
      </section>

      <section className="notes-wizard-section">
        <p className="section-label">3. 完成</p>
        <div className="row">
          <button
            type="button"
            className="primary-btn"
            disabled={completeBusy || copyBusy || isPending}
            onClick={() => void completeNote()}
          >
            {completeBusy ? "处理中…" : "完成"}
          </button>
        </div>
        {saveHint ? (
          <p className="status-text">
            {saveHint}
            {saveState === "error" ? (
              <button type="button" className="ghost-btn compact" onClick={() => void retrySave()}>
                重试
              </button>
            ) : null}
          </p>
        ) : null}
        {hint ? <p className="status-text">{hint}</p> : null}
      </section>
    </div>
  )
}
