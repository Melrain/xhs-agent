//! 本机 Grok CLI：preflight + 真实 analyze（ffmpeg / whisper / grok）。
//! 失败必须明示，禁止静默 stub 当成功。

use crate::xhs::resolve_named_bin;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const PROBE_TIMEOUT_MS: u64 = 8_000;
const FFMPEG_TIMEOUT_MS: u64 = 60_000;
const WHISPER_TIMEOUT_MS: u64 = 120_000;
const GROK_TIMEOUT_MS: u64 = 380_000;
const FILM_FRAME_CAP: usize = 16;
const FILM_MEDIA_MAX_BYTES: u64 = 80 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmLocalGrokPreflight {
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bin: Option<String>,
    pub auth_file: bool,
    pub auth_ok: bool,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ffmpeg_ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub whisper_ok: Option<bool>,
    pub source: String,
    /// 本机 analyze 是否可跑（工具 + 接线就绪）。
    pub analyze_ready: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmLocalAnalyzeInput {
    pub project_id: String,
    pub ref_id: String,
    #[serde(default)]
    pub media_path: Option<String>,
    #[serde(default)]
    pub media_url: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub reference_source: Option<String>,
    #[serde(default)]
    pub reference_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmLocalBreakdownCard {
    pub id: String,
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmLocalAnalyzeResult {
    pub items: Vec<FilmLocalBreakdownCard>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_body: Option<String>,
    /// cli | local — 本机真实 grok CLI 用 local（也可用 cli）
    pub mode: String,
    pub had_frames: bool,
    pub had_transcript: bool,
    pub blocked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmLocalCacheMediaInput {
    pub project_id: String,
    pub ref_id: String,
    pub filename: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilmLocalCacheMediaResult {
    pub path: String,
}

pub fn probe_local_grok() -> FilmLocalGrokPreflight {
    let grok_bin = resolve_grok_bin();
    let auth_path = grok_auth_path();
    let auth_file = auth_path.as_ref().map(|p| p.is_file()).unwrap_or(false);
    let auth_ok = auth_file && auth_looks_ok(auth_path.as_deref());
    let ffmpeg_ok = Some(resolve_ffmpeg_bin().is_some());
    let whisper_ok = Some(resolve_whisper_bin().is_some());

    let (installed, bin, bin_note) = match grok_bin {
        Some(path) => {
            let path_str = path.display().to_string();
            match probe_grok_binary(&path) {
                Ok(()) => (true, Some(path_str), None),
                Err(err) => (
                    false,
                    Some(path_str),
                    Some(format!("找到 grok 但无法执行：{err}")),
                ),
            }
        }
        None => (false, None, Some("未找到本机 grok（PATH / ~/.grok/bin）".to_string())),
    };

    let analyze_ready = installed && auth_ok && ffmpeg_ok != Some(false);
    let detail = compose_detail(
        installed,
        auth_file,
        auth_ok,
        ffmpeg_ok,
        whisper_ok,
        analyze_ready,
        bin_note.as_deref(),
    );

    FilmLocalGrokPreflight {
        installed,
        bin,
        auth_file,
        auth_ok,
        detail,
        ffmpeg_ok,
        whisper_ok,
        source: "local".into(),
        analyze_ready,
    }
}

pub fn cache_local_media(input: FilmLocalCacheMediaInput) -> Result<FilmLocalCacheMediaResult, String> {
    if input.bytes.is_empty() {
        return Err("空文件".into());
    }
    if input.bytes.len() as u64 > FILM_MEDIA_MAX_BYTES {
        return Err("参考片超过 80MB".into());
    }
    let ext = Path::new(&input.filename)
        .extension()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| format!(".{s}"))
        .unwrap_or_else(|| ".mp4".into());
    let dest = film_work_dir(&input.project_id, &input.ref_id).join(format!("source{ext}"));
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    fs::write(&dest, &input.bytes).map_err(|e| format!("写入媒体失败：{e}"))?;
    Ok(FilmLocalCacheMediaResult {
        path: dest.display().to_string(),
    })
}

pub fn analyze_local_grok(input: FilmLocalAnalyzeInput) -> FilmLocalAnalyzeResult {
    let preflight = probe_local_grok();
    if !preflight.installed || !preflight.auth_ok {
        return blocked_result(
            preflight.detail.clone(),
            false,
            false,
            None,
            None,
        );
    }
    if preflight.ffmpeg_ok == Some(false) {
        return blocked_result(
            "ffmpeg 不可用，无法做真实拆解".into(),
            false,
            false,
            None,
            None,
        );
    }

    let work_dir = film_work_dir(&input.project_id, &input.ref_id);
    if let Err(err) = fs::create_dir_all(&work_dir) {
        return blocked_result(
            format!("创建工作目录失败：{err}"),
            false,
            false,
            None,
            Some(work_dir.display().to_string()),
        );
    }

    let media_path = match resolve_media_path(&input, &work_dir) {
        Ok(path) => path,
        Err(err) => {
            return blocked_result(err, false, false, None, Some(work_dir.display().to_string()));
        }
    };

    let media_bundle = match extract_frames_and_transcript(&media_path, &work_dir) {
        Ok(bundle) => bundle,
        Err(err) => {
            return blocked_result(
                format!("媒体预处理失败：{err}"),
                false,
                false,
                Some(media_path.display().to_string()),
                Some(work_dir.display().to_string()),
            );
        }
    };

    let had_frames = !media_bundle.frames.is_empty();
    let had_transcript = !media_bundle.transcript.trim().is_empty();
    let prompt = breakdown_prompt(&input, &media_bundle);
    let schema = analyze_schema_json();

    let grok_bin = match resolve_grok_bin() {
        Some(bin) => bin,
        None => {
            return blocked_result(
                "未找到本机 grok".into(),
                had_frames,
                had_transcript,
                Some(media_path.display().to_string()),
                Some(work_dir.display().to_string()),
            );
        }
    };

    let stdout = match run_grok_cli(&grok_bin, &prompt, &schema, &work_dir) {
        Ok(text) => text,
        Err(err) => {
            return FilmLocalAnalyzeResult {
                items: vec![meta_card(&format!("本机 Grok CLI 拆解失败：{err}"))],
                script_title: None,
                script_body: None,
                mode: "stub".into(),
                had_frames,
                had_transcript,
                blocked: true,
                error: Some(err),
                detail: "本机 grok 执行失败（非静默 stub）".into(),
                media_path: Some(media_path.display().to_string()),
                work_dir: Some(work_dir.display().to_string()),
            };
        }
    };

    let parsed = parse_grok_analyze_output(&stdout);
    if parsed.items.is_empty() {
        return FilmLocalAnalyzeResult {
            items: vec![meta_card("本机 Grok 未返回可解析的拆解卡片")],
            script_title: None,
            script_body: None,
            mode: "stub".into(),
            had_frames,
            had_transcript,
            blocked: true,
            error: Some("没有解析到 breakdown items".into()),
            detail: "本机 grok 输出无法解析".into(),
            media_path: Some(media_path.display().to_string()),
            work_dir: Some(work_dir.display().to_string()),
        };
    }

    let items = ensure_breakdown_meta(
        parsed.items,
        "本机 Grok CLI 拆解完成。",
    );

    FilmLocalAnalyzeResult {
        items,
        script_title: parsed.script_title,
        script_body: parsed.script_body,
        mode: "local".into(),
        had_frames,
        had_transcript,
        blocked: false,
        error: None,
        detail: format!(
            "本机拆解完成 · frames={} · transcript={}",
            had_frames, had_transcript
        ),
        media_path: Some(media_path.display().to_string()),
        work_dir: Some(work_dir.display().to_string()),
    }
}

struct MediaBundle {
    media_path: PathBuf,
    dir: PathBuf,
    frames: Vec<PathBuf>,
    transcript: String,
    transcript_path: PathBuf,
}

struct ParsedAnalyze {
    items: Vec<FilmLocalBreakdownCard>,
    script_title: Option<String>,
    script_body: Option<String>,
}

fn blocked_result(
    detail: String,
    had_frames: bool,
    had_transcript: bool,
    media_path: Option<String>,
    work_dir: Option<String>,
) -> FilmLocalAnalyzeResult {
    FilmLocalAnalyzeResult {
        items: vec![meta_card(&detail)],
        script_title: None,
        script_body: None,
        mode: "stub".into(),
        had_frames,
        had_transcript,
        blocked: true,
        error: Some(detail.clone()),
        detail,
        media_path,
        work_dir,
    }
}

fn meta_card(body: &str) -> FilmLocalBreakdownCard {
    FilmLocalBreakdownCard {
        id: new_film_id(),
        title: "分析状态".into(),
        body: body.to_string(),
        kind: Some("meta".into()),
    }
}

fn compose_detail(
    installed: bool,
    auth_file: bool,
    auth_ok: bool,
    ffmpeg_ok: Option<bool>,
    whisper_ok: Option<bool>,
    analyze_ready: bool,
    bin_note: Option<&str>,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(note) = bin_note {
        if !installed {
            parts.push(note.to_string());
        }
    }
    if installed && !auth_file {
        parts.push("未登录（缺少 ~/.grok/auth.json，请 grok login）".into());
    } else if installed && auth_file && !auth_ok {
        parts.push("登录失效（再 grok login）".into());
    }
    if ffmpeg_ok == Some(false) {
        parts.push("ffmpeg 不可用".into());
    }
    if whisper_ok == Some(false) {
        parts.push("whisper 不可用（对白可能不完整）".into());
    } else if whisper_ok == Some(true) {
        parts.push("whisper 可用".into());
    }
    if analyze_ready {
        parts.push("本机 grok 已就绪，可真实拆解".into());
    } else if parts.is_empty() {
        parts.push("本机 Grok CLI 探测未完成".into());
    }
    parts.join("；")
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn grok_auth_path() -> Option<PathBuf> {
    home_dir().map(|home| home.join(".grok").join("auth.json"))
}

fn film_work_dir(project_id: &str, ref_id: &str) -> PathBuf {
    let base = std::env::temp_dir().join("xhs-film");
    base.join(project_id).join(ref_id)
}

fn resolve_grok_bin() -> Option<PathBuf> {
    if let Some(explicit) = std::env::var_os("GROK_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(explicit) = std::env::var_os("FILM_GROK_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(home) = home_dir() {
        let local = home.join(".grok").join("bin").join("grok");
        if local.is_file() {
            return Some(local);
        }
        #[cfg(windows)]
        {
            let local_exe = home.join(".grok").join("bin").join("grok.exe");
            if local_exe.is_file() {
                return Some(local_exe);
            }
        }
    }
    resolve_named_bin("grok")
}

fn resolve_ffmpeg_bin() -> Option<PathBuf> {
    if let Some(explicit) = std::env::var_os("FFMPEG_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(explicit) = std::env::var_os("FILM_FFMPEG_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    resolve_named_bin("ffmpeg")
}

fn resolve_whisper_bin() -> Option<PathBuf> {
    if let Some(explicit) = std::env::var_os("FILM_WHISPER_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(explicit) = std::env::var_os("WHISPER_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Some(path);
        }
    }
    for name in ["faster-whisper", "whisper"] {
        if let Some(path) = resolve_named_bin(name) {
            return Some(path);
        }
    }
    None
}

fn probe_grok_binary(path: &Path) -> Result<(), String> {
    let mut command = Command::new(path);
    command.arg("--help");
    hide_window(&mut command);
    let child = command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    wait_with_timeout(child, Duration::from_millis(PROBE_TIMEOUT_MS))
}

fn wait_with_timeout(mut child: std::process::Child, timeout: Duration) -> Result<(), String> {
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    return Ok(());
                }
                return Err(format!("退出码 {}", status.code().unwrap_or(-1)));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("探测超时".into());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn run_command_capture(
    bin: &Path,
    args: &[String],
    timeout: Duration,
    cwd: Option<&Path>,
) -> Result<String, String> {
    let mut command = Command::new(bin);
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    hide_window(&mut command);
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动失败 {}: {e}", bin.display()))?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = String::new();
                if let Some(mut out) = child.stdout.take() {
                    use std::io::Read;
                    let _ = out.read_to_string(&mut stdout);
                }
                let mut stderr = String::new();
                if let Some(mut err) = child.stderr.take() {
                    use std::io::Read;
                    let _ = err.read_to_string(&mut stderr);
                }
                if status.success() {
                    return Ok(stdout);
                }
                let code = status.code().unwrap_or(-1);
                let err = stderr.trim();
                if err.is_empty() {
                    return Err(format!("退出码 {code}"));
                }
                return Err(format!("退出码 {code}：{err}"));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("执行超时".into());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn hide_window(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = command;
}

fn auth_looks_ok(path: Option<&Path>) -> bool {
    let Some(path) = path else {
        return false;
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return false;
    };
    let Some(map) = value.as_object() else {
        return false;
    };
    if map.is_empty() {
        return false;
    }
    let now = Utc::now();
    for entry in map.values() {
        let Some(obj) = entry.as_object() else {
            continue;
        };
        let has_refresh = obj
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let expires_ok = obj
            .get("expires_at")
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc) > now)
            .unwrap_or(false);
        if has_refresh || expires_ok {
            return true;
        }
        if obj.get("key").and_then(|v| v.as_str()).is_some()
            || obj.get("access_token").and_then(|v| v.as_str()).is_some()
        {
            return true;
        }
    }
    false
}

fn resolve_media_path(input: &FilmLocalAnalyzeInput, work_dir: &Path) -> Result<PathBuf, String> {
    if let Some(raw) = input.media_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let path = PathBuf::from(raw);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("本机媒体不存在：{raw}"));
    }

    let url = input
        .media_url
        .as_deref()
        .or(input.reference_url.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if let Some(url) = url {
        if is_xiaohongshu_url(url) {
            return Err("小红书链接无法直链下载，请上传视频文件到本机".into());
        }
        if !(url.starts_with("http://") || url.starts_with("https://")) {
            return Err("需上传视频文件".into());
        }
        let dest = work_dir.join("source.mp4");
        download_public_video(url, &dest)?;
        return Ok(dest);
    }

    Err("需上传视频文件（本机 analyze 需要本地路径或可下载 URL）".into())
}

fn is_xiaohongshu_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("xiaohongshu.com") || lower.contains("xhslink.com") || lower.contains("xhscdn.com")
}

fn download_public_video(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("HTTP 客户端失败：{e}"))?;
    let mut response = client
        .get(url)
        .send()
        .map_err(|e| format!("下载参考片失败：{e}"))?;
    if !response.status().is_success() {
        return Err(format!("下载参考片失败 HTTP {}", response.status()));
    }
    if let Some(len) = response.content_length() {
        if len > FILM_MEDIA_MAX_BYTES {
            return Err("参考片超过 80MB".into());
        }
    }
    let mut file = fs::File::create(dest).map_err(|e| format!("写入失败：{e}"))?;
    let mut written: u64 = 0;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = {
            use std::io::Read;
            response
                .read(&mut buffer)
                .map_err(|e| format!("下载读失败：{e}"))?
        };
        if n == 0 {
            break;
        }
        written += n as u64;
        if written > FILM_MEDIA_MAX_BYTES {
            let _ = fs::remove_file(dest);
            return Err("参考片超过 80MB".into());
        }
        file.write_all(&buffer[..n])
            .map_err(|e| format!("写入失败：{e}"))?;
    }
    Ok(())
}

fn extract_frames_and_transcript(media_path: &Path, work_dir: &Path) -> Result<MediaBundle, String> {
    let frames_dir = work_dir.join("frames");
    fs::create_dir_all(&frames_dir).map_err(|e| format!("创建帧目录失败：{e}"))?;
    let wav_path = work_dir.join("audio.wav");
    let transcript_path = work_dir.join("transcript.txt");
    let mut frames: Vec<PathBuf> = Vec::new();

    if let Some(ffmpeg) = resolve_ffmpeg_bin() {
        let pattern = frames_dir.join("frame_%02d.jpg");
        let pattern_str = pattern.display().to_string();
        let media_str = media_path.display().to_string();
        let scene_args = scene_frame_args(&media_str, &pattern_str);
        let _ = run_command_capture(
            &ffmpeg,
            &scene_args,
            Duration::from_millis(FFMPEG_TIMEOUT_MS),
            None,
        );
        frames = list_frames(&frames_dir);
        if frames.len() < 4 {
            let interval_args = interval_frame_args(&media_str, &pattern_str);
            let _ = run_command_capture(
                &ffmpeg,
                &interval_args,
                Duration::from_millis(FFMPEG_TIMEOUT_MS),
                None,
            );
            frames = list_frames(&frames_dir);
        }
        let wav_str = wav_path.display().to_string();
        let _ = run_command_capture(
            &ffmpeg,
            &wav_args(&media_str, &wav_str),
            Duration::from_millis(FFMPEG_TIMEOUT_MS),
            None,
        );
    }

    let mut transcript = String::new();
    if wav_path.is_file() {
        if let Some(whisper) = resolve_whisper_bin() {
            match run_whisper(&whisper, &wav_path, work_dir) {
                Ok(text) => transcript = text,
                Err(_) => transcript = String::new(),
            }
        }
    }
    fs::write(&transcript_path, &transcript).map_err(|e| format!("写转写失败：{e}"))?;

    Ok(MediaBundle {
        media_path: media_path.to_path_buf(),
        dir: work_dir.to_path_buf(),
        frames: frames.into_iter().take(FILM_FRAME_CAP).collect(),
        transcript,
        transcript_path,
    })
}

fn scene_frame_args(input: &str, out_pattern: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.into(),
        "-vf".into(),
        "select='gt(scene,0.25)',scale='min(720,iw)':-2".into(),
        "-vsync".into(),
        "vfr".into(),
        "-frames:v".into(),
        FILM_FRAME_CAP.to_string(),
        out_pattern.into(),
    ]
}

