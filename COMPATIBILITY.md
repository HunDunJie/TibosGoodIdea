# Compatibility / 兼容性

Version 0.8.0-rc.19 · Windows 11 x64 · Microsoft Store Codex

## Current evidence / 当前证据

- Codex 26.1027.3384.0: read-only syntax discovery found both completion and draft interfaces, plus the native usage-page opener
- Codex 26.1023.6621.0: the previously verified exact-hash mapping remains in the bundled signed catalog
- The current Codex process was not restarted or reloaded, and no real draft was sent or music played for these checks
- Synthetic adapter tests cover renamed exports, quote changes, missing/ambiguous interfaces, independent degradation, native navigation, draft preservation and account switching
- Confirmed Pro accounts without a five-hour limit hide that quota and cancel obsolete send/reset schedules; weekly usage, credits and completion reminders remain independent. This behavior was tested with fixtures, not a real Pro account

## Startup policy / 启动策略

No blanket version-number rejection. Base layout and independent reset reminders do not depend on draft/completion discovery
The usage opener is checked separately. Completion and sending are enabled separately only after their bindings and runtime shape checks pass
Missing or ambiguous composer assets disable sending, while verified completion events remain available
Unverified submission never falls back to guessed network requests or simulated Enter

启动时分别检查能力，不再用旧版本清单挡住整个界面
未识别的功能会在对应按钮提示中说明不可用，其余功能可继续使用
首次更新需退出正在使用的旧控制器并启动新版本；不会在运行中自动替换脚本或触发草稿发送

## Adapter updates / 适配更新

Every Start.cmd launch checks the fixed signed adapter catalog and the separate program catalog, with bounded network timeouts and sizes. Additional controller background checks retain their 12-hour cache and priority checks after client/capability changes
Ed25519 signatures are verified with the bundled public key, revisions cannot replace a newer verified catalog with an older one, and all local module hashes must match an entry
Only declarative export mappings are accepted. No remote scripts are evaluated
Offline, invalid or unavailable updates retain bundled/verified local data; the local syntax recognizer remains available

自动适配表用于解决可用接口的命名变化，不保证任意结构变更都能自行修复
维护者需验证新版本后发布新的签名表；更大的变化可能需要新版程序
Windows notifications, real Codex cold start, actual completed tasks and real multi-chat sending require manual acceptance separately

Full program updater / 完整程序更新: [docs/program-updates.md](https://github.com/HunDunJie/TibosGoodIdea/blob/main/docs/program-updates.md)
