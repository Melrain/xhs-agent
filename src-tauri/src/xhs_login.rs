use crate::xhs::{configure_child, resolve_companion_python, sanitize_cli_env};
use serde::Serialize;
use serde_json::Value;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const QR_TIMEOUT_MS: u64 = 240_000;
pub const QR_CREATE_TIMEOUT_MS: u64 = 60_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QrEvent {
    Ready,
    Hint { message: String },
    Qr { url: String },
    Scanned,
    Confirming,
    Confirmed,
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XhsQrSessionView {
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qr_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl XhsQrSessionView {
    fn idle() -> Self {
        Self {
            phase: "idle".into(),
            session_id: None,
            qr_url: None,
            expires_at: None,
            message: None,
        }
    }
}

struct LoginInner {
    view: XhsQrSessionView,
    settled: bool,
    pid: Option<u32>,
    stderr_tail: String,
}

#[derive(Clone)]
pub struct XhsLogin {
    pair: Arc<(Mutex<LoginInner>, Condvar)>,
}

impl XhsLogin {
    pub fn new() -> Self {
        Self {
            pair: Arc::new((
                Mutex::new(LoginInner {
                    view: XhsQrSessionView::idle(),
                    settled: true,
                    pid: None,
                    stderr_tail: String::new(),
                }),
                Condvar::new(),
            )),
        }
    }

    pub fn start(&self, app: &AppHandle) -> Result<XhsQrSessionView, String> {
        self.dispose(Some("已开始新的扫码会话"));

        let python = resolve_companion_python()?;
        let helper = resolve_helper_path(app)?;
        let timeout_ms = env_millis("XHS_QR_TIMEOUT_MS", QR_TIMEOUT_MS);
        let create_ms = env_millis("XHS_QR_CREATE_TIMEOUT_MS", QR_CREATE_TIMEOUT_MS);
        let mut env = login_env();
        assert_desktop(&env)?;

        let session_id = new_session_id();
        let expires_at = rfc3339_from_now_ms(timeout_ms);
        let timeout_s = (timeout_ms / 1000).max(1).to_string();

        let mut command = Command::new(&python);
        configure_child(&mut command);
        let mut child = command
            .arg(&helper)
            .arg("--timeout-s")
            .arg(&timeout_s)
            .envs(env.drain(..))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("无法启动扫码进程：{error}"))?;

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let (lock, cond) = &*self.pair;
            let mut inner = lock.lock().map_err(|_| "扫码状态锁损坏")?;
            inner.view = XhsQrSessionView {
                phase: "waiting".into(),
                session_id: Some(session_id.clone()),
                qr_url: None,
                expires_at: Some(expires_at),
                message: Some("正在打开桌面浏览器…".into()),
            };
            inner.settled = false;
            inner.pid = Some(pid);
            inner.stderr_tail.clear();
            cond.notify_all();
        }

        spawn_line_reader(self.clone(), stdout, false);
        spawn_line_reader(self.clone(), stderr, true);
        spawn_exit_waiter(self.clone(), child, session_id.clone());

        self.wait_until_ready(&session_id, create_ms)
    }

    pub fn status(&self) -> XhsQrSessionView {
        let (lock, cond) = &*self.pair;
        let Ok(mut inner) = lock.lock() else {
            return XhsQrSessionView::idle();
        };
        inner.view = expire_if_needed(inner.view.clone(), now_ms());
        if inner.view.phase == "expired" {
            let pid = inner.pid.take();
            cond.notify_all();
            drop(inner);
            if let Some(pid) = pid {
                terminate_pid(pid);
            }
            let Ok(inner) = lock.lock() else {
                return XhsQrSessionView {
                    phase: "expired".into(),
                    message: Some("桌面扫码已超时，请重新登录".into()),
                    ..XhsQrSessionView::idle()
                };
            };
            return inner.view.clone();
        }
        inner.view.clone()
    }

    pub fn cancel(&self) -> XhsQrSessionView {
        self.dispose(None);
        XhsQrSessionView::idle()
    }

    pub fn is_busy(&self) -> bool {
        matches!(
            self.status().phase.as_str(),
            "waiting" | "scanned" | "confirming"
        )
    }

    fn wait_until_ready(
        &self,
        session_id: &str,
        create_ms: u64,
    ) -> Result<XhsQrSessionView, String> {
        let (lock, cond) = &*self.pair;
        let mut inner = lock.lock().map_err(|_| "扫码状态锁损坏")?;
        let deadline = Instant::now() + Duration::from_millis(create_ms);
        while !inner.settled && inner.view.session_id.as_deref() == Some(session_id) {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            let (next, wait) = cond
                .wait_timeout(inner, deadline.saturating_duration_since(now))
                .map_err(|_| "扫码状态锁损坏")?;
            inner = next;
            if wait.timed_out() {
                break;
            }
        }

        if inner.view.session_id.as_deref() != Some(session_id) {
            return Err("已开始新的扫码会话".into());
        }

        if !inner.settled {
            inner.view.phase = "error".into();
            inner.view.message = Some("打开桌面浏览器超时".into());
            inner.settled = true;
            let pid = inner.pid.take();
            let view = inner.view.clone();
            cond.notify_all();
            drop(inner);
            if let Some(pid) = pid {
                terminate_pid(pid);
            }
            return Err(view.message.unwrap_or_else(|| "打开桌面浏览器超时".into()));
        }

        if inner.view.phase == "error" {
            return Err(inner
                .view
                .message
                .clone()
                .unwrap_or_else(|| "无法开始小红书桌面扫码".into()));
        }

        Ok(inner.view.clone())
    }

    fn apply_event(&self, event: QrEvent) {
        let (lock, cond) = &*self.pair;
        let Ok(mut inner) = lock.lock() else {
            return;
        };
        inner.view = apply_qr_event(inner.view.clone(), event.clone());
        inner.settled = true;
        if matches!(event, QrEvent::Error { .. }) {
            // keep running process until dispose; helper usually exits itself
        }
        cond.notify_all();
    }

    fn dispose(&self, error_message: Option<&str>) {
        let (lock, cond) = &*self.pair;
        let Ok(mut inner) = lock.lock() else {
            return;
        };
        if let Some(message) = error_message {
            if inner.view.phase != "confirmed" && inner.view.phase != "expired" {
                inner.view.phase = "error".into();
                inner.view.message = Some(message.into());
            }
        } else {
            inner.view = XhsQrSessionView::idle();
        }
        inner.settled = true;
        let pid = inner.pid.take();
        cond.notify_all();
        drop(inner);
        if let Some(pid) = pid {
            terminate_pid(pid);
        }
    }
}