fn interval_frame_args(input: &str, out_pattern: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.into(),
        "-vf".into(),
        "fps=1,scale='min(720,iw)':-2".into(),
        "-frames:v".into(),
        FILM_FRAME_CAP.to_string(),
        out_pattern.into(),
    ]
}

fn wav_args(input: &str, wav_path: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        input.into(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        "16000".into(),
        wav_path.into(),
    ]
}

fn list_frames(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|s| s.to_str())
                .map(|ext| {
                    let lower = ext.to_ascii_lowercase();
                    lower == "jpg" || lower == "jpeg" || lower == "png" || lower == "webp"
                })
                .unwrap_or(false)
        })
        .collect();
    names.sort();
    names
}

fn run_whisper(bin: &Path, wav_path: &Path, work_dir: &Path) -> Result<String, String> {
    let bin_name = bin.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let wav_str = wav_path.display().to_string();
    let out_dir = work_dir.display().to_string();
    let args = if bin_name.contains("faster-whisper") {
        vec![
            wav_str,
            "--model".into(),
            "tiny".into(),
            "--output_dir".into(),
            out_dir,
        ]
    } else {
        vec![
            wav_str,
            "--model".into(),
            "tiny".into(),
            "--output_format".into(),
            "txt".into(),
            "--output_dir".into(),
            out_dir,
        ]
    };
    let _ = run_command_capture(
        bin,
        &args,
        Duration::from_millis(WHISPER_TIMEOUT_MS),
        Some(work_dir),
    )?;
    let base = wav_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let preferred = work_dir.join(format!("{base}.txt"));
    if preferred.is_file() {
        return fs::read_to_string(preferred).map_err(|e| e.to_string()).map(|s| s.trim().to_string());
    }
    let Ok(entries) = fs::read_dir(work_dir) else {
        return Ok(String::new());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("txt") {
            if let Ok(text) = fs::read_to_string(&path) {
                let trimmed = text.trim().to_string();
                if !trimmed.is_empty() && path.file_name().and_then(|s| s.to_str()) != Some("transcript.txt")
                {
                    return Ok(trimmed);
                }
            }
        }
    }
    Ok(String::new())
}

