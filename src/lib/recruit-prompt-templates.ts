import { T2I_DEFAULT_PROMPT } from "@/lib/recruit-t2i-templates"

export type RecruitPromptTemplate = {
  id: string
  label: string
  prompt: string
}

/**
 * 招聘出图提示词模板。目前只上默认模板01（现有 T2I 默认稿 live-onair）。
 * 之后加 02/03 往这个数组追加即可，选择器会按列表渲染。
 */
export const RECRUIT_PROMPT_TEMPLATES: readonly RecruitPromptTemplate[] = [
  {
    id: "default-01",
    label: "默认模板01",
    prompt: T2I_DEFAULT_PROMPT,
  },
]
