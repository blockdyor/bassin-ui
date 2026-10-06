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

    def test_only_public_metadata_is_published(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'pool/location.json'
            m.publish(path,{'ip':'8.8.8.8','source':'bitcoin-node'})
            self.assertEqual(json.loads(path.read_text()),{'ip':'8.8.8.8','source':'bitcoin-node'})
            m.publish(path,None)
            self.assertIsNone(json.loads(path.read_text()))
            self.assertEqual(list(path.parent.glob('.location-*')),[])

if __name__ == '__main__': unittest.main()
