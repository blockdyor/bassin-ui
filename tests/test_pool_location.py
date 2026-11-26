import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import time
spec = importlib.util.spec_from_file_location('pool_location', Path(__file__).parents[1]/'scripts/pool-location.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class PoolLocationTest(unittest.TestCase):
    def test_public_only(self):
        for address in ['127.0.0.1','192.168.1.2','10.0.0.1','100.64.0.1','::1','fc00::1','fe80::1','224.0.0.1','abc.onion','node.local','invalid']:
            self.assertIsNone(m.public_ip(address), address)
        self.assertEqual(m.public_ip('8.8.8.8:8333'),'8.8.8.8')
        self.assertEqual(m.public_ip('[2606:4700:4700::1111]:8333'),'2606:4700:4700::1111')

    def test_advertised_address_and_peer_observation(self):
        info={'localaddresses':[{'address':'10.0.0.1','score':20},{'address':'8.8.8.8','score':2},{'address':'1.1.1.1','score':4}]}
        self.assertEqual(m.node_ip(info),'1.1.1.1')
        peers=[{'addr':'9.9.9.9:8333','addrlocal':'8.8.8.8:8333'},{'addrlocal':'8.8.8.8:8333'},{'addrlocal':'1.1.1.1:8333'}]
        self.assertEqual(m.node_ip({},peers),'8.8.8.8')
        self.assertIsNone(m.node_ip({},[{'addr':'9.9.9.9:8333'}]))

    def test_no_ip_does_not_call_geo_service(self):
        def rpc(node, method): return {'localaddresses':[{'address':'secret.onion'}]} if method=='getnetworkinfo' else [{'addr':'8.8.8.8:8333'}]
        def forbidden(ip): self.fail('must never infer a caller/visitor IP')
        self.assertIsNone(m.resolve({'btcd':[{}]},rpc_call=rpc,geolocate=forbidden))

    def test_cache_and_failover(self):
        calls=[]
        def rpc(node, method):
            if node.get('offline'): raise OSError('unreachable')
            return {'localaddresses':[{'address':'8.8.8.8'}]}
        cached={'source':'bitcoin-node','ip':'8.8.8.8','updatedAt':time.time()*1000}
        result=m.resolve({'btcd':[{'offline':True},{}]},cached,rpc_call=rpc,geolocate=lambda ip:calls.append(ip))
        self.assertEqual(result,cached)
        self.assertEqual(calls,[])
        m.resolve({'btcd':[{}]},rpc_call=rpc,geolocate=lambda ip:calls.append(ip))
        self.assertEqual(calls,['8.8.8.8'])
        # Malformed cached updatedAt must fall back to geolocation rather than skipping the node.
        for bad in [{'source':'bitcoin-node','ip':'8.8.8.8','updatedAt':'invalid'},
                    {'source':'bitcoin-node','ip':'8.8.8.8','updatedAt':True},
                    {'source':'bitcoin-node','ip':'8.8.8.8','updatedAt':None}]:
            calls.clear()
            m.resolve({'btcd':[{}]},bad,rpc_call=rpc,geolocate=lambda ip:calls.append(ip) or {'source':'bitcoin-node','ip':ip})
            self.assertEqual(calls,['8.8.8.8'])

    def test_no_external_http_geolocation_client(self):
        source = Path(m.__file__).read_text(encoding='utf-8')
        self.assertNotIn('ipwho.is', source)
        self.assertNotIn('urlopen', source)
        self.assertNotIn('urllib.request', source)

    def test_local_bgeo_lookup_and_validation(self):
        import ipaddress
        builder_spec = importlib.util.spec_from_file_location('build_geoip_db', Path(__file__).parents[1] / 'scripts/build-geoip-db.py')
        builder = importlib.util.module_from_spec(builder_spec)
        builder_spec.loader.exec_module(builder)

        # Adjacent IPv4 ranges with matching quantized coordinates should coalesce cleanly.
        v4_ranges = [
            (int(ipaddress.IPv4Address('8.8.8.0')), int(ipaddress.IPv4Address('8.8.8.127')), 378, -978),
            (int(ipaddress.IPv4Address('8.8.8.128')), int(ipaddress.IPv4Address('8.8.8.255')), 378, -978),
            (int(ipaddress.IPv4Address('1.1.1.0')), int(ipaddress.IPv4Address('1.1.1.255')), 950, 0),
        ]
        v6_hi = int(ipaddress.IPv6Address('2606:4700:4700::')) >> 64
        v6_ranges = [
            (v6_hi, v6_hi, -339, 1512),
        ]

        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'geoip.bin'
            palette_cnt, v4_cnt, v6_cnt = builder.write_bgeo(db, v4_ranges, v6_ranges)
            # 3 unique coords; v4 = [1.1.1.0, gap 1.1.2.0, 8.8.8.0, tail 8.8.9.0]; v6 = [2606:..., tail]
            self.assertEqual((palette_cnt, v4_cnt, v6_cnt), (3, 4, 2))

            loc4 = m.lookup('8.8.8.8', db_path=db)
            self.assertEqual(loc4['source'], 'bitcoin-node')
            self.assertEqual(loc4['ip'], '8.8.8.8')
            self.assertEqual(loc4['latitude'], 37.8)
            self.assertEqual(loc4['longitude'], -97.8)

            loc6 = m.lookup('[2606:4700:4700::1111]:8333', db_path=db)
            self.assertEqual(loc6['ip'], '2606:4700:4700::1111')
            self.assertEqual(loc6['latitude'], -33.9)
            self.assertEqual(loc6['longitude'], 151.2)

            # Out-of-range coordinates, gap IPs, and unmapped IPs return None.
            self.assertIsNone(m.lookup('1.1.1.1', db_path=db))
            self.assertIsNone(m.lookup('2.2.2.2', db_path=db))
            self.assertIsNone(m.lookup('203.0.113.1', db_path=db))
            self.assertIsNone(m.lookup('2606:4700:4701::1', db_path=db))

            for non_public in ('127.0.0.1', '192.168.1.2', '10.0.0.1', 'secret.onion'):
                self.assertIsNone(m.lookup(non_public, db_path=db))

            # Missing DB file returns None cleanly without raising.
            self.assertIsNone(m.lookup('8.8.8.8', db_path=Path(directory) / 'missing.bin'))

            # Corrupt DB header fails closed as None.
            corrupt = Path(directory) / 'corrupt.bin'
            corrupt.write_bytes(b'NOPE123456789012')
            self.assertIsNone(m.lookup('8.8.8.8', db_path=corrupt))

    def test_once_with_custom_paths(self):
        from http.server import BaseHTTPRequestHandler, HTTPServer
        import subprocess
        import sys
        from threading import Thread
        calls = []

        class Node(BaseHTTPRequestHandler):
            def do_POST(self):
                calls.append(json.loads(self.rfile.read(int(self.headers['Content-Length'])))['method'])
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"result": {}}' if calls[-1] == 'getnetworkinfo' else b'{"result": []}')

        with tempfile.TemporaryDirectory() as directory, HTTPServer(('127.0.0.1', 0), Node) as node:
            root = Path(directory)
            rpc = {'url': f'127.0.0.1:{node.server_port}', 'auth': 'test', 'pass': 'fixture'}
            (root / 'operator.conf').write_text(json.dumps({'btcd': [rpc]}))
            server = Thread(target=node.serve_forever)
            server.start()
            try:
                subprocess.run([sys.executable, m.__file__, '--config', str(root / 'operator.conf'),
                                '--output', 'new/nested/status.json', '--once'], cwd=root,
                               check=True, timeout=10)
            finally:
                node.shutdown()
                server.join()
            self.assertEqual(calls, ['getnetworkinfo', 'getpeerinfo'])
            self.assertIsNone(json.loads((root / 'new/nested/status.json').read_text()))

    def test_rpc_transport(self):
        import socket
        from unittest.mock import MagicMock
        answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('10.21.21.8', 8332))]
        for url, kind, host in [('bitcoin_bitcoind_1:8332', 'HTTPConnection', '10.21.21.8'),
                                ('https://node.example:8332', 'HTTPSConnection', 'node.example')]:
            with self.subTest(url=url), patch('socket.getaddrinfo', return_value=answer), \
                    patch('http.client.' + kind) as connect:
                response = MagicMock(status=200)
                response.read.return_value = b'{"result": 17}'
                connect.return_value.getresponse.return_value = response
                self.assertEqual(m.rpc({'url':url, 'auth':'test', 'pass':'fixture'}, 'getnetworkinfo'), 17)
                connect.assert_called_once_with(host, 8332, timeout=10)

    def test_cleartext_refused_before_connection(self):
        import socket
        answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('192.0.2.1', 8332))]
        with patch('socket.getaddrinfo', return_value=answer), patch('http.client.HTTPConnection') as connect:
            with self.assertRaises(ValueError):
                m.rpc({'url':'http://node.example:8332','auth':'test','pass':'fixture'}, 'getnetworkinfo')
            connect.assert_not_called()

    def test_public_file_respects_process_umask(self):
        import os
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'pool/location.json'
            # An inherited default ACL supersedes umask on Linux.
            if hasattr(os, 'listxattr') and 'system.posix_acl_default' in os.listxattr(directory):
                os.removexattr(directory, 'system.posix_acl_default')
            old = os.umask(0o022)
            try:
                m.publish(path, None)
                self.assertEqual(path.stat().st_mode & 0o777, 0o644)
                os.umask(0o077)
                m.publish(path, None)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            finally:
                os.umask(old)

    def test_only_public_metadata_is_published(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'pool/location.json'
            m.publish(path,{'ip':'8.8.8.8','source':'bitcoin-node'})
            self.assertEqual(json.loads(path.read_text()),{'ip':'8.8.8.8','source':'bitcoin-node'})
            m.publish(path,None)
            self.assertIsNone(json.loads(path.read_text()))
            self.assertEqual(list(path.parent.glob('.location-*')),[])

    def test_sv2_metadata_extracts_latest_public_key_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / 'ckpool.log'
            key1 = '9auqWEzQGCt2s1Y8V7uV7K3t9xN4qP6mR2kL8wX5jH1cB3dE7fG'
            key2 = '9bvqWEzQGCt2s1Y8V7uV7K3t9xN4qP6mR2kL8wX5jH1cB3dE7fH'
            # Pad across chunk boundaries (> 64 KiB) to verify streaming scan.
            log.write_text(
                f'[2026-11-22 10:00:00] SV2 authority URL path (stratum2+tcp://<host>:<port>/{key1}) [new/ephemeral material]\n'
                + ('x' * 70000) + '\n'
                + f'[2026-11-22 10:05:00] SV2 authority URL path (stratum2+tcp://<host>:<port>/{key2})\n'
            )
            cfg = {
                'sv2url': ['0.0.0.0:3336'],
                'sv2jdurl': ['0.0.0.0:3337'],
                'sv2_authority_key': '/sv2/sv2_authority.key',
                'sv2_static_key': '/sv2/sv2_static.key',
            }
            info = m.resolve_sv2(cfg, log)
            self.assertEqual(info['enabled'], True)
            self.assertEqual(info['jdEnabled'], True)
            self.assertEqual(info['authorityPubkey'], key2)
            self.assertEqual(info['ephemeralKeys'], False)
            # Missing persistent key paths flags ephemeralKeys=True.
            self.assertEqual(m.resolve_sv2({'sv2url': '0.0.0.0:3336'}, log)['ephemeralKeys'], True)
            # Disabled SV2 publishes disabled metadata without scanning keys.
            disabled = m.resolve_sv2({'btcd': []}, log)
            self.assertEqual(disabled['enabled'], False)
            self.assertIsNone(disabled['authorityPubkey'])

if __name__ == '__main__': unittest.main()
