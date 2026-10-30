"""Maintainer release checkpoints. Credentials stay in memory; published assets are immutable."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'HunDunJie/TibosGoodIdea'
VERSION_RE = re.compile(r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$')


def run(args, **kwargs):
    result = subprocess.run([str(a) for a in args], cwd=ROOT, text=True, encoding='utf-8',
                            capture_output=True, timeout=kwargs.pop('timeout', 120), **kwargs)
    if result.returncode:
        raise RuntimeError(f'{Path(str(args[0])).name} failed: {(result.stderr or result.stdout)[-1800:]}')
    return result.stdout.strip()


def git(*args):
    return run(['git', *args])


def read_json(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))


def write_json(file, data):
    Path(file).parent.mkdir(parents=True, exist_ok=True)
    Path(file).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')


def digest(file):
    value = hashlib.sha256()
    with open(file, 'rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            value.update(block)
    return value.hexdigest()


def version():
    value = read_json(ROOT/'product.json')['version']
    if not VERSION_RE.fullmatch(value) or read_json(ROOT/'package.json')['version'] != value:
        raise RuntimeError('Product and package versions must match a supported SemVer')
    return value


def node():
    bundled = ROOT/'runtime/node.exe'
    return str(bundled) if bundled.is_file() else 'node'


def snapshot():
    candidates = set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0'))-{''}
    # Hash the actual source tree. A removed tracked path must not leave a
    # staging-only tombstone that disappears on commit and invalidates a build.
    names = sorted(name for name in candidates if (ROOT/name).is_file())
    h = hashlib.sha256()
    for name in names:
        file = ROOT/name
        h.update(name.encode('utf-8')+b'\0'+bytes.fromhex(digest(file)))
    return {'version': version(), 'sha256': h.hexdigest(), 'files': names}


def state_dir():
    return ROOT/'work/release'/version()


def require_receipt(receipt, current, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    completed = dt.datetime.fromisoformat(receipt.get('completedAt', '').replace('Z', '+00:00'))
    if not receipt.get('passed') or receipt.get('mode') != 'full' or receipt.get('version') != current['version']:
        raise RuntimeError('A successful full validation is required')
    if receipt.get('sourceFingerprint') != current['sha256']:
        raise RuntimeError('Source differs from the tested tree; run full validation again')
    age = (now-completed).total_seconds()
    if not 0 <= age <= 86400:
        raise RuntimeError('Validation is older than 24 hours or from the future')


def verify_zip(file, buyer):
    with zipfile.ZipFile(file) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('ZIP CRC validation failed')
        names = archive.namelist()
        if len(names) != len(set(names)) or any(not n.startswith('TibosGoodIdea/') or '..' in Path(n).parts for n in names):
            raise RuntimeError('Invalid ZIP paths or duplicate entries')
        forbidden = [n for n in names if Path(n).name.startswith(('config.local.json', '.env')) or n.endswith(('.key', '.pfx', '.log', '.bak')) or n.endswith('.pem') and n not in ('TibosGoodIdea/updates/public-key.pem', 'TibosGoodIdea/updates/program-public-key.pem')]
        if forbidden:
            raise RuntimeError('Private/runtime files in release inventory: '+', '.join(forbidden))
        if buyer:
            inventory = json.loads(archive.read('TibosGoodIdea/SHA256-MANIFEST.json'))
            if set(names) != {'TibosGoodIdea/'+n for n in inventory} | {'TibosGoodIdea/SHA256-MANIFEST.json'}:
                raise RuntimeError('ZIP inventory does not cover every entry')
            for name, expected in inventory.items():
                if hashlib.sha256(archive.read('TibosGoodIdea/'+name)).hexdigest() != expected:
                    raise RuntimeError('Inventory checksum mismatch: '+name)
        elif 'TibosGoodIdea/runtime/node.exe' in names:
            raise RuntimeError('Corresponding source must not contain node.exe')
        return len(names)


def prepare(value):
    old = version()
    if not VERSION_RE.fullmatch(value):
        raise RuntimeError('Use X.Y.Z or X.Y.Z-rc.N')
    def order(v):
        m = VERSION_RE.fullmatch(v)
        return tuple(int(x) if x is not None else float('inf') for x in m.groups())
    if order(value) <= order(old):
        raise RuntimeError('New version must be greater than the current version')
    changes = {}
    for name in ['product.json', 'package.json']:
        data = read_json(ROOT/name);data['version'] = value
        changes[name] = json.dumps(data, ensure_ascii=False, indent=2)+'\n'
    for name in ['bottom-bar.js', 'README.md', 'README.en.md', 'COMPATIBILITY.md', 'QUICKSTART.ja.md']:
        file = ROOT/name
        text = file.read_text(encoding='utf-8')
        if old not in text:
            raise RuntimeError('Expected version was not found: '+name)
        changes[name] = text.replace(old, value)
    for name, text in changes.items():
        (ROOT/name).write_text(text, encoding='utf-8', newline='\n')
    print(json.dumps({'prepared': value, 'next': f'Write docs/release-notes-{value}.md, then run node scripts/test.mjs full'}))


def build(rebuild=False):
    current = snapshot()
    receipt_path = ROOT/'work/validation'/version()/'full/result.json'
    receipt = read_json(receipt_path);require_receipt(receipt, current)
    record_path = state_dir()/'build.json'
    if record_path.exists() and not rebuild:
        record = read_json(record_path)
        if record['sourceFingerprint'] != current['sha256']:
            raise RuntimeError('Build is stale; review and use build --rebuild before uploading')
        check_assets(record)
        print(json.dumps({'reused': True, 'build': str(record_path)}));return
    if (state_dir()/'publication.json').exists():
        raise RuntimeError('An upload checkpoint exists; never rebuild an uploaded release')
    files = [ROOT/'dist'/f'TibosGoodIdea-{version()}-{kind}{suffix}' for kind in ['Windows-x64', 'source'] for suffix in ['.zip', '.zip.sha256']]
    if any(f.exists() for f in files) and not rebuild:
        raise RuntimeError('Output files exist; review and explicitly use build --rebuild')
    run([sys.executable, '-X', 'utf8', 'pack-buyer.py'])
    run([sys.executable, '-X', 'utf8', 'pack-source.py'])
    if snapshot()['sha256'] != current['sha256']:
        raise RuntimeError('Packaging changed tracked inputs; review, validate and rebuild')
    record = {'schema': 1, 'version': version(), 'sourceFingerprint': current['sha256'],
              'validatedAt': receipt['completedAt'], 'unitTests': next(s.get('tests') for s in receipt['steps'] if s['name'] == 'unit'),
              'integrationChecks': len(read_json(ROOT/'scripts/test-plan.json')['integration']), 'assets': []}
    for f in files:
        item = {'name': f.name, 'bytes': f.stat().st_size, 'sha256': digest(f)}
        if f.suffix == '.zip':item['entries'] = verify_zip(f, '-Windows-x64.zip' in f.name)
        record['assets'].append(item)
    write_json(record_path, record)
    print(json.dumps(record))


def check_assets(record):
    for item in record['assets']:
        file = ROOT/'dist'/item['name']
        if not file.is_file() or file.stat().st_size != item['bytes'] or digest(file) != item['sha256']:
            raise RuntimeError('Built asset changed: '+item['name'])
        if file.name.endswith('.sha256'):
            target = file.with_suffix('')
            if file.read_text(encoding='utf-8').strip() != f'{digest(target)}  {target.name}':
                raise RuntimeError('Checksum sidecar mismatch')


class GitHub:
    def __init__(self):
        env = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'}
        raw = run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', env=env)
        credential = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
        self.token = credential.get('password')
        if not self.token:raise RuntimeError('No GitHub credential available; sign in locally first')

    def request(self, endpoint, method='GET', body=None, file=None, raw=False):
        url = endpoint if endpoint.startswith('https://') else 'https://api.github.com/repos/'+REPOSITORY+endpoint
        if not (url.startswith('https://api.github.com/') or url.startswith('https://uploads.github.com/') or raw and url.startswith('https://raw.githubusercontent.com/'+REPOSITORY+'/')):
            raise RuntimeError('Unexpected GitHub endpoint')
        headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'TibosGoodIdea-maintainer', 'X-GitHub-Api-Version': '2022-11-28'}
        if not raw:headers['Authorization'] = 'Bearer '+self.token
        args = ['curl.exe', '--config', '-', '--silent', '--show-error', '--fail-with-body', '--max-time', '180' if file else '45', '--request', method]
        if method == 'GET':args += ['--retry', '2']
        if file:
            headers['Content-Type'] = 'application/octet-stream';args += ['--data-binary', '@'+str(file)]
        config = ''.join('header = '+json.dumps(k+': '+v)+'\n' for k, v in headers.items())
        if body is not None:
            headers['Content-Type'] = 'application/json'
            config += 'header = "Content-Type: application/json"\n'+'data = '+json.dumps(json.dumps(body))+'\n'
        result = subprocess.run([*args, url], input=config, text=True, encoding='utf-8', capture_output=True, timeout=200 if file else 150)
        if result.returncode:
            # Do not echo curl config, credential-manager output or signed redirect URLs.
            raise RuntimeError(f'GitHub {method} failed (curl {result.returncode}); rerun the same checkpoint to reconcile server state')
        return result.stdout if raw else json.loads(result.stdout or '{}')


def matching_asset(asset, expected):
    return asset.get('size') == expected['bytes'] and asset.get('digest') == 'sha256:'+expected['sha256']


def reconcile_asset(gh, release_id, expected):
    assets = gh.request(f'/releases/{release_id}/assets?per_page=100')
    same = [a for a in assets if a['name'] == expected['name']]
    if same:
        if len(same) != 1 or not matching_asset(same[0], expected):
            raise RuntimeError('Remote asset differs; it will not be deleted or overwritten: '+expected['name'])
        return same[0]
    asset = gh.request(f'https://uploads.github.com/repos/{REPOSITORY}/releases/{release_id}/assets?name={expected["name"]}', 'POST', file=ROOT/'dist'/expected['name'])
    if not matching_asset(asset, expected):raise RuntimeError('GitHub stored digest/size does not match: '+expected['name'])
    return asset


def ci_status(gh, commit, tag):
    runs = gh.request(f'/actions/workflows/test.yml/runs?head_sha={commit}&per_page=30')['workflow_runs']
    selected = []
    for branch in ['main', tag]:
        candidates = [r for r in runs if r['head_sha'] == commit and r['event'] == 'push' and r['head_branch'] == branch]
        if not candidates:return {'passed': False, 'pending': True, 'missing': branch, 'runs': selected}
        r = max(candidates, key=lambda r:r['id'])
        selected.append({k:r.get(k) for k in ['id', 'run_attempt', 'status', 'conclusion', 'html_url']})
    return {'passed': all(r['conclusion'] == 'success' for r in selected),
            'pending': any(r['status'] != 'completed' for r in selected), 'runs': selected}


def publish(notes):
    if git('branch', '--show-current') != 'main' or git('status', '--porcelain'):
        raise RuntimeError('Review and commit all intended changes on main before publishing')
    remote = git('remote', 'get-url', 'origin')
    if remote.rstrip('/').removesuffix('.git') not in ('https://github.com/'+REPOSITORY, 'git@github.com:'+REPOSITORY):
        raise RuntimeError('Unexpected origin repository')
    record = read_json(state_dir()/'build.json');check_assets(record)
    if snapshot()['sha256'] != record['sourceFingerprint']:raise RuntimeError('Committed tree differs from the tested build')
    commit = git('rev-parse', 'HEAD');tag = 'v'+version()
    gh = GitHub()
    owner = gh.request('https://api.github.com/user')['login']
    if owner.lower() != REPOSITORY.split('/')[0].lower():raise RuntimeError('Authenticated GitHub account is not the project owner')
    if git('ls-remote', 'origin', 'refs/heads/main').split()[0] != commit:
        raise RuntimeError('Push the reviewed main commit before publishing')
    tags = git('tag', '--list', tag)
    if tags:
        if git('rev-list', '-n', '1', tag) != commit:raise RuntimeError('Tag already points to another commit')
    else:git('tag', '-a', tag, '-m', f"Tibo's Good Idea {version()}")
    git('push', 'origin', 'refs/tags/'+tag)
    releases = gh.request('/releases?per_page=100')
    matches = [r for r in releases if r['tag_name'] == tag]
    release = matches[0] if matches else gh.request('/releases', 'POST', {'tag_name': tag, 'target_commitish': commit, 'name': "Tibo’s Good Idea "+version(), 'body': Path(notes).read_text(encoding='utf-8'), 'draft': True, 'prerelease': '-rc.' in version()})
    receipt = {**record, 'releaseCommit': commit, 'releaseId': release['id'], 'releaseUrl': release['html_url'], 'draft': release['draft'], 'prerelease': release['prerelease']}
    write_json(state_dir()/'publication.json', receipt)
    for item in record['assets']:
        reconcile_asset(gh, release['id'], item);print('VERIFIED '+item['name'], flush=True)
    checks = ci_status(gh, commit, tag);receipt['githubChecks'] = checks;write_json(state_dir()/'publication.json', receipt)
    if not checks['passed']:
        print(json.dumps({'checkpoint': 'ci-pending' if checks['pending'] else 'ci-failed', **checks}));return 3 if checks['pending'] else 1
    if release['draft']:
        release = gh.request(f'/releases/{release["id"]}', 'PATCH', {'draft': False})
    receipt['releaseUrl'] = release['html_url'];receipt['draft'] = release['draft'];receipt['githubStorageDigestsMatch'] = True
    write_json(state_dir()/'publication.json', receipt)
    print(json.dumps({'published': True, 'url': release['html_url']}));return 0


def catalog_check(expected, catalog_file, asar=None):
    code = """import fs from 'node:fs/promises';import {verifyProgramCatalog,clientFingerprint,selectRelease} from './program-updates.mjs';import {readPackage,sha256} from './update-files.mjs';
