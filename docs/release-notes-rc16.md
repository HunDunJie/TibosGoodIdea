# Tibo’s Good Idea 0.8.0-rc.16

## 中文

- 适配确认没有五小时限制的 Pro 账户：隐藏五小时栏，定时发送与刷新提醒显示“不适用”并取消旧安排；每周额度、点数、可用重置与完成提醒保持可用，缺失数据仍显示未知
- 修复完成提醒播放器异常退出时，错误显示在刷新提醒上的问题
- 修复服务重启或播放器恢复后，Codex 内鼠标操作停止音乐的配置丢失问题
- 修复程序更新失败回退的状态判断，避免尚未恢复旧服务就报告成功或启动冲突的服务
- 随包提供签名程序更新功能：后台检查兼容修复，在后续安全启动时应用；正在发送、播放或临近提醒时推迟切换

从 rc.14 或更早版本升级，请下载 Windows-x64.zip，解压后运行 Install.cmd 一次，以安装程序更新功能
已安装带更新功能的 rc.15 源码构建版可接收当前已验证客户端的兼容修复
本次自动更新匹配已验证的 Codex 26.1027.3384.0 指纹；不会热更新正在运行的聊天，也不改变原生 Codex 启动入口

## English

- Support confirmed Pro accounts without a five-hour limit: hide that quota and cancel obsolete send/reset schedules, with translated “Not applicable” tooltips; weekly usage, credits, available resets and completion sound stay available
- Attribute player failures to the correct reminder and retain mouse-stop configuration after service/player restarts
- Fix failed-update recovery so rollback waits for the correct worker and remains retryable when restoration cannot finish
- Include signed compatible program updates, background checks, safe deferred activation and automatic code rollback

For rc.14 or older, download the Windows-x64 ZIP, extract it and run Install.cmd once to obtain the updater
Automatic updates target the verified Codex 26.1027.3384.0 fingerprint only; active chats and native launch entries are not changed

## 日本語

- 5時間の制限がないと確認できた Pro アカウントでは該当枠を非表示にし、予約送信と更新通知の古い予約を取り消します 対象外の理由はツールチップに表示され、週間枠、クレジット、リセット回数と完了通知は引き続き利用できます
- プレーヤー終了時のエラー表示、再起動後のマウス操作による停止設定、更新失敗時の復旧処理を修正しました
- 署名付きの互換性更新を同梱し、使用中のチャットを中断せず次回の安全な起動時に適用します

rc.14 以前からは Windows-x64 ZIP を展開し、Install.cmd で一度手動更新してください

## Validation

Pro-specific behavior uses simulated account data; a real Pro account has not been tested
Real Codex cold start, notification activation and real multi-chat submission remain outside the automated checks
See [release verification](release-rc16-verification.json) and the two local code-review reports for executed checks
