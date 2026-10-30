# Quick start

1. Download the Windows-x64 ZIP and extract everything into the folder you want to keep
2. Finish running tasks and close Codex before first use
3. Double-click **Start.cmd**, the only CMD entry

No installation, administrator rights, generated shortcuts or AppData program copy. A verified Node.js runtime is included. Use Start.cmd for this layout; the official entry is unchanged. You may create your own Windows shortcut

## Automatic updates

Every launch checks both signed indexes: Codex compatibility and TiBo fixes/features. A changed Codex fingerprint triggers adaptation checks; an unchanged client can still receive compatible TiBo updates. No manual update tool is needed

Updates activate during a safe cold launch. Running Codex, active sending, playback, imminent alarms or shutdown monitoring defer activation. Network failure falls back to available code. Unverified interfaces remain disabled

Older installed users: extract this release to your chosen folder, close Codex and run Start.cmd once. Verified preferences and reminder state are adopted; shutdown countdowns are not. Old files remain as a fallback. Old shortcuts still point there, so use the new Start.cmd

## Files and tray

config.local.json stores settings here; data contains logs and reminder state; versions contains verified updates. install-info.json records portable ownership for updater compatibility and does not mean the program was copied elsewhere

Left-click the tray to stop sound. Right-click for TiBo settings, Open TiBo folder, reminder controls and Cancel scheduled shutdown. Time zones and WAV files are configurable; empty audio paths use bundled music. Language follows Codex (Chinese, English, Japanese). Settings apply on the next launch

Before removing or moving TiBo, choose **Exit TiBo** from its tray menu. It restores the layout, stops reminders and cancels shutdown plans. Then delete or move the entire folder. Codex is not force-closed; external music is untouched

## Features

Left to right: scheduled shutdown, scheduled send, completion sound, reset reminder

Shutdown checks chats every three minutes, scheduling shutdown in five minutes when idle. Armed sending pauses checks; new tasks revoke the plan. Persistent network failure requires confirmation local tools are idle. Shutdown force-closes apps; unsaved work will be lost. Cancel with the button or tray

Scheduled send is armed manually for one round of existing drafts after the next confirmed reset. Keep Codex running. Modified, failed or unsupported drafts are preserved without automatic retries

Completion plays music only. Reset reminds one minute after reset, even after Codex exits. Playback lasts at most 30 minutes; mouse movement or interaction in Codex stops it, as does the tray. The computer must remain on and awake

Checked environment: Windows 11 x64 / Store Codex 26.1027.3384.0. Future changes may require maintainer adaptation. Native cold start, real submissions and audible playback need manual acceptance; automated checks use isolated clients and silent audio

Independent add-on, not affiliated with OpenAI; no accounts, subscription or extra quota. Original code is GPL-3.0-only. See THIRD-PARTY-NOTICES.md and docs/program-updates.md
