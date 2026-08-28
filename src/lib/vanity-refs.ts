export const VANITY_KINDS = ["makeup", "wardrobe"] as const

export type VanityKind = (typeof VANITY_KINDS)[number]

export type VanityCategory = "日常" | "舞台" | "古风" | "创意" | "机能"

export type VanityRefSource = "system" | "user"

export type VanityRef = {
  id: string
  kind: VanityKind
  title: string
  blurb: string
  change: string
  category: VanityCategory
  src: string
  source: VanityRefSource
}

export const SYSTEM_REF_LIBRARY = {
  id: "system",
  label: "系统默认",
  description: "官方妆造与服装参考，所有账号都能用",
} as const

export const USER_REF_LIBRARY = {
  id: "mine",
  label: "我的参考",
  description: "自己导入的妆造或服装，只有这个账号能用",
} as const

export const VANITY_USER_REF_TITLE_MAX = 16

export function describeUserRefImport(imported: number, skipped: number) {
  if (imported === 0) {
    return skipped > 0
      ? "没有可用的参考图：只支持 ≤10MB 的图片"
      : "请选一张图片"
  }
  if (skipped > 0) {
    return `已导入 ${imported} 张，跳过 ${skipped} 张（非图片或超过 10MB）`
  }
  return imported > 1 ? `已导入 ${imported} 张` : undefined
}

export function vanityUserRefChange(kind: VanityKind) {
  return kind === "makeup"
    ? "按参考图的妆容风格迁移"
    : "按参考图的服装款式、颜色、面料和剪裁整套替换"
}

export function vanityRefChipPart(kind: VanityKind, ref: VanityRef) {
  return ref.source === "user" ? `${kind}:custom:${ref.id}` : `${kind}:${ref.id}`
}

function systemRef(
  kind: VanityKind,
  id: string,
  title: string,
  blurb: string,
  change: string,
  category: VanityCategory,
): VanityRef {
  return {
    id,
    kind,
    title,
    blurb,
    change,
    category,
    source: "system",
    src: `/refs/system/${kind}/${id}.webp`,
  }
}

export const VANITY_MAKEUP_REFS: VanityRef[] = [
  systemRef("makeup", "bare", "素颜清爽", "妆前干净脸", "妆前素颜清爽，皮肤保留真实纹理，几乎看不出底妆", "日常"),
  systemRef("makeup", "daily", "日常淡妆", "自然能出门", "日常淡妆，薄底妆、浅棕色眼影和自然唇色", "日常"),
  systemRef("makeup", "peach", "蜜桃妆", "脸更甜", "蜜桃妆，珊瑚颊彩从眼下扫到脸颊，暖桃色眼影和桃粉唇", "日常"),
  systemRef("makeup", "stage", "舞台浓妆", "镜头前更抢", "舞台浓妆，眼线清晰、腮红和唇色饱和，适合补光灯", "舞台"),
  systemRef("makeup", "smoky", "烟熏妆", "夜场更立体", "烟熏妆，青铜棕烟熏眼、香槟内眼角和雾面玫瑰唇", "舞台"),
  systemRef("makeup", "guofeng", "古风妆", "眉眼拉长", "古风妆，细长眉眼、朱红唇和淡淡额妆", "古风"),
  systemRef("makeup", "glow", "清透水光", "高光更润", "清透水光妆，皮肤润亮、高光轻薄、唇色像刚喝过水", "创意"),
  systemRef("makeup", "beauty", "过曝美颜", "柔亮通透", "过曝美颜妆感，高光发白，皮肤柔亮通透", "创意"),
  systemRef("makeup", "fox", "狐狸妆", "眼尾上挑", "狐狸妆，眼线拉长上挑，外眼角利落，雾面玫瑰唇", "创意"),
]

