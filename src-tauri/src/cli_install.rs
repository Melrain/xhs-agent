use crate::xhs::{resolve_named_bin, resolve_xhs_bin, run_cli_as};
use std::path::PathBuf;

const INSTALL_TIMEOUT_MS: u64 = 180_000;
const BOOTSTRAP_TIMEOUT_MS: u64 = 120_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnsureCli {
    pub found: bool,
    pub installed_now: bool,
    pub detail: String,
}

pub fn ensure_xhs_cli() -> EnsureCli {
    if resolve_xhs_bin().is_some() {
        return EnsureCli {
            found: true,
            installed_now: false,
            detail: String::new(),
        };
    }

    match install_xiaohongshu_cli() {
        Ok(how) => EnsureCli {
            found: true,
            installed_now: true,
            detail: format!("已用 {how} 安装 xiaohongshu-cli。"),
        },
        Err(error) => EnsureCli {
            found: false,
            installed_now: false,
            detail: format!("{error}\n{}", manual_install_help()),
        },
    }
}

pub fn manual_install_help() -> String {
    "请自行安装 xiaohongshu-cli 后点「再次安装 CLI」，或重启本应用：\n\
     推荐：uv tool install xiaohongshu-cli\n\
     或：pipx install xiaohongshu-cli\n\
     也可把 xhs 路径写到环境变量 XHS_BIN。"
        .into()
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
        return None;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn help_tells_user_how_to_install() {
        let help = manual_install_help();
        assert!(help.contains("uv tool install xiaohongshu-cli"));
        assert!(help.contains("XHS_BIN"));
    }

    #[test]
    fn ensure_keeps_existing_cli() {
        if resolve_xhs_bin().is_none() {
            return;
        }
        let result = ensure_xhs_cli();
        assert!(result.found);
        assert!(!result.installed_now);
    }
}
