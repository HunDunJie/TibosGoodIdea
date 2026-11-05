# 0.8.0-rc.21

## 中文

- 修复 Codex 26.1029.7803.0 更换打包结构后无法识别客户端、自动更新停留在旧版的问题。新识别器读取实际 HTML 入口，旧版客户端指纹保持不变；更新仍要求签名索引中的明确兼容记录
- 修复“无法识别客户端”“有新版但尚未验证兼容”“更新器或校验条件阻止更新”被误报为“已是最新”的问题。启动时显示对应提示，状态记录保留最新版本和阻止原因；这些状态不会激活旧的待更新决定
- 适配新打包结构的完成提醒、定时发送和任务检查接口，逐项验证原生接口和作用域；无法确认的接口保持关闭，不代替用户发送草稿
- 完整显示后检查音量；隐藏窗口等待可见后再提示。启动时读取音量失败也显示明确提示，保留静音、低音量提醒及双提醒按钮的音量说明
- 新增旧更新器的修复入口：先下载并验证签名版本，保留原始 Start.cmd，下一次安全启动使用新版更新器。每次执行前重新验证全部版本文件；当前聊天和运行中的服务不被切换。维护命令为 update-cli.mjs repair-bootstrap
- 保留代理优先、失败回退直连、无代理则直连，以及 GitHub 最新 3 个版本包的保留策略

通过 TiBo 目录内的 Start.cmd 启动。正在运行 Codex 时只暂存更新，完成任务并退出 Codex 后再启动才会切换。旧更新器已经卡住的安装需要一次修复入口衔接，或下载新版便携包；仅重新打开 Codex 不能修复旧更新器。rc.14 及更早安装仍需手动下载一次便携包。

## English

- Recognize the Rspack renderer shipped in Codex 26.1029.7803.0 from its actual HTML entry points while preserving legacy fingerprints. Automatic installation still requires an explicitly compatible, signed catalog entry
- Distinguish unidentified clients, newer releases without verified compatibility, and blocked updater/validation requirements from an up-to-date installation. Report the latest version and blocking reason; these states cannot activate an earlier pending release
- Discover completion, native draft submission and task-monitor interfaces independently in the new module layout. Unverified contracts remain disabled
- Wait for a visible, complete interface before the startup volume notice; report unavailable volume reads as well as mute/low volume. Both reminder tooltips retain volume information
- Recover a stuck legacy updater using a verified version and a backed-up Start.cmd. The recovery entry verifies all signed payload files before execution, and hands off at the next safe start without switching running services. Maintainer command: update-cli.mjs repair-bootstrap
- Retain proxy-first/direct-fallback networking and packages for the latest three GitHub versions

Use Start.cmd. Updates stay staged while Codex is running and switch after tasks finish and Codex closes. A stuck legacy updater needs one recovery handoff or a new portable extraction. rc.14 and earlier require a manual portable download.

## 日本語

- Codex 26.1029.7803.0 の Rspack 構成を HTML の実際のエントリーから識別します。旧フィンガープリントを維持し、自動適用には署名付き索引の明示的な互換性確認を必要とします
- クライアント識別失敗、互換性未検証の新版、更新要件や検証による保留を「最新版」と誤表示しないよう修正しました。起動時に理由を表示し、古い適用待ち更新を有効にしません
- 新構成の完了通知、予約送信、タスク確認を個別に検証します。確認できないインターフェースは無効のままにします
- 画面が完全に表示されてから音量を確認します。非表示中は待機し、音量を取得できない場合も通知します。ミュート・低音量と両通知ボタンの音量表示を維持します
- 検証済みバージョンと元の Start.cmd のバックアップを使い、停止した旧更新器を復旧できます。実行前に署名付きファイルを再検証し、次の安全な起動時に引き継ぎます。保守用コマンド：update-cli.mjs repair-bootstrap
- プロキシ優先・失敗時の直接接続、最新3版の配布物保持を維持します

Start.cmd で起動してください。Codex 実行中は更新を準備し、タスク完了後に Codex を終了して再起動すると切り替わります。停止した旧更新器は一度の復旧処理または新版の展開が必要です。rc.14 以前は手動取得が必要です。

## Verification boundary

The installed Codex module exports, scope stores, navigation methods and quota reads are checked read-only. Native draft sending, completion delivery, volume UI and shutdown behavior use isolated fixtures; checks do not send real drafts, play audible music, change system volume or restart the user's Codex. Public large-download and local recovery results are recorded separately from the standard release verification.
