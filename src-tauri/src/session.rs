use crate::store::{StoredAccount, Store};
use crate::xhs::{
    comments_command, comments_from_envelope, comments_timeout_ms, envelope_code, envelope_error,
    short_timeout_ms, XhsNotePullResult, XhsNoteView, XhsProbe, XhsRuntime,
};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct SessionHub {
    xhs: XhsRuntime,
    store: Store,
    vault: PathBuf,
    slot: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub accounts: Vec<StoredAccount>,
    pub active_account_id: Option<String>,
    pub probe: XhsProbe,
}

impl SessionHub {
    pub fn new(xhs: XhsRuntime, store: Store, app_dir: PathBuf) -> Self {
        Self {
            xhs,
            store,
            vault: app_dir.join("sessions"),
            slot: default_cli_cookie_path(),
        }
    }

    #[cfg(test)]
    fn for_test(store: Store, vault: PathBuf, slot: PathBuf) -> Self {
        Self {
            xhs: XhsRuntime::new(),
            store,
            vault,
            slot,
        }
    }

    pub fn boot(&self) -> Result<SessionSnapshot, String> {
        self.xhs.with_lock(|| {
            let cli = crate::cli_install::ensure_local_runtime();
            self.migrate_cli_slot()?;
            if let Some(active) = self.store.active_account_id()? {
                if self.vault_exists(&active) {
                    self.install(&active)?;
                }
            } else if let Some(id) = self.first_vault_account()? {
                self.install(&id)?;
                self.store.set_active_account(Some(&id))?;
            }
            let mut snapshot = self.refresh_locked()?;
            if !cli.detail.is_empty()
                && (snapshot.probe.kind == "missing_cli"
                    || snapshot.probe.kind == "logged_out"
                    || snapshot.probe.kind == "error"
                    || cli.installed_now)
            {
                snapshot.probe.message = cli.detail;
            }
            Ok(snapshot)
        })
    }

    pub fn snapshot(&self) -> Result<SessionSnapshot, String> {
        self.xhs.with_lock(|| self.refresh_locked())
    }

    pub fn restore_active(&self) -> Result<SessionSnapshot, String> {
        self.xhs.with_lock(|| {
            if let Some(active) = self.store.active_account_id()? {
                if self.vault_exists(&active) {
                    self.install(&active)?;
                }
            }
            self.refresh_locked()
        })
    }

    pub fn prepare_login(&self) -> Result<(), String> {
        self.xhs.with_lock(|| {
            self.capture_active()?;
            clear_cookies(&self.slot)
        })
    }

    pub fn adopt_cli(&self) -> Result<SessionSnapshot, String> {
        self.xhs.with_lock(|| {
            let probe = self.xhs.probe_unlocked("status");
            let Some(user) = probe.user.clone() else {
                return Err("登录尚未写入，请稍后再试".into());
            };
            self.save_slot_to_vault(&user.xhs_user_id)?;
            self.store.upsert_account(&user)?;
            self.store.set_session_ok(&user.xhs_user_id, true)?;
            self.store.set_active_account(Some(&user.xhs_user_id))?;
            self.refresh_locked()
        })
    }

    pub fn switch_to(&self, account_id: &str) -> Result<SessionSnapshot, String> {
        let account_id = account_id.trim();
        if account_id.is_empty() {
            return Err("缺少账号".into());
        }
        self.xhs.with_lock(|| {
            self.capture_active()?;
            if !self.vault_exists(account_id) {
                return Err("这个账号还没有 session 文件，请重新登录".into());
            }
            self.install(account_id)?;
            self.store.set_active_account(Some(account_id))?;
            let probe = self.xhs.probe_unlocked("status");
            let ok = probe.user.as_ref().is_some_and(|user| user.xhs_user_id == account_id);
            self.store.set_session_ok(account_id, ok)?;
            if let Some(user) = &probe.user {
                if user.xhs_user_id == account_id {
                    self.store.upsert_account(user)?;
                    self.save_slot_to_vault(account_id)?;
                }
            }
            self.refresh_locked()
        })
    }

