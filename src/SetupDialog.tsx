import type { SetupReport } from './setup';

export function SetupDialog({
  report,
  busy,
  onRetry,
}: {
  report: SetupReport | null;
  busy: boolean;
  onRetry: () => void;
}) {
  const failed =
    (report?.steps.some((step) => step.status === 'error') ?? false) ||
    Boolean(report && !report.ready && !busy);

  return (
    <div className="setup-mask">
      <section className="setup-card" role="dialog" aria-labelledby="setup-title" aria-modal="true">
        <p className="eyebrow">本机环境</p>
        <h1 id="setup-title">正在准备运行环境</h1>
        <p className="setup-lead">
          {report?.message || '正在检查 Python、CLI、Camoufox 和 Playwright。浏览器安装包会走加速源。'}
        </p>
        <ol className="setup-steps">
          {(report?.steps ?? []).map((step) => (
            <li key={step.id} className={`setup-step is-${step.status}`}>
              <span className="setup-mark" aria-hidden>
                {step.status === 'done' ? '✓' : step.status === 'error' ? '!' : step.status === 'running' ? '…' : '○'}
              </span>
              <div>
                <p className="setup-step-title">{step.title}</p>
                <p className="setup-step-detail">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {failed && !busy ? (
          <button type="button" className="primary-btn" onClick={onRetry}>
            重试安装
          </button>
        ) : (
          <p className="setup-foot">{busy ? '请保持窗口打开，第一次下载浏览器会久一点。' : '检查中…'}</p>
        )}
      </section>
    </div>
  );
}
