# 0.8.0-rc.22

## 中文

- 完成提醒和刷新提醒的悬浮说明不再追加系统音量，恢复为功能和开启状态说明
- 音量只在按钮附近的独立提示框显示：开启哪个提醒，就在对应按钮上方提示；启动检查也在提醒按钮附近显示，窗口调整后跟随按钮位置
- 保持现有音量读取、低音量判断、静音提醒和检查时机不变

通过 TiBo 目录内的 Start.cmd 启动。正在运行 Codex 时只暂存更新，完成任务并退出 Codex 后再启动才会切换。

## English

- Remove system volume from the completion and reset reminder tooltips, keeping their feature descriptions and enabled state
- Show volume in a separate notice above the corresponding reminder button. Startup notices also stay near the reminder buttons, and positioning follows window resizing
- Keep existing volume reads, low-volume thresholds, mute warnings and check timing unchanged

Use Start.cmd. Updates stay staged while Codex is running and switch after tasks finish and Codex closes.

## 日本語

- 完了通知とリセット通知のツールチップからシステム音量を削除し、機能説明と有効状態の表示に戻しました
- 音量は対応する通知ボタンの上に独立した通知枠で表示します。起動時も通知ボタン付近に表示し、ウィンドウのサイズ変更に追従します
- 既存の音量取得、低音量のしきい値、ミュート通知と確認タイミングは変更しません

Start.cmd で起動してください。Codex 実行中は更新を準備し、タスク完了後に Codex を終了して再起動すると切り替わります。

## Verification boundary

UI behavior is checked in an isolated preview. Tests do not play audio, change system volume or restart the user's Codex.