fn spawn_line_reader<T>(login: XhsLogin, pipe: Option<T>, is_stderr: bool)
where
    T: Read + Send + 'static,
{
    let Some(pipe) = pipe else {
        return;
    };
    thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    let line = decode_process_line(&buf);
                    if is_stderr {
                        let (lock, _) = &*login.pair;
                        if let Ok(mut inner) = lock.lock() {
                            inner.stderr_tail = format!("{}{}\n", inner.stderr_tail, line);
                            if inner.stderr_tail.len() > 2000 {
                                let drain = inner.stderr_tail.len() - 2000;
                                inner.stderr_tail.drain(..drain);
                            }
                        }
                    }
                    if let Some(event) = parse_login_output(&line) {
                        login.apply_event(event);
                    }
                }
                Err(_) => break,
            }
        }
    });
}

/// Windows 上 Python 可能按 GBK 写出中文行。`BufRead::lines()` 遇到非法 UTF-8 会整段停掉，
/// 后面的 `confirmed` 就丢了，界面会一直不能 adopt session。
fn decode_process_line(raw: &[u8]) -> String {
    String::from_utf8_lossy(raw).trim().to_string()
}

fn phase_after_helper_exit(phase: &str, code: Option<i32>, settled: bool) -> Option<&'static str> {
    if code == Some(0) && settled && matches!(phase, "waiting" | "scanned" | "confirming") {
        Some("confirmed")
    } else {
        None
    }
}

