import { BriefcaseBusiness, NotebookPen, Palette, Users } from "lucide-react"
import { logoutAccount } from "@/lib/auth/api"
import type { StoredAuthUser } from "@/lib/auth/tokens"
import { WORKSPACES, type WorkspaceId } from "./types"

const ICONS = {
  recruit: BriefcaseBusiness,
  notes: NotebookPen,
  makeup: Palette,
  comments: Users,
} as const

export function Sidebar({
  workspace,
  onChange,
  user,
}: {
  workspace: WorkspaceId
  onChange: (id: WorkspaceId) => void
  user: StoredAuthUser | null
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p>本机</p>
        <h1>R7工作台</h1>
      </div>
      <nav className="sidebar-nav">
        {WORKSPACES.map((item) => {
          const Icon = ICONS[item.id]
          return (
            <button
              key={item.id}
              type="button"
              className={workspace === item.id ? "nav-item active" : "nav-item"}
              onClick={() => onChange(item.id)}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        <p className="sidebar-user">
          云端账号
          <strong>{user?.username ?? "未登录"}</strong>
        </p>
        {user ? (
          <button type="button" className="sidebar-logout" onClick={() => void logoutAccount()}>
            退出云端
          </button>
        ) : null}
      </div>
    </aside>
  )
}
