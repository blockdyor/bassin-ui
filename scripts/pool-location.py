#!/usr/bin/env python3
"""Publish a Bitcoin-node-derived location; never discover the caller's public IP."""
import argparse
import base64
from collections import Counter
import ipaddress
import json
import math
import os
from pathlib import Path
import tempfile
import time
from urllib.parse import quote, urlsplit
from urllib.request import Request, ProxyHandler, build_opener, urlopen


def public_ip(address):
    if not isinstance(address, str):
        return None
    # getnetworkinfo supplies an IP; getpeerinfo.addrlocal includes the port.
    host = address
    if address.startswith('[') and ']' in address:
        host = address[1:address.index(']')]
    elif address.count(':') == 1 and '.' in address:
        host = address.rsplit(':', 1)[0]
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None
    return str(ip) if ip.is_global and not ip.is_multicast else None


def node_ip(network_info, peers=()):
    addresses = network_info.get('localaddresses', [])
    valid = [(item.get('score', 0), public_ip(item.get('address'))) for item in addresses if isinstance(item, dict)]
    valid = [(score if isinstance(score, (int, float)) else 0, ip) for score, ip in valid if ip]
    if valid:
        return max(valid, key=lambda item: item[0])[1]
    # addrlocal is OUR node's address as seen by its peers. addr is the remote peer: never use it.
    observed = Counter(ip for peer in peers if isinstance(peer, dict) and (ip := public_ip(peer.get('addrlocal'))))
    return observed.most_common(1)[0][0] if observed else None


def rpc(node, method):
    url = node['url']
    if '://' not in url:
        url = 'http://' + url
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Invalid node URL')
    token = base64.b64encode((node['auth'] + ':' + node['pass']).encode()).decode()
    request = Request(url, data=json.dumps({'jsonrpc':'1.0','id':'bassin-location','method':method,'params':[]}).encode(),
                      headers={'Content-Type':'application/json', 'Authorization':'Basic ' + token})
    # Internal RPC credentials must not be sent through an environment-configured HTTP proxy.
    with build_opener(ProxyHandler({})).open(request, timeout=10) as response:
        data = json.loads(response.read(1_000_000))
    if data.get('error'):
        raise ValueError('Node RPC failed')
    return data['result']


def lookup(ip):
    # An explicit, node-reported IP is mandatory. Never call the provider's self-IP endpoint.
    if not public_ip(ip):
        return None
    url = 'https://ipwho.is/' + quote(ip, safe=':') + '?fields=ip,success,latitude,longitude'
    with urlopen(Request(url, headers={'User-Agent':'Bassin-location/2.1.8'}), timeout=10) as response:
        data = json.loads(response.read(65536))
    lat, lon = data.get('latitude'), data.get('longitude')
    if data.get('success') is not True or public_ip(data.get('ip')) != ip:
        return None
    if any(type(value) not in (int, float) or not math.isfinite(value) for value in (lat, lon)):
        return None
    if abs(lat) > 90 or abs(lon) > 180:
        return None
    return {'source':'bitcoin-node','ip':ip,'latitude':lat,'longitude':lon,'updatedAt':int(time.time()*1000)}


def resolve(config, previous=None, rpc_call=rpc, geolocate=lookup):
    for node in config.get('btcd', []):
        try:
            info = rpc_call(node, 'getnetworkinfo')
            ip = node_ip(info)
            if not ip:
                ip = node_ip(info, rpc_call(node, 'getpeerinfo'))
            if not ip:
                continue
            if (isinstance(previous, dict) and previous.get('source') == 'bitcoin-node'
                    and previous.get('ip') == ip and 0 <= time.time()*1000-previous.get('updatedAt', 0) < 6*3600000):
                return previous
            return geolocate(ip)
        except Exception:
            # Try configured failover nodes, without logging their credentials or RPC responses.
            continue
    return None


def publish(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.location-', delete=False) as file:
        temporary = Path(file.name)
        try:
            json.dump(value, file, allow_nan=False)
            file.flush()
            os.fchmod(file.fileno(), 0o644)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='/config/ckpool.conf')
    parser.add_argument('--output', default='/www/pool/location.json')
    parser.add_argument('--interval', type=int, default=900)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    output = Path(args.output)
    while True:
        try:
            config = json.loads(Path(args.config).read_text())
            if not isinstance(config, dict):
                raise ValueError('Invalid configuration')
            try:
                previous = json.loads(output.read_text())
            except (OSError, ValueError):
                previous = None
            location = resolve(config, previous)
        except (OSError, ValueError):
            location = None
        publish(output, location)
        if args.once:
            return
        time.sleep(max(60, args.interval))


if __name__ == '__main__':
    main()
