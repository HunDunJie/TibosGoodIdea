# 0.8.0-rc.19

## 中文

- 便携版：解压后双击唯一的 Start.cmd，无需安装、不向 AppData 复制程序、不创建快捷方式
- 每次启动自动检查 Codex 适配和 TiBo 更新，包括新功能；安全时切换，运行中暂存，断网使用当前版本
- 设置、数据和更新都在所选目录；托盘新增设置、打开文件夹和退出 TiBo
- 验证旧服务归属后迁移设置和提醒状态，不迁移关机倒计时；阻止跨目录重复服务和注入
- 修复 PowerShell 解码中文路径的问题，保留签名、校验、回滚和忙碌推迟机制

旧版用户请下载本版到自己选择的位置，完成任务并退出 Codex 后运行 Start.cmd 一次。旧文件保留，旧快捷方式仍指向旧目录，请改用新入口

## English

- Portable ZIP with one Start.cmd; no installation, generated shortcuts or AppData program copy
- Every launch checks Codex adaptation and compatible TiBo fixes/features; safe activation, busy deferral and offline fallback
- Settings, state and updates stay in the chosen folder; tray settings, open-folder and Exit TiBo replace extra CMDs
- Verified legacy handoff preserves settings/reminder state, excludes shutdown plans and prevents duplicate injection/services
- Fixes Unicode paths in Windows PowerShell; signatures, hashes and rollback remain enforced

Older users: extract this release to your chosen folder, finish tasks, close Codex and run Start.cmd once. Use the new entry; old shortcuts still point to the retained old copy

## 日本語

- 唯一の Start.cmd で起動するポータブル版 インストール・自動ショートカット・AppData へのコピーは不要です
- 毎回 Codex 適応と TiBo 修正・新機能を自動確認 安全な切り替え・実行中の保留・オフライン起動に対応します
- 設定・状態・更新は同じフォルダー トレイに設定・フォルダーを開く・TiBo 終了を追加しました
- 旧サービスの所有確認後に設定と通知を引き継ぎます シャットダウン計画は移行せず 重複サービスを防止します
- PowerShell の中国語・日本語パスを修正し 署名・校正・ロールバックを維持しました

旧版は希望の場所へ展開し Codex 終了後に Start.cmd を実行してください 旧ファイルは残るため新しい入口を使ってください

## Validation boundary

Automated checks use isolated Windows folders, mocked client startup/signed update fixtures and silent audio. They do not submit live drafts, restart the user's Codex, play audible music or shut down the computer. Native client and audible acceptance remain manual
