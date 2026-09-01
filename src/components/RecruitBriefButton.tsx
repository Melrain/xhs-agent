import { useState } from "react"
import {
  RECRUIT_FACTS,
  RECRUIT_NOTES,
  RECRUIT_SCRIPTS,
  RECRUIT_SLOGANS,
  recruitBriefPlaintext,
} from "@/lib/recruit-brief"

export function RecruitBriefButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="ghost-btn compact" onClick={() => setOpen(true)}>
        招聘简报
      </button>
      {open ? (
        <div className="brief-layer">
          <button type="button" className="brief-backdrop" onClick={() => setOpen(false)} />
          <div className="brief-card" role="dialog" aria-labelledby="recruit-brief-title">
            <header className="brief-head">
              <div>
                <h2 id="recruit-brief-title">R7-若栖传媒 · 招聘简报</h2>
                <p>写提示词时对照，数字和卖点只按这里写</p>
              </div>
              <div className="row">
                <CopyTextButton text={recruitBriefPlaintext()} label="复制全部" />
                <button type="button" className="ghost-btn compact" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
            </header>
            <div className="brief-body">
              <section>
                <h3>已确认事实</h3>
                <dl>
                  {RECRUIT_FACTS.map((item) => (
                    <div key={item.label}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section>
                <h3>宣传口径 · 可用，勿当已核实数据</h3>
                <p>{RECRUIT_SLOGANS.join(" · ")}</p>
              </section>
              <section>
                <h3>可直接用的话术</h3>
                {RECRUIT_SCRIPTS.map((item) => (
                  <article key={item.title}>
                    <div className="brief-script-head">
                      <strong>{item.title}</strong>
                      <CopyTextButton text={item.text} />
                    </div>
                    <p>{item.text}</p>
                  </article>
                ))}
              </section>
              <section>
                <h3>写帖注意</h3>
                <ul>
                  {RECRUIT_NOTES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement("textarea")
    field.value = text
    field.setAttribute("readonly", "")
    field.style.position = "fixed"
    field.style.left = "-9999px"
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand("copy")
    field.remove()
    return ok
  }
}

function CopyTextButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="ghost-btn compact"
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        })
      }}
    >
      {copied ? "已复制" : label}
    </button>
  )
}
