import http.client
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer

SCRIPT = Path(__file__).parents[1] / 'scripts/bassin-server.py'
spec = importlib.util.spec_from_file_location('bassin_server', SCRIPT)
bassin_server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bassin_server)

TEST_TOKEN = 'test-config-api-token-for-unit-tests'


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

        self.state = bassin_server.AppState(
            self.ui_dir, self.www_dir, self.config_file, 900, config_token=TEST_TOKEN
        )
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

    def auth_headers(self, extra=None):
        headers = {'Authorization': f'Bearer {TEST_TOKEN}'}
        if extra:
            headers.update(extra)
        return headers

    def test_config_api_requires_bearer_token_and_fails_closed_when_unset(self):
        # Missing or wrong Bearer token returns 401 on GET and PUT.
        status, _, body = self.request('GET', '/api/config')
        self.assertEqual(status, 401)
        self.assertTrue(json.loads(body)['authRequired'])

        status, _, _ = self.request('GET', '/api/config', headers={'Authorization': 'Bearer wrong-token'})
        self.assertEqual(status, 401)

        status, _, _ = self.request(
            'PUT',
            '/api/config',
            body=json.dumps({'mindiff': 2}),
            headers={'Content-Type': 'application/json', 'X-Bassin-Config': '1'},
        )
        self.assertEqual(status, 401)

        # Unset token fails closed with 403.
        self.state.config_token = ''
        try:
            status, _, _ = self.request('GET', '/api/config', headers=self.auth_headers())
            self.assertEqual(status, 403)
            status, _, _ = self.request(
                'PUT',
                '/api/config',
                body=json.dumps({'mindiff': 2}),
                headers=self.auth_headers({'Content-Type': 'application/json', 'X-Bassin-Config': '1'}),
            )
            self.assertEqual(status, 403)
        finally:
            self.state.config_token = TEST_TOKEN

    def test_get_masks_password_and_save_gates_reload_trigger(self):
        status, _, body = self.request('GET', '/api/config', headers=self.auth_headers())
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertTrue(payload['live'])
        self.assertEqual(payload['passwordsSet'], [True])
        self.assertNotIn('pass', payload['config']['btcd'][0])
        self.assertNotIn('super-secret-rpc-pass', body.decode('utf-8'))

        # Missing CSRF header is rejected even with valid Bearer token.
        updated = dict(payload['config'])
        updated['sv2url'] = ['0.0.0.0:3336']
        updated['sv2_authority_key'] = '/sv2/sv2_authority.key'
        updated['sv2_static_key'] = '/sv2/sv2_static.key'
        updated['ipcmining'] = '/bitcoin/node.sock'
        status, _, _ = self.request(
            'PUT',
            '/api/config',
            body=json.dumps(updated),
            headers=self.auth_headers({'Content-Type': 'application/json'}),
        )
        self.assertEqual(status, 403)

        # Save WITHOUT restart writes ckpool.conf (0600), preserves RPC password, and does NOT write .reload-trigger.
        trigger = self.cfg_dir / '.reload-trigger'
        self.assertFalse(trigger.exists())
        status, _, body = self.request(
            'PUT',
            '/api/config',
            body=json.dumps(updated),
            headers=self.auth_headers({'Content-Type': 'application/json', 'X-Bassin-Config': '1'}),
        )
        self.assertEqual(status, 200)
        res_payload = json.loads(body)
        self.assertEqual(res_payload['passwordsSet'], [True])
        self.assertFalse(res_payload['restarted'])
        self.assertNotIn('config', res_payload)
        self.assertFalse(trigger.exists())

        on_disk = json.loads(self.config_file.read_text(encoding='utf-8'))
        self.assertEqual(on_disk['btcd'][0]['pass'], 'super-secret-rpc-pass')
        self.assertEqual(on_disk['sv2url'], ['0.0.0.0:3336'])
        self.assertEqual(on_disk['ipcmining'], '/bitcoin/node.sock')
        self.assertEqual(on_disk['logdir'], '/www')
        self.assertEqual(self.config_file.stat().st_mode & 0o777, 0o600)

        # Save WITH restart=1 writes .reload-trigger so supervisor restarts CKPool intentionally.
        status, _, body = self.request(
            'PUT',
            '/api/config?restart=1',
            body=json.dumps(updated),
            headers=self.auth_headers({'Content-Type': 'application/json', 'X-Bassin-Config': '1', 'X-Bassin-Restart': '1'}),
        )
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['restarted'])
        self.assertTrue(trigger.exists())

    def test_allowlist_blocks_donation_btcaddress_logdir_and_unconfined_paths(self):
        status, _, body = self.request('GET', '/api/config', headers=self.auth_headers())
        self.assertEqual(status, 200)
        base = json.loads(body)['config']
        headers = self.auth_headers({'Content-Type': 'application/json', 'X-Bassin-Config': '1'})

        for bad_patch in [
            {'donation': 50},
            {'btcaddress': 'bc1qattacker'},
            {'logdir': '/config'},
            {'proxy': [{'url': 'evil:3333'}]},
            {'redirecturl': ['evil:3333']},
            {'arbitrary_unknown_key': 123},
            {'sv2_authority_key': '/www/leak.key'},
            {'sv2_static_key': '/sv2/../www/leak.key'},
            {'ipcmining': '/etc/passwd'},
        ]:
            attempt = dict(base)
            attempt.update(bad_patch)
            status, _, _ = self.request('PUT', '/api/config', body=json.dumps(attempt), headers=headers)
            self.assertEqual(status, 400, bad_patch)

        # Disk file remained completely untouched.
        self.assertEqual(json.loads(self.config_file.read_text(encoding='utf-8')), self.initial_config)

        # NaN constant is also rejected.
        status, _, _ = self.request(
            'PUT',
            '/api/config',
            body='{"btcd":[{"url":"10.0.0.1:8332","auth":"u"}],"mindiff":NaN}',
            headers=headers,
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

        (self.www_dir / 'ckpool.log').write_bytes(b'')
        status, headers, _ = self.request('GET', '/ckpool.log', headers={'Range': 'bytes=-65536'})
        self.assertEqual(status, 416)
        self.assertEqual(headers.get('Content-Range'), 'bytes */0')

        status, _, _ = self.request('GET', '/pool/../../config/ckpool.conf')
        self.assertEqual(status, 404)
        secret_link = self.www_dir / 'pool/leak.conf'
        os.symlink(self.config_file, secret_link)
        status, _, _ = self.request('GET', '/pool/leak.conf')
        self.assertEqual(status, 404)

    def test_builtin_umbrel_widgets_and_worker_leaderboard(self):
        now = int(time.time())
        (self.www_dir / 'pool/pool.status').write_text(
            '\n'.join([
                json.dumps({'runtime': 3600, 'lastupdate': now - 10, 'Users': 2, 'Workers': 3, 'Idle': 0, 'Disconnected': 0}),
                json.dumps({'hashrate1m': '1.61T', 'hashrate5m': '1e+03G', 'hashrate1hr': '950G', 'hashrate1d': '1.10T', 'hashrate7d': '410G'}),
                json.dumps({'diff': 42, 'accepted': 66872638, 'rejected': 10, 'bestshare': 1.25e15, 'SPS1m': 1.5}),
                json.dumps({'clients': 2, 'channels': 2, 'jdclients': 0}),
            ]) + '\n',
            encoding='utf-8',
        )
        (self.www_dir / 'users/bc1qminer1').write_text(
            json.dumps({
                'worker': [
                    {'workername': 'bc1qminer1.gamma', 'hashrate5m': '1e+03G', 'bestshare': 146605934.08, 'bestever': 146605934},
                    {'workername': 'bc1qminer1.ultra', 'hashrate5m': '555G', 'bestshare': 17426432, 'bestever': 17426432},
                ]
            }),
            encoding='utf-8',
        )
        (self.www_dir / 'users/bc1qminer2').write_text(
            json.dumps({
                'worker': [
                    {'workername': 'bc1qminer2.nerdqaxe', 'hashrate5m': '4.80T', 'bestshare': 500000, 'bestever': 2500000000000},
                    {'workername': 'bc1qbareaddresswithnosuffix', 'hashrate5m': '0', 'bestshare': 0, 'bestever': 850000000},
                ]
            }),
            encoding='utf-8',
        )

        status, _, body = self.request('GET', '/health')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'status': 'ok'})

        status, _, body = self.request('GET', '/widgets/pool')
        self.assertEqual(status, 200)
        pool_w = json.loads(body)
        self.assertEqual(pool_w['items'][0], {'title': 'Hashrate', 'text': '1.00', 'subtext': 'Th/s'})
        self.assertEqual(pool_w['items'][2], {'title': 'Best Share', 'text': '1.25', 'subtext': 'P'})

        status, _, body = self.request('GET', '/widgets/workers')
        self.assertEqual(status, 200)
        lb = json.loads(body)
        self.assertEqual(lb['items'][0], {'text': '#1 nerdqaxe', 'subtext': 'Best ever: 2.5T · 4.80 Th/s'})
        self.assertEqual(lb['items'][1], {'text': '#2 bc1qba…ffix', 'subtext': 'Best ever: 850M · Idle'})


if __name__ == '__main__':
    unittest.main()