fn spawn_exit_waiter(login: XhsLogin, mut child: std::process::Child, session_id: String) {
    thread::spawn(move || {
        let code = child.wait().ok().and_then(|status| status.code());
        let (lock, cond) = &*login.pair;
        let Ok(mut inner) = lock.lock() else {
            return;
        };
        if inner.view.session_id.as_deref() != Some(session_id.as_str()) {
            return;
        }
        inner.pid = None;
        if inner.view.phase == "confirmed" || inner.view.phase == "expired" {
            inner.settled = true;
            cond.notify_all();
            return;
        }
        if inner.view.phase == "error" {
            inner.settled = true;
            cond.notify_all();
            return;
        }
        if phase_after_helper_exit(&inner.view.phase, code, inner.settled) == Some("confirmed") {
            inner.view = apply_qr_event(inner.view.clone(), QrEvent::Confirmed);
            inner.settled = true;
            cond.notify_all();
            return;
        }
        let stderr = inner.stderr_tail.trim().to_string();
        inner.view.phase = "error".into();
        inner.view.message = Some(if !stderr.is_empty() {
            stderr
        } else if inner.settled {
            if code.unwrap_or(0) != 0 {
                format!("扫码进程退出 {}", code.unwrap_or(0))
            } else {
                "扫码已中断，SESSION 未写入".into()
            }
        } else {
            "扫码进程在出码前退出".into()
        });
        inner.settled = true;
        cond.notify_all();
    });
}

fn login_env() -> Vec<(String, String)> {
    let mut env = sanitize_cli_env();
    upsert_env(&mut env, "PYTHONUNBUFFERED", "1".into());
    if let Ok(display) = std::env::var("XHS_DISPLAY") {
        let display = display.trim();
        if !display.is_empty() {
            upsert_env(&mut env, "DISPLAY", display.into());
        }
    }
    env
}

fn upsert_env(env: &mut Vec<(String, String)>, key: &str, value: String) {
    if let Some((_, current)) = env.iter_mut().find(|(item, _)| item == key) {
        *current = value;
    } else {
        env.push((key.into(), value));
    }
}

fn assert_desktop(env: &[(String, String)]) -> Result<(), String> {
    if cfg!(any(target_os = "macos", target_os = "windows")) {
        return Ok(());
    }
    let has_display = env.iter().any(|(key, value)| {
        (key == "DISPLAY" || key == "WAYLAND_DISPLAY") && !value.trim().is_empty()
    });
    if has_display {
        return Ok(());
    }
    Err("未检测到桌面（DISPLAY / WAYLAND_DISPLAY）。请在本机图形会话里启动，或设置 XHS_DISPLAY=:0".into())
}

