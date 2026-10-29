"""Private seller source backup, never a public buyer deliverable. Never include user music, settings, logs or screenshots."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent
names = [name for name in json.loads((root/'release-files.json').read_text(encoding='utf-8')) if name!='runtime/node.exe']
names += """
.gitignore README.md README.en.md download-runtime.ps1 重启并开启底栏.cmd
preview.html preview-wide.png preview-narrow.png preview-countdown.png preview-tooltips.png preview-volume-warning.png
pack-source.py pack-buyer.py pack-seller.py make-tones.py .gitattributes
docs/PROJECT.md docs/migration.json docs/migration-verification.json
tests/engine.test.mjs tests/display.test.mjs tests/locale.test.mjs tests/ui.cjs tests/display.cjs tests/volume.cjs tests/native-adapter.cjs
tests/controller.cjs tests/worker-integration.mjs tests/install.mjs tests/settings-worker.mjs .github/workflows/test.yml
""".split()
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
output = output_dir / f"BottomBar-Companion-{version}-private-source.zip"
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name, file in files:
        archive.write(file, "CodexTiBoBottomBar/" + name)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix(".zip.sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
print(f"{len(files)} files; {output.stat().st_size} bytes\n{output}\nSHA-256: {digest}")
