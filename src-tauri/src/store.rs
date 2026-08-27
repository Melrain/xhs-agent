use crate::xhs::{XhsCommentView, XhsNoteView, XhsUserView};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct Store {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccount {
    pub xhs_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub red_id: Option<String>,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    pub session_ok: bool,
    pub last_used_at: i64,
    pub has_session: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredNote {
    pub id: String,
    pub account_id: String,
    pub title: String,
    pub comments_count: i64,
    pub stored_comments: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xsec_token: Option<String>,
    pub synced_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredComment {
    pub id: String,
    pub note_id: String,
    pub author_id: String,
    pub nickname: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commented_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ip_location: Option<String>,
    pub like_count: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_title: Option<String>,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("无法创建数据目录：{error}"))?;
        }
        let conn = Connection::open(path).map_err(|error| format!("无法打开数据库：{error}"))?;
        Self::from_connection(conn)
    }

    pub fn open_app_data(dir: PathBuf) -> Result<Self, String> {
        Self::open(dir.join("xhs-local.sqlite"))
    }

    #[cfg(test)]
    fn memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|error| error.to_string())?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, String> {
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS accounts (
                xhs_user_id TEXT PRIMARY KEY,
                red_id TEXT,
                nickname TEXT NOT NULL DEFAULT '',
                bio TEXT,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                title TEXT NOT NULL,
                comments_count INTEGER NOT NULL DEFAULT 0,
                xsec_token TEXT,
                synced_at INTEGER NOT NULL,
                FOREIGN KEY (account_id) REFERENCES accounts(xhs_user_id)
            );
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                nickname TEXT NOT NULL DEFAULT '',
                avatar_url TEXT,
                content TEXT NOT NULL DEFAULT '',
                commented_at INTEGER,
                ip_location TEXT,
                like_count INTEGER NOT NULL DEFAULT 0,
                synced_at INTEGER NOT NULL,
                FOREIGN KEY (note_id) REFERENCES notes(id)
            );
            CREATE INDEX IF NOT EXISTS comments_note_id ON comments(note_id);
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| format!("初始化数据库失败：{error}"))?;
        for sql in [
            "ALTER TABLE accounts ADD COLUMN session_ok INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE accounts ADD COLUMN last_used_at INTEGER NOT NULL DEFAULT 0",
        ] {
            let _ = conn.execute(sql, []);
        }
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn upsert_account(&self, user: &XhsUserView) -> Result<(), String> {
        let now = now_ms();
        let conn = self.lock()?;
        conn.execute(
            "
            INSERT INTO accounts (xhs_user_id, red_id, nickname, bio, updated_at, session_ok, last_used_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 0, 0)
            ON CONFLICT(xhs_user_id) DO UPDATE SET
                red_id = excluded.red_id,
                nickname = excluded.nickname,
                bio = excluded.bio,
                updated_at = excluded.updated_at
            ",
            params![
                user.xhs_user_id,
                user.red_id,
                user.nickname,
                user.bio,
                now
            ],
        )
        .map_err(|error| format!("写入账号失败：{error}"))?;
        Ok(())
    }

    pub fn set_session_ok(&self, account_id: &str, ok: bool) -> Result<(), String> {
        let now = now_ms();
        let conn = self.lock()?;
        conn.execute(
            "UPDATE accounts SET session_ok = ?1, last_used_at = ?2 WHERE xhs_user_id = ?3",
            params![ok as i64, now, account_id],
        )
        .map_err(|error| format!("更新账号状态失败：{error}"))?;
        Ok(())
    }

    pub fn active_account_id(&self) -> Result<Option<String>, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT value FROM app_state WHERE key = 'active_account_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("读取当前账号失败：{error}"))
        .map(|value| value.filter(|id| !id.is_empty()))
    }

    pub fn set_active_account(&self, account_id: Option<&str>) -> Result<(), String> {
        let conn = self.lock()?;
        match account_id.filter(|id| !id.is_empty()) {
            Some(id) => {
                conn.execute(
                    "
                    INSERT INTO app_state (key, value) VALUES ('active_account_id', ?1)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                    ",
                    [id],
                )
                .map_err(|error| format!("写入当前账号失败：{error}"))?;
            }
            None => {
                conn.execute("DELETE FROM app_state WHERE key = 'active_account_id'", [])
                    .map_err(|error| format!("清除当前账号失败：{error}"))?;
            }
        }
        Ok(())
    }

    pub fn list_account_rows(&self) -> Result<Vec<StoredAccount>, String> {
        let active = self.active_account_id()?;
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "
                SELECT xhs_user_id, red_id, nickname, bio, session_ok, last_used_at
                FROM accounts
                ORDER BY last_used_at DESC, updated_at DESC, xhs_user_id
                ",
            )
            .map_err(|error| format!("查询账号失败：{error}"))?;
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                Ok(StoredAccount {
                    is_active: active.as_deref() == Some(id.as_str()),
                    xhs_user_id: id,
                    red_id: row.get(1)?,
                    nickname: row.get(2)?,
                    bio: row.get(3)?,
                    session_ok: row.get::<_, i64>(4)? != 0,
                    last_used_at: row.get(5)?,
                    has_session: false,
                })
            })
            .map_err(|error| format!("读取账号失败：{error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取账号失败：{error}"))
    }

    pub fn upsert_notes(&self, account_id: &str, notes: &[XhsNoteView]) -> Result<i64, String> {
        let now = now_ms();
        let conn = self.lock()?;
        let mut count = 0_i64;
        for note in notes {
            conn.execute(
                "
                INSERT INTO notes (id, account_id, title, comments_count, xsec_token, synced_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(id) DO UPDATE SET
                    account_id = excluded.account_id,
                    title = excluded.title,
                    comments_count = excluded.comments_count,
                    xsec_token = excluded.xsec_token,
                    synced_at = excluded.synced_at
                ",
                params![
                    note.id,
                    account_id,
                    note.title,
                    note.comments_count,
                    note.xsec_token,
                    now
                ],
            )
            .map_err(|error| format!("写入笔记失败：{error}"))?;
            count += 1;
        }
        Ok(count)
    }

    pub fn upsert_comments(&self, comments: &[XhsCommentView]) -> Result<i64, String> {
        let now = now_ms();
        let conn = self.lock()?;
        let mut count = 0_i64;
        for comment in comments {
            conn.execute(
                "
                INSERT INTO comments (
                    id, note_id, author_id, nickname, avatar_url, content,
                    commented_at, ip_location, like_count, synced_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ON CONFLICT(id) DO UPDATE SET
                    note_id = excluded.note_id,
                    author_id = excluded.author_id,
                    nickname = excluded.nickname,
                    avatar_url = excluded.avatar_url,
                    content = excluded.content,
                    commented_at = excluded.commented_at,
                    ip_location = excluded.ip_location,
                    like_count = excluded.like_count,
                    synced_at = excluded.synced_at
                ",
                params![
                    comment.id,
                    comment.note_id,
                    comment.author_id,
                    comment.nickname,
                    comment.avatar_url,
                    comment.content,
                    comment.commented_at,
                    comment.ip_location,
                    comment.like_count,
                    now
                ],
            )
            .map_err(|error| format!("写入评论失败：{error}"))?;
            count += 1;
        }
        Ok(count)
    }

    pub fn list_notes(&self, account_id: Option<&str>) -> Result<Vec<StoredNote>, String> {
        let conn = self.lock()?;
        let sql = "
                SELECT
                    n.id, n.account_id, n.title, n.comments_count, n.xsec_token, n.synced_at,
                    (SELECT COUNT(*) FROM comments c WHERE c.note_id = n.id)
                FROM notes n
                WHERE (?1 IS NULL OR n.account_id = ?1)
                ORDER BY n.synced_at DESC, n.id DESC
                ";
        let mut stmt = conn
            .prepare(sql)
            .map_err(|error| format!("查询笔记失败：{error}"))?;
        let rows = stmt
            .query_map([account_id], |row| {
                Ok(StoredNote {
                    id: row.get(0)?,
                    account_id: row.get(1)?,
                    title: row.get(2)?,
                    comments_count: row.get(3)?,
                    xsec_token: row.get(4)?,
                    synced_at: row.get(5)?,
                    stored_comments: row.get(6)?,
                })
            })
            .map_err(|error| format!("读取笔记失败：{error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取笔记失败：{error}"))
    }

    pub fn get_note(&self, note_id: &str) -> Result<Option<StoredNote>, String> {
        let conn = self.lock()?;
        conn.query_row(
            "
            SELECT
                n.id, n.account_id, n.title, n.comments_count, n.xsec_token, n.synced_at,
                (SELECT COUNT(*) FROM comments c WHERE c.note_id = n.id)
            FROM notes n
            WHERE n.id = ?1
            ",
            [note_id],
            |row| {
                Ok(StoredNote {
                    id: row.get(0)?,
                    account_id: row.get(1)?,
                    title: row.get(2)?,
                    comments_count: row.get(3)?,
                    xsec_token: row.get(4)?,
                    synced_at: row.get(5)?,
                    stored_comments: row.get(6)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("读取笔记失败：{error}"))
    }

    pub fn list_comments(&self, note_id: &str) -> Result<Vec<StoredComment>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "
                SELECT id, note_id, author_id, nickname, avatar_url, content,
                       commented_at, ip_location, like_count
                FROM comments
                WHERE note_id = ?1
                ORDER BY commented_at DESC, id DESC
                ",
            )
            .map_err(|error| format!("查询评论失败：{error}"))?;
        let rows = stmt
            .query_map([note_id], |row| {
                Ok(StoredComment {
                    id: row.get(0)?,
                    note_id: row.get(1)?,
                    author_id: row.get(2)?,
                    nickname: row.get(3)?,
                    avatar_url: row.get(4)?,
                    content: row.get(5)?,
                    commented_at: row.get(6)?,
                    ip_location: row.get(7)?,
                    like_count: row.get(8)?,
                    note_title: None,
                })
            })
            .map_err(|error| format!("读取评论失败：{error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取评论失败：{error}"))
    }

    pub fn list_comments_for_account(&self, account_id: &str) -> Result<Vec<StoredComment>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "
                SELECT
                    c.id, c.note_id, c.author_id, c.nickname, c.avatar_url, c.content,
                    c.commented_at, c.ip_location, c.like_count, n.title
                FROM comments c
                INNER JOIN notes n ON n.id = c.note_id
                WHERE n.account_id = ?1
                ORDER BY c.commented_at DESC, c.id DESC
                ",
            )
            .map_err(|error| format!("查询评论用户失败：{error}"))?;
        let rows = stmt
            .query_map([account_id], |row| {
                Ok(StoredComment {
                    id: row.get(0)?,
                    note_id: row.get(1)?,
                    author_id: row.get(2)?,
                    nickname: row.get(3)?,
                    avatar_url: row.get(4)?,
                    content: row.get(5)?,
                    commented_at: row.get(6)?,
                    ip_location: row.get(7)?,
                    like_count: row.get(8)?,
                    note_title: row.get(9)?,
                })
            })
            .map_err(|error| format!("读取评论用户失败：{error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取评论用户失败：{error}"))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        Ok(self.conn.lock().unwrap_or_else(|error| error.into_inner()))
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user() -> XhsUserView {
        XhsUserView {
            xhs_user_id: "u1".into(),
            red_id: Some("114".into()),
            nickname: "Ada".into(),
            bio: None,
        }
    }

    fn note() -> XhsNoteView {
        XhsNoteView {
            id: "n1".into(),
            title: "金丝熊".into(),
            comments_count: 2,
            xsec_token: Some("tok".into()),
        }
    }

    #[test]
    fn upserts_notes_and_comments() {
        let store = Store::memory().unwrap();
        store.upsert_account(&user()).unwrap();
        assert_eq!(store.upsert_notes("u1", &[note()]).unwrap(), 1);
        let notes = store.list_notes(Some("u1")).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "金丝熊");
        assert_eq!(notes[0].stored_comments, 0);
        assert!(store.list_notes(Some("other")).unwrap().is_empty());

        let upserted = store
            .upsert_comments(&[XhsCommentView {
                id: "c1".into(),
                note_id: "n1".into(),
                author_id: "u2".into(),
                nickname: "无语大王".into(),
                avatar_url: None,
                content: "多少钱".into(),
                commented_at: Some(1_752_580_535_000),
                ip_location: Some("上海".into()),
                like_count: 3,
            }])
            .unwrap();
        assert_eq!(upserted, 1);
        let comments = store.list_comments("n1").unwrap();
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].content, "多少钱");
        assert_eq!(store.list_notes(Some("u1")).unwrap()[0].stored_comments, 1);
        let people = store.list_comments_for_account("u1").unwrap();
        assert_eq!(people.len(), 1);
        assert_eq!(people[0].note_title.as_deref(), Some("金丝熊"));
        assert_eq!(people[0].author_id, "u2");
    }

    #[test]
    fn remembers_active_account() {
        let store = Store::memory().unwrap();
        store.upsert_account(&user()).unwrap();
        assert_eq!(store.active_account_id().unwrap(), None);
        store.set_active_account(Some("u1")).unwrap();
        assert_eq!(store.active_account_id().unwrap().as_deref(), Some("u1"));
        store.set_session_ok("u1", true).unwrap();
        let accounts = store.list_account_rows().unwrap();
        assert_eq!(accounts.len(), 1);
        assert!(accounts[0].is_active);
        assert!(accounts[0].session_ok);
        store.set_active_account(None).unwrap();
        assert_eq!(store.active_account_id().unwrap(), None);
    }

    #[test]
    fn updates_existing_comment() {
        let store = Store::memory().unwrap();
        store.upsert_account(&user()).unwrap();
        store.upsert_notes("u1", &[note()]).unwrap();
        let comment = XhsCommentView {
            id: "c1".into(),
            note_id: "n1".into(),
            author_id: "u2".into(),
            nickname: "Ada".into(),
            avatar_url: None,
            content: "旧".into(),
            commented_at: Some(1),
            ip_location: None,
            like_count: 0,
        };
        store.upsert_comments(&[comment.clone()]).unwrap();
        let mut next = comment;
        next.content = "新".into();
        store.upsert_comments(&[next]).unwrap();
        assert_eq!(store.list_comments("n1").unwrap()[0].content, "新");
    }
}
