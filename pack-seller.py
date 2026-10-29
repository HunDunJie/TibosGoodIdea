"""Build a private seller kit from an explicit sales allowlist and the buyer ZIP."""
from pathlib import Path
import hashlib
import json
import zipfile

root=Path(__file__).resolve().parent
sales=root/'sales'
version=json.loads((root/'product.json').read_text(encoding='utf-8'))['version']
output_dir=root/'dist'
buyer=output_dir/f'TibosGoodIdea-{version}-Windows-x64.zip'
if not buyer.is_file():raise SystemExit('Run python pack-buyer.py first')
buyer_digest=hashlib.sha256(buyer.read_bytes()).hexdigest()
sidecar=buyer.with_suffix('.zip.sha256')
if sidecar.read_text(encoding='utf-8').split()[0]!=buyer_digest:raise SystemExit('Buyer checksum mismatch')
with zipfile.ZipFile(buyer) as z:
    assert z.testzip() is None
    manifest=json.loads(z.read('TibosGoodIdea/SHA256-MANIFEST.json'))
    assert len(manifest)+1==len(z.namelist())
    for name,digest in manifest.items():
        assert hashlib.sha256(z.read('TibosGoodIdea/'+name)).hexdigest()==digest
        assert (root/name).read_bytes()==z.read('TibosGoodIdea/'+name), 'Buyer archive is stale: '+name

names=json.loads((sales/'source-files.json').read_text(encoding='utf-8'))+['source-files.json']
items=[]
for name in names:
    path=(sales/name).resolve()
    if not path.is_relative_to(sales.resolve()) or not path.is_file():raise SystemExit('Invalid sales file: '+name)
    items.append(('sales/'+name,path))
items += [('dist/'+buyer.name,buyer),('dist/'+sidecar.name,sidecar),('START-HERE.md',sales/'START-HERE.md')]
manifest={name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in items}
output=output_dir/f'TibosGoodIdea-{version}-seller-kit.zip'
prefix='TibosGoodIdea-seller-kit/'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name,path in items:z.write(path,prefix+name)
    z.writestr(prefix+'SHA256-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    for name,digest in manifest.items():assert hashlib.sha256(z.read(prefix+name)).hexdigest()==digest
digest=hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(digest+'  '+output.name+'\n',encoding='utf-8')
print(json.dumps({'path':str(output),'files':len(items)+1,'bytes':output.stat().st_size,'sha256':digest,'privateSourceIncluded':False},ensure_ascii=False))
