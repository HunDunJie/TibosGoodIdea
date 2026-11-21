# Tibo’s Good Idea 0.8.0-rc.28

## 中文

- 包含 rc.27 的双额度判断与刷新后延迟3分钟执行，以及 Codex 26.1117.4957.0 兼容修复
- 原自动更新签名私钥丢失，经维护者授权更换签名密钥；今后维护密钥固定保存在项目同级的 TibosGoodIdea-Maintainer 目录，不写入 C 盘 AppData
- 保留旧公钥及已验证索引的恢复记录；拒绝覆盖已有私钥、拒绝从无效旧签名迁移，读取 Codex 指纹不再要求私钥

**rc.27 及更早版本需要手动升级一次。** 旧版无法验证新签名，请先退出 Codex 和 TiBo 托盘，将原 TiBo 目录改名保留为备份，再把完整 Windows 包解压到原路径，只从备份复制 config.local.json 和 data 目录，最后运行 Start.cmd。不要复制旧 versions、活动/待更新指针或启动修复记录，也不要只更换旧版公钥；旧版本记录仍依赖原公钥。手动升级的完整程序包含新的信任配置，之后继续使用签名更新。

真实 Codex 的只读兼容检查见 rc.27 记录；未发送真实草稿、消耗重置次数、播放声音或触发关机。

## English

- Includes rc.27 dual-quota checks, execution 3 minutes after reset, and Codex 26.1117.4957.0 compatibility fixes
- Replaces the lost update signing key with maintainer authorization. The private key now lives in the sibling TibosGoodIdea-Maintainer folder, outside the repository and C-drive AppData
- Preserves the previous public key and verified catalog in a recovery record, rejects existing-key replacement and invalid old signatures, and removes signing access from read-only fingerprinting

**rc.27 and earlier require one manual upgrade.** Close Codex and the TiBo tray, rename the old TiBo folder as a backup, extract the complete Windows package at the original path, copy only config.local.json and data from the backup, then launch Start.cmd. Do not carry over old versions, active/pending pointers or bootstrap repair records, or replace only the old public key: old version records still require it. The complete upgrade supplies the new trust configuration for future signed updates.

Native checks remain read-only; no real draft, reset, audio or shutdown was triggered.

## 日本語

- rc.27 の5時間枠・週間枠の確認、更新3分後の実行、Codex 26.1117.4957.0 対応を含みます
- 紛失した更新署名鍵を管理者の承認により交換しました。秘密鍵はプロジェクトと同階層の TibosGoodIdea-Maintainer に保存し、リポジトリや C ドライブの AppData に含めません
- 旧公開鍵と検証済みカタログを復旧記録に保存します。既存秘密鍵の上書きや無効な旧署名からの移行を拒否します

**rc.27 以前からは一度だけ手動更新が必要です。** Codex と TiBo トレイを終了し、旧 TiBo フォルダーをバックアップとして改名します。元の場所に Windows 完全版を展開し、config.local.json と data だけを戻して Start.cmd を実行します。旧 versions、更新ポインター、起動修復記録、公開鍵だけの差し替えは引き継がないでください。完全版の新しい信頼設定に移行後、署名付き更新を継続できます。

実機確認は読み取り専用です。実際の送信、リセット、再生、シャットダウンは行っていません。
