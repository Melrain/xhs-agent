use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SHORT_TIMEOUT_MS: u64 = 15_000;
const LIST_TIMEOUT_MS: u64 = 30_000;
const COMMENTS_TIMEOUT_MS: u64 = 60_000;
const READ_COMMANDS: &[&str] = &["status", "whoami", "logout", "my-notes", "comments"];
const PROXY_ENV_KEYS: &[&str] = &[
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "FTP_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "ftp_proxy",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XhsUserView {
    pub xhs_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub red_id: Option<String>,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XhsProbe {
    pub kind: String,
    pub command: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cli_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<XhsUserView>,
}

impl XhsProbe {
    fn missing_cli(command: &str) -> Self {
        Self {
            kind: "missing_cli".into(),
            command: command.into(),
            message: crate::cli_install::manual_install_help(),
            cli_path: None,
            user: None,
        }
    }

    fn logged_out(command: &str, cli_path: Option<String>) -> Self {
        Self {
            kind: "logged_out".into(),
            command: command.into(),
            message: "未登录，或登录已过期。".into(),
            cli_path,
            user: None,
        }
    }

    fn logged_in(command: &str, cli_path: Option<String>, user: XhsUserView) -> Self {
        let nickname = if user.nickname.is_empty() {
            "已登录".into()
        } else {
            format!("已登录：{}", user.nickname)
        };
        Self {
            kind: "logged_in".into(),
            command: command.into(),
            message: nickname,
            cli_path,
            user: Some(user),
        }
    }

    pub fn error(command: &str, message: String, cli_path: Option<String>) -> Self {
        Self {
            kind: "error".into(),
            command: command.into(),
            message,
            cli_path,
            user: None,
        }
    }
}

#[derive(Clone)]
pub struct XhsRuntime {
    lock: Arc<Mutex<()>>,
}

impl XhsRuntime {
    pub fn new() -> Self {
        Self {
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn with_lock<R>(&self, func: impl FnOnce() -> R) -> R {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        func()
    }

    pub fn probe_unlocked(&self, command: &str) -> XhsProbe {
        run_probe(command)
    }

    pub fn run_envelope(&self, args: &[String], timeout_ms: u64) -> Result<Value, String> {
        self.with_lock(|| self.run_envelope_unlocked(args, timeout_ms))
    }

    pub fn run_envelope_unlocked(&self, args: &[String], timeout_ms: u64) -> Result<Value, String> {
        run_envelope(args, timeout_ms)
    }

    pub fn list_notes_unlocked(&self) -> Result<Vec<XhsNoteView>, String> {
        let envelope = run_envelope(
            &["my-notes".into(), "--json".into()],
            list_timeout_ms(),
        )?;
        if let Some(error) = envelope_error(&envelope) {
            return Err(error);
        }
        Ok(notes_from_envelope(&envelope))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XhsNoteView {
    pub id: String,
    pub title: String,
    pub comments_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xsec_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XhsNotePullResult {
    pub note_id: String,
    pub pulled: i64,
    pub upserted: i64,
    pub message: String,
    pub verification_required: bool,
}

pub fn list_timeout_ms() -> u64 {
    LIST_TIMEOUT_MS
}

pub fn comments_timeout_ms() -> u64 {
    COMMENTS_TIMEOUT_MS
}

pub fn short_timeout_ms() -> u64 {
    SHORT_TIMEOUT_MS
}

/// CLI 把纯数字参数当成「上次列表的序号」，全数字笔记 id 会误判。
/// 改成 explore URL，走 `parse_note_reference`。
pub fn comments_note_ref(note_id: &str) -> String {
    let id = note_id.trim();
    if id.is_empty() || id.contains("xiaohongshu.com") {
        return id.to_string();
    }
    if id.bytes().all(|byte| byte.is_ascii_digit()) {
        return format!("https://www.xiaohongshu.com/explore/{id}");
    }
    id.to_string()
}

pub fn comments_command(note_id: &str, xsec_token: Option<&str>) -> Vec<String> {
    let mut command = vec![
        "comments".into(),
        comments_note_ref(note_id),
        "--json".into(),
        "--all".into(),
    ];
    if let Some(token) = xsec_token.map(str::trim).filter(|text| !text.is_empty()) {
        command.push("--xsec-token".into());
        command.push(token.into());
    }
    command
}

fn run_probe(command: &str) -> XhsProbe {
    if command != "status" && command != "whoami" && command != "logout" {
        return XhsProbe::error(command, "不支持的命令".into(), None);
    }

    let Some(bin) = resolve_xhs_bin() else {
        return XhsProbe::missing_cli(command);
    };
    let cli_path = bin.display().to_string();

    match run_cli(&bin, &[command, "--json"], short_timeout_ms()) {
        Ok((_code, stdout, stderr)) => parse_probe(command, Some(cli_path), &stdout, &stderr),
        Err(message) => XhsProbe::error(command, message, Some(cli_path)),
    }
}

pub fn resolve_xhs_bin() -> Option<PathBuf> {
    if let Some(explicit) = std::env::var_os("XHS_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    resolve_named_bin("xhs")
}

pub(crate) fn configure_child(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub(crate) fn is_windows_apps_alias(path: &Path) -> bool {
    path.to_string_lossy()
        .replace('\\', "/")
        .split('/')
        .any(|part| part.eq_ignore_ascii_case("WindowsApps"))
}

fn python_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["python.exe", "python3.exe", "python", "python3"]
    } else {
        &["python3", "python"]
    }
}

fn usable_bin(path: &Path) -> bool {
    path.is_file() && !is_windows_apps_alias(path)
}

pub(crate) fn resolve_named_bin(name: &str) -> Option<PathBuf> {
    let mut names = vec![name.to_string()];
    if cfg!(windows) && !name.ends_with(".exe") {
        names.push(format!("{name}.exe"));
    }
    for dir in candidate_bin_dirs() {
        for file in &names {
            let path = dir.join(file);
            if usable_bin(&path) {
                return Some(path);
            }
        }
    }
    None
}

pub(crate) fn resolve_companion_python() -> Result<PathBuf, String> {
    if let Some(explicit) = std::env::var("XHS_PYTHON")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("XHS_PYTHON 无效：{}", path.display()));
    }

    let Some(bin) = resolve_xhs_bin() else {
        return fallback_python3().ok_or_else(|| "找不到 Python，无法启动扫码。".into());
    };
    let real = std::fs::canonicalize(&bin).unwrap_or(bin);
    if let Some(dir) = real.parent() {
        if let Some(python) = python_in_dir(dir) {
            return Ok(python);
        }
    }
    if let Some(from_shebang) = python_from_shebang(&real) {
        return Ok(from_shebang);
    }
    fallback_python3().ok_or_else(|| "找不到与 xhs 配套的 Python。".into())
}

fn python_in_dir(dir: &Path) -> Option<PathBuf> {
    for name in python_names() {
        let path = dir.join(name);
        if usable_bin(&path) {
            return Some(path);
        }
    }
    None
}

fn fallback_python3() -> Option<PathBuf> {
    for dir in candidate_bin_dirs() {
        if let Some(python) = python_in_dir(&dir) {
            return Some(python);
        }
    }
    None
}

fn python_from_shebang(bin: &Path) -> Option<PathBuf> {
    let file = File::open(bin).ok()?;
    let mut reader = BufReader::new(file);
    let mut first = String::new();
    reader.read_line(&mut first).ok()?;
    let rest = first.trim().strip_prefix("#!")?.trim();
    if rest.contains("env") {
        return None;
    }
    let path = PathBuf::from(rest.split_whitespace().next()?);
    path.is_file().then_some(path)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn candidate_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = home_dir() {
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".cargo/bin"));
        dirs.extend(python_user_bin_dirs(&home));
    }
    if let Some(local_app) = std::env::var_os("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local_app).join("uv").join("bin"));
    }
    dirs.push(PathBuf::from("/opt/homebrew/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            if !dir.as_os_str().is_empty() && !dirs.contains(&dir) {
                dirs.push(dir);
            }
        }
    }
    dirs
}

fn python_user_bin_dirs(home: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(home.join("Library/Python")) {
        for entry in entries.flatten() {
            let bin = entry.path().join("bin");
            if bin.is_dir() {
                dirs.push(bin);
            }
        }
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let python = PathBuf::from(appdata).join("Python");
        let root_scripts = python.join("Scripts");
        if root_scripts.is_dir() {
            dirs.push(root_scripts);
        }
        if let Ok(entries) = std::fs::read_dir(&python) {
            for entry in entries.flatten() {
                let scripts = entry.path().join("Scripts");
                if scripts.is_dir() {
                    dirs.push(scripts);
                }
            }
        }
    }
    dirs
}

pub(crate) fn sanitize_cli_env() -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = std::env::vars()
        .filter(|(key, value)| {
            if !PROXY_ENV_KEYS.contains(&key.as_str()) {
                return true;
            }
            !value.to_ascii_lowercase().contains("socks")
        })
        .collect();

    let extras: Vec<PathBuf> = candidate_bin_dirs()
        .into_iter()
        .filter(|dir| dir.is_dir())
        .collect();
    if extras.is_empty() {
        return env;
    }

    let current = env
        .iter()
        .find(|(key, _)| key == "PATH")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();
    let mut parts: Vec<PathBuf> = extras;
    for dir in std::env::split_paths(&current) {
        if !dir.as_os_str().is_empty() && !parts.contains(&dir) {
            parts.push(dir);
        }
    }
    let merged = std::env::join_paths(parts)
        .ok()
        .and_then(|value| value.into_string().ok());
    if let Some(merged) = merged {
        if let Some((_, value)) = env.iter_mut().find(|(key, _)| key == "PATH") {
            *value = merged;
        } else {
            env.push(("PATH".into(), merged));
        }
    }
    env
}

