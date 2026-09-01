use crate::xhs::{
    resolve_companion_python, resolve_named_bin, resolve_xhs_bin, run_cli_as, run_cli_as_progress,
    run_cli_as_with_env,
};
use serde::Serialize;
use std::path::{Path, PathBuf};

const INSTALL_TIMEOUT_MS: u64 = 300_000;
const BOOTSTRAP_TIMEOUT_MS: u64 = 180_000;
const PYPI_MIRRORS: &[&str] = &[
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://mirrors.aliyun.com/pypi/simple",
];
const UV_PYTHON_MIRROR: &str =
    "https://ghfast.top/https://github.com/astral-sh/python-build-standalone/releases/download";
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
        set_step(
            &mut report,
            "camoufox-pkg",
            "running",
            "正在安装 camoufox 包…",
        );
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
                set_step(
                    &mut report,
                    "camoufox-browser",
                    "done",
                    "Camoufox 浏览器已就绪",
                );
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
    let Ok((code, stdout, _)) = run_cli_as(python, &["-c", PY_CHECK_BROWSER], 20_000, "camoufox")
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
    let attempts = python_package_attempts(python, package, resolve_named_bin("uv"));
    let mut last_error = format!("安装 {package} 失败");
    for (index, (bin, args, name)) in attempts.iter().enumerate() {
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        match run_cli_as(bin, &arg_refs, INSTALL_TIMEOUT_MS, name) {
            Ok((0, _, _)) => return Ok(()),
            Ok((code, stdout, stderr)) => {
                last_error =
                    format_command_error(&format!("安装 {package}"), code, &stdout, &stderr);
            }
            Err(error) => last_error = format!("安装 {package} 失败：{error}"),
        }
        let has_more = index + 1 < attempts.len();
        if !has_more {
            break;
        }
        if looks_like_network_error(&last_error) {
            continue;
        }
        break;
    }
    Err(last_error)
}

fn python_package_attempts(
    python: &Path,
    package: &str,
    uv: Option<PathBuf>,
) -> Vec<(PathBuf, Vec<String>, &'static str)> {
    let python_arg = python.to_string_lossy().into_owned();
    let mut attempts = Vec::new();
    if let Some(uv) = uv {
        attempts.push((
            uv.clone(),
            vec![
                "pip".into(),
                "install".into(),
                "--python".into(),
                python_arg.clone(),
                package.into(),
            ],
            "uv",
        ));
        for mirror in PYPI_MIRRORS {
            attempts.push((
                uv.clone(),
                vec![
                    "pip".into(),
                    "install".into(),
                    "--python".into(),
                    python_arg.clone(),
                    "--default-index".into(),
                    (*mirror).into(),
                    package.into(),
                ],
                "uv",
            ));
        }
    }
    attempts.push((
        python.to_path_buf(),
        vec!["-m".into(), "pip".into(), "install".into(), package.into()],
        "pip",
    ));
    attempts.push((
        python.to_path_buf(),
        vec![
            "-m".into(),
            "pip".into(),
            "install".into(),
            "--user".into(),
            package.into(),
        ],
        "pip",
    ));
    for mirror in PYPI_MIRRORS {
        attempts.push((
            python.to_path_buf(),
            vec![
                "-m".into(),
                "pip".into(),
                "install".into(),
                "-i".into(),
                (*mirror).into(),
                package.into(),
            ],
            "pip",
        ));
    }
    attempts
}

fn format_command_error(action: &str, code: i32, stdout: &str, stderr: &str) -> String {
    let tail = [stderr.trim(), stdout.trim()]
        .into_iter()
        .find(|text| !text.is_empty())
        .unwrap_or("没有输出");
    let cut: String = tail.chars().take(240).collect();
    format!("{action} 失败（退出码 {code}）：{cut}")
}

