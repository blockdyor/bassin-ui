#!/usr/bin/env python3
"""Publish a Bitcoin-node-derived location using offline local GeoIP; never contact external geolocation APIs."""
import argparse
import base64
from collections import Counter
import http.client
import ipaddress
import json
import math
import os
import re

from pathlib import Path
import secrets
import socket
import struct
from contextlib import contextmanager
import time
from urllib.parse import urlsplit

CONFIG = Path('/config/ckpool.conf')
OUTPUT = Path('/www/pool/location.json')
GEOIP_DB = Path(os.environ.get('BASSIN_GEOIP_DB', '/opt/bassin/geoip.bin'))
BGEO_MAGIC = b'BGEO'
BGEO_VERSION = 1
BGEO_HEADER = struct.Struct('>4sIII')
BGEO_V4 = struct.Struct('>IIhh')
BGEO_V6 = struct.Struct('>16s16shh')
SV2_PUBKEY_RE = re.compile(
    r'SV2 authority URL path \(stratum2\+tcp://<host>:<port>/([1-9A-HJ-NP-Za-km-z]{32,80})\)(\s+\[new/ephemeral material\])?'
)

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


def _bgeo_search(file, base_offset, count, rec_struct, key_bytes):
    lo, hi = 0, count - 1
    size = rec_struct.size
    key_len = len(key_bytes)
    while lo <= hi:
        mid = (lo + hi) // 2
        file.seek(base_offset + mid * size)
        raw = file.read(size)
        if len(raw) != size:
            return None
        start = raw[:key_len]
        end = raw[key_len:key_len * 2]
        if key_bytes < start:
            hi = mid - 1
        elif key_bytes > end:
            lo = mid + 1
        else:
            lat_e2, lon_e2 = struct.unpack('>hh', raw[key_len * 2:])
            lat, lon = lat_e2 / 100.0, lon_e2 / 100.0
            if abs(lat) > 90 or abs(lon) > 180:
                return None
            return lat, lon
    return None


def _lookup_bgeo(db_path, ip_obj):
    with db_path.open('rb') as file:
        header = file.read(BGEO_HEADER.size)
        if len(header) != BGEO_HEADER.size:
            return None
        magic, version, v4_count, v6_count = BGEO_HEADER.unpack(header)
        if magic != BGEO_MAGIC or version != BGEO_VERSION:
            return None
        v4_offset = BGEO_HEADER.size
        if ip_obj.version == 4:
            if v4_count == 0:
                return None
            return _bgeo_search(file, v4_offset, v4_count, BGEO_V4, ip_obj.packed)
        if v6_count == 0:
            return None
        v6_offset = v4_offset + v4_count * BGEO_V4.size
        return _bgeo_search(file, v6_offset, v6_count, BGEO_V6, ip_obj.packed)


def lookup(ip, db_path=None):
    """Resolve a node-reported public IP to approximate coordinates using the local BGEO table."""
    normalized = public_ip(ip)
    if not normalized:
        return None
    target = Path(db_path) if db_path is not None else GEOIP_DB
    if not target.is_file():
        return None
    try:
        coords = _lookup_bgeo(target, ipaddress.ip_address(normalized))
    except (OSError, ValueError, struct.error):
        return None
    if coords is None:
        return None
    lat, lon = coords
    return {
        'source': 'bitcoin-node',
        'ip': normalized,
        'latitude': lat,
        'longitude': lon,
        'updatedAt': int(time.time() * 1000),
    }


def resolve(config, previous=None, rpc_call=rpc, geolocate=lookup):
    for node in config.get('btcd', []):
        try:
            info = rpc_call(node, 'getnetworkinfo')
            ip = node_ip(info)
            if not ip:
                ip = node_ip(info, rpc_call(node, 'getpeerinfo'))
            if not ip:
                continue
            updated_at = previous.get('updatedAt') if isinstance(previous, dict) else None
            if (isinstance(previous, dict) and previous.get('source') == 'bitcoin-node'
                    and previous.get('ip') == ip
                    and isinstance(updated_at, (int, float)) and not isinstance(updated_at, bool)
                    and math.isfinite(updated_at)
                    and 0 <= time.time()*1000 - updated_at < 6*3600000):
                return previous
            return geolocate(ip)
        except Exception:
            # Try configured failover nodes, without logging their credentials or RPC responses.
            continue
    return None


@contextmanager
def parent_directory(path, create=False):
    # Walk from a known descriptor; never follow links in intermediate directories.
    flags = os.O_DIRECTORY | os.O_NOFOLLOW
    directory = os.open('/' if path.is_absolute() else '.', flags)
    try:
        for part in path.parent.parts:
            if part == path.anchor:
                continue
            name = local_name(part)
            if create:
                try:
                    os.mkdir(name, dir_fd=directory)
                except FileExistsError:
                    pass
            child = os.open(name, flags, dir_fd=directory)
            os.close(directory)
            directory = child
        yield directory
    finally:
        os.close(directory)