fn resolve_helper_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("XHS_QR_HELPER") {
        let path = PathBuf::from(explicit.trim());
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("找不到扫码脚本：{}", path.display()));
    }

    if let Ok(path) = app
        .path()
        .resolve("xhs_qr_login.py", tauri::path::BaseDirectory::Resource)
    {
        if path.is_file() {
            return Ok(path);
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        for candidate in [
            dir.join("xhs_qr_login.py"),
            dir.join("resources/xhs_qr_login.py"),
        ] {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for candidate in [
        manifest.join("resources/xhs_qr_login.py"),
        manifest.join("../scripts/xhs_qr_login.py"),
    ] {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("找不到扫码脚本 xhs_qr_login.py".into())
}

fn terminate_pid(pid: u32) {
    if cfg!(windows) {
        let mut command = Command::new("taskkill");
        configure_child(&mut command);
        let _ = command.args(["/PID", &pid.to_string(), "/T", "/F"]).status();
        return;
    }
    let _ = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status();
    thread::sleep(Duration::from_millis(200));
    let _ = Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .status();
}

fn env_millis(key: &str, fallback: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn new_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn rfc3339_from_now_ms(offset_ms: u64) -> String {
    rfc3339_from_millis(now_ms() + offset_ms as i64)
}

fn rfc3339_from_millis(ms: i64) -> String {
    let seconds = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000) as u32;
    let Some(datetime) = chrono::DateTime::from_timestamp(seconds, millis * 1_000_000) else {
        return String::new();
    };
    datetime.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn parse_millis(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.timestamp_millis())
}

pub fn parse_qr_event(line: &str) -> Option<QrEvent> {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return None;
    }
    let parsed: Value = serde_json::from_str(trimmed).ok()?;
    let record = parsed.as_object()?;
    match record.get("event").and_then(Value::as_str) {
        Some("qr") => {
            let url = record
                .get("url")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|url| !url.is_empty())?;
            Some(QrEvent::Qr { url: url.into() })
        }
        Some("ready") => Some(QrEvent::Ready),
        Some("scanned") => Some(QrEvent::Scanned),
        Some("confirming") => Some(QrEvent::Confirming),
        Some("confirmed") => Some(QrEvent::Confirmed),
        Some("hint") => {
            let message = message_from_value(record.get("message"), "")?;
            if message.is_empty() {
                None
            } else {
                Some(QrEvent::Hint { message })
            }
        }
        Some("error") => Some(QrEvent::Error {
            message: message_from_value(record.get("message"), "小红书扫码失败")
                .unwrap_or_else(|| "小红书扫码失败".into()),
        }),
        _ => parse_cli_json(record),
    }
}

fn parse_cli_json(record: &serde_json::Map<String, Value>) -> Option<QrEvent> {
    if record.get("ok") == Some(&Value::Bool(true)) {
        if let Some(data) = record.get("data").and_then(Value::as_object) {
            if data.get("authenticated") == Some(&Value::Bool(true)) {
                if let Some(user) = data.get("user").and_then(Value::as_object) {
                    if user.get("guest") == Some(&Value::Bool(true)) {
                        return None;
                    }
                }
                return Some(QrEvent::Confirmed);
            }
        }
        if record.get("authenticated") == Some(&Value::Bool(true)) {
            return Some(QrEvent::Confirmed);
        }
        return None;
    }
    if record.get("ok") == Some(&Value::Bool(false)) {
        let message = record
            .get("error")
            .and_then(Value::as_object)
            .and_then(|error| message_from_value(error.get("message"), "xhs login 失败"))
            .or_else(|| message_from_value(record.get("message"), "xhs login 失败"))
            .unwrap_or_else(|| "xhs login 失败".into());
        return Some(QrEvent::Error { message });
    }
    None
}

pub fn parse_login_output(line: &str) -> Option<QrEvent> {
    if let Some(event) = parse_qr_event(line) {
        return Some(event);
    }
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if (lower.contains("starting") && lower.contains("qr"))
        || lower.contains("scan the qr code")
        || lower.contains("waiting for qr code scan")
    {
        return Some(QrEvent::Ready);
    }
    if lower.contains("scanned!") {
        return Some(QrEvent::Scanned);
    }
    if lower.contains("login confirmed") {
        return Some(QrEvent::Confirming);
    }
    if lower.contains("logged in as") || lower.contains("session saved") {
        return Some(QrEvent::Confirmed);
    }
    let failed = lower.contains("qr login failed")
        || lower.contains("qr code login timed out")
        || lower.contains("failed to load xiaohongshu")
        || lower.contains("browser-assisted qr login");
    let severe =
        lower.contains("failed") || lower.contains("timed out") || lower.contains("unable") || lower.contains("missing");
    if failed && severe && !lower.contains("starting browser-assisted") {
        return Some(QrEvent::Error {
            message: trimmed.into(),
        });
    }
    None
}

pub fn apply_qr_event(state: XhsQrSessionView, event: QrEvent) -> XhsQrSessionView {
    if state.phase == "confirmed" || state.phase == "expired" {
        return state;
    }
    match event {
        QrEvent::Ready => XhsQrSessionView {
            phase: "waiting".into(),
            message: Some("请在桌面弹出的浏览器窗口里扫码".into()),
            ..state
        },
        QrEvent::Hint { message } => XhsQrSessionView {
            message: Some(message),
            ..state
        },
        QrEvent::Qr { url } => XhsQrSessionView {
            phase: "waiting".into(),
            qr_url: Some(url),
            message: None,
            ..state
        },
        QrEvent::Scanned => XhsQrSessionView {
            phase: "scanned".into(),
            message: None,
            ..state
        },
        QrEvent::Confirming => XhsQrSessionView {
            phase: "confirming".into(),
            message: None,
            ..state
        },
        QrEvent::Confirmed => XhsQrSessionView {
            phase: "confirmed".into(),
            message: None,
            ..state
        },
        QrEvent::Error { message } => XhsQrSessionView {
            phase: "error".into(),
            message: Some(message),
            ..state
        },
    }
}

pub fn expire_if_needed(state: XhsQrSessionView, now_ms: i64) -> XhsQrSessionView {
    if state.phase != "waiting" && state.phase != "scanned" {
        return state;
    }
    let Some(expires_at) = state.expires_at.as_deref() else {
        return state;
    };
    let Some(expires) = parse_millis(expires_at) else {
        return state;
    };
    if expires > now_ms {
        return state;
    }
    XhsQrSessionView {
        phase: "expired".into(),
        message: Some("桌面扫码已超时，请重新登录".into()),
        ..state
    }
}

fn message_from_value(value: Option<&Value>, fallback: &str) -> Option<String> {
    match value.and_then(Value::as_str).map(str::trim).filter(|text| !text.is_empty()) {
        Some(text) => Some(text.to_string()),
        None if fallback.is_empty() => None,
        None => Some(fallback.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qr_helper_aligns_camoufox_to_the_host() {
        let source = include_str!("../resources/xhs_qr_login.py");
        assert!(
            source.contains("Camoufox(**camoufox_launch_kwargs())"),
            "QR login must launch Camoufox from host-aligned kwargs, not a random fingerprint"
        );
        assert!(source.contains("zh-CN"));
        assert!(source.contains("if platform == \"win32\":"));
        assert!(source.contains("return \"windows\""));
    }

    #[test]
    fn reads_a_qr_url() {
        assert_eq!(
            parse_qr_event(r#"{"event":"qr","url":"https://example.com/q"}"#),
            Some(QrEvent::Qr {
                url: "https://example.com/q".into()
            })
        );
    }

    #[test]
    fn ignores_noise_and_empty_urls() {
        assert_eq!(parse_qr_event("debug line"), None);
        assert_eq!(parse_qr_event(r#"{"event":"qr","url":"  "}"#), None);
    }

    #[test]
    fn reads_scanned_confirmed_and_error() {
        assert_eq!(parse_qr_event(r#"{"event":"scanned"}"#), Some(QrEvent::Scanned));
        assert_eq!(
            parse_qr_event(r#"{"event":"confirming"}"#),
            Some(QrEvent::Confirming)
        );
        assert_eq!(
            parse_qr_event(r#"{"event":"confirmed"}"#),
            Some(QrEvent::Confirmed)
        );
        assert_eq!(
            parse_qr_event(r#"{"event":"error"}"#),
            Some(QrEvent::Error {
                message: "小红书扫码失败".into()
            })
        );
    }

    #[test]
    fn reads_official_xhs_json_envelopes() {
        assert_eq!(
            parse_qr_event(r#"{"ok":true,"data":{"authenticated":true}}"#),
            Some(QrEvent::Confirmed)
        );
        assert_eq!(
            parse_qr_event(r#"{"ok":true,"data":{"authenticated":true,"user":{"guest":true}}}"#),
            None
        );
        assert_eq!(
            parse_qr_event(r#"{"ok":false,"error":{"message":"QR login failed: captcha"}}"#),
            Some(QrEvent::Error {
                message: "QR login failed: captcha".into()
            })
        );
    }

    #[test]
    fn reads_a_captcha_hint() {
        assert_eq!(
            parse_qr_event(r#"{"event":"hint","message":"请在桌面浏览器窗口里完成"}"#),
            Some(QrEvent::Hint {
                message: "请在桌面浏览器窗口里完成".into()
            })
        );
    }

    #[test]
    fn reads_official_cli_status_lines() {
        assert_eq!(
            parse_login_output("🔑 Starting browser-assisted QR login..."),
            Some(QrEvent::Ready)
        );
        assert_eq!(
            parse_login_output("📲 Scanned! Waiting for confirmation..."),
            Some(QrEvent::Scanned)
        );
        assert_eq!(
            parse_login_output("✅ Login confirmed!"),
            Some(QrEvent::Confirming)
        );
        assert_eq!(
            parse_login_output("Logged in as: Ada (ID: 123)"),
            Some(QrEvent::Confirmed)
        );
        assert_eq!(
            parse_login_output("QR code login timed out after 4 minutes"),
            Some(QrEvent::Error {
                message: "QR code login timed out after 4 minutes".into()
            })
        );
    }

    #[test]
    fn moves_through_qr_scanned_confirmed() {
        let base = XhsQrSessionView {
            phase: "waiting".into(),
            session_id: Some("s1".into()),
            qr_url: None,
            expires_at: None,
            message: None,
        };
        let with_qr = apply_qr_event(
            base,
            QrEvent::Qr {
                url: "https://q".into(),
            },
        );
        assert_eq!(with_qr.phase, "waiting");
        assert_eq!(with_qr.qr_url.as_deref(), Some("https://q"));
        assert_eq!(apply_qr_event(with_qr.clone(), QrEvent::Scanned).phase, "scanned");
        assert_eq!(
            apply_qr_event(with_qr.clone(), QrEvent::Confirming).phase,
            "confirming"
        );
        assert_eq!(
            apply_qr_event(with_qr, QrEvent::Confirmed).phase,
            "confirmed"
        );
    }

    #[test]
    fn keeps_phase_when_hint_arrives() {
        let hinted = apply_qr_event(
            XhsQrSessionView {
                phase: "waiting".into(),
                session_id: Some("s1".into()),
                ..XhsQrSessionView::idle()
            },
            QrEvent::Hint {
                message: "请在桌面浏览器窗口里完成".into(),
            },
        );
        assert_eq!(hinted.phase, "waiting");
        assert_eq!(hinted.message.as_deref(), Some("请在桌面浏览器窗口里完成"));
    }

    #[test]
    fn does_not_regress_confirmed_or_expired() {
        let confirmed = apply_qr_event(
            XhsQrSessionView {
                phase: "waiting".into(),
                session_id: Some("s1".into()),
                ..XhsQrSessionView::idle()
            },
            QrEvent::Confirmed,
        );
        assert_eq!(
            apply_qr_event(confirmed.clone(), QrEvent::Scanned).phase,
            "confirmed"
        );
        assert_eq!(
            apply_qr_event(
                confirmed,
                QrEvent::Error {
                    message: "x".into()
                }
            )
            .phase,
            "confirmed"
        );
        assert_eq!(
            apply_qr_event(
                XhsQrSessionView {
                    phase: "expired".into(),
                    ..XhsQrSessionView::idle()
                },
                QrEvent::Scanned
            )
            .phase,
            "expired"
        );
    }

    #[test]
    fn expires_a_waiting_session_past_expires_at() {
        let expires_at = "2026-01-01T00:00:00.000Z";
        let expired = expire_if_needed(
            XhsQrSessionView {
                phase: "waiting".into(),
                expires_at: Some(expires_at.into()),
                ..XhsQrSessionView::idle()
            },
            parse_millis(expires_at).expect("rfc3339") + 1000,
        );
        assert_eq!(expired.phase, "expired");
        assert!(expired.message.unwrap().contains("超时"));
    }

    #[test]
    fn leaves_confirmed_sessions_alone() {
        assert_eq!(
            expire_if_needed(
                XhsQrSessionView {
                    phase: "confirmed".into(),
                    expires_at: Some("2020-01-01T00:00:00.000Z".into()),
                    ..XhsQrSessionView::idle()
                },
                now_ms(),
            )
            .phase,
            "confirmed"
        );
    }

    #[test]
    fn does_not_expire_a_confirming_session() {
        assert_eq!(
            expire_if_needed(
                XhsQrSessionView {
                    phase: "confirming".into(),
                    expires_at: Some("2020-01-01T00:00:00.000Z".into()),
                    ..XhsQrSessionView::idle()
                },
                now_ms(),
            )
            .phase,
            "confirming"
        );
    }

    #[test]
    fn keeps_reading_after_a_non_utf8_line() {
        let gbk_hint = [0x7B, 0x7D, 0xC4, 0xE3]; // "{}" + GBK byte
        let mixed = [gbk_hint.as_slice(), b"\n{\"event\":\"confirmed\"}\n"].concat();
        let lines: Vec<String> = mixed
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .map(decode_process_line)
            .collect();
        assert_eq!(lines.last().map(String::as_str), Some(r#"{"event":"confirmed"}"#));
        assert_eq!(parse_login_output(lines.last().unwrap()), Some(QrEvent::Confirmed));
    }

    #[test]
    fn treats_clean_exit_during_confirming_as_confirmed() {
        assert_eq!(
            phase_after_helper_exit("confirming", Some(0), true),
            Some("confirmed")
        );
        assert_eq!(phase_after_helper_exit("scanned", Some(0), true), Some("confirmed"));
        assert_eq!(phase_after_helper_exit("waiting", Some(0), true), Some("confirmed"));
        assert_eq!(phase_after_helper_exit("waiting", Some(0), false), None);
        assert_eq!(phase_after_helper_exit("confirming", Some(1), true), None);
    }
}