    pub fn remove(&self, account_id: &str) -> Result<SessionSnapshot, String> {
        let account_id = account_id.trim();
        if account_id.is_empty() {
            return Err("缺少账号".into());
        }
        self.xhs.with_lock(|| {
            let active = self.store.active_account_id()?;
            delete_file(&self.vault_path(account_id))?;
            if active.as_deref() == Some(account_id) {
                clear_cookies(&self.slot)?;
                let next = self
                    .first_vault_account()?
                    .filter(|id| id != account_id);
                if let Some(next) = next {
                    self.install(&next)?;
                    self.store.set_active_account(Some(&next))?;
                } else {
                    self.store.set_active_account(None)?;
                }
            }
            self.store.set_session_ok(account_id, false)?;
            self.refresh_locked()
        })
    }

    pub fn list_comments_for_active(&self) -> Result<Vec<crate::store::StoredComment>, String> {
        let Some(active) = self.store.active_account_id()? else {
            return Ok(Vec::new());
        };
        self.store.list_comments_for_account(&active)
    }

    pub fn list_notes_for_active(&self) -> Result<Vec<crate::store::StoredNote>, String> {
        let Some(active) = self.store.active_account_id()? else {
            return Ok(Vec::new());
        };
        self.store.list_notes(Some(&active))
    }

    pub fn sync_note_comments(&self, note_id: &str) -> Result<XhsNotePullResult, String> {
        self.xhs.with_lock(|| {
            let Some(active) = self.store.active_account_id()? else {
                return Err("还没有当前账号，请先登录".into());
            };
            if self.vault_exists(&active) {
                self.install(&active)?;
            }
            let note = self
                .store
                .get_note(note_id)?
                .ok_or_else(|| "本地还没有这篇笔记，请先同步笔记".to_string())?;
            if note.account_id != active {
                return Err("这篇笔记不属于当前账号".into());
            }
            let view = XhsNoteView {
                id: note.id.clone(),
                title: note.title.clone(),
                comments_count: note.comments_count,
                xsec_token: note.xsec_token.clone(),
            };
            match collect_comments_unlocked(&self.xhs, &view) {
                Ok(comments) => {
                    let pulled = comments.len() as i64;
                    let upserted = self.store.upsert_comments(&comments)?;
                    Ok(XhsNotePullResult {
                        note_id: note_id.to_string(),
                        pulled,
                        upserted,
                        message: format!("已写入本地 {upserted} 条评论（本次拉到 {pulled} 条）"),
                        verification_required: false,
                    })
                }
                Err(error) => Ok(XhsNotePullResult {
                    note_id: note_id.to_string(),
                    pulled: 0,
                    upserted: 0,
                    verification_required: error.contains("Captcha")
                        || error.contains("verification_required"),
                    message: error,
                }),
            }
        })
    }

    pub fn sync_notes(&self) -> Result<Vec<crate::store::StoredNote>, String> {
        self.xhs.with_lock(|| {
            let Some(account_id) = self.store.active_account_id()? else {
                return Err("还没有当前账号，请先登录".into());
            };
            if self.vault_exists(&account_id) {
                self.install(&account_id)?;
            }
            let probe = self.xhs.probe_unlocked("status");
            let Some(user) = probe.user.clone() else {
                self.store.set_session_ok(&account_id, false)?;
                return Err(probe.message);
            };
            if user.xhs_user_id != account_id {
                return Err("当前登录号和选中的账号不一致，请重新登录或再切一次".into());
            }
            self.store.upsert_account(&user)?;
            self.store.set_session_ok(&account_id, true)?;
            self.save_slot_to_vault(&account_id)?;
            let notes = self.xhs.list_notes_unlocked()?;
            self.store.upsert_notes(&account_id, &notes)?;
            self.store.list_notes(Some(&account_id))
        })
    }

    fn refresh_locked(&self) -> Result<SessionSnapshot, String> {
        let active = self.store.active_account_id()?;
        let probe = self.align_slot(active.as_deref())?;
        Ok(SessionSnapshot {
            accounts: self.accounts_with_files()?,
            active_account_id: self.store.active_account_id()?,
            probe,
        })
    }

