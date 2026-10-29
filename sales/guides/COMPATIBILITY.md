# Compatibility / 兼容性

- Tested client: Microsoft Store Codex **26.1023.6621.0**
- Build machine: Windows 11 x64
- Version: **0.8.0-rc.4**, release candidate
- Included runtime: official Node.js **24.22.1 Windows x64**, source builds require Node.js 22+
- Languages: Chinese, English and Japanese; changes follow Codex immediately, with no separate selector, explicit IANA time zones supported
- Uses the add-on launcher and loopback debugging port 9347
- Codex installation files and official launch entries are not modified
- Private renderer interfaces are checked by version and fingerprint, unsupported versions stop loading

This uses local debugging access rather than an official Codex theme API. Commercial distribution permission under the applicable OpenAI terms has not been established. See the seller release checklist before public distribution.

Automated tests cover formatting, tooltip behavior, mock draft submission, real local controller bridging and reminders using silent WAVs. They do not establish full Codex cold-start, all-chat real submission or notification activation. The running client was checked without restarting it.

本候选包仍需独立买家环境验收冷启动、通知点击返回及真实多聊天发送。技术上可运行不代表取得 OpenAI 或销售平台的商业授权
