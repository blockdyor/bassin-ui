#!/usr/bin/env python3
"""Publish a Bitcoin-node-derived location; never discover the caller's public IP."""
import argparse
import base64
from collections import Counter
import http.client
import ipaddress
import json
import math
import os

from pathlib import Path
import secrets
import socket
from contextlib import contextmanager
import time
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

CONFIG = Path('/config/ckpool.conf')
OUTPUT = Path('/www/pool/location.json')

def private_rpc(address):
    ip = ipaddress.ip_address(address)
    if ip.is_loopback:
        return True
    if ip.version == 6:
        return ip in ipaddress.IPv6Network('fc00::/7')
    # RFC 1918 only; is_private also includes documentation and reserved space.
    first, second = ip.packed[:2]
    return first == 10 or (first == 172 and 16 <= second <= 31) or (first, second) == (192, 168)


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
    parsed = urlsplit(url if '://' in url else '//' + url)
    if parsed.scheme not in ('', 'http', 'https') or not parsed.hostname or parsed.username is not None:
        raise ValueError('Invalid node URL')
    host, port = parsed.hostname, parsed.port
    if parsed.scheme == 'https':
        connection = http.client.HTTPSConnection(host, port, timeout=10)
    else:
        # Umbrel's Bitcoin RPC has no TLS. Pin a private address, not a DNS name.
        addresses = socket.getaddrinfo(host, port or 80, type=socket.SOCK_STREAM)
        host = next((addr[4][0] for addr in addresses if private_rpc(addr[4][0])), None)
        if host is None:
            raise ValueError('Non-private node RPC requires HTTPS')
        connection = http.client.HTTPConnection(host, port, timeout=10)
    token = base64.b64encode((node['auth'] + ':' + node['pass']).encode()).decode()
    body = json.dumps({'jsonrpc':'1.0','id':'bassin-location','method':method,'params':[]})
    try:
        target = (parsed.path or '/') + ('?' + parsed.query if parsed.query else '')
        connection.request('POST', target,
                           body, {'Host':parsed.netloc, 'Content-Type':'application/json', 'Authorization':'Basic ' + token})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError('Node RPC failed')
        data = json.loads(response.read(1_000_000))
    finally:
        connection.close()
    if data.get('error'):
        raise ValueError('Node RPC failed')
    return data['result']


def lookup(ip):
    # An explicit, node-reported IP is mandatory. Never call the provider's self-IP endpoint.
    if not public_ip(ip):
        return None
    url = 'https://ipwho.is/' + quote(ip, safe=':') + '?fields=ip,success,latitude,longitude'
    with urlopen(Request(url, headers={'User-Agent':'Bassin-location/2.1.9'}), timeout=10) as response:
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


@contextmanager
def parent_directory(path):
    directory = os.open(path.parent, os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        yield directory
    finally:
        os.close(directory)


def read_json(path):
    with parent_directory(path) as directory:
        with os.fdopen(os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)) as file:
            return json.load(file)


def publish(path, value):
    path.parent.mkdir(exist_ok=True)
    with parent_directory(path) as directory:
        temporary = '.location-' + secrets.token_hex(16)
        # Public metadata is served by a separate reader; respect deployment umask.
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644, dir_fd=directory)
        try:
            with os.fdopen(fd, 'w') as file:
                json.dump(value, file, allow_nan=False)
            os.replace(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory)
        except BaseException:
            os.unlink(temporary, dir_fd=directory)
            raise


def deployment_file(value, default):
    if value == str(default):
        return default
    for candidate in default.parent.glob('*' + default.suffix):
        if str(candidate) == value and not candidate.is_symlink() and candidate.is_file():
            return candidate
    raise argparse.ArgumentTypeError(f'expected an existing {default.suffix} file in {default.parent}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=lambda value: deployment_file(value, CONFIG), default=CONFIG)
    parser.add_argument('--output', type=lambda value: deployment_file(value, OUTPUT), default=OUTPUT)
    parser.add_argument('--interval', type=int, default=900)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    while True:
        try:
            config = read_json(args.config)
            if not isinstance(config, dict):
                raise ValueError('Invalid configuration')
            try:
                previous = read_json(args.output)
            except (OSError, ValueError):
                previous = None
            location = resolve(config, previous)
        except (OSError, ValueError):
            location = None
        publish(args.output, location)
        if args.once:
            return
        time.sleep(max(60, args.interval))


if __name__ == '__main__':
    main()
