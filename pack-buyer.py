"""Allowlisted buyer bundle; no private configuration, logs or account images."""
from pathlib import Path
import hashlib,json,zipfile,sys
root=Path(__file__).resolve().parent
names='''
Start.cmd Settings.cmd Restore.cmd StopSound.cmd DisableReset.cmd ExitReminders.cmd Reload.cmd Install.cmd Uninstall.cmd Check.cmd
开启底栏.cmd 恢复原界面.cmd 停止响铃.cmd 关闭刷新提醒.cmd 退出提醒服务.cmd 设置.cmd 重新加载.cmd 安装.cmd 卸载.cmd
start.ps1 restore.ps1 control-reminders.ps1 launcher-common.ps1 settings.ps1 install.ps1 uninstall.ps1 reload.ps1 check.ps1
WindowsActivation.cs WindowsAudio.cs audio-host.ps1 audio-client.mjs alarm-worker.mjs worker-client.mjs runtime-paths.mjs
bottom-bar.css bottom-bar.js feature-ui.js native-features.js feature-engine.mjs native-bindings.mjs feature-bindings.mjs controller.mjs
i18n.js locale-config.mjs settings-check.mjs diagnostics.mjs product.json package.json config.example.json
LICENSE LICENSE.zh-CN.md LICENSE.en.md THIRD-PARTY-NOTICES.md QUICKSTART.zh-CN.md QUICKSTART.en.md COMPATIBILITY.md
sounds/completion.wav sounds/refresh.wav sounds/README.md runtime/node.exe runtime/LICENSE-Node.txt runtime/NOTICE.md
release-files.json
'''.split()
(root/'release-files.json').write_text(json.dumps(names,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
missing=[n for n in names if not(root/n).is_file()]
if missing:raise SystemExit('Missing: '+', '.join(missing))
if hashlib.sha256((root/'runtime/node.exe').read_bytes()).hexdigest()!='d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5':raise SystemExit('Runtime checksum mismatch')
if '--manifest-only' in sys.argv:print(f'Buyer manifest ready: {len(names)} files');raise SystemExit()
version=json.loads((root/'product.json').read_text(encoding='utf-8'))['version']
output_dir=root/'dist'
output_dir.mkdir(exist_ok=True)
output=output_dir/f'BottomBar-Companion-{version}-Windows-x64.zip'
manifest={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in names}
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for n in names:z.write(root/n,'BottomBar-Companion/'+n)
    z.writestr('BottomBar-Companion/SHA256-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(output) as z:assert z.testzip() is None
digest=hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n',encoding='utf-8')
print(json.dumps({'path':str(output),'files':len(names)+1,'bytes':output.stat().st_size,'sha256':digest},ensure_ascii=False))
