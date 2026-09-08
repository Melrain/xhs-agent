export type WorkspaceId = "recruit" | "makeup" | "notes" | "film" | "comments"

export const WORKSPACES: {
  id: WorkspaceId
  label: string
  hint: string
}[] = [
  { id: "recruit", label: "招聘", hint: "文生图、改图、加字、转视频" },
  { id: "notes", label: "笔记", hint: "选图组稿、AI 文案、一键发帖" },
  { id: "makeup", label: "妆造", hint: "选脸换妆换装" },
  { id: "film", label: "影片", hint: "跟拍参考片，需要时再开画布" },
  { id: "comments", label: "小红书管理", hint: "本机登录、拉评论、导出 Excel" },
]
