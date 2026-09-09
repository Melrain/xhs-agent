import {
  executorSourceLabel,
  executorSourceLocalUnwiredLabel,
  type ExecutorSource,
} from "@/lib/executor-source"

/**
 * Global「走 VPS / 走本机」switch.
 * Desktop: both options (unless `locked`).
 * Web (`platform="web"`): VPS-only — local chip stays visible but disabled.
 */
export function ExecutorSourceSwitch({
  value,
  onChange,
  locked = false,
  platform = "desktop",
  showTip = false,
  className,
  lockLabel = "项目已锁定执行端",
}: {
  value: ExecutorSource
  onChange: (next: ExecutorSource) => void
  /** When true, non-active option is disabled (e.g. film project already pinned source). */
  locked?: boolean
  /** web = VPS-only (isomorphic with web app); desktop = both. */
  platform?: "web" | "desktop"
  /**
   * Optional tip beside the chips (isomorphic with web).
   * Web: 「网页端仅 VPS」; desktop: makeup-style local-unwired hint.
   */
  showTip?: boolean
  className?: string
  lockLabel?: string
}) {
  const webOnly = platform === "web"
  const vpsDisabled = locked && value !== "vps"
  const localDisabled = webOnly || (locked && value !== "local")

  function select(next: ExecutorSource) {
    if (next === value) return
    if (next === "local" && localDisabled) return
    if (next === "vps" && vpsDisabled) return
    onChange(next)
  }

  const tipText = webOnly
    ? "网页端仅 VPS"
    : executorSourceLocalUnwiredLabel()

  return (
    <p
      className={["executor-source-switch", className].filter(Boolean).join(" ")}
      aria-label="执行端"
    >
      <button
        type="button"
        className={`executor-source-chip${value === "vps" ? " is-active" : ""}`}
        aria-pressed={value === "vps"}
        disabled={vpsDisabled}
        onClick={() => select("vps")}
      >
        {executorSourceLabel("vps")}
      </button>
      <button
        type="button"
        className={`executor-source-chip${value === "local" ? " is-active" : ""}`}
        aria-pressed={value === "local"}
        disabled={localDisabled}
        title={webOnly ? "网页端仅支持走 VPS" : undefined}
        onClick={() => select("local")}
      >
        {executorSourceLabel("local")}
      </button>
      {locked ? <span className="executor-source-lock">{lockLabel}</span> : null}
      {showTip ? <span className="executor-source-lock">{tipText}</span> : null}
    </p>
  )
}
