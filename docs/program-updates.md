# Program updates / 程序更新

Implemented in 0.8.0-rc.15. Older rc.14 installations need one manual upgrade with Install.cmd; they cannot acquire this updater themselves.

## User behavior

- Start.cmd starts with verified local files. Background checks normally run every 12 hours. A changed Codex fingerprint or adapter capability result gets a priority check after a minimum five-minute request interval; failures back off persistently from five minutes to 12 hours.
- An unchanged Codex can still receive compatible TiBo bug fixes. A release that only supports another Codex build is ignored. Exact local module fingerprints are compared locally and are never uploaded.
- Only compatible `fix` releases are automatically downloaded. Update.cmd / 检查更新.cmd also allows compatible feature releases. Stable installations stay on the stable channel; preview installations accept newer preview or stable versions.
- Activation happens on a later Start.cmd launch with Codex and its controller closed. Downloads never reload a live chat. A prepared update older than 12 hours gets a bounded, small-index revalidation first; failure retains the current version.
- Sending, playback, a reminder due within two minutes, an unavailable worker, or a worker owned by another installation postpones activation. An exited reminder worker is not restarted just to install an update.
- Uninstall.cmd removes owned root and version files. Unknown personal files are retained. Manual Install.cmd resets the active pointer transactionally and preserves user settings.

## Trust and rollback

The data-only adapter index and full-program index use separate Ed25519 keys. Program releases require a signed revision, exact product/platform/channel, supported local client fingerprints, state schema 1, updater protocol 1, exact GitHub release URL, byte count, ZIP SHA-256 and inventory SHA-256.

Downloads have a two-minute lifetime and a 96 MiB cap. Extracted data is capped at 256 MiB; paths, duplicate/case-colliding names, devices, alternate streams, traversal, links, overlapping ZIP records, CRCs and every inventory checksum are checked. No update is downloaded from a repository tag merely because it is newest.

Installed versions live under `versions/`. The fixed root bootstrap and pinned program key are not replaced automatically. Root config and independent worker state remain outside the immutable payloads. Pointer changes use atomic JSON replacement, a crash journal and the shared install/start/uninstall mutex. A download process has a per-installation named-pipe lock and acknowledged cancellation before reinstall/removal.

Worker handoff is serialized with normal operations: prepare establishes a 30-second lease, commit rechecks busy state, saves the latest state and exits without disableAll. Claims and enabling features are blocked during handoff. A failed activation restores the previous code and quarantines that candidate for the current client. Rollback never restores stale drafts, send batches, alarm or user-setting snapshots. An interrupted sending round retains the existing no-retry rule.

Rollback is complete only after the candidate process exits and any previously running reminder service starts again. A busy candidate or failed restoration keeps the crash journal open for the next launch instead of reporting success or starting a competing worker. A lost commit reply is distinguished from a still-running service using its committed-exit status. The fallback target is the verified code actually selected before activation, including when a damaged active payload has already fallen back.

Incompatible state migrations or updater protocols require manual installation. The fixed bootstrap is a deliberate boundary: future changes to it also require a manual upgrade. An interrupted download can leave its `.incoming-*` directory after a hard process/system crash; it is never activated or recursively removed as an unknown folder. No native Codex launch entry is changed.

## Maintainer publishing

1. Verify the intended Codex build and regression tests. Read its local fingerprint with:
   `runtime\node.exe scripts/sign-program-catalog.mjs --fingerprint <app.asar>`
2. Build the Windows ZIP with pack-buyer.py, publish its matching versioned release asset and corresponding GPL source. Published assets are immutable.
3. Keep the program signing private key outside Git and archives. Sign the existing index with a strictly larger revision:
   `runtime\node.exe scripts/sign-program-catalog.mjs --zip <Windows-x64.zip> --client <fingerprint> --kind fix --key <external-private-key.pem>`
4. Inspect and commit `updates/program-catalog.json`. Use kind `feature` for optional features. Repeat `--client` only for independently verified builds.
5. Withdraw a candidate using `--input <reviewed-payload.json>` with a higher revision and that release removed. Never reuse a revision for different contents. Key rotation requires removing the old managed installation and manually installing a freshly trusted build; an ordinary automatic update cannot rotate it.

The initially bundled signed program index has no release candidates. It provides the trust root; a future compatible release becomes downloadable only after the maintainer publishes and signs it. Adapter-only changes continue to use the existing declarative adapter index.

Each Windows ZIP retains the previously signed index, avoiding a self-referential archive checksum; do not rebuild or replace published assets after signing the new public index. Use the [maintainer workflow](release-workflow.md) to publish and verify a new version. Historical rc.16 release evidence is recorded in [release-rc16-publication.json](release-rc16-publication.json).

## Verification boundary

The design was reviewed in three rounds (36 scenarios) before implementation. That document is design evidence, not test execution. Automated tests separately cover signatures, versions, compatibility, cache/backoff, rollback, worker handoff, archive validation and removal. The Windows integration test builds a complete signed fixture package, runs the bundled Node offline checks, switches real isolated reminder workers, verifies original alarm/send IDs and settings, exercises bootstrap routing, and uninstalls both payloads. It never connects to Codex, sends real drafts or plays audible music.

Actual future client compatibility and end-to-end download of a future public release require maintainer validation. Existing OpenAI integration/permission limitations remain unchanged.

Execution evidence: [program-updates-verification.json](program-updates-verification.json).
