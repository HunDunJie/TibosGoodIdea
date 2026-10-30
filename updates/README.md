# Adapter catalog / 适配表

The launcher no longer rejects all unknown Codex versions. The controller checks
the signed catalog for exact local renderer fingerprints, then uses local syntax
discovery when no entry matches. No Codex code is included in this folder

- entries.json: readable corresponding source of the mappings
- catalog.json: signed payload requested from the fixed raw.githubusercontent.com URL
- public-key.pem: pinned Ed25519 public key, safe to distribute

A startup check is made at most once per 12 hours. Timeout: 3.5 seconds
Only bounded JSON, verified signatures and exact SHA-256 matches are accepted
No account, usage, drafts or local paths are sent. No remote JavaScript is run
Changes take effect on the next start; active conversations are not reloaded

## Maintainer workflow

1. Verify the new client read-only with Check.cmd and the structural recognizer
2. Run native adapter and regression tests; manual acceptance remains separate
3. Run the signing command with the private key kept OUTSIDE the repository

```powershell
.\runtime\node.exe scripts/sign-adapters.mjs --key <external-private-key.pem> --asar <installed-app.asar>
```

4. Review entries.json, verify signatures, commit and push both JSON files

The signing key must never enter Git, release archives, logs or issues
Fork maintainers must generate their own key with --init, change UPDATE_URL to
their repository, and distribute their own trusted public key with their build
Do not rotate the key while expecting existing installations to trust the new key
Structural client changes can still need a new recognizer or runtime adapter release
