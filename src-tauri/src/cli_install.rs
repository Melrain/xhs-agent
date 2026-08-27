use crate::xhs::{
    resolve_companion_python, resolve_named_bin, resolve_xhs_bin, run_cli_as, run_cli_as_progress,
};
use serde::Serialize;
use std::path::{Path, PathBuf};

const INSTALL_TIMEOUT_MS: u64 = 180_000;
const BOOTSTRAP_TIMEOUT_MS: u64 = 120_000;
const CAMOUFOX_FETCH_TIMEOUT_MS: u64 = 900_000;
const CAMOUFOX_FETCH_PY: &str = include_str!("../resources/camoufox_fetch.py");

const PY_CHECK_BROWSER: &str = r#"
from camoufox.multiversion import get_active_path
from camoufox.pkgman import launch_path
path = get_active_path()
if path is None:
    raise SystemExit(2)
print(launch_path(path))
"#;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetupStep {
    pub id: String,
    pub title: String,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetupReport {
    pub ready: bool,
    pub message: String,
    pub steps: Vec<SetupStep>,
}

pub fn probe_runtime() -> SetupReport {
    report_from_facts(collect_facts())
}

pub fn ensure_runtime(mut on_progress: impl FnMut(&SetupReport)) -> SetupReport {
    let mut facts = collect_facts();
    let mut report = report_from_facts(facts.clone());
    if report.ready {
        on_progress(&report);
        return report;
    }
    on_progress(&report);

    if !facts.toolchain {
        set_step(&mut report, "toolchain", "running", "正在安装 uv…");
        on_progress(&report);
        match bootstrap_uv() {
            Some(_) => {
                facts = collect_facts();
                set_step(&mut report, "toolchain", "done", "已安装 uv");
            }
            None => {
                set_step(
                    &mut report,
                    "toolchain",
                    "error",
                    "装不上 uv。请先安装 Python 3.10+，或手动安装 uv。",
                );
                report.ready = false;
                report.message = current_error(&report);
                on_progress(&report);
                return report;
            }
        }
        on_progress(&report);
    }

    if !facts.cli {
        set_step(&mut report, "cli", "running", "正在安装 xiaohongshu-cli…");
        on_progress(&report);
        match install_xiaohongshu_cli() {
            Ok(how) => set_step(&mut report, "cli", "done", &format!("已用 {how} 安装")),
            Err(error) => {
                set_step(&mut report, "cli", "error", &error);
                report.ready = false;
                report.message = error;
                on_progress(&report);
                return report;
            }
        }
        facts = collect_facts();
        apply_facts(&mut report, &facts);
        on_progress(&report);
    }

    let python = match resolve_companion_python() {
        Ok(path) => path,
        Err(error) => {
            set_step(
                &mut report,
                "camoufox-pkg",
                "error",
                &format!("找不到配套 Python：{error}"),
            );
            report.ready = false;
            report.message = format!("CLI 在，但找不到配套 Python：{error}");
            on_progress(&report);
            return report;
        }
    };

    if !facts.camoufox_pkg {
        set_step(&mut report, "camoufox-pkg", "running", "正在安装 camoufox 包…");
        on_progress(&report);
        if let Err(error) = install_python_package(&python, "camoufox") {
            set_step(&mut report, "camoufox-pkg", "error", &error);
            report.ready = false;
            report.message = error;
            on_progress(&report);
            return report;
        }
        set_step(&mut report, "camoufox-pkg", "done", "camoufox 包已就绪");
        on_progress(&report);
    }

    if !module_present(&python, "playwright") {
        set_step(&mut report, "playwright", "running", "正在安装 Playwright…");
        on_progress(&report);
        if let Err(error) = install_python_package(&python, "playwright") {
            set_step(&mut report, "playwright", "error", &error);
            report.ready = false;
            report.message = error;
            on_progress(&report);
            return report;
        }
        set_step(&mut report, "playwright", "done", "Playwright 已就绪");
        on_progress(&report);
    } else {
        set_step(&mut report, "playwright", "done", "Playwright 已就绪");
        on_progress(&report);
    }

    if !camoufox_browser_ready(&python) {
        set_step(
            &mut report,
            "camoufox-browser",
            "running",
            "正在通过加速源下载 Camoufox 浏览器…",
        );
        on_progress(&report);
        let script = match write_camoufox_fetch_script() {
            Ok(path) => path,
            Err(error) => {
                set_step(&mut report, "camoufox-browser", "error", &error);
                report.ready = false;
                report.message = error;
                on_progress(&report);
                return report;
            }
        };
        let script_arg = script.to_string_lossy().into_owned();
        let fetch = run_cli_as_progress(
            &python,
            &[&script_arg],
            CAMOUFOX_FETCH_TIMEOUT_MS,
            "camoufox",
            |line| {
                let detail = clean_progress_line(line);
                if !detail.is_empty() {
                    set_step(&mut report, "camoufox-browser", "running", &detail);
                    on_progress(&report);
                }
            },
        );
        match fetch {
            Ok((0, _, _)) if camoufox_browser_ready(&python) => {
                set_step(&mut report, "camoufox-browser", "done", "Camoufox 浏览器已就绪");
            }
            Ok((code, stdout, stderr)) => {
                let tail = [stderr.trim(), stdout.trim()]
                    .into_iter()
                    .find(|text| !text.is_empty())
                    .unwrap_or("没有输出");
                let cut: String = tail.chars().take(240).collect();
                let error = format!("Camoufox 浏览器安装失败（退出码 {code}）：{cut}");
                set_step(&mut report, "camoufox-browser", "error", &error);
                report.ready = false;
                report.message = error;
                on_progress(&report);
                return report;
            }
            Err(error) => {
                let error = format!("安装 Camoufox 浏览器失败：{error}");
                set_step(&mut report, "camoufox-browser", "error", &error);
                report.ready = false;
                report.message = error;
                on_progress(&report);
                return report;
            }
        }
        on_progress(&report);
    }

    facts = collect_facts();
    report = report_from_facts(facts);
    if report.ready {
        report.message = "环境已就绪".into();
    }
    on_progress(&report);
    report
}