fn run_envelope(args: &[String], timeout_ms: u64) -> Result<Value, String> {
    let command = args.first().map(String::as_str).unwrap_or("");
    if !READ_COMMANDS.contains(&command) {
        return Err("不支持的命令".into());
    }
    if command == "comments" && args.get(1).map(String::as_str).unwrap_or("").is_empty() {
        return Err("comments 需要笔记 id".into());
    }

    let Some(bin) = resolve_xhs_bin() else {
        return Err("找不到本机 xhs 命令。请先安装 xiaohongshu-cli，或设置 XHS_BIN。".into());
    };
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let (_code, stdout, stderr) = run_cli(&bin, &arg_refs, timeout_ms)?;
    parse_envelope_value(&stdout, &stderr)
}

pub fn parse_envelope_value(stdout: &str, stderr: &str) -> Result<Value, String> {
    let raw = if extract_json_text(stdout).starts_with(['{', '[']) {
        stdout
    } else {
        stderr
    };
    let json = extract_json_text(raw);
    if json.is_empty() {
        return Err(summarize_cli_output(stderr).unwrap_or_else(|| "xhs 没有返回内容".into()));
    }
    let parsed: Value = match serde_json::from_str(json) {
        Ok(value) => value,
        Err(_) => {
            return Err(summarize_cli_output(stderr)
                .or_else(|| summarize_cli_output(stdout))
                .unwrap_or_else(|| "xhs 输出不是合法 JSON".into()));
        }
    };
    if !parsed.is_object() {
        return Err("xhs 输出不是 JSON 对象".into());
    }
    Ok(parsed)
}