export const VANITY_WARDROBE_REFS: VanityRef[] = [
  systemRef(
    "wardrobe",
    "hoodie",
    "卫衣便装",
    "妆前休息",
    "穿浅燕麦米色连帽卫衣套装：宽松落肩连帽上衣带袋鼠袋，配同色同面料阔腿卫裤和白米色厚底运动鞋",
    "日常",
  ),
  systemRef(
    "wardrobe",
    "home",
    "家居服",
    "下播之后",
    "穿雾霾藕粉色细针织家居套装：宽松落肩圆领长袖上衣，配同色同面料抽绳阔腿家居裤，面料带轻微绒感；上下必须同色同料，不要开衫、白T或灰色针织外套",
    "日常",
  ),
  systemRef(
    "wardrobe",
    "shirt",
    "白衬衫",
    "干净通勤",
    "穿纯白宽松长袖尖领衬衫，左胸贴袋、下摆塞进裤子，配高腰浅米色双褶直筒西裤",
    "日常",
  ),
  systemRef(
    "wardrobe",
    "sparkle",
    "亮片舞台服",
    "开播主视觉",
    "穿香槟金细密亮片半高领修身长袖上衣，下摆塞进高腰黑色直筒西裤，脚上米白色尖头短靴；上衣必须满铺亮片",
    "舞台",
  ),
  systemRef(
    "wardrobe",
    "team",
    "应援色外套",
    "团播齐套",
    "穿雾霾豆沙粉修身短款立领拉链外套，胸前有弧形分割线，配高腰黑色西裤；必须是这件粉色短外套",
    "舞台",
  ),
  systemRef(
    "wardrobe",
    "blackdress",
    "小黑裙",
    "活动主视觉",
    "穿深黑缎面长袖小黑裙：一字领、肩部微泡袖，腰侧有斜向褶皱垂坠；必须是连身裙，不要拆成上衣配裤子",
    "舞台",
  ),
  systemRef(
    "wardrobe",
    "hanfu",
    "古风舞台服",
    "水袖马面",
    "穿焦糖橘薄纱宽袖外袍，领缘金线绣花，内搭金色织锦齐胸襦裙和高腰橘带，水袖及地；必须是这套层叠汉服",
    "古风",
  ),
  systemRef(
    "wardrobe",
    "mamian",
    "马面裙",
    "新中式日常",
    "穿米白立领盘扣中袖上衣，下配玫瑰木色高腰马面裙，裙侧箱型褶、裙摆有浅色暗花；下装必须是马面裙",
    "古风",
  ),
  systemRef(
    "wardrobe",
    "tech",
    "机能外套",
    "电音场",
    "穿枪银灰反光连帽机能风衣，大贴袋和斜向反光线，内搭黑色贴身衣，下装黑色多袋工装裤，裤侧有织带和反光条，脚上黑色厚底机能运动鞋；外套必须是金属银反光面料",
    "机能",
  ),
]

export const VANITY_REFS: Record<VanityKind, VanityRef[]> = {
  makeup: VANITY_MAKEUP_REFS,
  wardrobe: VANITY_WARDROBE_REFS,
}

export const VANITY_KIND_META: Record<
  VanityKind,
  { label: string; empty: string; categories: VanityCategory[] }
> = {
  makeup: {
    label: "妆造",
    empty: "选妆造参考",
    categories: ["日常", "舞台", "古风", "创意"],
  },
  wardrobe: {
    label: "服装",
    empty: "选服装参考",
    categories: ["日常", "舞台", "古风", "机能"],
  },
}

export function listSystemRefs(kind: VanityKind) {
  return VANITY_REFS[kind].filter((item) => item.source === "system")
}

export function getVanityRef(kind: VanityKind, id: string) {
  return VANITY_REFS[kind].find((item) => item.id === id)
}

export function findVanityRef(id: string, kind?: VanityKind) {
  if (kind) return getVanityRef(kind, id)
  return (
    VANITY_MAKEUP_REFS.find((item) => item.id === id) ??
    VANITY_WARDROBE_REFS.find((item) => item.id === id)
  )
}
