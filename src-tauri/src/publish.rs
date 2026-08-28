use crate::session::SessionHub;
use crate::xhs::{envelope_error, parse_envelope_value, resolve_xhs_bin, run_cli};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static PUBLISH_TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

const POST_TIMEOUT_MS: u64 = 180_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishMediaInput {
    pub s3_key: String,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishNoteInput {
    pub api_base: String,
    pub access_token: String,
    pub target_xhs_user_id: String,
    pub title: String,
    pub body: String,
    pub topics: Vec<String>,
    pub is_private: bool,
    pub media: Vec<PublishMediaInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishNoteResult {
    pub ok: bool,
    pub message: String,
    pub xhs_note_id: Option<String>,
}

pub fn publish_note(hub: &SessionHub, input: PublishNoteInput) -> Result<PublishNoteResult, String> {
    let account_id = input.target_xhs_user_id.trim();
    if account_id.is_empty() {
        return Err("缺少目标账号".into());
    }
    if input.media.is_empty() {
        return Err("发布包没有图片".into());
    }
    if input.title.trim().is_empty() || input.body.trim().is_empty() {
        return Err("标题和正文不能为空".into());
    }

    let previous = hub.active_account_id().ok().flatten();
    hub.switch_to(account_id)?;

    let result = publish_with_temp_dir(hub, &input);
    restore_previous_account(hub, previous.as_deref(), account_id);
    result
}

fn publish_with_temp_dir(
    hub: &SessionHub,
    input: &PublishNoteInput,
) -> Result<PublishNoteResult, String> {
    let temp_dir = unique_temp_dir(hub.app_data_dir());
    fs::create_dir_all(&temp_dir).map_err(|error| format!("无法创建临时目录：{error}"))?;

    let download_result = download_media_files(
        input.api_base.trim(),
        input.access_token.trim(),
        &input.media,
        &temp_dir,
    );

    let image_paths = match download_result {
        Ok(paths) => paths,
        Err(error) => {
            cleanup_dir(&temp_dir);
            return Err(error);
        }
    };

    let publish_result = run_xhs_post(
        input.title.trim(),
        input.body.trim(),
        &input.topics,
        input.is_private,
        &image_paths,
    );

    cleanup_dir(&temp_dir);
    publish_result
}

fn unique_temp_dir(app_dir: &Path) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let seq = PUBLISH_TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    app_dir
        .join("publish-temp")
        .join(format!("{}-{}-{}", std::process::id(), stamp, seq))
}

fn restore_previous_account(hub: &SessionHub, previous: Option<&str>, published_as: &str) {
    let Some(previous) = previous else {
        return;
    };
    if previous == published_as {
        return;
    }
    if let Err(error) = hub.switch_to(previous) {
        eprintln!("发布后恢复原账号失败：{error}");
    }
}

fn download_media_files(
    api_base: &str,
    access_token: &str,
    media: &[PublishMediaInput],
    temp_dir: &Path,
) -> Result<Vec<PathBuf>, String> {
    if api_base.is_empty() {
        return Err("缺少 API 地址".into());
    }
    if access_token.is_empty() {
        return Err("未登录云端，无法下载发布图".into());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|error| format!("无法创建下载客户端：{error}"))?;

    let mut paths = Vec::with_capacity(media.len());
    for (index, item) in media.iter().enumerate() {
        let key = item.s3_key.trim();
        if key.is_empty() {
            return Err("图片地址无效".into());
        }
        let ext = extension_for_mime(item.mime_type.as_deref().unwrap_or(""));
        let file_name = format!("{:02}.{ext}", index);
        let dest = temp_dir.join(file_name);
        let url = format!(
            "{}/internal/studio/file?s3Key={}",
            api_base.trim_end_matches('/'),
            urlencoding::encode(key),
        );
        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("X-Client", "desktop")
            .send()
            .map_err(|error| format!("下载图片失败：{error}"))?;
        if !response.status().is_success() {
            return Err(format!("下载图片失败：HTTP {}", response.status()));
        }
        let bytes = response
            .bytes()
            .map_err(|error| format!("读取图片失败：{error}"))?;
        if bytes.is_empty() {
            return Err("下载的图片是空的".into());
        }
        fs::write(&dest, &bytes).map_err(|error| format!("写入临时文件失败：{error}"))?;
        paths.push(dest);
    }
    Ok(paths)
}

fn run_xhs_post(
    title: &str,
    body: &str,
    topics: &[String],
    is_private: bool,
    image_paths: &[PathBuf],
) -> Result<PublishNoteResult, String> {
    let Some(bin) = resolve_xhs_bin() else {
        return Err("找不到本机 xhs 命令。请先安装 xiaohongshu-cli。".into());
    };

    let mut args: Vec<String> = vec![
        "post".into(),
        "--title".into(),
        title.into(),
        "--body".into(),
        body.into(),
        "--json".into(),
    ];
    for path in image_paths {
        args.push("--images".into());
        args.push(path.display().to_string());
    }
    for topic in topics {
        let trimmed = topic.trim().replace('#', "");
        if trimmed.is_empty() {
            continue;
        }
        args.push("--topic".into());
        args.push(trimmed);
    }
    if is_private {
        args.push("--private".into());
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let (code, stdout, stderr) = run_cli(&bin, &arg_refs, POST_TIMEOUT_MS)?;
    let envelope = parse_envelope_value(&stdout, &stderr)?;
    Ok(interpret_post_result(code, &envelope))
}

fn interpret_post_result(code: i32, envelope: &serde_json::Value) -> PublishNoteResult {
    if let Some(error) = envelope_error(envelope) {
        return PublishNoteResult {
            ok: false,
            message: error,
            xhs_note_id: None,
        };
    }

    if let Some(xhs_note_id) = extract_note_id(envelope) {
        return PublishNoteResult {
            ok: true,
            message: "发布成功".into(),
            xhs_note_id: Some(xhs_note_id),
        };
    }

    if code != 0 {
        return PublishNoteResult {
            ok: false,
            message: format!("xhs 发布失败（退出码 {code}）"),
            xhs_note_id: None,
        };
    }

    PublishNoteResult {
        ok: false,
        message: "发布结果未解析到笔记 id，请到小红书确认后再决定是否重试".into(),
        xhs_note_id: None,
    }
}

fn extract_note_id(envelope: &serde_json::Value) -> Option<String> {
    let data = envelope.get("data").unwrap_or(envelope);
    for key in ["note_id", "noteId", "id"] {
        if let Some(value) = data.get(key).and_then(|item| item.as_str()) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    if let Some(note) = data.get("note") {
        for key in ["id", "note_id", "noteId"] {
            if let Some(value) = note.get(key).and_then(|item| item.as_str()) {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "video/mp4" => "mp4",
        _ => "png",
    }
}

fn cleanup_dir(path: &Path) {
    if path.exists() {
        let _ = fs::remove_dir_all(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_note_id_from_envelope() {
        let envelope = serde_json::json!({
            "ok": true,
            "data": { "note_id": "abc123" }
        });
        assert_eq!(extract_note_id(&envelope), Some("abc123".into()));
    }

    #[test]
    fn treats_missing_note_id_as_failure() {
        let envelope = serde_json::json!({ "ok": true, "data": {} });
        let result = interpret_post_result(0, &envelope);
        assert!(!result.ok);
        assert!(result.xhs_note_id.is_none());
    }

    #[test]
    fn treats_nonzero_exit_without_note_id_as_failure() {
        let envelope = serde_json::json!({ "ok": true, "data": {} });
        let result = interpret_post_result(1, &envelope);
        assert!(!result.ok);
        assert!(result.message.contains("退出码 1"));
    }

    #[test]
    fn accepts_note_id_even_if_exit_code_nonzero() {
        let envelope = serde_json::json!({
            "ok": true,
            "data": { "note_id": "n1" }
        });
        let result = interpret_post_result(1, &envelope);
        assert!(result.ok);
        assert_eq!(result.xhs_note_id.as_deref(), Some("n1"));
    }
}