pub fn envelope_error(value: &Value) -> Option<String> {
    if value.get("ok") != Some(&Value::Bool(false)) {
        return None;
    }
    value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
        .or_else(|| Some("xhs 失败".into()))
}

pub fn envelope_code(value: &Value) -> Option<String> {
    value
        .pointer("/error/code")
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub fn notes_from_envelope(envelope: &Value) -> Vec<XhsNoteView> {
    let data = envelope.get("data").unwrap_or(envelope);
    data.get("notes")
        .and_then(Value::as_array)
        .map(|notes| notes.iter().filter_map(note_from_value).collect())
        .unwrap_or_default()
}

fn note_from_value(value: &Value) -> Option<XhsNoteView> {
    let id = value.get("id").and_then(Value::as_str)?.trim();
    if id.is_empty() {
        return None;
    }
    let title = value
        .get("display_title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or("(无标题)");
    let xsec = value
        .get("xsec_token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string);
    Some(XhsNoteView {
        id: id.to_string(),
        title: title.to_string(),
        comments_count: json_int(value.get("comments_count").unwrap_or(&Value::Null)),
        xsec_token: xsec,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XhsCommentView {
    pub id: String,
    pub note_id: String,
    pub author_id: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
    pub content: String,
    pub commented_at: Option<i64>,
    pub ip_location: Option<String>,
    pub like_count: i64,
}

pub fn comments_from_envelope(envelope: &Value, fallback_note_id: &str) -> Vec<XhsCommentView> {
    let data = envelope.get("data").unwrap_or(envelope);
    data.get("comments")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| comment_from_value(item, fallback_note_id))
                .collect()
        })
        .unwrap_or_default()
}

fn comment_from_value(value: &Value, fallback_note_id: &str) -> Option<XhsCommentView> {
    let id = value.get("id").and_then(Value::as_str)?.trim();
    if id.is_empty() {
        return None;
    }
    let user = value.get("user_info").unwrap_or(value);
    let author_id = string_field(user, &["user_id", "id"]);
    if author_id.is_empty() {
        return None;
    }
    let note_id = value
        .get("note_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or(fallback_note_id);
    let create_time = json_int(value.get("create_time").unwrap_or(&Value::Null));
    let commented_at = if create_time <= 0 {
        None
    } else if create_time > 1_000_000_000_000 {
        Some(create_time)
    } else {
        Some(create_time * 1000)
    };
    Some(XhsCommentView {
        id: id.to_string(),
        note_id: note_id.to_string(),
        author_id,
        nickname: string_field(user, &["nickname", "name"]),
        avatar_url: optional_field(user, &["image", "avatar"]),
        content: value
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        commented_at,
        ip_location: optional_field(value, &["ip_location"]),
        like_count: json_int(value.get("like_count").unwrap_or(&Value::Null)),
    })
}

pub fn json_int(value: &Value) -> i64 {
    value
        .as_i64()
        .or_else(|| value.as_u64().map(|number| number as i64))
        .or_else(|| value.as_f64().map(|number| number as i64))
        .or_else(|| value.as_str().and_then(|text| text.trim().parse().ok()))
        .unwrap_or(0)
}

pub(crate) fn run_cli(bin: &Path, args: &[&str], timeout_ms: u64) -> Result<(i32, String, String), String> {
    run_cli_as(bin, args, timeout_ms, "xhs")
}

pub(crate) fn run_cli_as(
    bin: &Path,
    args: &[&str],
    timeout_ms: u64,
    name: &str,
) -> Result<(i32, String, String), String> {
    let mut command = Command::new(bin);
    configure_child(&mut command);
    let mut child = command
        .args(args)
        .envs(sanitize_cli_env())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                format!("找不到本机 {name} 命令")
            } else {
                format!("无法启动 {name}：{error}")
            }
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_handle = thread::spawn(move || read_pipe(stdout));
    let stderr_handle = thread::spawn(move || read_pipe(stderr));

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_handle.join().unwrap_or_default();
                let stderr = stderr_handle.join().unwrap_or_default();
                return Ok((status.code().unwrap_or(-1), stdout, stderr));
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{name} 执行超时"));
            }
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(error) => return Err(format!("等待 {name} 退出失败：{error}")),
        }
    }
}

