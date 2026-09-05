export type FilmPaneMenuState =
  | { kind: "pane"; screen: { x: number; y: number }; flow: { x: number; y: number } }
  | { kind: "card"; screen: { x: number; y: number }; cardId: string }

export function FilmPaneMenu({
  menu,
  onClose,
  onCreate,
  onRemove,
}: {
  menu: FilmPaneMenuState | null
  onClose: () => void
  onCreate: () => void
  onRemove: () => void
}) {
  if (!menu) return null
  return (
    <>
      <button type="button" className="film-menu-backdrop" aria-label="关闭菜单" onClick={onClose} />
      <div
        className="film-menu"
        style={{ left: menu.screen.x, top: menu.screen.y }}
        role="menu"
      >
        {menu.kind === "pane" ? (
          <button type="button" role="menuitem" onClick={onCreate}>
            新建卡片
          </button>
        ) : (
          <button type="button" role="menuitem" className="danger" onClick={onRemove}>
            删除
          </button>
        )}
      </div>
    </>
  )
}
