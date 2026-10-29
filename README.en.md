# CodexTiBoBottomBar

A Windows Codex bottom bar add-on, displayed in the app as BottomBar Companion

The source project and private GitHub repository are named CodexTiBoBottomBar
Sales materials are in sales/; generated archives and checksums go in dist/
Personal configuration, runtime state, downloaded Node.exe and dist/ are excluded from Git
The existing productId is retained for settings compatibility; see [docs/PROJECT.md](docs/PROJECT.md)

[中文](README.md) · [Quick start](QUICKSTART.en.md) · [Compatibility](COMPATIBILITY.md)

**0.8.0-rc.3**, local release candidate, not publicly listed. An independent Windows add-on prepared by 由龙见象, with no OpenAI affiliation or endorsement

Move Codex's icon navigation to the bottom and see purchased credits, separate five-hour and weekly quota, reset times and available resets in one row. The profile stays at the far left; chats and projects remain in the left panel

Three icons provide **Send on reset**, **Completion sound** and **Reset reminder**, in that order. State is shown in hover tips. Click either time to switch between a date and a countdown; choices persist and countdowns update every minute

- Send on reset arms one round of existing non-empty chat drafts after the next confirmed five-hour reset, then turns off; Codex must stay open
- Completion sound plays when a connected chat finishes, for up to 30 minutes, without an extra completion notification
- Reset reminder notifies and plays one minute after the five-hour reset, for up to 30 minutes; an already scheduled reminder survives closing Codex

Moving the mouse inside Codex, clicking or typing stops sound. The tray and StopSound.cmd also stop it without opening Codex. Windows must remain awake and running; the add-on does not wake the computer or install a logon task

## Install

Supported: **Windows 11 x64 / Microsoft Store Codex 26.1023.6621.0**. Other client versions are rejected

The buyer ZIP includes official Node.js 24.22.1, original tones and Chinese/English/Japanese guides. Extract all files, run Install.cmd, then use the BottomBar Companion shortcut. Language follows Codex automatically in Chinese, English or Japanese. Settings.cmd only selects the time zone and optional custom WAVs. See the quick start

This uses a local debugging endpoint rather than an official theme API. It leaves Codex installation files and official launch entries unchanged. Finish tasks and exit Codex yourself before first use. Opening Codex normally after a full exit uses the original layout

## Private source backup and checks

Source requires Node.js 22+, Python 3, Windows PowerShell 5.1 and Microsoft Edge. Run download-runtime.ps1 to obtain the pinned, checksum-verified official Node binary, then `python pack-buyer.py --manifest-only` and Start.cmd

Run `npm install --ignore-scripts`, `npx playwright install msedge`, `npm test` and the package scripts test:ui, test:language, test:display, test:volume, test:adapter, test:controller, test:worker, test:install, test:settings. Windows CI is included

Current regression evidence is preserved in sales/verification.json. Live language switching, Japanese translations, tray synchronization and removal of the language selector are documented in docs/language-follow.md. Audio fixtures are silent and no real chat drafts are submitted

Full Codex cold start, notification activation, real multi-chat submission and real task completion still need independent acceptance. Mock tests do not establish these. Codex hosting this work has not been restarted; the add-on was reloaded and confirmed to follow its current English language

## License and distribution

Original code, icons and tones are prepared under the [commercial self-use license draft](LICENSE.en.md), with contributor and seller notices retained. Purchasers may use this version for personal or commercial work on their own devices; resale and public distribution of the add-on are not granted. Node.js retains its own licenses; see THIRD-PARTY-NOTICES.md. Source stays in a private seller backup

Planned one-time prices: **CNY 3.90 / US$0.90**. No public repository or checkout is live. The user reports that OpenAI support escalated the question to a specialist; a reply is pending. Escalation is not approval. Do not sell this approach if it is not permitted. Real client acceptance and payment/delivery checks also remain

`python pack-source.py` creates an allowlisted private seller source backup, not a buyer deliverable, without Node.exe, personal settings, music or logs. `python pack-buyer.py` creates the buyer ZIP with a per-file manifest and SHA-256