    fn align_slot(&self, active: Option<&str>) -> Result<XhsProbe, String> {
        let probe = self.xhs.probe_unlocked("status");
        let slot_user = probe.user.as_ref().map(|user| user.xhs_user_id.clone());
        match (active, slot_user.as_deref()) {
            (Some(active_id), Some(user_id)) if active_id == user_id => {
                if let Some(user) = &probe.user {
                    self.store.upsert_account(user)?;
                }
                self.save_slot_to_vault(active_id)?;
                self.store.set_session_ok(active_id, true)?;
                Ok(probe)
            }
            (None, Some(user_id)) => {
                if let Some(user) = &probe.user {
                    self.store.upsert_account(user)?;
                }
                self.save_slot_to_vault(user_id)?;
                self.store.set_session_ok(user_id, true)?;
                self.store.set_active_account(Some(user_id))?;
                Ok(probe)
            }
            (Some(active_id), Some(user_id)) => {
                if let Some(user) = &probe.user {
                    self.store.upsert_account(user)?;
                    self.save_slot_to_vault(user_id)?;
                }
                if self.vault_exists(active_id) {
                    self.install(active_id)?;
                    return Ok(self.xhs.probe_unlocked("status"));
                }
                self.store.set_session_ok(active_id, false)?;
                Ok(probe)
            }
            (Some(active_id), None) => {
                self.store.set_session_ok(active_id, false)?;
                Ok(probe)
            }
            (None, None) => Ok(probe),
        }
    }

    fn accounts_with_files(&self) -> Result<Vec<StoredAccount>, String> {
        let mut accounts = self.store.list_account_rows()?;
        for account in &mut accounts {
            account.has_session = self.vault_exists(&account.xhs_user_id);
        }
        Ok(accounts)
    }

    fn migrate_cli_slot(&self) -> Result<(), String> {
        if !cookies_look_valid(&self.slot) {
            return Ok(());
        }
        if self.store.active_account_id()?.is_some() {
            return Ok(());
        }
        let probe = self.xhs.probe_unlocked("status");
        let Some(user) = probe.user else {
            return Ok(());
        };
        self.save_slot_to_vault(&user.xhs_user_id)?;
        self.store.upsert_account(&user)?;
        self.store.set_session_ok(&user.xhs_user_id, true)?;
        self.store.set_active_account(Some(&user.xhs_user_id))?;
        Ok(())
    }

    fn capture_active(&self) -> Result<(), String> {
        let Some(active) = self.store.active_account_id()? else {
            return Ok(());
        };
        if !cookies_look_valid(&self.slot) {
            return Ok(());
        }
        let probe = self.xhs.probe_unlocked("status");
        if probe
            .user
            .as_ref()
            .is_some_and(|user| user.xhs_user_id == active)
        {
            self.save_slot_to_vault(&active)?;
        }
        Ok(())
    }

    fn install(&self, account_id: &str) -> Result<(), String> {
        let source = self.vault_path(account_id);
        if !source.is_file() {
            return Err("找不到这个账号的 session 文件".into());
        }
        if let Some(parent) = self.slot.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建 CLI 配置目录：{error}"))?;
        }
        fs::copy(&source, &self.slot).map_err(|error| format!("无法装入 session：{error}"))?;
        restrict_file(&self.slot);
        Ok(())
    }

    fn save_slot_to_vault(&self, account_id: &str) -> Result<(), String> {
        if !cookies_look_valid(&self.slot) {
            return Ok(());
        }
        let dest = self.vault_path(account_id);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建 session 目录：{error}"))?;
        }
        fs::copy(&self.slot, &dest).map_err(|error| format!("无法保存 session：{error}"))?;
        restrict_file(&dest);
        Ok(())
    }

    fn vault_path(&self, account_id: &str) -> PathBuf {
        self.vault.join(sanitize_account_id(account_id)).join("cookies.json")
    }

    fn vault_exists(&self, account_id: &str) -> bool {
        self.vault_path(account_id).is_file()
    }

    fn first_vault_account(&self) -> Result<Option<String>, String> {
        Ok(self
            .accounts_with_files()?
            .into_iter()
            .find(|account| account.has_session)
            .map(|account| account.xhs_user_id))
    }
}

