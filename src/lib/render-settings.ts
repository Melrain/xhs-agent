import { create } from "zustand"
import type { RenderSettings } from "@/lib/api/characters"
import type { ImageQuality, ImageResolution } from "@/lib/types"

const STORAGE_KEY = "xhs.makeup.render"

const DEFAULTS: RenderSettings = {
  quality: "low",
  resolution: "auto",
  model: "",
}

type RenderSettingsStore = RenderSettings & {
  set: (patch: Partial<RenderSettings>) => void
}

function readStored(): RenderSettings {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<RenderSettings>
    return {
      quality: (parsed.quality as ImageQuality) ?? DEFAULTS.quality,
      resolution: (parsed.resolution as ImageResolution) ?? DEFAULTS.resolution,
      model: typeof parsed.model === "string" ? parsed.model : DEFAULTS.model,
    }
  } catch {
    return DEFAULTS
  }
}

/** 模型、画质、分辨率一次设好基本不动，所以记在本地，不跟着每张卡走。 */
export const useRenderSettings = create<RenderSettingsStore>((set, get) => ({
  ...DEFAULTS,
  set: (patch) => {
    set(patch)
    if (typeof window === "undefined") return
    const next = get()
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          quality: next.quality,
          resolution: next.resolution,
          model: next.model,
        }),
      )
    } catch {
      // ignore quota / private mode
    }
  },
}))

export function hydrateRenderSettings() {
  useRenderSettings.setState(readStored())
}
