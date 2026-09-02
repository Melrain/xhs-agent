import { recruitBriefPlaintext, recruitPosterCopy } from "@/lib/recruit-brief"
import {
  buildT2iPrompt,
  DEFAULT_T2I_SLOTS,
  T2I_DEFAULT_PROMPT,
  type T2iSlots,
  type T2iTemplateId,
} from "@/lib/recruit-t2i-templates"

export type RecruitPromptGroupId = "brief" | "style" | "scene" | "copy"

export type RecruitPromptTemplate = {
  id: string
  label: string
  prompt: string
  blurb?: string
  group: RecruitPromptGroupId
  previewS3Keys?: readonly string[]
}

function templatePreviews(id: string) {
  return [`templates/recruit/${id}/01.png`, `templates/recruit/${id}/02.png`] as const
}

export const RECRUIT_PROMPT_GROUPS: readonly { id: RecruitPromptGroupId; label: string }[] = [
  { id: "brief", label: "简报" },
  { id: "style", label: "风格海报" },
  { id: "scene", label: "画面" },
  { id: "copy", label: "文字" },
]

const POSTER = recruitPosterCopy()

const POSTER_EXCLUDE =
  "不要微信号、二维码、水印和乱入 logo；不要编造工时、提成比例、宿舍细节；不要在人脸或身体上叠字；只写上面给出的中文，不要额外口号"

function scenePrompt(id: T2iTemplateId, overrides: Partial<T2iSlots> = {}) {
  return buildT2iPrompt(id, { ...DEFAULT_T2I_SLOTS, ...overrides })
}

function stylePosterPrompt(parts: {
  look: string
  skeleton: string
  palette: string
  photo: string
  text: string
}) {
  return [
    "画面：小红书竖图 3:4，招聘海报平面设计，中文必须印刷级清晰可读，像真实印刷品不是涂抹纹理。",
    `风格：${parts.look}`,
    `骨架：${parts.skeleton}`,
    `配色：${parts.palette}`,
    `照片：${parts.photo}`,
    `文字：${parts.text}`,
    `排除：${POSTER_EXCLUDE}。`,
  ].join("\n")
}

/**
 * 招聘出图模板：每套只给效果图 + 提示词，不把画面和版式拼进同一条提示词。
 * 风格海报是完整海报词；画面 / 文字的填入词都是场景，版式只看效果图。
 */
