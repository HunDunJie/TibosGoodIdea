# 0.8.0-rc.25

## 中文

- 修复 Codex 26.1106.6628.0 的定时发送：识别新版提交组件，继续调用原生提交回调，避免触发后全部草稿被跳过
- 自动识别增加提交组件结构校验与运行时只读验证，支持已验证的新旧结构；按当前客户端资源指纹重新发现并记录诊断信息
- 跳过隐藏的保留编辑器，按目标聊天寻找编辑器；未知或歧义接口明确报错，提交未就绪时保留草稿并显示需处理
- 修复卸载时运行时文件短暂被占用导致中止的问题：对共享或锁定冲突进行有界等待，其他错误仍直接报告
- 保留额度主动刷新、原生重置入口、提醒与任务监测功能

运行中的 Codex 只暂存更新。完成任务并退出 Codex 后，通过原来的 Start.cmd 启动即可切换新版。

## English

- Restore scheduled sending on Codex 26.1106.6628.0 by recognizing its current submission component and delegating to native submission callbacks
- Discover verified legacy and current component structures, validate live handlers without submitting, and record discovery against renderer resource fingerprints
- Ignore hidden retained editors, match the target conversation, explain unknown or ambiguous interfaces, and preserve drafts when submission is not ready
- Retry transient sharing/lock violations for a bounded time during uninstall; report other removal failures immediately
- Retain active usage refresh, native reset-page access, reminders and task monitoring

Updates remain staged while Codex runs. Finish tasks, close Codex, then use the existing Start.cmd to activate.

## 日本語

- Codex 26.1106.6628.0 の新しい送信コンポーネントを識別し、ネイティブ送信コールバックによる予約送信を修復しました
- 検証済みの新旧構造を自動検出し、送信せずに実行中のインターフェースを確認します。診断情報をクライアントのリソース指紋と対応付けます
- 非表示の保持エディターを除外し、対象チャットを照合します。不明・曖昧なインターフェースや送信未準備の状態を明示し、下書きを保持します
- アンインストール時の一時的な共有・ロック違反を制限時間内で再試行します。他の削除エラーは直ちに報告します
- 使用量の自動更新、リセット画面、通知、タスク監視を維持します

Codex 実行中は更新を準備します。タスク完了後に Codex を終了し、既存の Start.cmd で起動すると切り替わります。

## Verification boundary

The installed Codex 26.1106.6628.0 submission structure was validated read-only using an isolated adapter instance. Its current native callback was recognized without sending drafts or replacing the running adapter. Usage polling, reset exports and ongoing task detection were checked on the live client. Simulated submissions, unsupported/ambiguous structures, hidden editors, lifecycle and transient file locks are covered by isolated tests. No real reset, audible playback or actual shutdown was triggered. Automatic discovery supports verified structural contracts; a change to submission semantics still requires compatibility work.
