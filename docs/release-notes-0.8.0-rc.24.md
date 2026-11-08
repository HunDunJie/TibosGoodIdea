# 0.8.0-rc.24

## 中文

- 修复额度只重复显示旧缓存的问题：每 30 秒主动查询，回到前台时校正，查询成功后立即同步底栏与提醒样本
- 新版 Codex 的原生额度查询暂停或等待推送时，使用经识别的客户端原生用量读取接口；旧版暂停查询也能执行，空缓存不再阻止刷新
- 合并重复请求、限制刷新频率，失败后退避重试；切换账户、退出组件或收到更新的原生推送时，避免迟到响应覆盖有效数据
- 修复新版 Codex 将导航状态放入外部模块后，定时发送被误判为不可用的问题；继续使用原生导航和提交回调
- 保留 rc.23 的可用重置入口修复及现有提醒、音量和安全启动行为

通过 TiBo 目录内的 Start.cmd 启动。运行中的 Codex 只暂存更新；完成任务并退出 Codex 后再次启动才会切换。

## English

- Actively refresh usage every 30 seconds and on returning to the foreground, updating the bottom bar and reminder samples after successful requests
- Use the verified native usage reader when newer clients pause polling for push updates; execute disabled legacy queries and recover missing usage caches
- Coalesce and throttle requests, back off after failures, and reject late responses after account changes, disposal or newer native updates
- Restore scheduled-send compatibility when newer Codex clients store navigation in an external module, retaining native navigation and submission callbacks
- Retain the rc.23 reset-page fix and existing reminder, volume and safe-start behavior

Use Start.cmd. Updates remain staged while Codex is running and activate after tasks finish and Codex closes.

## 日本語

- 30 秒ごと、および前面に戻った際に使用量を取得し、取得成功後に底部バーと通知用データを更新します
- 新しい Codex がプッシュ更新のためにポーリングを停止している場合、識別済みのネイティブ使用量取得機能を使用します。旧版の無効化されたクエリと空キャッシュにも対応します
- 重複リクエストをまとめ、頻度制限と失敗時の再試行間隔調整を行います。アカウント変更、終了、より新しいネイティブ更新後の古い応答は反映しません
- ナビゲーション状態が外部モジュールに移った Codex で、予約送信が利用不可になる問題を修正しました。ネイティブの移動・送信処理を維持します
- rc.23 のリセット画面修正と既存の通知、音量、安全な起動処理を維持します

Start.cmd で起動してください。Codex 実行中は更新を準備し、タスク完了後に Codex を終了して再起動すると切り替わります。

## Verification boundary

Installed Codex 26.1103.4239.0 was checked without activating a window. A real native usage GET updated the matching account cache and the existing bottom-bar sample; native navigation methods and composer scope were inspected without navigating or submitting. Task monitoring correctly reported ongoing local work. Isolated tests cover disabled/empty queries, periodic and foreground refreshes, duplicate suppression, account changes, newer native updates, cancellation, retries and simulated draft submission. No real reset was consumed, no real draft was sent, and no audio or shutdown action was triggered.
