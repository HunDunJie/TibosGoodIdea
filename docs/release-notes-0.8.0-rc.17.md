# Tibo’s Good Idea 0.8.0-rc.17

## 中文

- 修复定时发送结束后，把 Electron 加载地址 `/index.html` 当成聊天地址恢复的问题。现在返回 Codex 维护的原聊天路径，包含查询信息
- 无法取得聊天路径时保留最后访问的聊天；无草稿时不额外跳转；恢复页面失败也保留正确的发送统计
- 固定测试、打包、GitHub 发布和签名更新索引流程。本地与 GitHub Actions 共用测试入口，重复运行复用相同代码的成功报告，上传可从检查点继续
- 提供 TiBo 专用 Codex 技能与维护流程文档，包含四项资产校验、精确发布提交的 CI 门禁和公开更新索引验证

下载 **Windows-x64.zip**，解压后运行 **Install.cmd**。rc.14 及更早版本需要手动升级一次；已有兼容更新器的版本会检查本次修复

验证：完整 Windows 自动化测试覆盖路由恢复、刷新卡、提醒服务、三种语言、安装卸载及更新回滚；维护工具另有隔离自测。测试没有提交真实聊天草稿或播放有声音乐。已确认并修复错误路由；原始空白窗口未保留，不能声称已完成该次故障的唯一因果归因或真实客户端人工复测

项目为非官方第三方工具；现有客户端集成与许可限制未改变

## English

- Fix scheduled sending restoring Electron’s `/index.html` shell URL instead of the original Codex chat route. Native route and query information are now retained
- Keep the last chat when a restore route is unavailable, avoid navigation for an empty batch, and preserve submission counts if restoration fails
- Add a reusable Windows test and release workflow shared with GitHub Actions, source-bound test receipts, resumable immutable asset uploads, CI gates, and signed update-index verification
- Include a project-specific Codex maintainer skill and workflow documentation

Download **Windows-x64.zip**, extract it, and run **Install.cmd**. rc.14 and earlier need one manual upgrade

Validation uses isolated fixtures; no real chat drafts were submitted and no audible music was played. The incorrect route was reproduced and fixed; the original blank window was already closed, so this does not establish a unique cause or constitute a full live-client acceptance test. This is an unofficial third-party tool; existing integration and licensing limitations are unchanged

## 日本語

- 定時送信の終了後、元のチャットではなく Electron の `/index.html` に戻る問題を修正。Codex 内部のチャットパスとクエリ情報を保持します
- 復元先が不明な場合は最後のチャットを保持し、下書きがない場合の不要な移動を防止。復元失敗時も送信結果を保持します
- ローカルと GitHub Actions で共通の Windows テスト・リリース手順を追加。テスト結果の再利用、アップロード再開、公開前の CI 確認、署名付き更新情報の検証を自動化します
- Codex 用の保守スキルと手順書を同梱します

**Windows-x64.zip** を展開し、**Install.cmd** を実行してください。rc.14 以前は一度手動で更新する必要があります

テストは隔離環境で実施し、実際の下書き送信や音楽の再生は行っていません。誤った復元先は再現・修正しましたが、元の空白画面は終了済みのため、唯一の原因や実機での完全な確認を保証するものではありません。本ツールは非公式です