fn breakdown_prompt(input: &FilmLocalAnalyzeInput, media: &MediaBundle) -> String {
    let source_label = input
        .reference_url
        .as_deref()
        .or(input.title.as_deref())
        .unwrap_or("参考片");
    let has_frames = !media.frames.is_empty();
    let ref_source = input.reference_source.as_deref().unwrap_or("upload");
    let mut lines = vec![
        "你是短视频拆解助理。输出镜头拆解和一版短剧本，供画布卡片渲染。".into(),
        "不要读仓库代码。".into(),
        if has_frames {
            "请阅读下列抽帧图片，并结合转写（可能为空；没有对白也正常）。".into()
        } else {
            "没有抽帧图片时：只能根据标题/来源做谨慎推断，并在 meta 写明「无帧」。不要声称已经看过视频画面。".into()
        },
        format!("来源类型：{ref_source}"),
        format!("标题：{}", input.title.as_deref().unwrap_or("（无）")),
        format!("URL：{}", input.reference_url.as_deref().unwrap_or("（无）")),
        format!("mediaUrl：{}", input.media_url.as_deref().unwrap_or("（无）")),
        format!("来源摘要：{source_label}"),
        format!("本地媒体：{}", media.media_path.display()),
        format!("工作目录：{}", media.dir.display()),
    ];
    if has_frames {
        lines.push("抽帧文件：".into());
        for frame in &media.frames {
            lines.push(format!("- {}", frame.display()));
        }
    }
    lines.push(format!("转写文件：{}", media.transcript_path.display()));
    lines.push("转写正文（可能为空）：".into());
    lines.push("\"\"\"".into());
    lines.push(if media.transcript.trim().is_empty() {
        "（无对白 / 未转写）".into()
    } else {
        media.transcript.trim().to_string()
    });
    lines.push("\"\"\"".into());
    lines.push("产品形态（重点）：每条镜头卡 = 镜号 + 画面 + 对白。".into());
    lines.push(
        "shot 卡片：title 写成「镜号 N」（N 从 1 起）；body 必须含两段，分别以「画面：」和「对白：」开头（可换行）。画面写可见内容与大致时段；对白写该镜口播/台词，没有就写「（无）」。"
            .into(),
    );
    lines.push(
        "items 至少包含：meta（分析状态）、duration、hook、2-6 条 shot（上述三联形态）、spoken（全文口播摘要，可与各镜对白呼应）、note。"
            .into(),
    );
    lines.push("kind 只能是 meta / duration / hook / shot / spoken / note。".into());
    lines.push("同时给 script.title 和 script.body（中文短剧本草稿）。".into());
    lines.push("title、body 用中文，短句。可读卡片优先，不要发明额外字段。".into());
    lines.join("\n")
}

