export type WorkspaceId = "recruit" | "makeup" | "comments"

export const WORKSPACES: {
  id: WorkspaceId
  label: string
  hint: string
}[] = [
  { id: "recruit", label: "招聘", hint: "文生图、改图、加字、转视频" },
  { id: "makeup", label: "妆造", hint: "选脸换妆换装" },
  { id: "comments", label: "小红书管理", hint: "本机登录、拉评论、导出 Excel" },
]
