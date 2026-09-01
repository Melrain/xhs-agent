import { recruitBriefPlaintext } from "@/lib/recruit-brief"
import { T2I_DEFAULT_PROMPT } from "@/lib/recruit-t2i-templates"

export type RecruitPromptTemplate = {
  id: string
  label: string
  prompt: string
}

/**
 * 招聘出图提示词模板。默认是 docs/recruit-brief.md 口径（招聘简报）。
 * 之后加模板往这个数组追加即可，选择器会按列表渲染。
 */
export const RECRUIT_PROMPT_TEMPLATES: readonly RecruitPromptTemplate[] = [
  {
    id: "recruit-brief",
    label: "招聘简报",
    prompt: recruitBriefPlaintext(),
  },
  {
    id: "live-onair",
    label: "直播中实况",
    prompt: T2I_DEFAULT_PROMPT,
  },
]

export const DEFAULT_RECRUIT_PROMPT = RECRUIT_PROMPT_TEMPLATES[0]!.prompt