def local_name(part):
    if part in ('.', '..') or not re.fullmatch(r'[^/\x00-\x1f]+', part):
        raise ValueError('Expected a local filename component')
    return part


def read_json(path):
    with parent_directory(path) as directory:
        with os.fdopen(os.open(local_name(os.path.basename(path)), os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)) as file:
            return json.load(file)


def publish(path, value):
    name = local_name(os.path.basename(path))
    with parent_directory(path, create=True) as directory:
        temporary = '.location-' + secrets.token_hex(16)
        # Public metadata is served by a separate reader; respect deployment umask.
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644, dir_fd=directory)
        try:
            with os.fdopen(fd, 'w') as file:
                json.dump(value, file, allow_nan=False)
            os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
        except BaseException:
            os.unlink(temporary, dir_fd=directory)
            raise


def normalize_urls(value):
    if isinstance(value, str):
        cleaned = value.strip()
        return [cleaned] if cleaned else []
    if isinstance(value, list):
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return []


def extract_sv2_pubkey(log_path):
    """Scan the public CKPool log in bounded chunks for the latest SV2 authority pubkey."""
    pubkey = None
    ephemeral = False
    try:
        with parent_directory(log_path) as directory:
            fd = os.open(local_name(os.path.basename(log_path)), os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
            with os.fdopen(fd, 'rb') as file:
                tail = ''
                while True:
                    chunk = file.read(65536)
                    if not chunk:
                        break
                    text = tail + chunk.decode('utf-8', errors='ignore')
                    for match in SV2_PUBKEY_RE.finditer(text):
                        pubkey = match.group(1)
                        ephemeral = bool(match.group(2))
                    tail = text[-256:]
    except (OSError, ValueError):
        return None, False
    return pubkey, ephemeral


def resolve_sv2(config, log_path):
    """Publish only public Stratum V2 endpoint metadata; never read or expose private keys."""
    if not isinstance(config, dict):
        return {'enabled': False, 'jdEnabled': False, 'sv2Urls': [], 'sv2JdUrls': [], 'authorityPubkey': None, 'ephemeralKeys': False}
    sv2_urls = normalize_urls(config.get('sv2url'))
    sv2_jd_urls = normalize_urls(config.get('sv2jdurl'))
    enabled = bool(sv2_urls or sv2_jd_urls)
    jd_enabled = bool(sv2_jd_urls)
    if not enabled:
        return {'enabled': False, 'jdEnabled': False, 'sv2Urls': [], 'sv2JdUrls': [], 'authorityPubkey': None, 'ephemeralKeys': False}
    pubkey, log_ephemeral = extract_sv2_pubkey(log_path)
    missing_key_paths = not (
        isinstance(config.get('sv2_authority_key'), str) and config.get('sv2_authority_key').strip()
        and isinstance(config.get('sv2_static_key'), str) and config.get('sv2_static_key').strip()
    )
    return {
        'enabled': True,
        'jdEnabled': jd_enabled,
        'sv2Urls': sv2_urls,
        'sv2JdUrls': sv2_jd_urls,
        'authorityPubkey': pubkey,
        'ephemeralKeys': missing_key_paths or log_ephemeral,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=CONFIG)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--sv2-output', type=Path, default=None)
    parser.add_argument('--log', type=Path, default=None)
    parser.add_argument('--geoip-db', type=Path, default=GEOIP_DB)
    parser.add_argument('--interval', type=int, default=900)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    # Only local operator arguments select files; RPC and geolocation data never do.
    config_file, output = args.config, args.output
    sv2_output = args.sv2_output or output.with_name('sv2.json')
    log_file = args.log or (output.parent.parent / 'ckpool.log')
    def geolocate(ip):
        return lookup(ip, db_path=args.geoip_db)
    while True:
        config = None
        try:
            config = read_json(config_file)
            if not isinstance(config, dict):
                raise ValueError('Invalid configuration')
            try:
                previous = read_json(output)
            except (OSError, ValueError):
                previous = None
            location = resolve(config, previous, geolocate=geolocate)
        except (OSError, ValueError):
            location = None
        publish(output, location)
        sv2 = resolve_sv2(config, log_file)
        publish(sv2_output, sv2)
        if args.once:
            return
        # On startup CKPool may log its SV2 authority pubkey a few seconds after UI boot.
        remaining = max(60, args.interval)
        if sv2['enabled'] and not sv2['authorityPubkey']:
            for delay in (5, 10, 15):
                time.sleep(delay)
                remaining -= delay
                sv2 = resolve_sv2(config, log_file)
                publish(sv2_output, sv2)
                if sv2['authorityPubkey']:
                    break
        if remaining > 0:
            time.sleep(remaining)


if __name__ == '__main__':
    main()