#[derive(Debug, Clone)]
struct RuntimeFacts {
    toolchain: bool,
    cli: bool,
    camoufox_pkg: bool,
    playwright: bool,
    camoufox_browser: bool,
}

fn collect_facts() -> RuntimeFacts {
    let python = resolve_companion_python().ok();
    let camoufox_pkg = python
        .as_ref()
        .is_some_and(|path| module_present(path, "camoufox"));
    let playwright = python
        .as_ref()
        .is_some_and(|path| module_present(path, "playwright"));
    let camoufox_browser = python
        .as_ref()
        .is_some_and(|path| camoufox_browser_ready(path));
    RuntimeFacts {
        toolchain: resolve_named_bin("uv").is_some()
            || resolve_named_bin("python3").is_some()
            || resolve_named_bin("python").is_some()
            || python.is_some(),
        cli: resolve_xhs_bin().is_some(),
        camoufox_pkg,
        playwright,
        camoufox_browser,
    }
}

fn report_from_facts(facts: RuntimeFacts) -> SetupReport {
    let steps = vec![
        step(
            "toolchain",
            "Python / uv",
            facts.toolchain,
            if facts.toolchain {
                "已找到"
            } else {
                "未找到，将自动安装 uv"
            },
        ),
        step(
            "cli",
            "xiaohongshu-cli",
            facts.cli,
            if facts.cli {
                "已找到 xhs"
            } else {
                "未安装"
            },
        ),
        step(
            "camoufox-pkg",
            "camoufox 包",
            facts.camoufox_pkg,
            if facts.camoufox_pkg {
                "已安装"
            } else {
                "扫码登录需要"
            },
        ),
        step(
            "playwright",
            "Playwright",
            facts.playwright,
            if facts.playwright {
                "已安装"
            } else {
                "camoufox 启动浏览器需要"
            },
        ),
        step(
            "camoufox-browser",
            "Camoufox 浏览器",
            facts.camoufox_browser,
            if facts.camoufox_browser {
                "已安装"
            } else {
                "未安装，将执行 camoufox fetch"
            },
        ),
    ];
    let ready = steps.iter().all(|item| item.status == "done");
    SetupReport {
        ready,
        message: if ready {
            "环境已就绪".into()
        } else {
            "还缺运行环境，开始安装…".into()
        },
        steps,
    }
}