fn looks_like_network_error(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "timed out",
        "timeout",
        "connection",
        "network",
        "ssl",
        "certificate",
        "failed to fetch",
        "failed to download",
        "could not resolve",
        "unreachable",
        "403",
        "429",
        "超时",
        "连接失败",
        "无法连接",
        "无法解析",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn looks_like_missing_python(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "no python",
        "python was not found",
        "couldn't find a valid python",
        "could not find a valid python",
        "no interpreter",
        "managed python",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn clean_progress_line(line: &str) -> String {
    let cleaned: String = line.chars().filter(|ch| !ch.is_control()).collect();
    cleaned.trim().chars().take(80).collect()
}

fn install_xiaohongshu_cli() -> Result<String, String> {
    let installers = all_installers();
    let mut errors = Vec::new();
    let had_uv = installers
        .iter()
        .any(|item| matches!(item, Installer::Uv(_)));

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
    PyLauncher(PathBuf),
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
    if cfg!(windows) {
        if let Some(py) = resolve_named_bin("py") {
            installers.push(Installer::PyLauncher(py));
        }
    }
    installers
}

fn installer_attempts(installer: &Installer) -> Vec<(String, PathBuf, Vec<String>)> {
    match installer {
        Installer::Uv(bin) => {
            let mut attempts = vec![(
                "uv".into(),
                bin.clone(),
                vec!["tool".into(), "install".into(), "xiaohongshu-cli".into()],
            )];
            for mirror in PYPI_MIRRORS {
                attempts.push((
                    "uv".into(),
                    bin.clone(),
                    vec![
                        "tool".into(),
                        "install".into(),
                        "--default-index".into(),
                        (*mirror).into(),
                        "xiaohongshu-cli".into(),
                    ],
                ));
            }
            attempts.push((
                "uv".into(),
                bin.clone(),
                vec![
                    "tool".into(),
                    "install".into(),
                    "--python".into(),
                    "3.11".into(),
                    "xiaohongshu-cli".into(),
                ],
            ));
            attempts
        }
        Installer::Pipx(bin) => vec![(
            "pipx".into(),
            bin.clone(),
            vec!["install".into(), "xiaohongshu-cli".into()],
        )],
        Installer::Pip(bin) => pip_user_attempts("pip", bin, &["-m", "pip", "install", "--user"]),
        Installer::PyLauncher(bin) => {
            pip_user_attempts("py", bin, &["-3", "-m", "pip", "install", "--user"])
        }
    }
}

fn pip_user_attempts(
    how: &str,
    bin: &Path,
    prefix: &[&str],
) -> Vec<(String, PathBuf, Vec<String>)> {
    let mut attempts = vec![(
        how.into(),
        bin.to_path_buf(),
        prefix
            .iter()
            .map(|item| (*item).to_string())
            .chain(std::iter::once("xiaohongshu-cli".into()))
            .collect(),
    )];
    for mirror in PYPI_MIRRORS {
        let mut args: Vec<String> = prefix.iter().map(|item| (*item).to_string()).collect();
        args.push("-i".into());
        args.push((*mirror).into());
        args.push("xiaohongshu-cli".into());
        attempts.push((how.into(), bin.to_path_buf(), args));
    }
    attempts
}

fn run_installer(installer: &Installer) -> Result<String, String> {
    let attempts = installer_attempts(installer);
    let mut last_error = "安装 xiaohongshu-cli 失败".to_string();
    for (index, (how, bin, args)) in attempts.iter().enumerate() {
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let extra_env: &[(&str, &str)] =
            if how == "uv" && args.iter().any(|item| item == "--python") {
                &[("UV_PYTHON_INSTALL_MIRROR", UV_PYTHON_MIRROR)]
            } else {
                &[]
            };
        let result = run_cli_as_with_env(bin, &arg_refs, INSTALL_TIMEOUT_MS, how, extra_env)
            .map_err(|error| format!("用 {how} 安装 xiaohongshu-cli 失败：{error}"));
        match result {
            Ok((0, _, _)) => return Ok(how.clone()),
            Ok((code, stdout, stderr)) => {
                last_error =
                    format_command_error(&format!("用 {how} 安装"), code, &stdout, &stderr);
            }
            Err(error) => last_error = error,
        }
        let should_retry = index + 1 < attempts.len()
            && (looks_like_network_error(&last_error) || looks_like_missing_python(&last_error));
        if !should_retry {
            break;
        }
    }
    Err(last_error)
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

    #[test]
    fn python_package_install_prefers_uv_pip() {
        let python = PathBuf::from("/opt/uv/tools/xiaohongshu-cli/bin/python3");
        let attempts =
            python_package_attempts(&python, "camoufox", Some(PathBuf::from("/usr/bin/uv")));
        assert!(attempts.iter().any(|(_, args, name)| *name == "uv"
            && args
                .windows(2)
                .any(|pair| pair == ["--python", python.to_str().unwrap()])));
        assert!(attempts.iter().any(|(_, args, _)| {
            args.iter()
                .any(|item| item.contains("pypi.tuna.tsinghua.edu.cn"))
        }));
    }

    #[test]
    fn uv_cli_install_has_mirror_and_python_fallback() {
        let attempts = installer_attempts(&Installer::Uv(PathBuf::from("/usr/bin/uv")));
        assert!(attempts
            .iter()
            .any(|(_, _, args)| args == &["tool", "install", "xiaohongshu-cli"]));
        assert!(attempts.iter().any(|(_, _, args)| {
            args.contains(&"--default-index".to_string())
                && args.iter().any(|item| item.contains("tuna.tsinghua"))
        }));
        assert!(attempts
            .iter()
            .any(|(_, _, args)| args.contains(&"--python".to_string())
                && args.contains(&"3.11".to_string())));
    }

    #[test]
    fn network_error_detector_covers_common_failures() {
        assert!(looks_like_network_error(
            "Failed to fetch: connection timed out"
        ));
        assert!(looks_like_missing_python("No Python interpreters found"));
        assert!(!looks_like_network_error("package not found"));
    }
}