fn analyze_schema_json() -> String {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["items"],
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["title", "body"],
                    "properties": {
                        "title": { "type": "string" },
                        "body": { "type": "string" },
                        "kind": {
                            "type": "string",
                            "enum": ["meta", "duration", "hook", "shot", "spoken", "note"]
                        }
                    }
                }
            },
            "script": {
                "type": "object",
                "additionalProperties": false,
                "required": ["title", "body"],
                "properties": {
                    "title": { "type": "string" },
                    "body": { "type": "string" }
                }
            }
        }
    })
    .to_string()
}

fn run_grok_cli(bin: &Path, prompt: &str, schema_json: &str, cwd: &Path) -> Result<String, String> {
    let args = vec![
        "--output-format".into(),
        "json".into(),
        "--json-schema".into(),
        schema_json.to_string(),
        "--cwd".into(),
        cwd.display().to_string(),
        "--permission-mode".into(),
        "bypassPermissions".into(),
        "--always-approve".into(),
        "-p".into(),
        prompt.to_string(),
    ];
    // 先写 prompt 备份便于排障
    let _ = fs::write(cwd.join("prompt.txt"), prompt);
    run_command_capture(
        bin,
        &args,
        Duration::from_millis(GROK_TIMEOUT_MS),
        Some(cwd),
    )
}