fn step(id: &str, title: &str, ok: bool, detail: &str) -> SetupStep {
    SetupStep {
        id: id.into(),
        title: title.into(),
        status: if ok { "done" } else { "waiting" }.into(),
        detail: detail.into(),
    }
}

fn set_step(report: &mut SetupReport, id: &str, status: &str, detail: &str) {
    if let Some(step) = report.steps.iter_mut().find(|item| item.id == id) {
        step.status = status.into();
        step.detail = detail.into();
    }
}

fn apply_facts(report: &mut SetupReport, facts: &RuntimeFacts) {
    let fresh = report_from_facts(facts.clone());
    for step in &fresh.steps {
        if step.status == "done" {
            set_step(report, &step.id, "done", &step.detail);
        }
    }
}

fn current_error(report: &SetupReport) -> String {
    report
        .steps
        .iter()
        .rev()
        .find(|step| step.status == "error")
        .map(|step| step.detail.clone())
        .unwrap_or_else(|| report.message.clone())
}

fn write_camoufox_fetch_script() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join("xhs-agent-camoufox-fetch.py");
    std::fs::write(&path, CAMOUFOX_FETCH_PY).map_err(|error| format!("写下载脚本失败：{error}"))?;
    Ok(path)
}

fn camoufox_browser_ready(python: &Path) -> bool {
    let Ok((code, stdout, _)) =
        run_cli_as(python, &["-c", PY_CHECK_BROWSER], 20_000, "camoufox")
    else {
        return false;
    };
    code == 0 && !stdout.trim().is_empty()
}

fn module_present(python: &Path, module: &str) -> bool {
    let script = format!("import {module}");
    run_cli_as(python, &["-c", &script], 15_000, "python")
        .ok()
        .is_some_and(|(code, _, _)| code == 0)
}

pub fn manual_install_help() -> String {
    "请自行装好环境后点「再次检查环境」，或重启本应用：\n\
     推荐：uv tool install xiaohongshu-cli\n\
     然后用配套 Python 执行：python -m camoufox fetch\n\
     扫码还需要 camoufox 包、Playwright，以及 Camoufox 浏览器本体。\n\
     也可把 xhs 路径写到环境变量 XHS_BIN。"
        .into()
}

fn install_python_package(python: &Path, package: &str) -> Result<(), String> {
    let attempts: [&[&str]; 2] = [
        &["-m", "pip", "install", package],
        &["-m", "pip", "install", "--user", package],
    ];
    let mut last_error = format!("安装 {package} 失败");
    for args in attempts {
        match run_cli_as(python, args, INSTALL_TIMEOUT_MS, "pip") {
            Ok((0, _, _)) => return Ok(()),
            Ok((code, stdout, stderr)) => {
                let tail = [stderr.trim(), stdout.trim()]
                    .into_iter()
                    .find(|text| !text.is_empty())
                    .unwrap_or("没有输出");
                let cut: String = tail.chars().take(240).collect();
                last_error = format!("安装 {package} 失败（退出码 {code}）：{cut}");
            }
            Err(error) => last_error = format!("安装 {package} 失败：{error}"),
        }
    }
    Err(last_error)
}

fn clean_progress_line(line: &str) -> String {
    let cleaned: String = line
        .chars()
        .filter(|ch| !ch.is_control())
        .collect();
    cleaned.trim().chars().take(80).collect()
}

