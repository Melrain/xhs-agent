import { useMemo, useState } from "react"
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react"
import { studioErrorMessage } from "@/lib/api/client"
import type { FilmProject, FilmProjectSummary } from "@/lib/api/film"
import { useFilmProjectMutations, useFilmProjects } from "@/hooks/use-film-project"

export function FilmProjectSwitcher({
  current,
  enabled,
}: {
  current?: FilmProject
  enabled: boolean
}) {
  const list = useFilmProjects(enabled && Boolean(current?.id))
  const mutations = useFilmProjectMutations()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const busy = mutations.create.isPending || mutations.open.isPending || mutations.remove.isPending

  const projects = useMemo(() => {
    const items: FilmProjectSummary[] = Array.isArray(list.data) ? list.data : []
    if (!current || items.some((item) => item.id === current.id)) return items
    return [current, ...items]
  }, [current, list.data])

  const error = mutations.create.error
    ? studioErrorMessage(mutations.create.error)
    : mutations.open.error
      ? studioErrorMessage(mutations.open.error)
      : mutations.rename.error
        ? studioErrorMessage(mutations.rename.error)
        : mutations.remove.error
          ? studioErrorMessage(mutations.remove.error)
          : ""

  async function commitRename() {
    if (!current) return
    const title = draft.trim()
    setRenaming(false)
    if (title && title !== current.title) {
      await mutations.rename.mutateAsync({ id: current.id, title })
    }
  }

  if (!current) {
    return <p className="film-project-loading">载入项目…</p>
  }

  return (
    <div className="film-project-switcher">
      {renaming ? (
        <input
          autoFocus
          value={draft}
          maxLength={40}
          aria-label="影片项目名称"
          className="film-project-name-input"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void commitRename()
            }
            if (event.key === "Escape") setRenaming(false)
          }}
        />
      ) : (
        <button
          type="button"
          title="重命名项目"
          className="film-project-name"
          disabled={busy}
          onClick={() => {
            setDraft(current.title)
            setRenaming(true)
          }}
        >
          {current.title}
        </button>
      )}

      <div className="film-project-menu-wrap">
        <button
          type="button"
          className="film-icon-btn"
          disabled={busy}
          aria-label="切换影片项目"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown size={14} />
        </button>
        {menuOpen ? (
          <>
            <button
              type="button"
              className="film-menu-backdrop"
              aria-label="关闭菜单"
              onClick={() => setMenuOpen(false)}
            />
            <div className="film-menu film-project-menu" role="menu">
              {projects.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false)
                    if (item.id !== current.id) void mutations.open.mutateAsync(item.id)
                  }}
                >
                  <Check size={14} className={item.id === current.id ? "" : "is-hidden"} />
                  <span>{item.title}</span>
                </button>
              ))}
              <hr />
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false)
                  void mutations.create.mutateAsync(undefined)
                }}
              >
                <Plus size={14} />
                新建影片
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmDelete(true)
                }}
              >
                <Trash2 size={14} />
                删除这部片子
              </button>
            </div>
          </>
        ) : null}
      </div>

      {confirmDelete ? (
        <div className="film-dialog-backdrop" role="presentation">
          <div className="film-dialog" role="dialog" aria-modal="true" aria-labelledby="film-delete-title">
            <p id="film-delete-title" className="film-dialog-title">
              删除「{current.title}」？
            </p>
            <p className="film-dialog-copy">
              制作包和画布上的卡片都会清掉。
            </p>
            <div className="film-dialog-actions">
              <button
                type="button"
                className="ghost-btn compact"
                disabled={mutations.remove.isPending}
                onClick={() => setConfirmDelete(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-btn compact"
                disabled={mutations.remove.isPending}
                onClick={() => {
                  void mutations.remove.mutateAsync(current.id).then(() => setConfirmDelete(false))
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <span className="film-project-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