fn read_pipe<T: Read>(pipe: Option<T>) -> String {
    let mut buf = String::new();
    if let Some(mut reader) = pipe {
        let _ = reader.read_to_string(&mut buf);
    }
    buf
}

pub fn extract_json_text(raw: &str) -> &str {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.starts_with('{') || trimmed.starts_with('[') {
        return trimmed;
    }
    let Some(start) = trimmed.find(['{', '[']) else {
        return trimmed;
    };
    let end_obj = trimmed.rfind('}').unwrap_or(0);
    let end_arr = trimmed.rfind(']').unwrap_or(0);
    let end = end_obj.max(end_arr);
    if end > start {
        &trimmed[start..=end]
    } else {
        trimmed
    }
}

pub fn parse_probe(
    command: &str,
    cli_path: Option<String>,
    stdout: &str,
    stderr: &str,
) -> XhsProbe {
    let raw = if extract_json_text(stdout).starts_with(['{', '[']) {
        stdout
    } else {
        stderr
    };
    let json = extract_json_text(raw);
    if json.is_empty() {
        return XhsProbe::error(
            command,
            summarize_cli_output(stderr).unwrap_or_else(|| "xhs 没有返回内容".into()),
            cli_path,
        );
    }

    let parsed: Value = match serde_json::from_str(json) {
        Ok(value) => value,
        Err(_) => {
            return XhsProbe::error(
                command,
                summarize_cli_output(stderr)
                    .or_else(|| summarize_cli_output(stdout))
                    .unwrap_or_else(|| "xhs 输出不是合法 JSON".into()),
                cli_path,
            );
        }
    };
    if !parsed.is_object() {
        return XhsProbe::error(command, "xhs 输出不是 JSON 对象".into(), cli_path);
    }

    if parsed.get("ok") == Some(&Value::Bool(false)) {
        return probe_from_failure(command, cli_path, &parsed);
    }

    if command == "logout" {
        return XhsProbe {
            kind: "logged_out".into(),
            command: command.into(),
            message: "已退出登录。".into(),
            cli_path,
            user: None,
        };
    }

    let data = parsed.get("data").cloned().unwrap_or(parsed);
    match user_from_data(&data) {
        Ok(user) => XhsProbe::logged_in(command, cli_path, user),
        Err(ProbeMapError::LoggedOut) => XhsProbe::logged_out(command, cli_path),
        Err(ProbeMapError::Invalid(message)) => XhsProbe::error(command, message, cli_path),
    }
}

