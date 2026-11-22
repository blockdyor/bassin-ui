import http.client
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

SCRIPT = Path(__file__).parents[1] / 'scripts/bassin-server.py'
spec = importlib.util.spec_from_file_location('bassin_server', SCRIPT)
bassin_server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bassin_server)


class BassinServerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.ui_dir = self.root / 'ui'
        self.www_dir = self.root / 'www'
        self.cfg_dir = self.root / 'config'
        (self.ui_dir / 'assets').mkdir(parents=True)
        (self.www_dir / 'pool').mkdir(parents=True)
        (self.www_dir / 'users').mkdir(parents=True)
        self.cfg_dir.mkdir(parents=True)

        (self.ui_dir / 'index.html').write_text('<!doctype html><title>Bassin</title>', encoding='utf-8')
        (self.www_dir / 'pool/pool.status').write_text('{"Users":1}\n', encoding='utf-8')
        (self.www_dir / 'users/bc1qminer1').write_text('{"workers":1}\n', encoding='utf-8')
        (self.www_dir / 'ckpool.log').write_text('line1\nline2\nline3\n', encoding='utf-8')

        self.config_file = self.cfg_dir / 'ckpool.conf'
        self.initial_config = {
            'btcd': [{'url': '10.21.21.8:8332', 'auth': 'umbrel', 'pass': 'super-secret-rpc-pass', 'notify': True}],
            'zmqblock': 'tcp://10.21.21.8:28332',
            'btcsig': '/mined by Bassin on Umbrel/',
            'mindiff': 1,
            'startdiff': 42,
            'maxdiff': 0,
            'logdir': '/www',
        }
        self.config_file.write_text(json.dumps(self.initial_config, indent=2) + '\n', encoding='utf-8')

        self.state = bassin_server.AppState(self.ui_dir, self.www_dir, self.config_file, 900)
        self.state.refresh_sv2()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), bassin_server.make_handler(self.state))
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.state.stop_event.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            res = conn.getresponse()
            data = res.read()
            return res.status, dict(res.getheaders()), data
        finally:
            conn.close()

    def test_get_config_masks_rpc_password_and_put_preserves_it(self):
        status, _, body = self.request('GET', '/api/config')
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertTrue(payload['live'])
        self.assertEqual(payload['passwordsSet'], [True])
        self.assertNotIn('pass', payload['config']['btcd'][0])
        self.assertNotIn('super-secret-rpc-pass', body.decode('utf-8'))

        # Missing CSRF header is rejected.
        updated = dict(payload['config'])
        updated['sv2url'] = ['0.0.0.0:3336']
        updated['sv2_authority_key'] = '/sv2/sv2_authority.key'
        updated['sv2_static_key'] = '/sv2/sv2_static.key'
        status, _, _ = self.request(
            'PUT',
            '/api/config',
            body=json.dumps(updated),
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(status, 403)

        # Valid save preserves on-disk RPC password, writes 0600 atomically, and updates sv2.json.
        status, _, body = self.request(
            'PUT',
            '/api/config',
            body=json.dumps(updated),
            headers={'Content-Type': 'application/json', 'X-Bassin-Config': '1'},
        )
        self.assertEqual(status, 200)
        res_payload = json.loads(body)
        self.assertEqual(res_payload['passwordsSet'], [True])
        self.assertNotIn('config', res_payload)

        get_status, get_headers, get_body = self.request('GET', '/api/config')
        self.assertEqual(get_status, 200)
        self.assertEqual(get_headers.get('X-Content-Type-Options'), 'nosniff')
        get_payload = json.loads(get_body)
        self.assertNotIn('pass', get_payload['config']['btcd'][0])
        self.assertEqual(get_payload['config']['sv2url'], ['0.0.0.0:3336'])

        on_disk = json.loads(self.config_file.read_text(encoding='utf-8'))
        self.assertEqual(on_disk['btcd'][0]['pass'], 'super-secret-rpc-pass')
        self.assertEqual(on_disk['sv2url'], ['0.0.0.0:3336'])
        self.assertEqual(self.config_file.stat().st_mode & 0o777, 0o600)

        sv2_status, _, sv2_body = self.request('GET', '/pool/sv2.json')
        self.assertEqual(sv2_status, 200)
        sv2 = json.loads(sv2_body)
        self.assertTrue(sv2['enabled'])
        self.assertFalse(sv2['ephemeralKeys'])

    def test_invalid_config_rejected_without_touching_disk(self):
        bad = dict(self.initial_config)
        bad['donation'] = 0.05
        status, _, body = self.request(
            'PUT',
            '/api/config',
            body=json.dumps(bad),
            headers={'Content-Type': 'application/json', 'X-Bassin-Config': '1'},
        )
        self.assertEqual(status, 400)
        self.assertIn('Donation', body.decode('utf-8'))
        self.assertEqual(json.loads(self.config_file.read_text(encoding='utf-8')), self.initial_config)

        # NaN constant is also rejected.
        status, _, _ = self.request(
            'PUT',
            '/api/config',
            body='{"btcd":[{"url":"10.0.0.1:8332","auth":"u"}],"donation":NaN}',
            headers={'Content-Type': 'application/json', 'X-Bassin-Config': '1'},
        )
        self.assertEqual(status, 400)

    def test_serves_ui_users_ranges_and_blocks_traversal(self):
        status, _, body = self.request('GET', '/')
        self.assertEqual(status, 200)
        self.assertIn(b'<title>Bassin</title>', body)

        status, _, body = self.request('GET', '/users/')
        self.assertEqual(status, 200)
        self.assertIn(b'<a href="bc1qminer1">bc1qminer1</a>', body)

        status, headers, body = self.request('GET', '/ckpool.log', headers={'Range': 'bytes=-6'})
        self.assertEqual(status, 206)
        self.assertEqual(body, b'line3\n')
        self.assertEqual(headers.get('Content-Range'), 'bytes 12-17/18')

        # 0-byte log returns 416 bytes */0 on suffix range.
        (self.www_dir / 'ckpool.log').write_bytes(b'')
        status, headers, _ = self.request('GET', '/ckpool.log', headers={'Range': 'bytes=-65536'})
        self.assertEqual(status, 416)
        self.assertEqual(headers.get('Content-Range'), 'bytes */0')

        # Path traversal and symlinks are blocked.
        status, _, _ = self.request('GET', '/pool/../../config/ckpool.conf')
        self.assertEqual(status, 404)
        secret_link = self.www_dir / 'pool/leak.conf'
        os.symlink(self.config_file, secret_link)
        status, _, _ = self.request('GET', '/pool/leak.conf')
        self.assertEqual(status, 404)


if __name__ == '__main__':
    unittest.main()
