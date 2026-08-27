# 评论用户（xhs-agent）

本机桌面端，用来登录小红书、同步自己的笔记，并拉取笔记下的评论用户。

支持 **Windows x64**、**Apple Silicon**、**Linux x64**。装过一次之后，后续版本会在应用里自动更新。

## 下载

到 [Releases](https://github.com/Melrain/xhs-agent/releases/latest) 选对应系统的安装包：

- Windows：`.exe`
- macOS（M 芯片）：`.dmg`
- Linux：`.AppImage`

Intel Mac 没有安装包。

## 发布新版本

1. 改 `src-tauri/tauri.conf.json` 和 `package.json` 的 `version`
2. 打 tag 并推送：`git tag v0.1.1 && git push origin v0.1.1`
3. GitHub Actions 会打三端包、签名，并更新 `latest.json`

仓库 Secrets 需要：

- `TAURI_SIGNING_PRIVATE_KEY`：签名私钥全文
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：若私钥无密码可留空

私钥在本机 `~/.tauri/xhs-agent.key`，不要提交到 git。