fn parse_grok_analyze_output(raw: &str) -> ParsedAnalyze {
    let text = raw.trim();
    if text.is_empty() {
        return ParsedAnalyze {
            items: vec![],
            script_title: None,
            script_body: None,
        };
    }
    let extracted = extract_json_object(text);
    let parsed = match serde_json::from_str::<Value>(&extracted) {
        Ok(v) => v,
        Err(_) => {
            return ParsedAnalyze {
                items: vec![],
                script_title: None,
                script_body: None,
            };
        }
    };
    for root in collect_payload_roots(&parsed) {
        let items = parse_breakdown_payload(&root);
        let (script_title, script_body) = parse_script_payload(&root);
        if !items.is_empty() || script_title.is_some() || script_body.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        {
            return ParsedAnalyze {
                items,
                script_title,
                script_body,
            };
        }
    }
    ParsedAnalyze {
        items: parse_breakdown_payload(&parsed),
        script_title: None,
        script_body: None,
    }
}

fn collect_payload_roots(parsed: &Value) -> Vec<Value> {
    let mut roots = vec![parsed.clone()];
    if let Some(obj) = parsed.as_object() {
        if let Some(structured) = obj
            .get("structuredOutput")
            .or_else(|| obj.get("structured_output"))
        {
            roots.insert(0, structured.clone());
        }
        if obj.get("type").and_then(|v| v.as_str()) == Some("end") {
            if let Some(structured) = obj
                .get("structuredOutput")
                .or_else(|| obj.get("structured_output"))
            {
                roots.insert(0, structured.clone());
            }
        }
        if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
            if let Ok(nested) = serde_json::from_str::<Value>(&extract_json_object(text)) {
                roots.insert(0, nested);
            }
        }
    }
    roots
}

