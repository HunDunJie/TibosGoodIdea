"""Release invariants tested without GitHub, credentials, actual installs or playback."""
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

spec = importlib.util.spec_from_file_location('release_workflow', Path(__file__).resolve().parents[1]/'scripts/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_receipt_requires_exact_successful_full_recent_tree(self):
        now = dt.datetime(2026, 10, 30, tzinfo=dt.timezone.utc)
        source = {'version': '0.8.0-rc.17', 'sha256': 'tree'}
        good = {'version': source['version'], 'sourceFingerprint': 'tree', 'passed': True, 'mode': 'full', 'completedAt': now.isoformat()}
        release.require_receipt(good, source, now)
        for overrides in [{'passed': False}, {'mode': 'quick'}, {'version': '0.8.0-rc.16'}, {'sourceFingerprint': 'old'}, {'completedAt': (now-dt.timedelta(days=2)).isoformat()}, {'completedAt': (now+dt.timedelta(seconds=1)).isoformat()}]:
            with self.subTest(overrides=overrides), self.assertRaises(RuntimeError):
                release.require_receipt({**good, **overrides}, source, now)

    def test_prepare_validates_all_inputs_before_writing(self):
        with tempfile.TemporaryDirectory(prefix='tibo-release-prepare-') as folder, patch.object(release, 'ROOT', Path(folder)):
            root = Path(folder)
            for name in ['product.json', 'package.json']:release.write_json(root/name, {'version': '0.8.0-rc.16'})
            for name in ['bottom-bar.js', 'README.md', 'README.en.md', 'COMPATIBILITY.md', 'QUICKSTART.ja.md']:(root/name).write_text('version 0.8.0-rc.16', encoding='utf-8')
            (root/'README.en.md').write_text('missing expected version', encoding='utf-8')
            with self.assertRaises(RuntimeError):release.prepare('0.8.0-rc.17')
            self.assertEqual(release.version(), '0.8.0-rc.16')
            (root/'README.en.md').write_text('version 0.8.0-rc.16', encoding='utf-8')
            for bad in ['0.8.0-rc.15', '0.8.0-rc.16', '0.8.0-rc.017', '../escape']:
                with self.assertRaises(RuntimeError):release.prepare(bad)
            with patch('sys.stdout', new_callable=io.StringIO):release.prepare('0.8.0-rc.17')
            self.assertEqual(release.version(), '0.8.0-rc.17')
            self.assertIn('0.8.0-rc.17', (root/'bottom-bar.js').read_text())

    def test_inventory_requires_all_entries_and_matching_hashes(self):
        with tempfile.TemporaryDirectory(prefix='tibo-release-zip-') as folder:
            file = Path(folder)/'fixture.zip'
            def write(entries):
                with zipfile.ZipFile(file, 'w') as z:
                    for name, value in entries.items():z.writestr('TibosGoodIdea/'+name, value)
            entries = {'product.json': '{}', 'SHA256-MANIFEST.json': json.dumps({'product.json': release.hashlib.sha256(b'{}').hexdigest()})}
            write(entries);self.assertEqual(release.verify_zip(file, True), 2)
            write({**entries, 'extra.txt': 'unexpected'})
            with self.assertRaises(RuntimeError):release.verify_zip(file, True)
            write({**entries, 'product.json': 'tampered'})
            with self.assertRaises(RuntimeError):release.verify_zip(file, True)
            write({'runtime/node.exe': 'binary'})
            with self.assertRaises(RuntimeError):release.verify_zip(file, False)

    def test_existing_asset_is_reused_and_never_replaced(self):
        expected = {'name': 'release.zip', 'bytes': 5, 'sha256': 'a'*64}
        matching = {'name': expected['name'], 'size': 5, 'digest': 'sha256:'+'a'*64}
        gh = Mock();gh.request.return_value = [matching]
        self.assertEqual(release.reconcile_asset(gh, 1, expected), matching)
        self.assertEqual(gh.request.call_count, 1)
        gh.reset_mock();gh.request.return_value = [{**matching, 'digest': 'sha256:'+'b'*64}]
        with self.assertRaises(RuntimeError):release.reconcile_asset(gh, 1, expected)
        self.assertEqual(gh.request.call_count, 1)

    def test_uncertain_upload_is_reconciled_on_resume(self):
        expected = {'name': 'release.zip', 'bytes': 5, 'sha256': 'a'*64}
        asset = {'name': expected['name'], 'size': 5, 'digest': 'sha256:'+'a'*64}
        gh = Mock();gh.request.side_effect = [[], RuntimeError('connection dropped'), [asset]]
        with self.assertRaises(RuntimeError):release.reconcile_asset(gh, 1, expected)
        self.assertEqual(release.reconcile_asset(gh, 1, expected), asset)
        self.assertEqual(sum(call.args[1:2] == ('POST',) for call in gh.request.call_args_list), 1)

    def test_ci_gates_both_exact_release_commit_runs(self):
        gh = Mock();runs = [{'id': 1, 'head_sha': 'exact', 'event': 'push', 'head_branch': 'main', 'status': 'completed', 'conclusion': 'success'}, {'id': 2, 'head_sha': 'exact', 'event': 'push', 'head_branch': 'v0.8.0', 'status': 'in_progress', 'conclusion': None}]
        gh.request.return_value = {'workflow_runs': runs}
        self.assertTrue(release.ci_status(gh, 'exact', 'v0.8.0')['pending'])
        runs[1].update(status='completed', conclusion='failure')
        self.assertFalse(release.ci_status(gh, 'exact', 'v0.8.0')['passed'])
        runs[1]['conclusion'] = 'success'
        self.assertTrue(release.ci_status(gh, 'exact', 'v0.8.0')['passed'])
        self.assertFalse(release.ci_status(gh, 'different', 'v0.8.0')['passed'])

    def test_credentials_are_stdin_only_and_errors_do_not_echo_responses(self):
        gh = release.GitHub.__new__(release.GitHub);gh.token = 'private-fixture-token'
        with patch.object(release.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{}', '')) as execute:
            gh.request('/releases', 'POST', {'body': 'actual\nnewlines'})
            args, kwargs = execute.call_args
            self.assertNotIn(gh.token, ' '.join(args[0]))
            self.assertIn(gh.token, kwargs['input'])
        with patch.object(release.subprocess, 'run', return_value=subprocess.CompletedProcess([], 22, 'private-fixture-token', 'private-fixture-token')):
            with self.assertRaises(RuntimeError) as error:gh.request('/releases')
            self.assertNotIn(gh.token, str(error.exception))

    def test_fingerprint_changes_with_inputs_and_restores(self):
        with tempfile.TemporaryDirectory(prefix='tibo-release-tree-') as folder, patch.object(release, 'ROOT', Path(folder)):
            root = Path(folder);release.run(['git', 'init', '-q'])
            for name in ['product.json', 'package.json']:release.write_json(root/name, {'version': '1.0.0'})
            file = root/'input.txt';file.write_text('original', encoding='utf-8')
            initial = release.snapshot()['sha256'];file.write_text('changed', encoding='utf-8')
            self.assertNotEqual(initial, release.snapshot()['sha256'])
            file.write_text('original', encoding='utf-8');self.assertEqual(initial, release.snapshot()['sha256'])


if __name__ == '__main__':unittest.main(verbosity=1)
