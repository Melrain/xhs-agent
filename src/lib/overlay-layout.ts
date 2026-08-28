import type { FontSizeToken, OverlayPosition } from "@/lib/types"

export const OVERLAY_FONT_FAMILY =
  '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif'

export const OVERLAY_PAD_RATIO = 0.08
export const OVERLAY_MAX_WIDTH_RATIO = 0.8
export const OVERLAY_LINE_HEIGHT = 1.25

export const FONT_SIZE_RATIO: Record<FontSizeToken, number> = {
  sm: 0.045,
  md: 0.07,
  lg: 0.1,
}

export function overlayPlacement(position: OverlayPosition): {
  h: "left" | "center" | "right"
  v: "top" | "center" | "bottom"
} {
  if (position === "center") return { h: "center", v: "center" }
  const [v, h] = position.split("-") as ["top" | "center" | "bottom", "left" | "center" | "right"]
  return { v, h }
}
