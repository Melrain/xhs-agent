export const LOOK_DIMENSIONS = ["makeup", "wardrobe", "hair"] as const

export type LookDimension = (typeof LOOK_DIMENSIONS)[number]

export type LookChip = {
  id: string
  title: string
  blurb: string
  change: string
}

export const LOOK_DIMENSION_META: Record<
  LookDimension,
  { label: string; keep: string; refine: string; loading: string[] }
> = {
  makeup: {
    label: "妆面",
    keep: "服装和发型保持原样",
    refine: "眼影再淡一点，不要改脸型",
    loading: ["只改妆面…", "皮肤质感保留中…", "定妆细节绘制中…"],
  },
  wardrobe: {
    label: "服装",
    keep: "妆面和发型保持原样",
    refine: "袖长再短一点，不要改脸",
    loading: ["只改服装…", "面料与剪裁绘制中…", "身材比例对齐中…"],
  },
  hair: {
    label: "发型",
    keep: "妆面和服装保持原样",
    refine: "碎发再收一点，不要改五官",
    loading: ["只改发型…", "发丝走向整理中…", "发色与脸型对齐中…"],
  },
}

export const LOOK_CHIPS: Record<LookDimension, LookChip[]> = {
  makeup: [
    { id: "bare", title: "素颜清爽", blurb: "妆前干净脸", change: "妆前素颜清爽，皮肤保留真实纹理，几乎看不出底妆" },
    { id: "daily", title: "日常淡妆", blurb: "自然能出门", change: "日常淡妆，薄底妆、浅棕色眼影和自然唇色" },
    { id: "stage", title: "舞台浓妆", blurb: "镜头前更抢", change: "舞台浓妆，眼线清晰、腮红和唇色饱和，适合补光灯" },
    { id: "guofeng", title: "古风妆", blurb: "眉眼拉长", change: "古风妆，细长眉眼、朱红唇和淡淡额妆" },
    { id: "glow", title: "清透水光", blurb: "高光更润", change: "清透水光妆，皮肤润亮、高光轻薄、唇色像刚喝过水" },
    { id: "beauty", title: "过曝美颜", blurb: "柔亮通透", change: "过曝美颜妆感，高光发白，皮肤柔亮通透" },
  ],
  wardrobe: [
    { id: "sparkle", title: "亮片舞台服", blurb: "开播主视觉", change: "穿亮片高领长袖舞台上衣配高腰长裤和白色短靴" },
    { id: "team", title: "应援色外套", blurb: "团播齐套", change: "穿统一应援色长袖短外套和高腰长裤" },
    { id: "hoodie", title: "卫衣便装", blurb: "妆前休息", change: "穿连帽卫衣和宽松长裤，像妆造间里的便装" },
    { id: "hanfu", title: "古风舞台服", blurb: "水袖马面", change: "穿改良汉元素长袖舞台服，配水袖和绣花马面裙" },
    { id: "tech", title: "机能外套", blurb: "电音场", change: "穿反光机能面料舞台外套、工装长裤和机能靴" },
    { id: "home", title: "家居服", blurb: "下播之后", change: "穿柔软家居服，像刚从舞台换下来" },
  ],
  hair: [
    { id: "tidy", title: "碎发收干净", blurb: "定妆收尾", change: "头发梳顺，碎发收干净，耳后利落" },
    { id: "pony", title: "高马尾", blurb: "齐舞好动", change: "高马尾，发丝束紧，额前碎发很少" },
    { id: "straight", title: "中长直发", blurb: "干净利落", change: "中长直发披肩，发尾整齐，中分或偏分" },
    { id: "coil", title: "古风盘发", blurb: "配古风妆", change: "古风盘发，发髻在脑后，有两缕垂发" },
    { id: "wool", title: "羊毛卷", blurb: "蓬松氛围", change: "羊毛卷中长发，蓬松有空气感" },
    { id: "bun", title: "低丸子头", blurb: "练功便装", change: "低丸子头，颈后束起，脸周干净" },
  ],
}

export const DEFAULT_LOOK_DIMENSION: LookDimension = "makeup"
export const DEFAULT_LOOK_CHIP_ID: Record<LookDimension, string> = {
  makeup: "stage",
  wardrobe: "sparkle",
  hair: "pony",
}

export const NEXT_LOOK_DIMENSION: Record<LookDimension, LookDimension> = {
  makeup: "wardrobe",
  wardrobe: "hair",
  hair: "hair",
}

export function getLookChip(dimension: LookDimension, chipId: string): LookChip | undefined {
  return LOOK_CHIPS[dimension].find((chip) => chip.id === chipId)
}

export function isLookDimension(value: string): value is LookDimension {
  return (LOOK_DIMENSIONS as readonly string[]).includes(value)
}

/** 后端存的是自由字符串，读回来时兜个底，免得旧数据把 UI 打崩。 */
export function asLookDimension(value: string): LookDimension {
  return isLookDimension(value) ? value : DEFAULT_LOOK_DIMENSION
}

/** 卡片上的短标签，例如「妆面 · 舞台浓妆」。 */
export function lookCaption(dimension: string, chipTitle: string) {
  return `${LOOK_DIMENSION_META[asLookDimension(dimension)].label} · ${chipTitle}`
}

export function buildLookPrompt(
  dimension: LookDimension,
  chipId: string,
  refine?: string,
): string {
  const chip = getLookChip(dimension, chipId)
  const meta = LOOK_DIMENSION_META[dimension]
  const extra = refine?.trim()

  return [
    "主体：同一位二十岁出头的人，脸型五官身份不变。",
    `本轮：只改${meta.label}，${meta.keep}。`,
    chip ? `改动：${chip.change}。` : "",
    extra ? `微调：${extra}。` : "",
    "规格：写实摄影，皮肤保留真实纹理，小红书竖图质感。",
  ]
    .filter(Boolean)
    .join("\n")
}
