import {
  executorSourceLabel,
  type ExecutorSource,
} from "@/lib/executor-source"

/**
 * Global「走 VPS / 走本机」switch.
 * Default unlocked (both options). Pass locked / platform only for rare force-lock.
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
  /** When true, non-active option is disabled. */
  locked?: boolean
  /** Retained for isomorphism; web no longer force-locks VPS. */
  platform?: "web" | "desktop"
  /**
   * Optional tip beside the chips.
   * Unlocked tip: film routes by preference; image local unwired when selected.
   */
  showTip?: boolean
  className?: string
  lockLabel?: string
}) {
  void platform
  const vpsDisabled = locked && value !== "vps"
  const localDisabled = locked && value !== "local"

  function select(next: ExecutorSource) {
    if (next === value) return
    if (next === "local" && localDisabled) return
    if (next === "vps" && vpsDisabled) return
    onChange(next)
  }

  const tipText = locked
    ? lockLabel
    : "影片走所选执行端；出图本机通路未接时会提示"

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
        onClick={() => select("local")}
      >
        {executorSourceLabel("local")}
      </button>
      {locked ? <span className="executor-source-lock">{lockLabel}</span> : null}
      {showTip ? <span className="executor-source-lock">{tipText}</span> : null}
    </p>
  )
}
