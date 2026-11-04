# 0.8.0-rc.20

## 中文

- 修复新版 Codex 使用用户和账号分组的额度缓存后，额度、5 小时/每周余量、刷新时间与可用重置次数显示为空的问题；同步修复额度提醒、定时发送和额度弹窗的数据读取与刷新，保留旧版兼容和账号隔离
- 完成提醒、刷新提醒的提示均显示系统音量；开启任一提醒以及 Codex 界面完整显示后检查音量，显示短暂提示，静音或低于 1% 时明确提醒；不调节系统音量、不抢焦点
- 自动更新优先使用已配置的 HTTP/HTTPS 环境代理或 Windows 手动代理，代理连接失败后回退直连；未配置代理时直连，继续执行签名、大小、下载来源和回滚保护
- GitHub 安装包和源码包保留最新 3 个版本，旧版说明、标签和 Git 历史保留；签名更新索引同步移除更旧的安装包引用

使用便携目录中的 Start.cmd 启动时自动检查更新。正在运行的 Codex 会暂存更新，完成任务并退出后再启动即可安全切换。rc.14 及更早版本仍需手动下载一次便携包。

## English

- Fix blank credits, five-hour/weekly quota, reset times and reset inventory with current Codex user/account-scoped caches. Reminder samples, scheduled sending, usage dialogs and refreshes use the same identity-checked cache reader, with legacy support
- Completion/reset reminder tooltips show system volume. After the Codex interface is fully displayed and whenever either reminder is enabled, a brief volume notice appears; muted or below-1% audio is identified without changing volume or focus
- Automatic updates prefer a configured HTTP/HTTPS environment proxy or Windows manual proxy, fall back to direct access on transport failure, and connect directly when none is configured. Signature, size, source-host and rollback checks remain enforced
- Retain packages for the latest three GitHub releases, remove older package references from the signed update index, and preserve release notes, tags and Git history

Start.cmd checks updates on launch. Updates remain staged while Codex is running and activate safely after tasks finish and Codex is closed. rc.14 and earlier require one manual portable-package download.

## 日本語

- 新しい Codex のユーザー・アカウント別キャッシュに対応し、クレジット、5時間・週間の利用枠、更新時刻、リセット回数の空欄を修正しました。通知・予約送信・利用枠画面も同じ本人確認付きの読み取りを使用し、旧版にも対応します
- 完了通知と更新通知のツールチップに音量を表示します。Codex の画面表示完了後と各通知を有効にした際に音量を確認し、短い通知を表示します。ミュート・1%未満の音量を知らせ、音量やフォーカスは変更しません
- 自動更新は設定済みの HTTP/HTTPS 環境プロキシまたは Windows 手動プロキシを優先し、接続失敗時は直接接続します。未設定なら直接接続し、署名・サイズ・配布元・ロールバックの検証を維持します
- GitHub のインストール用 ZIP とソース ZIP は最新3版を保持します。古い配布物の参照を署名付き更新情報から削除し、リリース説明・タグ・Git 履歴は保持します

Start.cmd で起動時に更新を確認します。Codex 実行中は保留し、タスク完了後に Codex を終了して再起動すると安全に切り替えます。rc.14 以前は一度だけポータブル版を手動取得してください。

## Validation boundary

Automated checks use isolated fixtures for native draft submission, reminders and shutdown scheduling. Live Codex quota/cache and signed-index reads are read-only. Checks do not submit real drafts, restart the user's Codex, play audible music or change system volume. Public verification checks GitHub's stored asset hashes and downloads the small signed index; it does not re-download the complete public ZIP files.
