# 0.8.0-rc.18

## 中文

- 新增“定时关闭”图标，位于“定时发送”左侧，支持中文、英文、日文跟随 Codex
- 手动开启后立即检查，此后每 3 分钟检查所有聊天；全部完成后安排 5 分钟关机，到期再次核验。发现新任务取消当前计划，之后重新等待
- 定时发送开启/发送期间暂停全部关机与网络检查；定时发送关闭后才开始检查
- 按钮关闭和托盘“取消定时关闭”同时撤销监测及已有计划。服务重启、Codex 退出、连接失效或睡眠恢复时不沿用旧倒计时
- 持续断网需要两次相隔至少 3 分钟的双站点检查，并确认没有本地工具、审批或队列仍执行，才可进入关机倒计时；网络恢复且仍有任务则取消计划
- Windows 任务计划程序登记专属守卫，最终检查通过后调用系统强制关机，避免其他应用的保存提示阻挡；**未保存内容会丢失**。关机命令失败会显示错误
- 自动程序更新在定时关闭开启时推迟；这次为新增功能版本，可通过 **Update.cmd / 检查更新.cmd** 手动获取，或下载 Windows-x64 ZIP 安装

测试包含状态机、网络故障、取消竞态、多聊天分页、真实 Windows 计划任务注册/取消、三语言、安装卸载与更新。系统关机调用使用替身检查命令和结果；**没有真实关闭当前电脑**，不声称已完成断电效果验收。设计及三轮审查记录见 [设计文档](https://github.com/HunDunJie/TibosGoodIdea/blob/main/docs/scheduled-shutdown-design.md)

## English

- Add Scheduled shutdown to the left of Send on reset, following the Codex language
- Check all chats every 3 minutes; schedule shutdown 5 minutes after all tasks finish, with a fresh final check. New work cancels the countdown
- Scheduled sending pauses all shutdown checks. Turning shutdown off or cancelling from the tray invalidates its Windows task
- Sustained outages require two checks at least 3 minutes apart, both connectivity probes failing, and no protected local work. Recovery with active work cancels shutdown
- Uses a dedicated Windows task guard and the system shutdown command with forced app closure; **unsaved work will be lost**. Restarted/disconnected services never resume old plans
- Optional feature update: use Update.cmd or install the Windows-x64 ZIP. Automated tests register/cancel a harmless Windows task and mock the actual shutdown command; the computer was not shut down

## 日本語

- 予約送信の左側に「シャットダウン予約」を追加し、Codex の言語に追従します
- 3分ごとに全チャットを確認し、完了5分後に終了します 実行直前に再確認し、新しいタスクがあれば解除します
- 予約送信がオンの間は確認を停止します ボタンとトレイから監視および既存の予約を解除できます
- 継続的な通信障害は、3分以上離れた2回の確認とローカル作業の保護を条件に判定します
- Windows の専用タスクと最終確認後にシステムを終了します アプリを強制終了するため、**未保存の内容は失われます**
- 新機能は Update.cmd または Windows-x64 ZIP のインストールで取得できます テストでは安全な予約の登録・解除と実行コマンドの検証を行い、実際のシャットダウンは行っていません

Unofficial third-party add-on; existing client integration and licensing limitations remain unchanged
