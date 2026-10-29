# Quick start

An independent Codex add-on prepared by 由龙见象 (Youlong Jianxiang), with no affiliation with or endorsement by OpenAI. No account, subscription or extra quota is included.

This release candidate supports **Windows 11 x64 and Microsoft Store Codex 26.1023.6621.0 only**. Other versions are rejected. Full Codex cold-start and operating-system notification activation still need manual acceptance.

1. Extract the whole ZIP to a normal folder. Do not run it inside the archive.
2. Run `Install.cmd`, without administrator access. It installs to `%LOCALAPPDATA%\Programs\BottomBarCompanion` and creates a desktop shortcut.
3. Before first use, finish tasks and exit Codex yourself. Use the **BottomBar Companion** shortcut to start. The installer does not close Codex.
4. Your official Codex entry point is unchanged. Use the add-on shortcut to load the bottom bar.

Portable use is available through `Start.cmd`. Keep the extracted folder while using it. The buyer package includes a verified Node.js runtime; no separate installation is needed.

## Settings and controls

- `Settings.cmd`: choose Chinese/English, time zone and custom WAV files. Empty sound fields use the included tones.
- Time zone `auto`: Beijing time for Chinese, local time for English. You can enter `UTC` or an IANA name such as `America/New_York`.
- Saved settings apply next time you start through this add-on. Use `Reload.cmd` while running to update both the interface and reminder service without force-closing Codex. Reloading is refused during a draft-sending round.
- `StopSound.cmd`: stop the current sound even if Codex is closed.
- `ExitReminders.cmd`: disable all reminders and exit the service. `Restore.cmd` only restores the interface, leaving reminders running.
- Tray icon: left-click to stop sound; right-click to manage reminders. Windows may hide it in the overflow area.
- `Uninstall.cmd`: remove managed files and shortcuts, preserve unknown files and back up settings to `%LOCALAPPDATA%\BottomBarCompanionBackup`. External sounds are never deleted.

## Three icons

Left to right: Send on reset, Completion sound, Reset reminder. Off icons are muted; on icons use a subtle gray background. Hover for status and details.

Send on reset must be manually armed for each round. Codex must stay running and confirm the reset. Existing nonempty drafts are submitted; no drafts are written for you. Make sure every draft is something you intend to send. Changed, failed or unsupported drafts are preserved and are not automatically retried.

Completion sound plays music without an extra completion popup. Reset reminder notifies and plays one minute after the 5h reset, even after Codex closes. Sounds loop for up to 30 minutes. Moving the mouse inside Codex, clicking or typing stops them. Mouse movement in other applications does not.

The computer must remain powered on. Sounds cannot play while shut down, suspended or logged out. Exiting the reminder service cancels reminders.

## Troubleshooting

`--` means account data is unavailable, not zero. Purchased credits, 5h/weekly percentages and available resets are separate values. The add-on does not increase quota, buy credits or automatically spend reset credits.

Run `Check.cmd` for compatibility details. Codex updates may break compatibility until a new adapter is available. No permanent compatibility or update timeline is promised. Contact the seller through your purchase order; do not publish account details, private paths or chat contents.

Original add-on materials are prepared under the commercial self-use license draft. A purchaser may use this version for personal or commercial work on their own devices; resale and public distribution of the add-on are not granted. See LICENSE.en.md. Node.js and third-party components retain their own licenses; see THIRD-PARTY-NOTICES.md.
