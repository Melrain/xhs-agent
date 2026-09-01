mod cli_install;
mod export;
mod media_save;
mod publish;
mod session;
mod store;
mod xhs;
mod xhs_login;

use cli_install::SetupReport;
use session::{SessionHub, SessionSnapshot};
use store::{StoredComment, StoredNote};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use xhs::{XhsNotePullResult, XhsProbe, XhsRuntime};
use xhs_login::{XhsLogin, XhsQrSessionView};

#[tauri::command]
async fn setup_probe() -> Result<SetupReport, String> {
    tauri::async_runtime::spawn_blocking(cli_install::probe_runtime)
        .await
        .map_err(|error| format!("任务中断：{error}"))
}

#[tauri::command]
async fn setup_ensure(app: AppHandle) -> Result<SetupReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cli_install::ensure_runtime(|progress| {
            let _ = app.emit("setup-progress", progress);
        })
    })
    .await
    .map_err(|error| format!("任务中断：{error}"))
}

#[tauri::command]
async fn session_boot(hub: State<'_, SessionHub>) -> Result<SessionSnapshot, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.boot())
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn session_snapshot(hub: State<'_, SessionHub>) -> Result<SessionSnapshot, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.snapshot())
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn session_switch(
    hub: State<'_, SessionHub>,
    login: State<'_, XhsLogin>,
    account_id: String,
) -> Result<SessionSnapshot, String> {
    if login.is_busy() {
        return Err("扫码进行中，不能切号".into());
    }
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.switch_to(&account_id))
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn session_remove(
    hub: State<'_, SessionHub>,
    login: State<'_, XhsLogin>,
    account_id: String,
) -> Result<SessionSnapshot, String> {
    if login.is_busy() {
        return Err("扫码进行中，不能移出账号".into());
    }
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.remove(&account_id))
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn session_adopt(hub: State<'_, SessionHub>) -> Result<SessionSnapshot, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.adopt_cli())
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn xhs_status(hub: State<'_, SessionHub>) -> Result<XhsProbe, String> {
    let snapshot = session_snapshot(hub).await?;
    Ok(snapshot.probe)
}

#[tauri::command]
async fn xhs_login_start(
    app: AppHandle,
    hub: State<'_, SessionHub>,
    login: State<'_, XhsLogin>,
) -> Result<XhsQrSessionView, String> {
    let prepared = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || prepared.prepare_login())
        .await
        .map_err(|error| format!("任务中断：{error}"))??;
    let login = login.inner().clone();
    let started = tauri::async_runtime::spawn_blocking(move || login.start(&app))
        .await
        .map_err(|error| format!("任务中断：{error}"))?;
    if started.is_err() {
        let hub = hub.inner().clone();
        let _ = tauri::async_runtime::spawn_blocking(move || hub.restore_active()).await;
    }
    started
}

#[tauri::command]
fn xhs_login_status(login: State<'_, XhsLogin>) -> XhsQrSessionView {
    login.status()
}

#[tauri::command]
async fn xhs_login_cancel(
    hub: State<'_, SessionHub>,
    login: State<'_, XhsLogin>,
) -> Result<SessionSnapshot, String> {
    login.inner().clone().cancel();
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.restore_active())
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn store_list_notes(hub: State<'_, SessionHub>) -> Result<Vec<StoredNote>, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.list_notes_for_active())
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn store_list_comments(hub: State<'_, SessionHub>) -> Result<Vec<StoredComment>, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.list_comments_for_active())
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn export_comments(
    app: AppHandle,
    comments: Vec<StoredComment>,
    file_name: String,
) -> Result<Option<String>, String> {
    if comments.is_empty() {
        return Err("没有可导出的评论用户".into());
    }
    let name = sanitize_file_name(&file_name);
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_title("导出评论用户")
                .set_file_name(&name)
                .add_filter("Excel", &["xlsx"])
                .blocking_save_file()
        }
    })
    .await
    .map_err(|error| format!("任务中断：{error}"))?;
    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|error| format!("无法使用所选路径：{error}"))?;
    tauri::async_runtime::spawn_blocking(move || export::write_comments_xlsx(&path, &comments).map(|_| path.display().to_string()))
        .await
        .map_err(|error| format!("任务中断：{error}"))?
        .map(Some)
}

#[tauri::command]
async fn save_media(
    app: AppHandle,
    url: Option<String>,
    bytes: Option<Vec<u8>>,
    file_name: String,
) -> Result<Option<String>, String> {
    media_save::save_media(app, url, bytes, file_name).await
}

fn sanitize_file_name(name: &str) -> String {
    let trimmed = name.trim();
    let safe: String = trimmed
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => ch,
        })
        .collect();
    let safe = safe.trim().trim_matches('.');
    let stem = safe.strip_suffix(".xlsx").unwrap_or(safe);
    let stem: String = stem.chars().take(80).collect();
    if stem.is_empty() {
        "评论用户.xlsx".into()
    } else {
        format!("{stem}.xlsx")
    }
}

#[tauri::command]
async fn xhs_sync_notes(hub: State<'_, SessionHub>) -> Result<Vec<StoredNote>, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sync_notes(&hub))
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn xhs_publish_note(
    hub: State<'_, SessionHub>,
    input: publish::PublishNoteInput,
) -> Result<publish::PublishNoteResult, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || publish::publish_note(&hub, input))
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

#[tauri::command]
async fn xhs_sync_note_comments(
    hub: State<'_, SessionHub>,
    note_id: String,
) -> Result<XhsNotePullResult, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || sync_note_comments(&hub, &note_id))
        .await
        .map_err(|error| format!("任务中断：{error}"))?
}

fn sync_notes(hub: &SessionHub) -> Result<Vec<StoredNote>, String> {
    hub.sync_notes()
}

fn sync_note_comments(hub: &SessionHub, note_id: &str) -> Result<XhsNotePullResult, String> {
    hub.sync_note_comments(note_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let xhs = XhsRuntime::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .manage(xhs.clone())
        .manage(XhsLogin::new())
        .setup(move |app| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("无法定位数据目录：{error}"))?;
            let store = store::Store::open_app_data(dir.clone())?;
            app.manage(SessionHub::new(xhs, store, dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            setup_probe,
            setup_ensure,
            session_boot,
            session_snapshot,
            session_switch,
            session_remove,
            session_adopt,
            xhs_status,
            xhs_login_start,
            xhs_login_status,
            xhs_login_cancel,
            store_list_notes,
            store_list_comments,
            export_comments,
            save_media,
            xhs_publish_note,
            xhs_sync_notes,
            xhs_sync_note_comments
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod windows_nsis_hooks_tests {
    #[test]
    fn hooks_file_has_utf8_bom_and_legacy_names() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows/hooks.nsh");
        let bytes = std::fs::read(&path).expect("windows/hooks.nsh");
        assert!(
            bytes.starts_with(&[0xEF, 0xBB, 0xBF]),
            "NSIS Unicode needs a UTF-8 BOM so leftover Chinese product names parse"
        );
        let text = String::from_utf8_lossy(&bytes[3..]);
        for name in ["小红书执行器", "R7工作台", "R7."] {
            assert!(text.contains(name), "missing leftover identity {name}");
        }
        assert!(text.contains("NSIS_HOOK_PREINSTALL"));
        assert!(text.contains("NSIS_HOOK_POSTINSTALL"));
        assert!(
            !text.contains("RmDir /r \"$APPDATA") && !text.contains("$LOCALAPPDATA\\${BUNDLEID}"),
            "hooks must not wipe identifier-based app data"
        );
    }
}
