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

    def test_explicit_ip_lookup_and_response_identity(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,limit): return json.dumps({'success':True,'ip':'8.8.8.8','latitude':1,'longitude':2}).encode()
        with patch.object(m,'urlopen',return_value=Response()) as request:
            location=m.lookup('8.8.8.8')
            self.assertEqual(location['source'],'bitcoin-node')
            self.assertTrue(request.call_args.args[0].full_url.startswith('https://ipwho.is/8.8.8.8?'))
            self.assertIsNone(m.lookup('1.1.1.1'))
            request.reset_mock()
            self.assertIsNone(m.lookup('127.0.0.1'))
            request.assert_not_called()

    def test_cli_rejects_non_deployment_paths(self):
        import subprocess
        import sys
        for option in ('--config', '--output'):
            with self.subTest(option=option), tempfile.TemporaryDirectory() as directory:
                result = subprocess.run([sys.executable, m.__file__, option, directory, '--help'],
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)
                self.assertIn(option, result.stderr)

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

if __name__ == '__main__': unittest.main()
