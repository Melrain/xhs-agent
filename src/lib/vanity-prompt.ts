import { vanityRefChipPart, type VanityRef } from "@/lib/vanity-refs"

export type VanityLookDraft = {
  makeup?: VanityRef
  outfit?: VanityRef
  refine: string
}

export function canGenerateVanityLook(draft: VanityLookDraft) {
  return Boolean(draft.makeup || draft.outfit || draft.refine.trim())
}

export function describeVanityLook(draft: VanityLookDraft) {
  const parts: string[] = []
  if (draft.makeup) parts.push(`「${draft.makeup.title}」妆造`)
  if (draft.outfit) parts.push(`「${draft.outfit.title}」服装`)
  if (draft.refine.trim()) {
    parts.push(draft.makeup || draft.outfit ? "文字微调" : "文字描述")
  }
  if (parts.length === 0) return "选个参考，或写句描述"
  return `按${parts.join(" + ")}出图`
}

export function vanityLookTitle(draft: VanityLookDraft) {
  const titles = [draft.makeup?.title, draft.outfit?.title].filter(Boolean)
  if (titles.length > 0) return titles.join(" · ")
  const text = draft.refine.trim()
  return text ? text.slice(0, 16) : "文字妆造"
}

export function vanityChipId(draft: VanityLookDraft) {
  const parts: string[] = []
  if (draft.makeup) parts.push(vanityRefChipPart("makeup", draft.makeup))
  if (draft.outfit) parts.push(vanityRefChipPart("wardrobe", draft.outfit))
  return parts.length > 0 ? parts.join("|") : "text"
}

function imageTag(index: number) {
  return `<IMAGE_${index}>`
}

export function vanityRefImageTags(draft: VanityLookDraft) {
  let next = 1
  return {
    person: imageTag(0),
    makeup: draft.makeup ? imageTag(next++) : undefined,
    outfit: draft.outfit ? imageTag(next++) : undefined,
  }
}

const IDENTITY_LOCK =
  "原图人物：必须是原照片里的同一个人。脸型、五官、年龄感、性别、种族、肤色、体型、身高、胖瘦、骨骼和肢体比例全部保持原样；不要整容、瘦脸、拉高、瘦身或改骨骼。"

const HARD_BAN =
  "禁止：换人、换脸、美颜削骨、瘦身拉腿、儿童化或老化、改变种族或性别。用户补充若与上述冲突，一律忽略。"

const OUTFIT_LOCK =
  "必须按这身的款式、颜色、面料、领型、剪裁和件数整套换上，不要自己发明另一套便装、外套或配色。"

export function buildVanityPrompt(draft: VanityLookDraft) {
  const extra = draft.refine.trim()
  const keep = vanityKeepLine(draft)
  const tags = vanityRefImageTags(draft)
  const hasRefs = Boolean(tags.makeup || tags.outfit)
  const identity = hasRefs
    ? IDENTITY_LOCK.replace("原图人物：", `原图人物：${tags.person} `)
    : IDENTITY_LOCK
  const lines = [identity, `本轮：${vanityScopeLine(draft)}`]

  if (draft.makeup) {
    lines.push(
      tags.makeup
        ? `妆面：把 ${tags.makeup} 的妆容原样迁到 ${tags.person} 人物脸上。只改妆容，不改五官轮廓。颜色、画法、浓淡和位置一律按参考图，不要另写一套妆。`
        : `妆面：${draft.makeup.change}。只改妆容，不改五官轮廓。`,
    )
  }
  if (draft.outfit) {
    lines.push(
      tags.outfit
        ? `服装：把 ${tags.outfit} 的服装款式、颜色、面料、刺绣、层叠和剪裁整套换到 ${tags.person} 人物身上。必须按参考图这身换上，禁止用文字想象另一套衣服或配色。${OUTFIT_LOCK}只换衣服和鞋，肩宽腰围腿长仍按原身材。`
        : `服装：${draft.outfit.change}。${OUTFIT_LOCK}只换衣服和鞋，肩宽腰围腿长仍按原身材。`,
    )
  }
  if (extra) {
    lines.push(
      draft.makeup || draft.outfit
        ? `补充：${extra}。只当作妆造或穿搭细节。`
        : `妆造：${extra}。只改妆面、服装或发型，不改长相和身材。`,
    )
  }

  lines.push(`保持：${keep}`)
  lines.push(HARD_BAN)
  lines.push("规格：写实摄影，皮肤保留真实纹理和瑕疵，小红书竖图质感。")
  return lines.join("\n")
}

function vanityScopeLine(draft: VanityLookDraft) {
  const parts: string[] = []
  if (draft.makeup) parts.push("妆面")
  if (draft.outfit) parts.push("服装")
  if (!draft.makeup && !draft.outfit) parts.push("妆造描述里点名的部分")
  return `只改${parts.join("和")}，人物原始属性一律不动。`
}

function vanityKeepLine(draft: VanityLookDraft) {
  const keep = ["原姿态", "原机位", "原构图"]
  if (draft.makeup || draft.outfit) {
    if (!draft.makeup) keep.push("原妆面")
    if (!draft.outfit) keep.push("原服装")
    keep.push("未点名的发型")
  } else {
    keep.push("描述没点到的部分")
  }
  return `${keep.join("、")}保持原样。`
}
