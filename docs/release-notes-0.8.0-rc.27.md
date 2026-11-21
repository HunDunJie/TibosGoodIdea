# Tibo’s Good Idea 0.8.0-rc.27

## 中文

- 定时发送和刷新提醒同时判断5小时额度与每周额度；任一额度仍用尽时继续等待，两者都用尽时等待较晚的恢复时间
- 在决定恢复可用的刷新时间后统一等待3分钟，提示显示实际执行时间；发送前再用新额度响应确认两种额度可用
- 保留重置卡改期、账户隔离、服务重启和单轮去重；升级后旧的单额度计划等待新数据再安排
- 适配 Codex 26.1117.4957.0 的分包聊天身份和草稿接口，恢复定时发送、完成提醒与任务检查；正确区分未初始化的云端客户端和真实连接异常

Codex 运行期间只暂存更新。完成任务并退出 Codex 后，使用现有 Start.cmd 启动以切换版本。

## English

- Scheduled sending and reset reminders consider both 5h and weekly quotas, waiting for the later recovery when both are exhausted
- Wait 3 minutes after the relevant reset and show the actual execution time; sending requires a fresh response confirming both quotas are usable
- Preserve reset-card rescheduling, account isolation, restart recovery and one-shot deduplication; legacy plans require updated quota data after upgrade
- Support the split thread identity and draft interfaces in Codex 26.1117.4957.0, restoring sending, completion events and task monitoring, including uninitialized cloud-client handling

Updates remain staged while Codex runs. Finish tasks, close Codex, then use the existing Start.cmd to activate.

## 日本語

- 予約送信と更新通知は5時間枠と週間枠を両方確認し、両方を使い切った場合は遅い方の回復を待ちます
- 利用可能になる更新の3分後に実行し、実行時刻を表示します。送信前には最新の応答で両枠の利用可否を確認します
- リセットカードによる時刻変更、アカウント分離、再起動時の復元、重複防止を維持します。旧形式の予定は更新後の使用量データで再設定します
- Codex 26.1117.4957.0 の分割されたスレッド識別と下書きインターフェースに対応し、送信・完了通知・タスク確認を修復しました

Codex 実行中は更新を準備します。タスク完了後に Codex を終了し、既存の Start.cmd で起動すると切り替わります。

## Verification boundary

The installed Codex 26.1117.4957.0 was inspected through an isolated read-only adapter. Native draft component recognition, navigation exports, completion subscription, usage refresh, reset API exports and task readback passed. The running adapter was not replaced. No real draft was submitted, reset consumed, audible playback requested or shutdown triggered. Isolated regression tests cover both quota windows, delayed execution, rescheduling, stale responses, restart recovery and native submissions. Full release validation is recorded by the repository release workflow.
