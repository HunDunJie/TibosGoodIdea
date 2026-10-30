# Automatic program and compatibility updates

## Current policy (0.8.0-rc.19)

The Windows ZIP is portable: extract to a permanent writable folder and use the single Start.cmd. No installer or manual update CMD is shipped. Internal legacy PowerShell scripts remain for compatibility and tests

Every launch fetches both pinned signed indexes, bypassing the previous 12-hour startup cache. Codex's renderer fingerprint and TiBo's version are independent. Compatible fixes, features and adapter releases are automatic. Stable users remain on stable; preview users may accept newer preview or stable releases. Unknown clients are never matched by version string alone

The root entry verifies and dispatches to the selected bootstrap before startup, so new policies remain reachable without overwriting a running launcher. Older installed bootstraps are bridged by selected start.ps1. Pre-rc.15 clients need a one-time download

Settings stay in config.local.json, state/logs in data, payloads in versions, and ownership/update pointers in the chosen root. install-info.json keeps its legacy name for updater compatibility; mode=portable means no program copy or registered installation. No automatic shortcuts

First start verifies the file inventory and SHA-256 manifest before claiming ownership. Legacy AppData services are adopted only with matching product markers and verified process/service identity after Codex exits. Preferences, alarm deduplication and once-only send IDs survive; existing local configuration wins. PIDs and shutdown plans are not copied. Interrupted sends are never retried. Old program files remain untouched as a fallback

Each Codex debug port has one controller lease across directories. Portable workers share a user-scoped owner pipe; launching another folder while one is active asks the user to exit the previous TiBo. No global on-disk installation directory is needed

## Safe activation

Downloads use fixed HTTPS hosts, a pinned Ed25519 key, exact compatible fingerprints and signed byte/manifest hashes. Archives reject traversal, links, duplicates, CRC mismatches and excessive sizes. Index revisions cannot roll back. Failed payloads are quarantined per client

A cold launch downloads, verifies, checks and activates automatically. Live Codex stages updates without changing renderer code. Sending, playback, alarms within two minutes and shutdown monitoring defer activation. Offline fresh checks cannot authorize stale pending decisions. Current code remains usable offline

Worker handoff uses a prepare/commit lease, persists latest state, waits for exit and verifies new root/version. Transaction recovery changes code only, without restoring old business state. Failed candidates roll back to verified previous code

The tray replaces extra CMDs: settings, open folder, sound/reminder controls, cancel shutdown and Exit TiBo. Exit cancels plans, waits for service exit and restores the UI. Then delete or move the whole folder; external WAV files are untouched

## Maintainer publication

Use the [release workflow](release-workflow.md). Publish immutable assets after exact-commit main/tag Windows CI, then sign a higher-revision index for independently verified fingerprints. Future adaptation still requires maintainer publication

Legacy APIs retain manual/fix-only defaults for compatibility; current startup explicitly uses force=true and automatic=true. This is not a user setting
