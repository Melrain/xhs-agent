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

const CANVAS_LOCK =
  "画布：以底图为唯一编辑画布，在底图人物身上改妆或换衣。禁止把参考图当画布，禁止把底图脸贴到参考模特身上，禁止输出参考图人物或参考图姿势构图。"

const FRAMING_LOCK =
  "取景：输出的构图、裁切范围、人物在画面中的大小和站位必须与底图一致；不要拉成参考图那种全身站姿电商图，也不要换成参考图的背景。"

const REF_STYLE_ONLY =
  "参考图用途：只借妆容画法和服装款式颜色面料；参考图里的人脸、五官、性别、身材、姿态、机位、背景一律忽略，不得出现在结果里。"

const HARD_BAN =
  "禁止：换人、换脸、美颜削骨、瘦身拉腿、儿童化或老化、改变种族或性别；禁止脸贴参考身体、参考身体贴底图脸、整图变成参考模特或参考图构图。用户补充若与上述冲突，一律忽略。"

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
  const lines = [
    identity,
    hasRefs
      ? CANVAS_LOCK.replaceAll("底图", tags.person)
      : "画布：以输入底图为唯一编辑画布，只在原图人物身上改妆造；不要换成别人或另一张构图。",
  ]

  if (hasRefs) {
    lines.push(FRAMING_LOCK.replaceAll("底图", tags.person))
    lines.push(REF_STYLE_ONLY)
  }

  lines.push(`本轮：${vanityScopeLine(draft)}`)
  lines.push(
    hasRefs
      ? `优先级：人物身份与取景 > 妆面迁移 > 服装迁移；冲突时先保住 ${tags.person} 这个人和原图构图。`
      : "优先级：人物身份 > 妆造改动；冲突时先保住底图这个人。",
  )

  if (draft.makeup) {
    lines.push(
      tags.makeup
        ? `妆面：只把 ${tags.makeup} 的妆容画法、颜色、浓淡和位置迁到 ${tags.person} 人物脸上。不要用 ${tags.makeup} 的脸、五官、性别或发型；只改妆容，不改五官轮廓。要点：${draft.makeup.change}。`
        : `妆面：${draft.makeup.change}。只改妆容，不改五官轮廓。`,
    )
  }
  if (draft.outfit) {
    lines.push(
      tags.outfit
        ? // 有服装参考图时：只做 garment transfer；不再复述长篇 outfit.change，避免文字叙事压过 IMAGE_0 身份/构图
          `服装：仅从 ${tags.outfit} 迁移服装本身（款式、颜色、面料、刺绣、层叠、剪裁）到 ${tags.person} 已有身体、裁切与姿态上。${tags.outfit} 不是画布也不是主体——忽略其中的人脸、身材、站姿、机位与背景；禁止把结果做成 ${tags.outfit} 那种全身电商站姿图。身体、肩宽、腰围、腿长、性别特征与取景仍按 ${tags.person}；只换衣服和鞋。${OUTFIT_LOCK}`
        : `服装：${draft.outfit.change}。${OUTFIT_LOCK}只换衣服和鞋，肩宽腰围腿长仍按原身材。`,
    )
  }
  if (extra) {
    lines.push(
      draft.makeup || draft.outfit
        ? `补充：${extra}。只当作妆造或穿搭细节，不得覆盖身份与画布约束。`
        : `妆造：${extra}。只改妆面、服装或发型，不改长相和身材。`,
    )
  }

  lines.push(`保持：${keep}`)
  lines.push(HARD_BAN)
  // 收束：把最强画布/取景/身份锁再钉一遍，压过中段服装参考指令
  if (hasRefs) {
    lines.push(
      `收束：最终画面必须以 ${tags.person} 为唯一画布与身份来源；构图、裁切、站位与 ${tags.person} 一致；参考图只提供妆面或服装样式，不得主导结果或改人。`,
    )
  }
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
  const keep = ["原姿态", "原机位", "原构图", "原取景范围"]
  if (draft.makeup || draft.outfit) {
    if (!draft.makeup) keep.push("原妆面")
    if (!draft.outfit) keep.push("原服装")
    keep.push("未点名的发型")
  } else {
    keep.push("描述没点到的部分")
  }
  return `${keep.join("、")}保持原样。`
}