const [version,zipPath,indexPath,asar]=process.argv.slice(1),key=await fs.readFile('updates/program-public-key.pem','utf8'),catalog=verifyProgramCatalog(JSON.parse(await fs.readFile(indexPath,'utf8')),key),zip=await fs.readFile(zipPath),pkg=readPackage(zip),entry=catalog.releases.find(r=>r.version===version);
if(!entry||entry.sha256!==sha256(zip)||entry.bytes!==zip.length||entry.manifestSha256!==pkg.manifestSha256)throw Error('Catalog does not match archive');
if(asar&&!entry.clients.includes(await clientFingerprint(asar)))throw Error('Client fingerprint mismatch');
if(selectRelease(catalog,{version,client:entry.clients[0]}))throw Error('Same version selected again');
console.log(JSON.stringify({revision:catalog.revision,version,signatureVerified:true,archiveVerified:true,clients:entry.clients}));"""
    return json.loads(run([node(), '--input-type=module', '-e', code, expected, ROOT/'dist'/f'TibosGoodIdea-{expected}-Windows-x64.zip', catalog_file, asar or '']))


def index(asar, kind):
    receipt = read_json(state_dir()/'publication.json')
    if receipt['draft']:raise RuntimeError('Publish the release before advertising its update')
    check_assets(receipt)
    fingerprint = run([node(), 'scripts/sign-program-catalog.mjs', '--fingerprint', asar])
    existing = json.loads(run([node(), '--input-type=module', '-e', "import fs from 'node:fs';import {verifyProgramCatalog} from './program-updates.mjs';console.log(JSON.stringify(verifyProgramCatalog(JSON.parse(fs.readFileSync('updates/program-catalog.json','utf8')),fs.readFileSync('updates/program-public-key.pem','utf8'))))"]))
    entry = next((r for r in existing['releases'] if r['version'] == version()), None)
    if entry and (fingerprint not in entry['clients'] or entry['sha256'] != receipt['assets'][0]['sha256']):raise RuntimeError('Existing signed entry differs; inspect before changing it')
    if not entry:run([node(), 'scripts/sign-program-catalog.mjs', '--zip', ROOT/'dist'/f'TibosGoodIdea-{version()}-Windows-x64.zip', '--client', fingerprint, '--kind', kind])
    receipt['programCatalog'] = catalog_check(version(), ROOT/'updates/program-catalog.json', asar)
    write_json(state_dir()/'publication.json', receipt)
    print(json.dumps({'signed': True, **receipt['programCatalog'], 'next': 'Commit and push updates/program-catalog.json, then run verify'}))


def verify():
    receipt = read_json(state_dir()/'publication.json');gh = GitHub();check_assets(receipt)
    release = gh.request(f'/releases/{receipt["releaseId"]}')
    if release['draft']:raise RuntimeError('Release is still a draft')
    receipt['releaseUrl'] = release['html_url'];receipt['draft'] = release['draft']
    assets = gh.request(f'/releases/{release["id"]}/assets?per_page=100')
    for item in receipt['assets']:
        if not any(a['name'] == item['name'] and matching_asset(a, item) for a in assets):raise RuntimeError('Public asset mismatch')
    receipt['githubChecks'] = ci_status(gh, receipt['releaseCommit'], 'v'+version())
    if not receipt['githubChecks']['passed']:raise RuntimeError('Release commit checks are not successful')
    text = gh.request(f'https://raw.githubusercontent.com/{REPOSITORY}/main/updates/program-catalog.json', raw=True)
    if text.encode('utf-8') != (ROOT/'updates/program-catalog.json').read_bytes():raise RuntimeError('Public update index differs from local file')
    public_file = state_dir()/'public-program-catalog.json';public_file.write_text(text, encoding='utf-8', newline='\n')
    receipt['programCatalog'] = {**catalog_check(version(), public_file), 'publicIndexDownloadedAndVerified': True}
    receipt['githubStorageDigestsMatch'] = True;receipt['fullPublicAssetDownloadVerified'] = False
    receipt['downloadVerificationScope'] = 'Local ZIP CRC/inventory + GitHub stored asset digest/size; full asset re-download was not performed'
    receipt['verifiedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    write_json(state_dir()/'publication.json', receipt)
    print(json.dumps({'verified': True, 'url': receipt['releaseUrl'], 'record': str(state_dir()/'publication.json'), 'fullAssetRedownload': False}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('fingerprint')
    sub.add_parser('prepare').add_argument('version')
    sub.add_parser('build').add_argument('--rebuild', action='store_true')
    sub.add_parser('publish').add_argument('--notes', required=True)
    p = sub.add_parser('index');p.add_argument('--asar', required=True);p.add_argument('--kind', choices=['fix', 'feature'], default='fix')
    sub.add_parser('verify')
    args = parser.parse_args()
    if args.command == 'fingerprint':print(json.dumps(snapshot()))
    elif args.command == 'prepare':prepare(args.version)
    elif args.command == 'build':build(args.rebuild)
    elif args.command == 'publish':return publish(args.notes)
    elif args.command == 'index':index(args.asar, args.kind)
    elif args.command == 'verify':verify()
    return 0


if __name__ == '__main__':
    try:sys.exit(main())
    except Exception as error:
        print(str(error), file=sys.stderr);sys.exit(1)
