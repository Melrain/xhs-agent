import { recruitBriefPlaintext } from "@/lib/recruit-brief"
import {
  buildT2iPrompt,
  DEFAULT_T2I_SLOTS,
  T2I_DEFAULT_PROMPT,
  type T2iSlots,
  type T2iTemplateId,
} from "@/lib/recruit-t2i-templates"

export type RecruitPromptGroupId = "brief" | "scene" | "copy"

export type RecruitPromptTemplate = {
  id: string
  label: string
  prompt: string
  blurb?: string
  group: RecruitPromptGroupId
}

export const RECRUIT_PROMPT_GROUPS: readonly { id: RecruitPromptGroupId; label: string }[] = [
  { id: "brief", label: "简报" },
  { id: "scene", label: "画面" },
  { id: "copy", label: "文字" },
]

function scenePrompt(id: T2iTemplateId, overrides: Partial<T2iSlots> = {}) {
  return buildT2iPrompt(id, { ...DEFAULT_T2I_SLOTS, ...overrides })
}

function layoutPrompt(
  id: T2iTemplateId,
  text: string,
  overrides: Partial<T2iSlots> = {},
  bakeReadableText = true,
) {
  return buildT2iPrompt(id, { ...DEFAULT_T2I_SLOTS, ...overrides }, { text, bakeReadableText })
}

/**
 * 招聘出图提示词模板。默认第一条是 docs/recruit-brief.md 口径（招聘简报）。
 * 画面组复用 T2I 场景词；文字组在同一套场景上加排版说明。
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
    id: "live-onair",
    label: "直播中实况",
    group: "scene",
    blurb: "补光灯竖屏礼物飘屏，图上不写字",
    prompt: T2I_DEFAULT_PROMPT,
  },
  {
    id: "practice-room",
    label: "练舞室日光",
    group: "scene",
    blurb: "干净日光练功，图上不写字",
    prompt: scenePrompt("practice-room", { practiceStatus: "learn", energy: "calm" }),
  },
  {
    id: "makeup-desk",
    label: "妆造台",
    group: "scene",
    blurb: "包妆造服装现场，图上不写字",
    prompt: scenePrompt("makeup-desk", { makeupStage: "done", tone: "glow" }),
  },
  {
    id: "pk-battle",
    label: "PK 荧光高能",
    group: "scene",
    blurb: "PK 荧光刚赢，图上不写字",
    prompt: scenePrompt("pk-battle", { pkBeat: "win", moneyCue: "gift" }),
  },
  {
    id: "backstage-wait",
    label: "开播候场",
    group: "scene",
    blurb: "侧幕候场纪实，图上不写字",
    prompt: scenePrompt("backstage-wait", { energy: "calm" }),
  },
  {
    id: "base-life",
    label: "基地日常",
    group: "scene",
    blurb: "食堂宿舍日常，不豪华，图上不写字",
    prompt: scenePrompt("base-life", { baseScene: "canteen" }),
  },
  {
    id: "cta-bottom",
    label: "底栏 CTA",
    group: "copy",
    blurb: "下三分之一暗底叠待遇与私信",
    prompt: layoutPrompt(
      "poster-blank",
      "画面下三分之一是压暗的纯净暗底，只在这一条底栏叠一行大号可读中文「无责保底 6k-15k · 综合 2w+ · 私信详聊」，浅色字、字距疏、水平居中。上三分之二是人物群像，不要往脸上或身体再叠字",
      { blankSide: "bottom", theme: "pop", energy: "high", moneyCue: "none" },
    ),
  },
  {
    id: "title-top",
    label: "顶标题海报",
    group: "copy",
    blurb: "顶部大字品牌，人物在中下",
    prompt: layoutPrompt(
      "poster-blank",
      "画面顶部三分之一叠两行大号可读中文：第一行「R7-若栖传媒」，第二行「红谷滩团播」。人物群像放在画面中下部，头顶不要顶到标题。不要再写别的句子",
      { blankSide: "top", theme: "pop", energy: "direct", moneyCue: "none" },
    ),
  },
  {
    id: "pay-hero",
    label: "大字待遇",
    group: "copy",
    blurb: "6k-15k / 2w+ 居中，人物虚化",
    prompt: layoutPrompt(
      "live-onair",
      "视觉中心是超大号可读中文数字，第一行「6k-15k」，第二行「2w+」，像招聘海报标题一样清晰。人物退到背景浅景深虚化，焦点给数字不给人脸。角落可跟一行小字「无责保底 · 综合收入 · 私信详聊」",
      { viewpoint: "bystander", energy: "high", tone: "neon", moneyCue: "none" },
    ),
  },
  {
    id: "three-line-split",
    label: "三行拆开",
    group: "copy",
    blurb: "上公司、中待遇、下培训，分行不堆",
    prompt: layoutPrompt(
      "live-onair",
      "画面分成上中下三行字带，三行分开排，不要堆成一段。上行公司介绍：「R7-若栖传媒 · 上海总部 · 红谷滩团播 · 六个光影视觉直播间」。中行待遇：「无责保底 6k-15k · 综合收入 2w+ · 包妆造服装住宿过渡 · 私信详聊」。下行培训：「妆造穿搭设计、舞蹈培训、外貌气质提升 · 练舞补贴每天 100」。字号大、对比强、可读。人物站在字带之间的空隙，不要挡住字",
      { viewpoint: "bystander", energy: "direct", tone: "neon", moneyCue: "none" },
    ),
  },
  {
    id: "vertical-left",
    label: "左侧竖排",
    group: "copy",
    blurb: "左 1/4 竖排中文，右 3/4 团播",
    prompt: layoutPrompt(
      "live-onair",
      "画面左四分之一是竖排可读中文，从上到下两列：「R7-若栖传媒」和「红谷滩团播」，衬在窄暗条上，浅色字。右四分之三是团播现场，人物脸和身体都在右侧，不要被竖排挡住",
      { viewpoint: "bystander", energy: "high", tone: "neon", moneyCue: "none" },
    ),
  },
  {
    id: "poster-blank",
    label: "海报底留白",
    group: "copy",
    blurb: "底部留空后期叠字，图上不写字",
    prompt: layoutPrompt(
      "poster-blank",
      "图上不要写任何字。底部三分之一压暗留空，留给后期叠标题",
      { blankSide: "bottom", theme: "pop", energy: "high", moneyCue: "none" },
      false,
    ),
  },
]

export const DEFAULT_RECRUIT_PROMPT = RECRUIT_PROMPT_TEMPLATES[0]!.prompt
