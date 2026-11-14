# Tibo’s Good Idea 0.8.0-rc.26

## 中文

- 适配 Codex 26.1111.2228.0，修复原生“可用重置”入口在会话识别逻辑拆分到独立模块后无法完整识别的问题
- 自动跟随原生重置回调使用的会话 Hook，核验它的导出、路由参数和 ID 解码函数；等价的模块副本可以识别，缺失或冲突的接口继续停止适配
- 重置完成时保留原生会话范围；新版只处理本地会话和快捷窗口，旧版保留原有行为
- 校验当前客户端的额度缓存、重置接口导出、发送结构和任务读取，并为本次验证的客户端指纹发布签名更新

Codex 运行期间只暂存更新。完成任务并退出 Codex 后，使用现有 Start.cmd 启动以切换版本。

## English

- Support Codex 26.1111.2228.0 and restore native Available resets discovery after its conversation hook moved into a separate module
- Follow the hook used by the native reset callback and verify its export, route parameters and ID decoder; accept equivalent module copies and reject missing or conflicting contracts
- Preserve the native callback's conversation scope: local and hotkey-window threads for the new hook, with existing behavior retained for older clients
- Check the live quota cache, reset API exports, submission structure and task readback, and publish a signed update for the verified client fingerprint

Updates remain staged while Codex runs. Finish tasks, close Codex, then use the existing Start.cmd to activate.

## 日本語

- Codex 26.1111.2228.0 に対応し、会話識別 Hook が別モジュールへ移動した後のネイティブ利用可能リセット機能の検出を修復しました
- リセット完了コールバックが使用する Hook のエクスポート、ルート引数、ID デコーダーを検証します。同等のモジュール複製を識別し、不明・競合する構造は引き続き拒否します
- ネイティブの会話範囲を維持します。新しい Hook はローカル会話とホットキーウィンドウを扱い、旧クライアントの動作は変更しません
- 実行中クライアントの使用量キャッシュ、リセット API、送信構造、タスク読み取りを確認し、検証済み指紋に署名付き更新を公開します

Codex 実行中は更新を準備します。タスク完了後に Codex を終了し、既存の Start.cmd で起動すると切り替わります。

## Verification boundary

The installed Codex 26.1111.2228.0 was checked through read-only native export inspection and an isolated feature adapter. The running adapter was not replaced. The reset modal was not opened, reset credits were not consumed, real drafts were not submitted, and no audible playback or shutdown was triggered. Route-scoped reset completion, equivalent and conflicting module copies, old renderer contracts and simulated submissions are covered by isolated tests. This compatibility repair does not claim to fix the separate Codex account/workspace initialization timeout observed earlier.
