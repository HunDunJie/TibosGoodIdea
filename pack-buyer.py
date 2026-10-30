"""Allowlisted buyer bundle; no private configuration, logs or account images."""
from pathlib import Path
import hashlib,json,zipfile,sys
root=Path(__file__).resolve().parent
names='''
Start.cmd
start.ps1 restore.ps1 control-reminders.ps1 launcher-common.ps1 lifecycle-common.ps1 settings.ps1 install.ps1 uninstall.ps1 reload.ps1 check.ps1
WindowsActivation.cs WindowsAudio.cs audio-host.ps1 audio-client.mjs alarm-worker.mjs worker-client.mjs runtime-paths.mjs state-file.mjs
bottom-bar.css bottom-bar.js feature-ui.js native-features.js feature-engine.mjs native-bindings.mjs feature-bindings.mjs controller.mjs
i18n.js locale-config.mjs settings-check.mjs diagnostics.mjs product.json package.json config.example.json
asar-reader.mjs adapter-updates.mjs updates/catalog.json updates/public-key.pem vendor/acorn/acorn.mjs vendor/acorn/LICENSE
LICENSE LICENSE.zh-CN.md LICENSE.en.md THIRD-PARTY-NOTICES.md QUICKSTART.zh-CN.md QUICKSTART.en.md QUICKSTART.ja.md COMPATIBILITY.md
sounds/completion.wav sounds/refresh.wav sounds/README.md runtime/node.exe runtime/LICENSE-Node.txt runtime/NOTICE.md
release-files.json
bootstrap.ps1 update.ps1 update-cli.mjs program-updates.mjs update-files.mjs update-lease.mjs
shutdown-engine.mjs shutdown-system.mjs shutdown-guard.mjs shutdown-task.ps1
updates/program-catalog.json updates/program-public-key.pem
portable-runtime.mjs startup-updates.mjs manage.ps1
'''.split()
(root/'release-files.json').write_text(json.dumps(names,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
missing=[n for n in names if not(root/n).is_file()]
if missing:raise SystemExit('Missing: '+', '.join(missing))
if hashlib.sha256((root/'runtime/node.exe').read_bytes()).hexdigest()!='d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5':raise SystemExit('Runtime checksum mismatch')
if '--manifest-only' in sys.argv:print(f'Buyer manifest ready: {len(names)} files');raise SystemExit()
version=json.loads((root/'product.json').read_text(encoding='utf-8'))['version']
output_dir=root/'dist'
output_dir.mkdir(exist_ok=True)
output=output_dir/f'TibosGoodIdea-{version}-Windows-x64.zip'
manifest={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in names}
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for n in names:z.write(root/n,'TibosGoodIdea/'+n)
    z.writestr('TibosGoodIdea/SHA256-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(output) as z:assert z.testzip() is None
digest=hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n',encoding='utf-8')
print(json.dumps({'path':str(output),'files':len(names)+1,'bytes':output.stat().st_size,'sha256':digest},ensure_ascii=False))
