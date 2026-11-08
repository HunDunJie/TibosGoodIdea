# 0.8.0-rc.23

## 中文

- 修复新版 Codex 中点击底栏“可用重置”无法打开重置页面的问题
- 识别新版 Rspack 数字模块，并使用客户端原有的依赖加载和原生重置弹窗；保留旧版入口兼容
- 保留重置次数、当前聊天和回合的原生记录逻辑，支持本地、远程和快捷窗口中的聊天

通过 TiBo 目录内的 Start.cmd 启动。正在运行 Codex 时只暂存更新，完成任务并退出 Codex 后再启动才会切换。

## English

- Fix the Available resets button failing to open the native reset page in newer Codex clients
- Discover numbered Rspack modules and use the client's original dependency loading group and reset dialog, while retaining older client support
- Preserve native reset inventory and conversation/turn recording for local, remote and hotkey-window chats

Use Start.cmd. Updates stay staged while Codex is running and switch after tasks finish and Codex closes.

## 日本語

- 新しい Codex で底部バーの「利用可能なリセット」からリセット画面を開けない問題を修正しました
- Rspack の数字名モジュールを識別し、クライアント本来の依存関係の読み込みとリセット画面を使用します。旧版との互換性も維持します
- ローカル、リモート、ショートカットウィンドウのチャットで、リセット回数と会話・ターンの記録を維持します

Start.cmd で起動してください。Codex 実行中は更新を準備し、タスク完了後に Codex を終了して再起動すると切り替わります。

## Verification boundary

Read-only checks in installed Codex 26.1103.4239.0 verified the native loading group, all six API exports and the matching root store. Isolated tests cover direct opening in three languages, local/remote/hotkey-window routes, reset-completion callbacks, alternative store providers and legacy bindings. Checks do not open a dialog in the user's working window, consume a real reset, send drafts, play audio or restart Codex.