fn install_xiaohongshu_cli() -> Result<String, String> {
    let installers = all_installers();
    let mut errors = Vec::new();
    let had_uv = installers.iter().any(|item| matches!(item, Installer::Uv(_)));

    for installer in &installers {
        match run_installer(installer) {
            Ok(how) if resolve_xhs_bin().is_some() => return Ok(how),
            Ok(how) => errors.push(format!("{how} 执行成功，但还是找不到 xhs")),
            Err(error) => errors.push(error),
        }
    }

    if !had_uv {
        if let Some(uv) = bootstrap_uv() {
            match run_installer(&Installer::Uv(uv)) {
                Ok(how) if resolve_xhs_bin().is_some() => return Ok(how),
                Ok(how) => errors.push(format!("{how} 执行成功，但还是找不到 xhs")),
                Err(error) => errors.push(error),
            }
        }
    }

    if errors.is_empty() {
        Err("本机没有找到 uv、pipx 或 Python，无法自动安装。".into())
    } else {
        Err(errors.join("；"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Installer {
    Uv(PathBuf),
    Pipx(PathBuf),
    Pip(PathBuf),
}

fn all_installers() -> Vec<Installer> {
    let mut installers = Vec::new();
    if let Some(uv) = resolve_named_bin("uv") {
        installers.push(Installer::Uv(uv));
    }
    if let Some(pipx) = resolve_named_bin("pipx") {
        installers.push(Installer::Pipx(pipx));
    }
    if let Some(python) = resolve_named_bin("python3").or_else(|| resolve_named_bin("python")) {
        installers.push(Installer::Pip(python));
    }
    installers
}

fn run_installer(installer: &Installer) -> Result<String, String> {
    let (how, bin, args) = match installer {
        Installer::Uv(bin) => (
            "uv",
            bin.clone(),
            vec!["tool".into(), "install".into(), "xiaohongshu-cli".into()],
        ),
        Installer::Pipx(bin) => (
            "pipx",
            bin.clone(),
            vec!["install".into(), "xiaohongshu-cli".into()],
        ),
        Installer::Pip(bin) => (
            "pip",
            bin.clone(),
            vec![
                "-m".into(),
                "pip".into(),
                "install".into(),
                "--user".into(),
                "xiaohongshu-cli".into(),
            ],
        ),
    };
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let (code, stdout, stderr) = run_cli_as(&bin, &arg_refs, INSTALL_TIMEOUT_MS, how)
        .map_err(|error| format!("用 {how} 安装 xiaohongshu-cli 失败：{error}"))?;
    if code == 0 {
        return Ok(how.into());
    }
    let tail = [stderr.trim(), stdout.trim()]
        .into_iter()
        .find(|text| !text.is_empty())
        .unwrap_or("没有输出");
    let cut: String = tail.chars().take(240).collect();
    Err(format!("用 {how} 安装失败（退出码 {code}）：{cut}"))
}

fn bootstrap_uv() -> Option<PathBuf> {
    if cfg!(windows) {
        return bootstrap_uv_windows();
    }
    let sh = resolve_named_bin("sh")?;
    let (code, _, _) = run_cli_as(
        &sh,
        &["-lc", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
        BOOTSTRAP_TIMEOUT_MS,
        "uv-install",
    )
    .ok()?;
    if code != 0 {
        return None;
    }
    resolve_named_bin("uv")
}

fn bootstrap_uv_windows() -> Option<PathBuf> {
    let powershell = resolve_named_bin("powershell").or_else(|| {
        let system = std::env::var_os("SystemRoot").map(PathBuf::from)?;
        let path = system.join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        path.is_file().then_some(path)
    })?;
    let (code, _, _) = run_cli_as(
        &powershell,
        &[
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "irm https://astral.sh/uv/install.ps1 | iex",
        ],
        BOOTSTRAP_TIMEOUT_MS,
        "uv-install",
    )
    .ok()?;
    if code != 0 {
        return None;
    }
    resolve_named_bin("uv")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_lists_runtime_steps() {
        let report = probe_runtime();
        let ids: Vec<_> = report.steps.iter().map(|step| step.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "toolchain",
                "cli",
                "camoufox-pkg",
                "playwright",
                "camoufox-browser"
            ]
        );
    }

    #[test]
    fn browser_check_does_not_use_camoufox_path_cli() {
        assert!(PY_CHECK_BROWSER.contains("get_active_path"));
        assert!(PY_CHECK_BROWSER.contains("launch_path"));
        assert!(!PY_CHECK_BROWSER.contains("camoufox path"));
    }

    #[test]
    fn help_tells_user_how_to_install() {
        let help = manual_install_help();
        assert!(help.contains("xiaohongshu-cli"));
        assert!(help.contains("camoufox fetch"));
    }

    #[test]
    fn fetch_script_uses_github_mirrors() {
        assert!(CAMOUFOX_FETCH_PY.contains("ghfast.top"));
        assert!(CAMOUFOX_FETCH_PY.contains("下载中"));
        assert!(!CAMOUFOX_FETCH_PY.contains("camoufox path"));
    }
}
