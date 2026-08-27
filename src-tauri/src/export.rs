use crate::store::StoredComment;
use chrono::{Local, TimeZone};
use rust_xlsxwriter::{Format, Workbook, Worksheet};
use std::path::Path;

const HEADERS: &[&str] = &[
    "序号",
    "昵称",
    "用户ID",
    "地区",
    "评论时间",
    "点赞",
    "笔记标题",
    "笔记ID",
    "评论内容",
];

pub fn write_comments_xlsx(path: &Path, comments: &[StoredComment]) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let header = Format::new().set_bold();
    let wrap = Format::new().set_text_wrap();
    let sheet = workbook.add_worksheet();
    sheet
        .set_name("评论用户")
        .map_err(|error| format!("无法创建工作表：{error}"))?;
    sheet.set_freeze_panes(1, 0).map_err(map_xlsx)?;
    for (column, title) in HEADERS.iter().enumerate() {
        sheet
            .write_with_format(0, column as u16, *title, &header)
            .map_err(map_xlsx)?;
    }
    sheet.set_column_width(0, 6).map_err(map_xlsx)?;
    sheet.set_column_width(1, 16).map_err(map_xlsx)?;
    sheet.set_column_width(2, 24).map_err(map_xlsx)?;
    sheet.set_column_width(3, 10).map_err(map_xlsx)?;
    sheet.set_column_width(4, 18).map_err(map_xlsx)?;
    sheet.set_column_width(5, 8).map_err(map_xlsx)?;
    sheet.set_column_width(6, 28).map_err(map_xlsx)?;
    sheet.set_column_width(7, 24).map_err(map_xlsx)?;
    sheet.set_column_width(8, 48).map_err(map_xlsx)?;

    for (index, comment) in comments.iter().enumerate() {
        write_row(sheet, index, comment, &wrap)?;
    }

    workbook
        .save(path)
        .map_err(|error| format!("写入 Excel 失败：{error}"))
}

fn write_row(
    sheet: &mut Worksheet,
    index: usize,
    comment: &StoredComment,
    wrap: &Format,
) -> Result<(), String> {
    let row = (index + 1) as u32;
    let nickname = excel_text(&comment.nickname);
    let location = excel_text(comment.ip_location.as_deref().unwrap_or(""));
    let title = excel_text(comment.note_title.as_deref().unwrap_or(""));
    let content = excel_text(&comment.content);
    sheet.write(row, 0, (index + 1) as i32).map_err(map_xlsx)?;
    sheet.write(row, 1, nickname.as_str()).map_err(map_xlsx)?;
    sheet
        .write(row, 2, comment.author_id.as_str())
        .map_err(map_xlsx)?;
    sheet.write(row, 3, location.as_str()).map_err(map_xlsx)?;
    sheet
        .write(row, 4, format_time(comment.commented_at).as_str())
        .map_err(map_xlsx)?;
    sheet.write(row, 5, comment.like_count).map_err(map_xlsx)?;
    sheet.write(row, 6, title.as_str()).map_err(map_xlsx)?;
    sheet
        .write(row, 7, comment.note_id.as_str())
        .map_err(map_xlsx)?;
    sheet
        .write_with_format(row, 8, content.as_str(), wrap)
        .map_err(map_xlsx)?;
    Ok(())
}

fn format_time(value: Option<i64>) -> String {
    let Some(ms) = value.filter(|item| *item > 0) else {
        return String::new();
    };
    let seconds = ms.div_euclid(1000);
    Local
        .timestamp_opt(seconds, 0)
        .single()
        .map(|time| time.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_default()
}

fn excel_text(value: &str) -> String {
    match value.chars().next() {
        Some('=' | '+' | '-' | '@') => format!("'{value}"),
        _ => value.to_string(),
    }
}

fn map_xlsx(error: rust_xlsxwriter::XlsxError) -> String {
    format!("写入 Excel 失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_real_xlsx() {
        let dir = std::env::temp_dir().join(format!("xhs-export-{}.xlsx", std::process::id()));
        write_comments_xlsx(
            &dir,
            &[StoredComment {
                id: "c1".into(),
                note_id: "n1".into(),
                author_id: "u2".into(),
                nickname: "无语大王".into(),
                avatar_url: None,
                content: "多少钱".into(),
                commented_at: Some(1_752_580_535_000),
                ip_location: Some("上海".into()),
                like_count: 3,
                note_title: Some("金丝熊".into()),
            }],
        )
        .unwrap();
        let bytes = std::fs::read(&dir).unwrap();
        std::fs::remove_file(&dir).ok();
        assert_eq!(&bytes[..2], b"PK");
    }

    #[test]
    fn prefixes_excel_formulas() {
        assert_eq!(excel_text("=1+1"), "'=1+1");
        assert_eq!(excel_text("多少钱"), "多少钱");
    }

    #[test]
    fn formats_comment_time_in_local_zone() {
        let text = format_time(Some(1_752_580_535_000));
        assert!(!text.is_empty());
        assert_ne!(text, "1970-01-01 00:00");
    }
}
