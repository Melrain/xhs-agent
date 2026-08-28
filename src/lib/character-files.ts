export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/** 后端一次最多收 20 张，多出来的先不收，免得整批被拒。 */
export const MAX_PHOTOS_PER_IMPORT = 20

export function pickImageFiles(incoming: File[]) {
  const usable = incoming.filter(
    (file) => file.type.startsWith("image/") && file.size <= MAX_PHOTO_BYTES,
  )
  const files = usable.slice(0, MAX_PHOTOS_PER_IMPORT)
  return { files, skipped: incoming.length - files.length }
}
