/** 与 xhs_auto_project/docs/recruit-brief.md 对齐。改待遇或卖点两边一起改。 */

export const RECRUIT_FACTS = [
  { label: "品牌", value: "R7-若栖传媒" },
  { label: "总部", value: "上海" },
  { label: "南昌基地", value: "红谷滩" },
  { label: "业务", value: "团播" },
  { label: "场地", value: "六个光影视觉直播间" },
  { label: "团队", value: "妆造、服装、摄影、运营" },
  { label: "无责保底", value: "6k–15k" },
  { label: "综合收入", value: "2w+" },
  { label: "入职配套", value: "包妆造、包服装，住宿过渡" },
  { label: "培训", value: "妆造穿搭设计、舞蹈培训、外貌气质提升" },
  { label: "工种配套", value: "化妆摄影、服搭师、灯光师、舞蹈老师" },
  { label: "练舞补贴", value: "每天 100 元" },
] as const

export const RECRUIT_SLOGANS = [
  "平均收入南昌第一",
  "红谷滩最强团播公司",
  "顶级光影视觉直播间",
] as const

export const RECRUIT_SCRIPTS = [
  {
    title: "开场 / 公司",
    text: "宝子泥嚎，平均收入南昌第一，《R7-若栖传媒》总部位于上海，现红谷滩最强团播公司，六个顶级光影视觉直播间，成熟的妆造服装摄影运营团队，很期待你的加入。～",
  },
  {
    title: "待遇 / 私信钩子",
    text: "无责保底 6k-15k，综合收入 2w+，包妆造服装，住宿过渡。方便加个微信详细聊下嘛？",
  },
  {
    title: "培训 / 配套",
    text: "包妆造穿搭设计，舞蹈培训，外貌气质提升。公司配套完善（化妆摄影，服搭师，灯光师，舞蹈老师）\n\n练舞补贴每天 100",
  },
] as const

export const RECRUIT_NOTES = [
  "岗位默认按出镜 / 主播写。运营、中后台不要套用保底和练舞补贴。",
  "语气口语、小红书感可以留，但别每条都同一套开场。",
  "数字只写已确认事实里有的；工时、提成比例、宿舍条件不要编。",
  "帖子正文不要留微信号或二维码，加微信写成「私信详聊」。",
  "宣传口径可用，不要写成官方统计或已核实排名。",
] as const

export function recruitBriefPlaintext() {
  const facts = RECRUIT_FACTS.map((item) => `${item.label}：${item.value}`).join("\n")
  const slogans = RECRUIT_SLOGANS.map((item) => `- ${item}`).join("\n")
  const scripts = RECRUIT_SCRIPTS.map((item) => `${item.title}\n${item.text}`).join("\n\n")
  const notes = RECRUIT_NOTES.map((item) => `- ${item}`).join("\n")
  return [
    "R7-若栖传媒 · 招聘简报",
    "",
    "已确认事实",
    facts,
    "",
    "宣传口径（可用，勿当核验过的数据）",
    slogans,
    "",
    "可直接用的话术",
    scripts,
    "",
    "写帖注意",
    notes,
  ].join("\n")
}
