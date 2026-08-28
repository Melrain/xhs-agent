import {
  FONT_SIZE_RATIO,
  OVERLAY_FONT_FAMILY,
  OVERLAY_LINE_HEIGHT,
  OVERLAY_MAX_WIDTH_RATIO,
  OVERLAY_PAD_RATIO,
  overlayPlacement,
} from "@/lib/overlay-layout"
import type { OverlayStyle } from "@/lib/types"

export async function bakeOverlayImage(url: string, style: OverlayStyle): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("无法读取输入图")
  return bakeOverlayBlob(await response.blob(), style)
}

export async function bakeOverlayBlob(blob: Blob, style: OverlayStyle): Promise<Blob> {
  const text = style.text.replace(/\r\n/g, "\n")
  if (!text.trim()) throw new Error("文字不能为空")

  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("无法合成文字")
    ctx.drawImage(bitmap, 0, 0)
    drawOverlay(ctx, bitmap.width, bitmap.height, { ...style, text })
    const png = await canvasToPng(canvas)
    if (!png) throw new Error("合成失败")
    return png
  } finally {
    bitmap.close()
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: OverlayStyle,
) {
  const pad = width * OVERLAY_PAD_RATIO
  const innerW = Math.max(1, width - pad * 2)
  const innerH = Math.max(1, height - pad * 2)
  const fontSize = Math.max(12, width * FONT_SIZE_RATIO[style.fontSize])
  const maxTextW = innerW * OVERLAY_MAX_WIDTH_RATIO
  ctx.font = `700 ${fontSize}px ${OVERLAY_FONT_FAMILY}`
  ctx.textBaseline = "top"
  ctx.textAlign = "center"

  const lines = wrapLines(ctx, style.text, maxTextW)
  const lineHeight = fontSize * OVERLAY_LINE_HEIGHT
  const textBlockH = Math.max(lineHeight, lines.length * lineHeight)
  const textBlockW = Math.min(
    maxTextW,
    Math.max(0, ...lines.map((line) => ctx.measureText(line || " ").width)),
  )
  const padX = fontSize * (10 / 28)
  const padY = fontSize * (6 / 28)
  const boxW = style.backdrop ? textBlockW + padX * 2 : textBlockW
  const boxH = style.backdrop ? textBlockH + padY * 2 : textBlockH
  const { h, v } = overlayPlacement(style.position)
  const x = pad + (h === "left" ? 0 : h === "right" ? innerW - boxW : (innerW - boxW) / 2)
  const y = pad + (v === "top" ? 0 : v === "bottom" ? innerH - boxH : (innerH - boxH) / 2)

  if (style.backdrop) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)"
    roundRect(ctx, x, y, boxW, boxH, fontSize * (8 / 28))
    ctx.fill()
  }

  const textX = x + boxW / 2
  let textY = y + (style.backdrop ? padY : 0)
  ctx.fillStyle = style.color
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)"
  ctx.lineWidth = Math.max(1, fontSize * 0.06)
  ctx.lineJoin = "round"

  for (const line of lines) {
    if (style.stroke) ctx.strokeText(line, textX, textY)
    ctx.fillText(line, textX, textY)
    textY += lineHeight
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("")
      continue
    }
    let current = ""
    for (const char of paragraph) {
      const next = current + char
      if (!current || ctx.measureText(next).width <= maxWidth) {
        current = next
      } else {
        lines.push(current)
        current = char
      }
    }
    if (current) lines.push(current)
  }
  return lines.length > 0 ? lines : [""]
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
}
