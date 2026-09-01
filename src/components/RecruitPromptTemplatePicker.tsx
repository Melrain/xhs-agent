import { useState } from "react"
import { RECRUIT_PROMPT_TEMPLATES } from "@/lib/recruit-prompt-templates"

export function RecruitPromptTemplatePicker({
  onFill,
}: {
  onFill: (prompt: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(RECRUIT_PROMPT_TEMPLATES[0]?.id)
  const selected = RECRUIT_PROMPT_TEMPLATES.find((item) => item.id === selectedId)

  function fill() {
    if (!selected) return
    onFill(selected.prompt)
    setOpen(false)
  }

  return (
    <>
      <button type="button" className="ghost-btn compact" onClick={() => setOpen(true)}>
        模板选择
      </button>
      {open ? (
        <div className="brief-layer">
          <button type="button" className="brief-backdrop" onClick={() => setOpen(false)} />
          <div className="brief-card" role="dialog" aria-labelledby="recruit-template-title">
            <header className="brief-head">
              <div>
                <h2 id="recruit-template-title">模板选择</h2>
                <p>点选模板查看提示词，再一键填入当前输入框</p>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="primary-btn compact"
                  onClick={fill}
                  disabled={!selected}
                >
                  一键填入
                </button>
                <button type="button" className="ghost-btn compact" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
            </header>
            <div className="brief-body">
              <section>
                <h3>可选模板</h3>
                <div className="brief-template-list">
                  {RECRUIT_PROMPT_TEMPLATES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedId ? "ghost-btn compact active" : "ghost-btn compact"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
              {selected ? (
                <section>
                  <h3>{selected.label}</h3>
                  <article>
                    <p>{selected.prompt}</p>
                  </article>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
