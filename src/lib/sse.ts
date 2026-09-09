export type SseFrame = {
  event: string
  data: string
}

/**
 * Incremental SSE parser. Keep `rest` across chunks.
 * Named events (`event: look.updated`) and default `message` are both returned.
 */
export function consumeSseBuffer(buffer: string): { frames: SseFrame[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const parts = normalized.split("\n\n")
  const rest = parts.pop() ?? ""
  const frames: SseFrame[] = []

  for (const block of parts) {
    if (!block.trim() || block.startsWith(":")) continue
    let event = "message"
    const dataLines: string[] = []
    for (const rawLine of block.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
      if (!line || line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        event = line.slice(6).trim()
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (dataLines.length === 0) continue
    frames.push({ event, data: dataLines.join("\n") })
  }

  return { frames, rest }
}