enum ProbeMapError {
    LoggedOut,
    Invalid(String),
}

fn probe_from_failure(command: &str, cli_path: Option<String>, envelope: &Value) -> XhsProbe {
    let code = envelope
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or("");
    let detail = envelope
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| envelope.get("message").and_then(Value::as_str))
        .unwrap_or("");

    match code {
        "not_authenticated" => XhsProbe::logged_out(command, cli_path),
        "verification_required" => {
            XhsProbe::error(command, "需要在弹出的浏览器里完成验证。".into(), cli_path)
        }
        "ip_blocked" => XhsProbe::error(command, "当前网络被限制，请稍后再试。".into(), cli_path),
        _ if is_logged_out_message(detail) => XhsProbe::logged_out(command, cli_path),
        _ => XhsProbe::error(
            command,
            if detail.is_empty() {
                format!("xhs {command} 失败")
            } else {
                humanize_cli_message(detail)
            },
            cli_path,
        ),
    }
}

fn user_from_data(data: &Value) -> Result<XhsUserView, ProbeMapError> {
    if data.get("authenticated") == Some(&Value::Bool(false)) {
        return Err(ProbeMapError::LoggedOut);
    }

    let user = data.get("user").unwrap_or(data);
    if !user.is_object() {
        return Err(ProbeMapError::Invalid("status 缺少 user".into()));
    }
    if user.get("guest") == Some(&Value::Bool(true)) {
        return Err(ProbeMapError::LoggedOut);
    }

    let xhs_user_id = string_field(user, &["id", "user_id", "userid"]);
    if xhs_user_id.is_empty() {
        return if data.get("authenticated") == Some(&Value::Bool(true)) {
            Err(ProbeMapError::Invalid("status 缺少 user.id".into()))
        } else {
            Err(ProbeMapError::LoggedOut)
        };
    }

    let nickname = string_field(user, &["nickname", "name"]);
    if nickname == "Unknown" {
        return Err(ProbeMapError::LoggedOut);
    }

    Ok(XhsUserView {
        xhs_user_id,
        red_id: optional_field(user, &["red_id", "username"]),
        nickname,
        bio: optional_field(user, &["desc", "bio"]),
    })
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or("")
        .to_string()
}

