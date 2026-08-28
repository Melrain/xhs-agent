import type { ComponentType } from "react"
import { Clapperboard, ImageIcon, Images, Type } from "lucide-react"
import type { Mode } from "@/lib/types"

export type T2iComposeMode = "template" | "free"

export const MODE_ICONS: Record<Mode, ComponentType<{ className?: string }>> = {
  t2i: ImageIcon,
  i2i: Images,
  "text-overlay": Type,
  i2v: Clapperboard,
}

export const MODE_HUES: Record<Mode, string> = {
  t2i: "oklch(0.64 0.24 20)",
  i2i: "oklch(0.72 0.19 55)",
  "text-overlay": "oklch(0.8 0.15 90)",
  i2v: "oklch(0.62 0.2 300)",
}

export const MODE_META: Record<
  Mode,
  { label: string; hint: string; action: string }
> = {
  t2i: {
    label: "文生图",
    hint: "手动输入提示词，默认出小红书竖图",
    action: "生成图片",
  },
  i2i: {
    label: "图生图",
    hint: "基于现有图片改构图、风格或细节",
    action: "开始改图",
  },
  "text-overlay": {
    label: "加文字",
    hint: "文字实时叠在图上，合成后写入成图，可下载或转视频",
    action: "合成文字",
  },
  i2v: {
    label: "图生视频",
    hint: "让静态图动起来，适合封面转成片",
    action: "生成视频",
  },
}

export const T2I_COMPOSE_META: Record<
  T2iComposeMode,
  { label: string; hint: string }
> = {
  free: {
    label: "手动",
    hint: "手动输入提示词，默认出小红书竖图",
  },
  template: {
    label: "模板",
    hint: "选场景填空，默认出小红书竖图",
  },
}

export function parseRecruitHash(
  hash: string,
): { mode: Mode; composeMode?: T2iComposeMode } | null {
  if (hash === "template" || hash === "free") {
    return { mode: "t2i", composeMode: hash }
  }
  if (hash === "t2i" || hash === "i2i" || hash === "text-overlay" || hash === "i2v") {
    return { mode: hash }
  }
  return null
}

export const LOADING_PHRASES: Record<Mode, string[]> = {
  t2i: ["正在理解你的描述…", "构图与光线绘制中…", "细节渲染中…"],
  i2i: ["分析原图结构…", "按你的要求重绘中…", "融合细节中…"],
  "text-overlay": ["排版文字图层…", "合成中…", "输出成图…"],
  i2v: ["关键帧生成中…", "补间渲染中…", "视频编码中…"],
}

export function originLabel(origin: Mode | "upload") {
  if (origin === "upload") return "上传"
  return MODE_META[origin].label
}
