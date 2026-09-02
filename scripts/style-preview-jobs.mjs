/** 预览对象键。出图提示词以 src/lib/recruit-prompt-templates.ts 为准。 */

export const PREVIEW_PREFIX = "templates/recruit"
export const VARIANTS = 2

export function previewS3Key(id, index) {
  return `${PREVIEW_PREFIX}/${id}/${String(index).padStart(2, "0")}.png`
}

export function previewS3Keys(id, count = VARIANTS) {
  return Array.from({ length: count }, (_, i) => previewS3Key(id, i + 1))
}
