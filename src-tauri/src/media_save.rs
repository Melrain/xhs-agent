use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

pub async fn save_media(
    app: AppHandle,
    url: Option<String>,
    bytes: Option<Vec<u8>>,
    file_name: String,
) -> Result<Option<String>, String> {
    let name = sanitize_media_name(&file_name, url.as_deref());
    let ext = extension(&name).unwrap_or("bin").to_string();
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        let name = name.clone();
        let ext = ext.clone();
        move || {
            let mut dialog = app
                .dialog()
                .file()
                .set_title("保存到本地")
                .set_file_name(&name);
            dialog = match ext.as_str() {
                "mp4" | "webm" | "mov" => dialog.add_filter("视频", &["mp4", "webm", "mov"]),
                _ => dialog.add_filter("图片", &["png", "jpg", "jpeg", "webp"]),
            };
            dialog.blocking_save_file()
        }
    })
    .await
    .map_err(|error| format!("任务中断：{error}"))?;

    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|error| format!("无法使用所选路径：{error}"))?;
    let data = load_bytes(url, bytes).await?;
    let write_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || write_bytes(&write_path, &data))
        .await
        .map_err(|error| format!("任务中断：{error}"))??;
    Ok(Some(path.display().to_string()))
}

async fn load_bytes(url: Option<String>, bytes: Option<Vec<u8>>) -> Result<Vec<u8>, String> {
    if let Some(bytes) = bytes {
        if bytes.is_empty() {
            return Err("没有可保存的内容".into());
        }
        return Ok(bytes);
    }
    let Some(url) = url.filter(|item| !item.trim().is_empty()) else {
        return Err("没有可保存的内容".into());
    };
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("这个地址不能直接保存，请重试".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|error| format!("无法下载：{error}"))?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("下载失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载失败：{}", response.status()));
    }
    let data = response
        .bytes()
        .await
        .map_err(|error| format!("读取文件失败：{error}"))?;
    if data.is_empty() {
        return Err("下载结果是空的".into());
    }
    Ok(data.to_vec())
}

fn write_bytes(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("无法创建目录：{error}"))?;
    }
    std::fs::write(path, data).map_err(|error| format!("写入失败：{error}"))
}

fn sanitize_media_name(name: &str, url: Option<&str>) -> String {
    let trimmed = name.trim();
    let safe: String = trimmed
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => ch,
        })
        .collect();
    let safe = safe.trim().trim_matches('.');
    let stem: String = PathBuf::from(safe)
        .file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or(safe)
        .chars()
        .take(80)
        .collect();
    let ext = extension(safe)
        .or_else(|| url.and_then(guess_url_ext))
        .unwrap_or("png");
    if stem.is_empty() {
        format!("r7-media.{ext}")
    } else {
        format!("{stem}.{ext}")
    }
}

fn extension(name: &str) -> Option<&str> {
    Path::new(name)
        .extension()
        .and_then(|item| item.to_str())
        .map(|item| item.trim().trim_start_matches('.'))
        .filter(|item| !item.is_empty())
}

fn guess_url_ext(url: &str) -> Option<&str> {
    let path = url.split('?').next().unwrap_or(url);
    extension(path)
}