fn parse_breakdown_payload(value: &Value) -> Vec<FilmLocalBreakdownCard> {
    let rows = if let Some(arr) = value.as_array() {
        arr.clone()
    } else if let Some(items) = value.get("items").and_then(|v| v.as_array()) {
        items.clone()
    } else if let Some(items) = value.get("breakdown").and_then(|v| v.as_array()) {
        items.clone()
    } else {
        Vec::new()
    };
    rows.iter().filter_map(as_breakdown_card).collect()
}

fn as_breakdown_card(value: &Value) -> Option<FilmLocalBreakdownCard> {
    let obj = value.as_object()?;
    let title = obj.get("title").and_then(|v| v.as_str())?.trim();
    if title.is_empty() {
        return None;
    }
    let body = obj
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let kind = obj
        .get("kind")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| {
            matches!(
                s.as_str(),
                "meta" | "duration" | "hook" | "shot" | "spoken" | "note"
            )
        });
    let id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(new_film_id);
    Some(FilmLocalBreakdownCard {
        id,
        title: title.to_string(),
        body,
        kind,
    })
}

fn parse_script_payload(value: &Value) -> (Option<String>, Option<String>) {
    let Some(script) = value.get("script").and_then(|v| v.as_object()) else {
        return (None, None);
    };
    let title = script
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let body = script
        .get("body")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if title.is_none() && body.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
        return (None, None);
    }
    (title.or_else(|| Some("剧本草稿".into())), body)
}

