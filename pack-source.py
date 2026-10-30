"""GPL corresponding source with original asset notices; no personal settings or logs."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent
names = [name for name in json.loads((root/'release-files.json').read_text(encoding='utf-8')) if name!='runtime/node.exe']
names += """
.gitignore README.md README.en.md download-runtime.ps1 重启并开启底栏.cmd
preview.html preview-wide.png preview-narrow.png preview-countdown.png preview-tooltips.png preview-volume-warning.png
pack-source.py pack-buyer.py pack-seller.py .gitattributes
scripts/sign-adapters.mjs updates/entries.json updates/README.md docs/automatic-adaptation.md docs/open-source-audit.json
docs/release-notes-rc14.md
tests/bindings.test.mjs tests/adapter-updates.test.mjs tests/program-updates.test.mjs tests/update-integration.mjs scripts/sign-program-catalog.mjs docs/program-updates.md docs/release-notes-rc15.md docs/images/README.md docs/images/01-overview.png docs/images/02-time-modes.png docs/images/03-feature-tooltips.png docs/images/04-languages.png docs/images/05-feature-tooltips-en.png docs/images/06-feature-tooltips-ja.png
docs/PROJECT.md docs/migration.json docs/migration-verification.json docs/language-follow.md docs/rename.md docs/lifecycle-fixes.md docs/lifecycle-verification.json docs/stale-state-fixes.md docs/stale-state-verification.json docs/recheck-fixes.md docs/recheck-verification.json docs/reset-send-fix.md docs/reset-send-verification.json
docs/review-rc9.md docs/review-rc9-verification.json
docs/launcher-path-fix.md docs/launcher-path-verification.json
docs/worker-wake-fix.md docs/worker-wake-verification.json
tests/engine.test.mjs tests/display.test.mjs tests/locale.test.mjs tests/ui.cjs tests/language.cjs tests/display.cjs tests/volume.cjs tests/native-adapter.cjs tests/send-reset.cjs
tests/controller.cjs tests/lifecycle.cjs tests/launcher-arguments.cjs tests/worker-integration.mjs tests/install.mjs tests/settings-worker.mjs .github/workflows/test.yml
""".split()
names += ['docs/program-updates-verification.json']
names += '''
tests/pro.cjs docs/pro-quota-support.md docs/release-notes-rc16.md docs/release-rc16-verification.json
docs/review-2026-10-30.md docs/review-2026-10-30-verification.json
docs/review-2026-10-30-round2.md docs/review-2026-10-30-round2-verification.json
'''.split()
sales_names = json.loads((root/'sales/source-files.json').read_text(encoding='utf-8'))
names += ['sales/'+name for name in sales_names]
names += ['sales/source-files.json']
names=list(dict.fromkeys(names))
files = [(name, (root / name).resolve()) for name in names]
for name, file in files:
    if not file.is_file() or not file.is_relative_to(root):
        raise SystemExit(f"Missing source file: {name}")
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
output_dir = root / "dist"
output_dir.mkdir(exist_ok=True)
output = output_dir / f"TibosGoodIdea-{version}-source.zip"
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name, file in files:
        archive.write(file, "TibosGoodIdea/" + name)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
print(f"{len(files)} files; {output.stat().st_size} bytes\n{output}\nSHA-256: {digest}")