fn optional_field(value: &Value, keys: &[&str]) -> Option<String> {
    let text = string_field(value, keys);
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn is_logged_out_message(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("not_authenticated")
        || lower.contains("not logged")
        || lower.contains("session expired")
        || message.contains("未登录")
}

fn humanize_cli_message(raw: &str) -> String {
    let trimmed = raw.trim();
    if is_logged_out_message(trimmed) {
        return "未登录，或登录已过期。".into();
    }
    if trimmed.chars().count() > 160 {
        let cut: String = trimmed.chars().take(157).collect();
        format!("{cut}…")
    } else {
        trimmed.to_string()
    }
}

fn summarize_cli_output(raw: &str) -> Option<String> {
    let lines: Vec<&str> = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let picked = lines.iter().rev().find(|line| {
        line.contains("Error") || line.contains("Exception") || line.contains("Failed")
    });
    picked
        .or(lines.last())
        .map(|line| humanize_cli_message(line))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_json_after_logs() {
        let raw = "debug line\n{\"ok\":true,\"data\":{\"authenticated\":true}}\n";
        assert_eq!(
            extract_json_text(raw),
            "{\"ok\":true,\"data\":{\"authenticated\":true}}"
        );
    }

    #[test]
    fn maps_not_authenticated_to_logged_out() {
        let stdout = r#"{"ok":false,"schema_version":"1","error":{"code":"not_authenticated","message":"Session expired"}}"#;
        let probe = parse_probe("status", Some("/bin/xhs".into()), stdout, "");
        assert_eq!(probe.kind, "logged_out");
        assert_eq!(probe.message, "未登录，或登录已过期。");
        assert!(probe.user.is_none());
    }

    #[test]
    fn maps_status_user() {
        let stdout = r#"{
            "ok": true,
            "data": {
                "authenticated": true,
                "user": {
                    "id": "u1",
                    "red_id": "114",
                    "nickname": "Melrain",
                    "desc": "bio"
                }
            }
        }"#;
        let probe = parse_probe("status", Some("/bin/xhs".into()), stdout, "");
        assert_eq!(probe.kind, "logged_in");
        let user = probe.user.expect("user");
        assert_eq!(user.xhs_user_id, "u1");
        assert_eq!(user.red_id.as_deref(), Some("114"));
        assert_eq!(user.nickname, "Melrain");
        assert_eq!(user.bio.as_deref(), Some("bio"));
    }

    #[test]
    fn maps_whoami_user_wrapper() {
        let stdout = r#"{"ok":true,"data":{"user":{"id":"u2","nickname":"Ada"}}}"#;
        let probe = parse_probe("whoami", None, stdout, "");
        assert_eq!(probe.kind, "logged_in");
        assert_eq!(probe.user.unwrap().nickname, "Ada");
    }

    #[test]
    fn treats_guest_as_logged_out() {
        let stdout = r#"{"ok":true,"data":{"authenticated":true,"user":{"id":"g1","guest":true,"nickname":"Unknown"}}}"#;
        let probe = parse_probe("status", None, stdout, "");
        assert_eq!(probe.kind, "logged_out");
    }

    #[test]
    fn lists_notes_from_envelope() {
        let value = serde_json::json!({
            "ok": true,
            "data": {
                "notes": [
                    { "id": "n1", "display_title": "标题", "comments_count": 12.0, "xsec_token": "tok" },
                    { "id": "", "display_title": "空" }
                ]
            }
        });
        let notes = notes_from_envelope(&value);
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, "n1");
        assert_eq!(notes[0].comments_count, 12);
        assert_eq!(notes[0].xsec_token.as_deref(), Some("tok"));
    }

    #[test]
    fn parses_comments_from_envelope() {
        let value = serde_json::json!({
            "ok": true,
            "data": {
                "comments": [
                    {
                        "id": "c1",
                        "note_id": "n1",
                        "content": "多少钱",
                        "create_time": 1752580535000_i64,
                        "ip_location": "上海",
                        "like_count": "3",
                        "user_info": { "user_id": "u2", "nickname": "Ada", "image": "https://img" }
                    },
                    { "id": "", "content": "空" }
                ]
            }
        });
        let comments = comments_from_envelope(&value, "fallback");
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, "c1");
        assert_eq!(comments[0].note_id, "n1");
        assert_eq!(comments[0].nickname, "Ada");
        assert_eq!(comments[0].commented_at, Some(1752580535000));
        assert_eq!(comments[0].like_count, 3);
    }

    #[test]
    fn wraps_digit_note_id_as_explore_url() {
        assert_eq!(
            comments_note_ref("687514080000000015020143"),
            "https://www.xiaohongshu.com/explore/687514080000000015020143"
        );
        assert_eq!(comments_note_ref("64ab"), "64ab");
        assert_eq!(
            comments_command("687514080000000015020143", Some(" tok "))[1],
            "https://www.xiaohongshu.com/explore/687514080000000015020143"
        );
    }

    #[test]
    fn parses_envelope_from_stdout() {
        let value = parse_envelope_value(r#"{"ok":true,"data":{"notes":[]}}"#, "").unwrap();
        assert_eq!(value["ok"], Value::Bool(true));
        assert!(envelope_error(&value).is_none());
    }

    #[test]
    fn surfaces_click_usage_when_json_missing() {
        let err = parse_envelope_value(
            "",
            "Usage: xhs comments [OPTIONS] ID_OR_URL\n\nError: Index 687514080000000015020143 not found — run a listing command first",
        )
        .unwrap_err();
        assert!(err.contains("Index 687514080000000015020143"));
    }

    #[test]
    fn maps_failed_envelope_message() {
        let value = parse_envelope_value(
            r#"{"ok":false,"error":{"code":"not_authenticated","message":"Session expired"}}"#,
            "",
        )
        .unwrap();
        assert_eq!(envelope_error(&value).as_deref(), Some("Session expired"));
    }

    #[test]
    fn maps_logout_success() {
        let probe = parse_probe(
            "logout",
            Some("/bin/xhs".into()),
            r#"{"ok":true,"data":{"logged_out":true}}"#,
            "",
        );
        assert_eq!(probe.kind, "logged_out");
        assert_eq!(probe.message, "已退出登录。");
    }

    #[test]
    fn python_user_dirs_tolerate_missing_home_layout() {
        let dirs = python_user_bin_dirs(&std::env::temp_dir().join("xhs-no-python-home"));
        assert!(dirs.is_empty());
    }

    #[test]
    fn skips_microsoft_store_python_aliases() {
        assert!(is_windows_apps_alias(Path::new(
            r"C:\Users\me\AppData\Local\Microsoft\WindowsApps\python.exe"
        )));
        assert!(!is_windows_apps_alias(Path::new(
            r"C:\Users\me\AppData\Local\Programs\Python\Python312\python.exe"
        )));
    }
}
