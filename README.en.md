# Tibo’s Good Idea — Codex Quota Bar & Desktop Skin

[中文](README.md) · [Install](QUICKSTART.en.md) · [日本語](QUICKSTART.ja.md)

A Windows Codex desktop skin and single-row quota bottom bar. Original code is open source under **GPL-3.0-only**
The icon rail moves to the bottom with the profile at the far left, followed by purchased credits, separate five-hour and weekly quota, reset times and available resets
Repository: TibosGoodIdea · Version: **0.8.0-rc.19**

An independent project with no affiliation with or endorsement by OpenAI or Tibo
The source license does not constitute OpenAI approval of this client integration

Search terms: Codex skin, Codex theme, desktop customization, remaining quota, usage monitor, five-hour quota, weekly quota, reset time, reset countdown, available resets, scheduled draft sending, completion sound and quota reset reminder
中文关键词・日本語の検索キーワード: [Multilingual feature index](README.md#搜索关键词--search-terms--検索キーワード)

## Features

- Scheduled shutdown: checks all chats every 3 minutes and shuts down 5 minutes after they finish; paused while scheduled sending is on. Cancel from its button or the tray. Confirmed sustained outages qualify only when no local tools are still running. Shutdown forces apps to close, so unsaved work will be lost
- Send on reset: manually arm one round of existing, non-empty chat drafts after the next confirmed five-hour reset, using native submission, then turn off
- Completion sound: play music when a connected chat finishes, for at most 30 minutes, without an additional completion notification
- Reset reminder: notify and play music one minute after the five-hour reset, for at most 30 minutes; an already scheduled alarm survives closing Codex
- Mouse movement, clicks or keyboard activity in Codex stop playback; the tray can stop it without opening Codex
- Click a time to switch between a date and a minute-updated countdown; choices persist; language follows Codex in Chinese, English and Japanese
- When a Pro account is confirmed to have no five-hour limit, hide that quota and disable scheduled sending and reset reminders, cancelling old schedules; weekly usage, credits, available resets and completion sound remain available; missing data stays unknown

Windows must stay awake and running. There is no wake timer or logon task
Codex must remain open for scheduled sending. Review all drafts before arming it

## Install and adapt

Download the Windows-x64 ZIP from [Releases](https://github.com/HunDunJie/TibosGoodIdea/releases), extract to your chosen folder and run **Start.cmd**, the only CMD entry
No installation, administrator rights, generated shortcuts or AppData program copy. Finish tasks and close Codex before first use
Settings, data and updates stay here. Manage settings, reminders and shutdown in the tray. Choose **Exit TiBo** before deleting or moving the folder. See [Quick start](QUICKSTART.en.md)

## Automatic updates

Every launch checks both signed indexes: Codex adaptation and compatible TiBo updates, including new features. No manual updater
Codex fingerprint changes and TiBo releases are handled independently. Code activates only at safe cold launch; running clients, sending, playback, imminent alarms and shutdown monitoring defer activation. Offline startup keeps available code. Signatures, inventory, rollback and quarantine checks remain enforced
Older users should extract this release to their chosen folder, close Codex and run Start.cmd once. Verified settings and reminders migrate; shutdown countdowns do not. Old files and shortcuts remain, so use the new entry
Checked client: Store Codex 26.1027.3384.0 / Windows 11 x64. Future changes may require maintainer adaptation. Unverified interfaces remain disabled
No account, quota, draft, client code or settings are uploaded. See [Update rules](docs/program-updates.md) and [Compatibility](COMPATIBILITY.md)

## Preview

Actual TiBo UI code with sample data and a mock host; these are not live Codex client screenshots

![Layout](docs/images/01-overview.png)
![Date and countdown](docs/images/02-time-modes.png)
![Feature tooltips in English](docs/images/05-feature-tooltips-en.png)
![Chinese, English and Japanese](docs/images/04-languages.png)
[Chinese feature guide](docs/images/03-feature-tooltips.png) · [日本語の機能説明](docs/images/06-feature-tooltips-ja.png)

## Build and verify

Requires Node.js 22+, Python 3, Windows PowerShell 5.1 and Microsoft Edge
Run download-runtime.ps1 for the pinned, checksum-verified official Node binary, then run `python pack-buyer.py`, extract the generated Windows ZIP and use its Start.cmd
Use `npm install --ignore-scripts`, `npm test` and the package scripts for UI, language, display, volume, native adapter, reset rescheduling, controller, worker, installer and lifecycle checks
Windows CI is included. `python pack-buyer.py` builds the Windows bundle and hashes; `python pack-source.py` builds corresponding source
Personal config, runtime state, signing private keys, downloaded Node.exe and dist are excluded from Git
See [adapter maintenance](updates/README.md) and [change evidence](docs/automatic-adaptation.md)
Mock tests do not establish full Codex cold start, notification activation or real multi-chat submission acceptance

## License

Original code, SVG icons and documentation: [GPL-3.0-only](LICENSE), retaining contributor copyrights
Distributed modifications must comply with GPL source requirements; GPL permits charging for copies
Node, Acorn and bundled recordings retain their own rights; see [license scope](LICENSE.en.md) and [third-party notices](THIRD-PARTY-NOTICES.md)
The sales directory is an archive of earlier preparation, not the current license or an active sales channel