export const RECRUIT_PROMPT_TEMPLATES: readonly RecruitPromptTemplate[] = [
  {
    id: "recruit-brief",
    label: "招聘简报",
    group: "brief",
    blurb: "已确认事实与三条话术，不是出图构图",
    prompt: recruitBriefPlaintext(),
  },
  {
    id: "style-gold-hall",
    label: "黑金殿堂",
    group: "style",
    blurb: "排面 · 五条描金卡竖叠",
    previewS3Keys: templatePreviews("style-gold-hall"),
    prompt: stylePosterPrompt({
      look: "黑金殿堂。奢华招聘海报，高级但不像夜店传单，也不要赛博朋克。",
      skeleton:
        "顶部大标题，中间五条描金圆角信息卡竖叠，底部一条口号栏。主体是卡片排版，人物只在右下角当氛围。不要杂志栏，不要超大数字占满屏，不要编号清单。",
      palette: "深黑底、金属金字、细金描边，右下角一点紫色舞台光。不要荧光粉青。",
      photo: "右下角虚化的光影直播间或练舞剪影，人物不挡字。",
      text: `顶部第一行大号「${POSTER.brand}」，右侧或下方小号「${POSTER.tag}」。五条卡片从上面下依次只写：「${POSTER.loc}」「${POSTER.rooms}，${POSTER.team}」「${POSTER.job} · ${POSTER.pay} · ${POSTER.income} · ${POSTER.perks}」「${POSTER.train}」「${POSTER.subsidy}」。底栏：「${POSTER.sloganA} · ${POSTER.sloganB}」。`,
    }),
  },
  {
    id: "style-magazine",
    label: "杂志封面",
    group: "style",
    blurb: "审美 · 上图下栏",
    previewS3Keys: templatePreviews("style-magazine"),
    prompt: stylePosterPrompt({
      look: "时尚杂志封面。克制、纸感、像刊头不是公会传单。",
      skeleton:
        "上三分之二整页照片，下三分之一浅色杂志栏。栏内左侧刊名，右侧最多三条要点。不要描金圆角卡阵列，不要暗金底铺满，不要超大数字英雄版。",
      palette: "浅米白与炭黑，栏顶一条细金线分隔。整体偏亮，不要紫光舞台。",
      photo: "干净棚拍或日光练舞室，浅景深，人物在上半区，脸可以虚，不要挡到杂志栏。",
      text: `杂志栏左竖排或两行刊名：「${POSTER.brand}」「${POSTER.tag}」。右侧三条短句：「${POSTER.loc}」「${POSTER.pay} · ${POSTER.income}」「${POSTER.train}」。栏底一行小字：「${POSTER.sloganA}」。`,
    }),
  },
  {
    id: "style-big-number",
    label: "数字英雄",
    group: "style",
    blurb: `钱 · ${POSTER.payAmount} / ${POSTER.incomeAmount} 占屏`,
    previewS3Keys: templatePreviews("style-big-number"),
    prompt: stylePosterPrompt({
      look: "瑞士海报式大字招聘。信息流三秒停滑，干净、直给。",
      skeleton:
        `画面中心两行超大数字占一半以上面积：第一行「${POSTER.payAmount}」，第二行「${POSTER.incomeAmount}」。上下只留短脚注。不要五条卡片，不要杂志栏，不要礼物特效和霓虹飘屏。`,
      palette: "白底黑字，或深底浅字，只允许一个强调色。不要金属金边框铺满。",
      photo: "人物退到浅景深背景，焦点给数字不给人脸。也可以纯色底不放人。",
      text: `超大号第一行「${POSTER.payAmount}」，第二行「${POSTER.incomeAmount}」。数字上方小字「${POSTER.brand} · ${POSTER.job}」。数字下方三行脚注：「${POSTER.pay} · ${POSTER.income}」「${POSTER.perks} · ${POSTER.subsidy}」「私信详聊」。不要再写别的句子。`,
    }),
  },
  {
    id: "style-checklist",
    label: "清单简报",
    group: "style",
    blurb: "信任 · 编号 01-05",
    previewS3Keys: templatePreviews("style-checklist"),
    prompt: stylePosterPrompt({
      look: "入职须知式招聘简报。正规、清晰、能截图给家人看。",
      skeleton:
        "纸白背景，顶部一条窄实拍，下面编号 01 到 05 左对齐清单，行距松、字号大。像文档不是炫光海报。不要描金圆角卡，不要超大数字占屏，不要暗底紫光。",
      palette: "纸白、墨黑，编号用一条鼠尾草绿或品牌红。不要金属金铺满。",
      photo: "顶部一条直播间或练舞室实拍横条即可，其余是排版。",
      text: `顶部「${POSTER.brand} 招聘简报」。清单五行：「01 ${POSTER.loc}」「02 ${POSTER.rooms}，${POSTER.team}」「03 ${POSTER.job} · ${POSTER.pay} · ${POSTER.income} · ${POSTER.perks}」「04 ${POSTER.train}」「05 ${POSTER.subsidy}」。底部一行：「${POSTER.sloganA} · ${POSTER.sloganB} · 私信详聊」。`,
    }),
  },
  {
    id: "style-daylight",
    label: "日光生活",
    group: "style",
    blurb: "信任 · 四宫格日常",
    previewS3Keys: templatePreviews("style-daylight"),
    prompt: stylePosterPrompt({
      look: "暖日光生活拼贴。像同事随手拍，不像豪华宣传片。",
      skeleton:
        "四宫格实拍：食堂、宿舍公共区、妆造台、练舞休息。每格一角手写短标注。不要暗金卡片，不要紫光舞台，不要超大数字。",
      palette: "暖米、木色、日光白，手写标注用墨绿或炭黑。不要金属金。",
      photo: "基地日常，干净年轻不豪华。人物自然，可以侧脸或背影，避免假合照摆拍。",
      text: `四格标注分别写：「${POSTER.loc}」「${POSTER.rooms}」「${POSTER.pay} · ${POSTER.income}」「${POSTER.subsidy}」。画面底部一条浅色字带：「${POSTER.brand} · ${POSTER.perks} · 私信详聊」。`,
    }),
  },
  {
    id: "style-cinematic",
    label: "电影候场",
    group: "style",
    blurb: "成长 · 全幅剧照 + 一条轨",
    previewS3Keys: templatePreviews("style-cinematic"),
    prompt: stylePosterPrompt({
      look: "电影感候场剧照。想当艺人，不是炫富海报。",
      skeleton:
        "全幅侧幕照片铺满，只在左侧或底部留一条很窄的信息轨写三行字。不要圆角卡片阵列，不要金属金边框铺满，不要杂志下栏。",
      palette: "低饱和青橙、胶片颗粒、暗部真实。不要荧光粉紫，不要描金发光。",
      photo: "开播前侧幕：对耳麦、听歌、补光从远处漏进来。人物在画面中，字只在信息轨里。",
      text: `信息轨三行：「${POSTER.brand}」「${POSTER.job} · ${POSTER.pay} · ${POSTER.income}」「${POSTER.train} · ${POSTER.subsidy}」。不要再写别的。`,
    }),
  },
  {
    id: "style-polaroid",
    label: "撕页合照",
    group: "style",
    blurb: "组织感 · 拍立得 + 马克笔",
    previewS3Keys: templatePreviews("style-polaroid"),
    prompt: stylePosterPrompt({
      look: "拍立得墙。已经有人在的组织感，轻松、可亲近。",
      skeleton:
        "三到四张白边拍立得交错叠放在浅色桌面或墙上，马克笔在白边或空隙批注数字。不要暗金五卡海报，不要超大数字英雄版。",
      palette: "白边、暖纸、马克笔粉或绿。背景浅，不要黑金底。",
      photo: "团播练舞或妆造抓拍，故意不精修。人脸可以侧过或略虚，避免假合照崩脸。",
      text: `马克笔批注只写：「${POSTER.brand}」「${POSTER.pay}」「${POSTER.income}」「${POSTER.subsidy}」。角落一行小字：「${POSTER.sloganA} · 私信详聊」。`,
    }),
  },
  {
    id: "live-onair",
    label: "直播中实况",
    group: "scene",
    blurb: "补光灯竖屏礼物飘屏，图上不写字",
    previewS3Keys: templatePreviews("live-onair"),
    prompt: T2I_DEFAULT_PROMPT,
  },
  {
    id: "practice-room",
    label: "练舞室日光",
    group: "scene",
    blurb: "干净日光练功，图上不写字",
    previewS3Keys: templatePreviews("practice-room"),
    prompt: scenePrompt("practice-room", { practiceStatus: "learn", energy: "calm" }),
  },
  {
    id: "makeup-desk",
    label: "妆造台",
    group: "scene",
    blurb: "包妆造服装现场，图上不写字",
    previewS3Keys: templatePreviews("makeup-desk"),
    prompt: scenePrompt("makeup-desk", { makeupStage: "done", tone: "glow" }),
  },
  {
    id: "pk-battle",
    label: "PK 荧光高能",
    group: "scene",
    blurb: "PK 荧光刚赢，图上不写字",
    previewS3Keys: templatePreviews("pk-battle"),
    prompt: scenePrompt("pk-battle", { pkBeat: "win", moneyCue: "gift" }),
  },
  {
    id: "backstage-wait",
    label: "开播候场",
    group: "scene",
    blurb: "侧幕候场纪实，图上不写字",
    previewS3Keys: templatePreviews("backstage-wait"),
    prompt: scenePrompt("backstage-wait", { energy: "calm" }),
  },
  {
    id: "base-life",
    label: "基地日常",
    group: "scene",
    blurb: "食堂宿舍日常，不豪华，图上不写字",
    previewS3Keys: templatePreviews("base-life"),
    prompt: scenePrompt("base-life", { baseScene: "canteen" }),
  },
  {
    id: "cta-bottom",
    label: "底栏 CTA",
    group: "copy",
    blurb: "下三分之一暗底叠待遇与私信",
    previewS3Keys: templatePreviews("cta-bottom"),
    prompt: scenePrompt("poster-blank", {
      blankSide: "bottom",
      theme: "pop",
      energy: "high",
      moneyCue: "none",
    }),
  },
  {
    id: "title-top",
    label: "顶标题海报",
    group: "copy",
    blurb: "顶部大字品牌，人物在中下",
    previewS3Keys: templatePreviews("title-top"),
    prompt: scenePrompt("poster-blank", {
      blankSide: "top",
      theme: "pop",
      energy: "direct",
      moneyCue: "none",
    }),
  },
  {
    id: "pay-hero",
    label: "大字待遇",
    group: "copy",
    blurb: `${POSTER.payAmount} / ${POSTER.incomeAmount} 居中，人物虚化`,
    previewS3Keys: templatePreviews("pay-hero"),
    prompt: scenePrompt("live-onair", {
      viewpoint: "bystander",
      energy: "high",
      tone: "neon",
      moneyCue: "none",
    }),
  },
  {
    id: "three-line-split",
    label: "三行拆开",
    group: "copy",
    blurb: "上公司、中待遇、下培训，分行不堆",
    previewS3Keys: templatePreviews("three-line-split"),
    prompt: scenePrompt("live-onair", {
      viewpoint: "bystander",
      energy: "direct",
      tone: "neon",
      moneyCue: "none",
    }),
  },
  {
    id: "vertical-left",
    label: "左侧竖排",
    group: "copy",
    blurb: "左 1/4 竖排中文，右 3/4 团播",
    previewS3Keys: templatePreviews("vertical-left"),
    prompt: scenePrompt("live-onair", {
      viewpoint: "bystander",
      energy: "high",
      tone: "neon",
      moneyCue: "none",
    }),
  },
  {
    id: "poster-blank",
    label: "海报底留白",
    group: "copy",
    blurb: "底部留空后期叠字，图上不写字",
    previewS3Keys: templatePreviews("poster-blank"),
    prompt: scenePrompt("poster-blank", {
      blankSide: "bottom",
      theme: "pop",
      energy: "high",
      moneyCue: "none",
    }),
  },
]

export const DEFAULT_RECRUIT_PROMPT = RECRUIT_PROMPT_TEMPLATES[0]!.prompt

export function listPreviewJobs() {
  return RECRUIT_PROMPT_TEMPLATES.filter((item) => item.previewS3Keys?.length).map((item) => ({
    id: item.id,
    label: item.label,
    group: item.group,
    prompt: item.prompt,
  }))
}
