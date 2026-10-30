# 0.8.0-rc.15

- Add signed compatible program updates, background checks, optional Update.cmd, immutable payloads, safe worker handoff and crash rollback
- Prioritize adapter rechecks after Codex fingerprint/capability changes without delaying initial injection
- Preserve root settings, alarm identity, refresh-card rescheduling and single-round draft state across updates
- Make install, update activation and uninstall coordinate, including removal of owned version payloads
- Fix Uninstall.cmd clicked in an extracted download: find the managed installed copy instead of reporting “Managed installation marker not found”; explicit target paths remain strict
- Add six clearly labeled demo screenshots, with Chinese, English and Japanese feature tooltips

Install this version manually once to obtain the full updater. This commit does not replace old published release assets or change the native Codex entry.
