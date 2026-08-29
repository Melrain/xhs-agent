import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { studioErrorMessage } from "@/lib/api/client"
import { toVanityUserRef } from "@/lib/api/vanity-refs"
import type { CharacterCard, LookCard } from "@/lib/api/characters"
import { pickImageFiles } from "@/lib/character-files"
import { hydrateRenderSettings, useRenderSettings } from "@/lib/render-settings"
import {
  allUserRefs,
  useVanityUserRefMutations,
  useVanityUserRefs,
} from "@/hooks/use-vanity-refs"
import { useCharacterMutations, useCharacters, useLooks } from "@/hooks/use-characters"
import {
  draftFromLook,
  hasCustomVanityChip,
  hydrateVanityDraft,
} from "@/lib/vanity-look"
import {
  buildVanityPrompt,
  canGenerateVanityLook,
  vanityChipId,
  vanityLookTitle,
  type VanityLookDraft,
} from "@/lib/vanity-prompt"
import { mediaFileName, saveMediaFile } from "@/lib/save-media"
import {
  VANITY_KIND_META,
  VANITY_REFS,
  describeUserRefImport,
  type VanityKind,
  type VanityRef,
} from "@/lib/vanity-refs"

export function MakeupWorkspace() {
  const [selectedId, setSelectedId] = useState<string>()
  const [scope, setScope] = useState<"current" | "all">("current")
  const charactersQuery = useCharacters()
  const looksEnabled = scope === "all" || Boolean(selectedId)
  const looksQuery = useLooks(scope === "current" ? selectedId : undefined, looksEnabled)
  const mutations = useCharacterMutations(selectedId)
  const makeupMine = useVanityUserRefs("makeup")
  const wardrobeMine = useVanityUserRefs("wardrobe")
  const makeupMut = useVanityUserRefMutations("makeup")
  const wardrobeMut = useVanityUserRefMutations("wardrobe")
  const settings = useRenderSettings()
  const userRefs = allUserRefs(makeupMine.data, wardrobeMine.data)
  const refsPending = makeupMine.isPending || wardrobeMine.isPending
  const [draft, setDraft] = useState<VanityLookDraft>({ refine: "" })
  const liveDraft = useMemo(() => hydrateVanityDraft(draft, userRefs), [draft, userRefs])
  const [picker, setPicker] = useState<VanityKind>()
  const [notice, setNotice] = useState<string>()
  const [preview, setPreview] = useState<LookCard | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    hydrateRenderSettings()
  }, [])

  const cards = charactersQuery.data ?? []
  const selected = cards.find((card) => card.id === selectedId)
  const looks = looksEnabled ? looksQuery.data?.looks ?? [] : []

  useEffect(() => {
    if (charactersQuery.isPending) return
    if (selectedId && selected) return
    if (cards[0]) setSelectedId(cards[0].id)
    else if (selectedId) setSelectedId(undefined)
  }, [cards, charactersQuery.isPending, selected, selectedId])

  const importFiles = useCallback(
    async (incoming: File[]) => {
      const { files, skipped } = pickImageFiles(incoming)
      if (files.length === 0) {
        setNotice("没有可用的照片：只支持 ≤10MB 的图片")
        return
      }
      setNotice(skipped > 0 ? `跳过了 ${skipped} 张（非图片或超过 10MB）` : undefined)
      try {
        const created = await mutations.create.mutateAsync(files)
        if (created[0]) setSelectedId(created[0].id)
      } catch (error) {
        setNotice(studioErrorMessage(error))
      }
    },
    [mutations.create],
  )

  async function generate() {
    if (!selected || !canGenerateVanityLook(liveDraft) || mutations.generate.isPending) return
    try {
      await mutations.generate.mutateAsync({
        characterId: selected.id,
        looks: [
          {
            dimension: "vanity",
            chipId: vanityChipId(liveDraft),
            chipTitle: vanityLookTitle(liveDraft),
            refine: liveDraft.refine.trim(),
            prompt: buildVanityPrompt(liveDraft),
          },
        ],
        settings: {
          quality: settings.quality,
          resolution: settings.resolution,
          model: settings.model,
        },
      })
      setNotice(undefined)
    } catch (error) {
      setNotice(studioErrorMessage(error))
    }
  }

  function reuseLook(look: LookCard) {
    if (hasCustomVanityChip(look.chipId) && refsPending) {
      setNotice("参考库还在加载，稍后再点复用")
      return
    }
    const reused = draftFromLook(look, userRefs)
    setDraft({
      makeup: reused.makeup,
      outfit: reused.outfit,
      refine: reused.refine,
    })
    setNotice(
      reused.missing.length > 0
        ? "有自定义参考已不在库里，只回填了还在的部分"
        : "已回填这套参数",
    )
  }

  async function removeCharacter(card: CharacterCard) {
    const warning =
      card.lookCount > 0
        ? `删掉「${card.name}」会连它的 ${card.lookCount} 张妆造一起删掉，确定？`
        : `删掉底图「${card.name}」？`
    if (!window.confirm(warning)) return
    try {
      await mutations.remove.mutateAsync(card.id)
      if (selectedId === card.id) setSelectedId(undefined)
    } catch (error) {
      setNotice(studioErrorMessage(error))
    }
  }

  const generateLabel = mutations.generate.isPending
    ? "出图中…"
    : !selected
      ? "先选一张脸"
      : canGenerateVanityLook(liveDraft)
        ? "出图"
        : "选出图参考"

  return (
    <div className="workspace makeup">
      <header className="makeup-toolbar">
        <div className="makeup-toolbar-meta">
          <p className={notice ? "status-text" : "status-text makeup-toolbar-hint"}>
            {notice ?? "选一张脸，再选妆造和服装参考后出图。"}
          </p>
          {notice ? (
            <button type="button" className="ghost-btn compact" onClick={() => setNotice(undefined)}>
              关闭
            </button>
          ) : null}
        </div>
        <div className="makeup-toolbar-actions">
          <input
            className="makeup-refine"
            value={liveDraft.refine}
            onChange={(event) => setDraft((current) => ({ ...current, refine: event.target.value }))}
            placeholder="补充一句细节"
          />
          <select
            value={settings.quality ?? "low"}
            onChange={(event) => settings.set({ quality: event.target.value as typeof settings.quality })}
            aria-label="画质"
          >
            <option value="auto">画质自动</option>
            <option value="low">低画质</option>
            <option value="medium">中画质</option>
            <option value="high">高画质</option>
          </select>
          <select
            value={settings.resolution ?? "auto"}
            onChange={(event) =>
              settings.set({ resolution: event.target.value as typeof settings.resolution })
            }
            aria-label="分辨率"
          >
            <option value="auto">分辨率自动</option>
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
          <button
            type="button"
            className="primary-btn"
            disabled={!selected || !canGenerateVanityLook(liveDraft) || mutations.generate.isPending}
            onClick={() => void generate()}
          >
            {generateLabel}
          </button>
        </div>
      </header>

      <div className="makeup-body">
        <aside className="makeup-col">
          <div className="makeup-col-head">
            <h3>源图</h3>
            <button type="button" className="makeup-text-btn" onClick={() => fileInputRef.current?.click()}>
              导入
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void importFiles(Array.from(event.target.files ?? []))
              event.target.value = ""
            }}
          />
          <div className="makeup-source-preview">
            {selected ? (
              <img src={selected.url} alt={selected.name} />
            ) : (
              <p className="status-text">{charactersQuery.isPending ? "加载中…" : "导入一张脸"}</p>
            )}
          </div>
          {selected ? (
            <div className="makeup-source-meta">
              <span>{selected.name}</span>
              <button type="button" className="makeup-text-btn" onClick={() => void removeCharacter(selected)}>
                删除
              </button>
            </div>
          ) : null}
          <div className="makeup-source-list">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                className={card.id === selectedId ? "makeup-face is-active" : "makeup-face"}
                onClick={() => setSelectedId(card.id)}
              >
                <img src={card.url} alt={card.name} />
              </button>
            ))}
          </div>
        </aside>

        <section className="makeup-col">
          <div className="makeup-col-head">
            <h3>参考</h3>
            <span>妆造和服装各选一张</span>
          </div>
          <div className="makeup-ref-slots">
            <RefSlot
              label="妆造"
              value={liveDraft.makeup}
              empty="点这里选妆造"
              onOpen={() => setPicker("makeup")}
              onClear={() => setDraft((current) => ({ ...current, makeup: undefined }))}
            />
            <RefSlot
              label="服装"
              value={liveDraft.outfit}
              empty="点这里选服装"
              onOpen={() => setPicker("wardrobe")}
              onClear={() => setDraft((current) => ({ ...current, outfit: undefined }))}
            />
          </div>
        </section>

        <aside className="makeup-col">
          <div className="makeup-col-head">
            <h3>历史</h3>
            <button
              type="button"
              className="makeup-text-btn"
              onClick={() => setScope((current) => (current === "current" ? "all" : "current"))}
            >
              {scope === "current" ? "只看当前脸" : "看全部"}
            </button>
          </div>
          {looksQuery.isPending && looks.length === 0 ? (
            <div className="makeup-state">
              <p className="status-text">加载中…</p>
            </div>
          ) : null}
          {!looksQuery.isPending && looks.length === 0 ? (
            <div className="makeup-state">
              <p className="status-text">出图后会排在这里</p>
            </div>
          ) : null}
          {looks.length > 0 ? (
            <ul className="makeup-look-grid">
              {looks.map((look) => (
                <li
                  key={look.id}
                  className={look.status === "failed" ? "makeup-look-card is-failed" : "makeup-look-card"}
                >
                  {look.url ? (
                    <button type="button" className="makeup-look-cover" onClick={() => setPreview(look)}>
                      <img src={look.url} alt={look.chipTitle} />
                    </button>
                  ) : (
                    <div className="makeup-look-cover is-empty">
                      {look.status === "failed" ? "失败" : "生成中"}
                    </div>
                  )}
                  <span className={`makeup-look-status is-${look.status}`}>
                    {look.status === "failed" ? "失败" : look.status === "pending" ? "生成中" : "已完成"}
                  </span>
                  <div className="makeup-look-copy">
                    <strong>{look.chipTitle}</strong>
                    {scope === "all" && look.characterName ? (
                      <p className="makeup-look-meta">{look.characterName}</p>
                    ) : null}
                    {look.status === "failed" ? (
                      <p className="status-text error">{look.error || "生成失败"}</p>
                    ) : null}
                    <div className="makeup-look-actions">
                      {look.url ? (
                        <button
                          type="button"
                          className="makeup-text-btn"
                          onClick={() =>
                            void saveMediaFile({
                              url: look.url!,
                              fileName: mediaFileName({
                                kind: "image",
                                url: look.url!,
                                title: look.chipTitle,
                              }),
                            }).catch((error) => setNotice(studioErrorMessage(error)))
                          }
                        >
                          下载
                        </button>
                      ) : null}
                      <button type="button" className="makeup-text-btn" onClick={() => reuseLook(look)}>
                        复用
                      </button>
                      {look.status === "failed" ? (
                        <button
                          type="button"
                          className="makeup-text-btn"
                          onClick={() =>
                            void mutations.retry.mutateAsync({
                              lookId: look.id,
                              settings: {
                                quality: settings.quality,
                                resolution: settings.resolution,
                                model: settings.model,
                              },
                            })
                          }
                        >
                          重试
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>

      {picker ? (
        <RefPicker
          kind={picker}
          mine={picker === "makeup" ? makeupMine.data ?? [] : wardrobeMine.data ?? []}
          onClose={() => setPicker(undefined)}
          onPick={(ref) => {
            setDraft((current) =>
              picker === "makeup" ? { ...current, makeup: ref } : { ...current, outfit: ref },
            )
            setPicker(undefined)
          }}
          onUpload={async (file) => {
            const mut = picker === "makeup" ? makeupMut : wardrobeMut
            try {
              const card = await mut.upload.mutateAsync(file)
              setNotice(describeUserRefImport(1, 0))
              return toVanityUserRef(card)
            } catch (error) {
              setNotice(studioErrorMessage(error))
              return undefined
            }
          }}
        />
      ) : null}

      {preview?.url ? (
        <button type="button" className="lightbox" onClick={() => setPreview(null)}>
          <img src={preview.url} alt={preview.chipTitle} />
        </button>
      ) : null}
    </div>
  )
}

function RefSlot({
  label,
  value,
  empty,
  onOpen,
  onClear,
}: {
  label: string
  value?: VanityRef
  empty: string
  onOpen: () => void
  onClear: () => void
}) {
  return (
    <div className={value ? "makeup-slot is-filled" : "makeup-slot"}>
      <button type="button" className="makeup-slot-hit" onClick={onOpen}>
        {value ? <img src={value.src} alt={value.title} /> : <span>{empty}</span>}
      </button>
      <div className="makeup-slot-meta">
        <div>
          <p className="makeup-slot-k">{label}</p>
          <p>{value ? value.title : "未选"}</p>
        </div>
        {value ? (
          <button type="button" className="makeup-text-btn" onClick={onClear}>
            清除
          </button>
        ) : null}
      </div>
    </div>
  )
}

function RefPicker({
  kind,
  mine,
  onClose,
  onPick,
  onUpload,
}: {
  kind: VanityKind
  mine: VanityRef[]
  onClose: () => void
  onPick: (ref: VanityRef) => void
  onUpload: (file: File) => Promise<VanityRef | undefined>
}) {
  const system = VANITY_REFS[kind]
  return (
    <div className="makeup-modal" onClick={onClose}>
      <div className="makeup-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="makeup-modal-head">
          <h3>{VANITY_KIND_META[kind].label}参考</h3>
          <button type="button" className="makeup-text-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <label className="makeup-text-btn makeup-modal-upload">
          上传我的参考
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onUpload(file).then((ref) => ref && onPick(ref))
              event.target.value = ""
            }}
          />
        </label>
        <div className="makeup-modal-grid">
          {mine.concat(system).map((ref) => (
            <button key={`${ref.source}-${ref.id}`} type="button" className="makeup-ref" onClick={() => onPick(ref)}>
              <img src={ref.src} alt={ref.title} />
              <span>{ref.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