fn collect_comments_unlocked(
    runtime: &XhsRuntime,
    note: &XhsNoteView,
) -> Result<Vec<crate::xhs::XhsCommentView>, String> {
    let status = runtime.run_envelope_unlocked(&["status".into(), "--json".into()], short_timeout_ms())?;
    if let Some(error) = envelope_error(&status) {
        return Err(error);
    }
    let command = comments_command(&note.id, note.xsec_token.as_deref());
    let envelope = runtime.run_envelope_unlocked(&command, comments_timeout_ms())?;
    if let Some(error) = envelope_error(&envelope) {
        let prefix = match envelope_code(&envelope).as_deref() {
            Some("verification_required") => "需要验证码：",
            Some("ip_blocked") => "网络被限制：",
            _ => "",
        };
        return Err(format!("{prefix}{error}"));
    }
    Ok(comments_from_envelope(&envelope, &note.id))
}

pub fn default_cli_cookie_path() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".xiaohongshu-cli")
        .join("cookies.json")
}

fn sanitize_account_id(account_id: &str) -> String {
    account_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn cookies_look_valid(path: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    ["a1", "web_session", "webId"]
        .iter()
        .any(|key| value.get(*key).and_then(|item| item.as_str()).is_some_and(|text| !text.is_empty()))
}

fn clear_cookies(path: &Path) -> Result<(), String> {
    delete_file(path)
}

fn delete_file(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("无法删除 session：{error}")),
    }
}

fn restrict_file(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(path, perms);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::xhs::XhsUserView;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(1);

    fn temp_hub() -> (SessionHub, PathBuf) {
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("xhs-session-test-{n}"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let store = Store::open(root.join("db.sqlite")).unwrap();
        let hub = SessionHub::for_test(
            store,
            root.join("sessions"),
            root.join("cli").join("cookies.json"),
        );
        (hub, root)
    }

    fn write_cookies(path: &Path, a1: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, format!(r#"{{"a1":"{a1}","web_session":"s"}}"#)).unwrap();
    }

    fn user() -> XhsUserView {
        XhsUserView {
            xhs_user_id: "u1".into(),
            red_id: Some("114".into()),
            nickname: "Ada".into(),
            bio: None,
        }
    }

    #[test]
    fn captures_and_installs_session_files() {
        let (hub, root) = temp_hub();
        hub.store.upsert_account(&user()).unwrap();
        hub.store.set_active_account(Some("u1")).unwrap();
        write_cookies(&hub.slot, "cookie-a");
        hub.save_slot_to_vault("u1").unwrap();
        assert!(hub.vault_exists("u1"));

        write_cookies(&hub.slot, "cookie-b");
        hub.install("u1").unwrap();
        let slot = fs::read_to_string(&hub.slot).unwrap();
        assert!(slot.contains("cookie-a"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn capture_does_not_overwrite_vault_when_slot_unverified() {
        let (hub, root) = temp_hub();
        hub.store.upsert_account(&user()).unwrap();
        hub.store.set_active_account(Some("u1")).unwrap();
        write_cookies(&hub.slot, "cookie-a");
        hub.save_slot_to_vault("u1").unwrap();
        write_cookies(&hub.slot, "cookie-b");
        hub.capture_active().unwrap();
        let vault = fs::read_to_string(hub.vault_path("u1")).unwrap();
        assert!(vault.contains("cookie-a"));
        assert!(!vault.contains("cookie-b"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn lists_no_notes_without_active_account() {
        let (hub, root) = temp_hub();
        hub.store.upsert_account(&user()).unwrap();
        hub.store.upsert_notes("u1", &[crate::xhs::XhsNoteView {
            id: "n1".into(),
            title: "金丝熊".into(),
            comments_count: 2,
            xsec_token: None,
        }]).unwrap();
        assert!(hub.list_notes_for_active().unwrap().is_empty());
        hub.store.set_active_account(Some("u1")).unwrap();
        assert_eq!(hub.list_notes_for_active().unwrap().len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_switch_without_vault() {
        let (hub, root) = temp_hub();
        hub.store.upsert_account(&user()).unwrap();
        let err = hub.switch_to("u1").unwrap_err();
        assert!(err.contains("session"));
        let _ = fs::remove_dir_all(root);
    }
}
