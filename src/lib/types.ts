export type Mode = "t2i" | "i2i" | "text-overlay" | "i2v"

export type AspectRatio = "3:4" | "1:1" | "4:3" | "16:9"

/** "auto" 表示交给 provider 默认值，请求时不发送该字段。 */
export type ImageQuality = "auto" | "low" | "medium" | "high"
export type ImageResolution = "auto" | "1K" | "2K" | "4K"

/** "source" 表示跟随输入图，请求时不发送 aspectRatio。 */
export type VideoAspectRatio =
  | "source"
  | "1:1"
  | "16:9"
  | "9:16"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
export type VideoResolution = "480p" | "720p" | "1080p"
export type VideoDuration = 3 | 5 | 10 | 15

export type OverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type FontSizeToken = "sm" | "md" | "lg"

export interface MediaResult {
  url: string
  s3Key: string
  mimeType: string
  width?: number
  height?: number
}

export interface Asset {
  id: string
  kind: "image" | "video"
  url: string
  s3Key?: string
  origin: Mode | "upload"
  prompt?: string
  createdAt: number
}

export interface OverlayStyle {
  text: string
  position: OverlayPosition
  fontSize: FontSizeToken
  color: string
  stroke: boolean
  backdrop: boolean
}

export type CanvasStatus = "empty" | "loading" | "error" | "ready"

export interface CanvasItem {
  id: string
  kind: "image" | "video"
  url: string
  s3Key?: string
  prompt?: string
  overlay?: OverlayStyle
}