fn ensure_breakdown_meta(
    mut cards: Vec<FilmLocalBreakdownCard>,
    body: &str,
) -> Vec<FilmLocalBreakdownCard> {
    if cards.iter().any(|c| c.kind.as_deref() == Some("meta")) {
        return cards;
    }
    cards.insert(0, meta_card(body));
    cards
}

fn extract_json_object(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return trimmed.to_string();
    }
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after
            .strip_prefix("json")
            .or_else(|| after.strip_prefix("JSON"))
            .unwrap_or(after)
            .trim_start();
        if let Some(end) = after.find("```") {
            return after[..end].trim().to_string();
        }
    }
    let start = trimmed.find(['{', '[']);
    let end = trimmed.rfind(['}', ']']);
    if let (Some(s), Some(e)) = (start, end) {
        if e > s {
            return trimmed[s..=e].to_string();
        }
    }
    trimmed.to_string()
}

fn new_film_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("local-{millis:x}-{}", fastrand_u32())
}

fn fastrand_u32() -> u32 {
    use std::cell::Cell;
    thread_local! {
        static SEED: Cell<u64> = Cell::new(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0x9e3779b97f4a7c15)
        );
    }
    SEED.with(|cell| {
        let mut x = cell.get();
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        cell.set(x);
        x as u32
    })
}

#[cfg(test)]
mod tests {
    use super::compose_detail;

    #[test]
    fn ready_tools_say_analyze_ready() {
        let detail = compose_detail(true, true, true, Some(true), Some(true), true, None);
        assert!(detail.contains("可真实拆解") || detail.contains("已就绪"));
        assert!(!detail.contains("尚未接线"));
    }

    #[test]
    fn missing_ffmpeg_mentions_ffmpeg() {
        let detail = compose_detail(true, true, true, Some(false), None, false, None);
        assert!(detail.contains("ffmpeg"));
    }
}
