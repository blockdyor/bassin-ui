#!/usr/bin/env python3
"""Serve Bassin UI, pool data, and live ckpool.conf API; publish location & SV2 metadata."""
import argparse
import html
import importlib.util
import ipaddress
import json
import math
import mimetypes
import os
import re
import secrets
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

spec = importlib.util.spec_from_file_location('pool_location', Path(__file__).with_name('pool-location.py'))
pool_location = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pool_location)

MAX_CONFIG_BYTES = 1024 * 1024
HOST_PORT_RE = re.compile(r'^(\[[^\]]+\]|[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.?):(\d+)$')
HOST_ONLY_RE = re.compile(r'^(\[[^\]]+\]|[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.?)$')
HEX_MASK_RE = re.compile(r'^[0-9a-fA-F]{1,8}$')
CONTROL_RE = re.compile(r'[\x00-\x1f]')
RANGE_SUFFIX_RE = re.compile(r'^bytes=-(\d+)$')
RANGE_SPAN_RE = re.compile(r'^bytes=(\d+)-(\d*)$')

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('font/woff2', '.woff2')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('application/geo+json', '.geojson')
mimetypes.add_type('application/manifest+json', '.webmanifest')


def is_safe_int(value):
    return type(value) is int


def valid_host_port(value, allow_http_scheme=False, allow_optional_port=False):
    if not isinstance(value, str):
        return False
    target = re.sub(r'^https?://', '', value, flags=re.IGNORECASE) if allow_http_scheme else value
    match = HOST_PORT_RE.fullmatch(target)
    if match:
        host, port = match.group(1), int(match.group(2))
        if port < 1 or port > 65535:
            return False
        return valid_host(host)
    if allow_optional_port:
        match = HOST_ONLY_RE.fullmatch(target)
        if match:
            return valid_host(match.group(1))
    return False


def valid_host(host):
    if host.startswith('[') and host.endswith(']'):
        try:
            ipaddress.IPv6Address(host[1:-1])
            return True
        except ValueError:
            return False
    # Reject malformed numeric IPv4 like 999.1.1.1
    if re.fullmatch(r'[\d.]+', host):
        try:
            ipaddress.IPv4Address(host)
            return True
        except ValueError:
            return False
    return True


def valid_path(value):
    return isinstance(value, str) and bool(value.strip()) and not CONTROL_RE.search(value)


def valid_zmq(value):
    if value is None:
        return True
    if not isinstance(value, str) or not value.startswith('tcp://'):
        return False
    rest = value[6:]
    match = HOST_PORT_RE.fullmatch(rest)
    if not match:
        return False
    host, port = match.group(1), int(match.group(2))
    if port < 1 or port > 65535 or not valid_host(host):
        return False
    if host in ('0.0.0.0', '[::]'):
        return False
    return True


def valid_url_field(value, allow_optional_port=False):
    if isinstance(value, str):
        return valid_host_port(value, False, allow_optional_port)
    if isinstance(value, list) and len(value) > 0:
        return all(valid_host_port(item, False, allow_optional_port) for item in value)
    return False


def validate_config(config):
    if not isinstance(config, dict):
        return ['Configuration must be a JSON object.']
    errors = []
    positive = ('mindiff', 'startdiff', 'blockpoll', 'update_interval')
    non_negative = ('maxdiff', 'highdiff', 'maxclients', 'maxusers', 'maxsendqueue', 'dropidle')
    for key in positive:
        if key in config and (not is_safe_int(config[key]) or config[key] < 1):
            errors.append(f'{key} must be a whole number greater than zero.')
    for key in non_negative:
        if key in config and (not is_safe_int(config[key]) or config[key] < 0):
            errors.append(f'{key} must be a whole number of zero or more.')
    if 'maxsubclients' in config and (not is_safe_int(config['maxsubclients']) or config['maxsubclients'] < -1):
        errors.append('maxsubclients must be a whole number of -1 (unlimited) or more.')
    for key in ('nonce1length', 'nonce2length'):
        if key in config and (not is_safe_int(config[key]) or config[key] < 2 or config[key] > 8):
            errors.append(f'{key} must be a whole number between 2 and 8.')
    if 'donation' in config:
        val = config['donation']
        if type(val) not in (int, float) or not math.isfinite(val) or val < 0 or (0 < val < 0.1) or val > 99.9:
            errors.append('Donation must be 0 (disabled) or between 0.1 and 99.9 percent.')
    if 'version_mask' in config and (not isinstance(config['version_mask'], str) or not HEX_MASK_RE.fullmatch(config['version_mask'])):
        errors.append('Version mask must be a 1 to 8 character hexadecimal value.')
    if 'reconnect' in config and not isinstance(config['reconnect'], bool):
        errors.append('reconnect must be true or false.')
    min_d = config['mindiff'] if is_safe_int(config.get('mindiff')) else 1
    start_d = config['startdiff'] if is_safe_int(config.get('startdiff')) else 10000
    max_d = config['maxdiff'] if is_safe_int(config.get('maxdiff')) else 0
    if start_d < min_d:
        errors.append('Starting difficulty cannot be below minimum difficulty.')
    if max_d > 0 and (max_d < min_d or max_d < start_d):
        errors.append('Maximum difficulty must be zero (unlimited) or at least the minimum and starting difficulty.')
    if 'btcsig' in config and (not isinstance(config['btcsig'], str) or len(config['btcsig'].encode('utf-8')) > 38):
        errors.append('Coinbase signature must be text of at most 38 bytes.')
    if 'logdir' in config and not valid_path(config['logdir']):
        errors.append('Log directory must be a nonempty path.')
    if 'ipcmining' in config and not valid_path(config['ipcmining']):
        errors.append('Mining IPC socket must be a nonempty path.')
    if 'zmqblock' in config and not valid_zmq(config['zmqblock']):
        errors.append('ZMQ endpoint must be tcp://host:port (not a wildcard bind address).')
    if 'serverurl' in config and not valid_url_field(config['serverurl'], False):
        errors.append('Stratum listeners must be host:port strings.')
    if 'sv2url' in config and not valid_url_field(config['sv2url'], True):
        errors.append('Stratum V2 listeners must be host or host:port strings.')
    if 'sv2jdurl' in config and not valid_url_field(config['sv2jdurl'], True):
        errors.append('Stratum V2 Job Declaration listeners must be host or host:port strings.')
    if 'sv2_authority_key' in config and not valid_path(config['sv2_authority_key']):
        errors.append('SV2 authority key path must be a nonempty path.')
    if 'sv2_static_key' in config and not valid_path(config['sv2_static_key']):
        errors.append('SV2 static key path must be a nonempty path.')
    btcd = config.get('btcd')
    if not isinstance(btcd, list) or len(btcd) == 0:
        errors.append('Add at least one Bitcoin RPC node.')
    else:
        for i, node in enumerate(btcd):
            if (not isinstance(node, dict) or not valid_host_port(node.get('url'), True)
                    or not isinstance(node.get('auth'), str) or not node['auth'].strip()
                    or not isinstance(node.get('pass'), str) or not node['pass']):
                errors.append(f'Bitcoin node {i + 1} needs a host:port, RPC username, and RPC password.')
            if isinstance(node, dict) and 'notify' in node and not isinstance(node['notify'], bool):
                errors.append(f'Bitcoin node {i + 1}: notify must be true or false.')
    return errors


def mask_config(config):
    """Return a copy of ckpool.conf with RPC passwords omitted and a boolean mask list."""
    masked = dict(config)
    passwords_set = []
    if isinstance(config.get('btcd'), list):
        nodes = []
        for node in config['btcd']:
            if isinstance(node, dict):
                has_pass = isinstance(node.get('pass'), str) and len(node['pass']) > 0
                passwords_set.append(has_pass)
                copy = {k: v for k, v in node.items() if k != 'pass'}
                nodes.append(copy)
            else:
                passwords_set.append(False)
                nodes.append(node)
        masked['btcd'] = nodes
    return masked, passwords_set


def merge_passwords(incoming, existing):
    """Preserve existing on-disk RPC passwords when the client leaves pass blank/omitted."""
    merged = dict(incoming)
    in_nodes = incoming.get('btcd')
    old_nodes = existing.get('btcd') if isinstance(existing, dict) else None
    if isinstance(in_nodes, list) and isinstance(old_nodes, list):
        nodes = []
        for i, node in enumerate(in_nodes):
            if isinstance(node, dict):
                copy = dict(node)
                if not copy.get('pass') and i < len(old_nodes) and isinstance(old_nodes[i], dict):
                    old_pass = old_nodes[i].get('pass')
                    if isinstance(old_pass, str) and old_pass:
                        copy['pass'] = old_pass
                nodes.append(copy)
            else:
                nodes.append(node)
        merged['btcd'] = nodes
    return merged


def write_config_atomic(path, config):
    name = pool_location.local_name(os.path.basename(path))
    with pool_location.parent_directory(path, create=True) as directory:
        temporary = '.ckpool.conf.' + secrets.token_hex(12)
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600, dir_fd=directory)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as file:
                json.dump(config, file, indent=2, allow_nan=False)
                file.write('\n')
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
        except BaseException:
            try:
                os.unlink(temporary, dir_fd=directory)
            except OSError:
                pass
            raise


def safe_resolve(root, rel_path):
    """Resolve a URL path under root without following symlinks or allowing traversal."""
    root_resolved = root.resolve()
    parts = [p for p in unquote(rel_path).split('/') if p]
    current = root_resolved
    for part in parts:
        if part in ('.', '..') or '/' in part or '\\' in part or '\x00' in part:
            return None
        candidate = current / part
        if candidate.is_symlink():
            return None
        current = candidate
    try:
        current.relative_to(root_resolved)
    except ValueError:
        return None
    return current


class AppState:
    def __init__(self, ui_dir, www_dir, config_file, interval):
        self.ui_dir = Path(ui_dir)
        self.www_dir = Path(www_dir)
        self.config_file = Path(config_file)
        self.location_output = self.www_dir / 'pool/location.json'
        self.sv2_output = self.www_dir / 'pool/sv2.json'
        self.log_file = self.www_dir / 'ckpool.log'
        self.interval = max(60, interval)
        self.config_lock = threading.Lock()
        self.refresh_event = threading.Event()
        self.stop_event = threading.Event()

    def refresh_sv2(self):
        try:
            config = pool_location.read_json(self.config_file)
        except (OSError, ValueError):
            config = None
        sv2 = pool_location.resolve_sv2(config, self.log_file)
        try:
            pool_location.publish(self.sv2_output, sv2)
        except OSError:
            pass
        return sv2

    def refresh_all(self):
        config = None
        try:
            config = pool_location.read_json(self.config_file)
            if not isinstance(config, dict):
                raise ValueError('Invalid configuration')
        except (OSError, ValueError):
            config = None
        sv2 = pool_location.resolve_sv2(config, self.log_file)
        try:
            pool_location.publish(self.sv2_output, sv2)
        except OSError:
            pass
        location = None
        if config is not None:
            try:
                previous = pool_location.read_json(self.location_output)
            except (OSError, ValueError):
                previous = None
            try:
                location = pool_location.resolve(config, previous)
            except (OSError, ValueError):
                location = None
        try:
            pool_location.publish(self.location_output, location)
        except OSError:
            pass
        return sv2

    def background_loop(self):
        while not self.stop_event.is_set():
            sv2 = self.refresh_all()
            # Re-scan quickly after startup or config save so new SV2 pubkeys appear promptly.
            if sv2['enabled'] and not sv2['authorityPubkey']:
                for delay in (3, 5, 10):
                    if self.stop_event.wait(delay):
                        return
                    sv2 = self.refresh_sv2()
                    if sv2['authorityPubkey']:
                        break
            if self.refresh_event.wait(self.interval):
                self.refresh_event.clear()
                # Wait briefly for CKPool supervisor to reload and log any new SV2 authority pubkey.
                for delay in (2, 4, 6):
                    if self.stop_event.wait(delay):
                        return
                    self.refresh_sv2()


def make_handler(state):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, format, *args):
            return

        def send_json(self, status, payload, close=False):
            body = json.dumps(payload, allow_nan=False).encode('utf-8')
            if close:
                self.close_connection = True
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            if close:
                self.send_header('Connection', 'close')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def send_error_text(self, status, message):
            body = message.encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/api/config':
                self.handle_get_config()
                return
            if path == '/users' or path == '/users/':
                self.handle_users_index()
                return
            if path == '/ckpool.log' or path.startswith('/pool/') or path.startswith('/users/'):
                self.serve_file(state.www_dir, path.lstrip('/'), no_store=True)
                return
            rel = 'index.html' if path in ('', '/') else path.lstrip('/')
            self.serve_file(state.ui_dir, rel, no_store=(rel == 'index.html'))

        def do_PUT(self):
            self.handle_save_config()

        def do_POST(self):
            self.handle_save_config()

        def handle_get_config(self):
            with state.config_lock:
                try:
                    config = pool_location.read_json(state.config_file)
                    if not isinstance(config, dict):
                        raise ValueError('Invalid configuration')
                except (OSError, ValueError):
                    self.send_json(HTTPStatus.NOT_FOUND, {'error': 'Configuration file not found.'})
                    return
                masked, passwords_set = mask_config(config)
                self.send_json(HTTPStatus.OK, {'live': True, 'config': masked, 'passwordsSet': passwords_set})

        def handle_save_config(self):
            path = urlsplit(self.path).path
            if path != '/api/config':
                self.send_json(HTTPStatus.NOT_FOUND, {'error': 'Not found'}, close=True)
                return
            if self.headers.get('X-Bassin-Config') != '1':
                self.send_json(HTTPStatus.FORBIDDEN, {'error': 'Missing required X-Bassin-Config header.'}, close=True)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Invalid Content-Length'}, close=True)
                return
            if length <= 0 or length > MAX_CONFIG_BYTES:
                self.send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {'error': 'Configuration exceeds 1 MiB.'}, close=True)
                return
            raw = self.rfile.read(length)
            try:
                def reject_constant(token):
                    raise ValueError(f'Invalid JSON constant: {token}')
                incoming = json.loads(raw.decode('utf-8'), parse_constant=reject_constant)
            except (UnicodeDecodeError, ValueError):
                self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Invalid JSON.'})
                return
            if not isinstance(incoming, dict):
                self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Configuration must be a JSON object.'})
                return
            with state.config_lock:
                try:
                    existing = pool_location.read_json(state.config_file)
                except (OSError, ValueError):
                    existing = {}
                merged = merge_passwords(incoming, existing)
                errors = validate_config(merged)
                if errors:
                    self.send_json(HTTPStatus.BAD_REQUEST, {'error': errors[0], 'errors': errors})
                    return
                try:
                    write_config_atomic(state.config_file, merged)
                except OSError:
                    self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {'error': 'Failed to save configuration.'})
                    return
                _, passwords_set = mask_config(merged)
            state.refresh_sv2()
            state.refresh_event.set()
            self.send_json(HTTPStatus.OK, {
                'live': True,
                'passwordsSet': [bool(flag) for flag in passwords_set],
                'savedAt': int(time.time() * 1000),
            })

        def handle_users_index(self):
            users_dir = safe_resolve(state.www_dir, 'users')
            entries = []
            if users_dir and users_dir.is_dir():
                for child in sorted(users_dir.iterdir(), key=lambda p: p.name):
                    if child.is_file() and not child.is_symlink() and not child.name.startswith('.'):
                        escaped = html.escape(child.name, quote=True)
                        entries.append(f'<a href="{escaped}">{escaped}</a>')
            body = ('<pre>\n' + '\n'.join(entries) + '\n</pre>\n').encode('utf-8')
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def serve_file(self, root, rel_path, no_store=False):
            target = safe_resolve(root, rel_path)
            if not target or not target.is_file():
                self.send_error_text(HTTPStatus.NOT_FOUND, 'Not found')
                return
            try:
                fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
            except OSError:
                self.send_error_text(HTTPStatus.NOT_FOUND, 'Not found')
                return
            try:
                stat = os.fstat(fd)
                total = stat.st_size
                ctype = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                if target.name.endswith('.status') or target.name.endswith('.log'):
                    ctype = 'text/plain; charset=utf-8'
                range_header = self.headers.get('Range')
                start, end, status = 0, total - 1, HTTPStatus.OK
                if range_header:
                    suffix = RANGE_SUFFIX_RE.fullmatch(range_header.strip())
                    span = RANGE_SPAN_RE.fullmatch(range_header.strip())
                    if suffix:
                        count = int(suffix.group(1))
                        if total == 0 or count == 0:
                            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                            self.send_header('Content-Range', f'bytes */{total}')
                            self.send_header('Cache-Control', 'no-store')
                            self.send_header('Content-Length', '0')
                            self.end_headers()
                            return
                        start = max(0, total - count)
                        end = total - 1
                        status = HTTPStatus.PARTIAL_CONTENT
                    elif span:
                        start = int(span.group(1))
                        end = int(span.group(2)) if span.group(2) else total - 1
                        if start >= total or end < start:
                            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                            self.send_header('Content-Range', f'bytes */{total}')
                            self.send_header('Cache-Control', 'no-store')
                            self.send_header('Content-Length', '0')
                            self.end_headers()
                            return
                        end = min(end, total - 1)
                        status = HTTPStatus.PARTIAL_CONTENT
                length = 0 if total == 0 else (end - start + 1)
                self.send_response(status)
                self.send_header('Content-Type', ctype)
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Accept-Ranges', 'bytes')
                if status == HTTPStatus.PARTIAL_CONTENT:
                    self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
                self.send_header('Cache-Control', 'no-store' if no_store else 'public, max-age=3600')
                self.send_header('Content-Length', str(length))
                self.end_headers()
                if self.command != 'HEAD' and length > 0:
                    os.lseek(fd, start, os.SEEK_SET)
                    remaining = length
                    while remaining > 0:
                        chunk = os.read(fd, min(65536, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            finally:
                os.close(fd)

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--ui-dir', type=Path, default=Path('/ui'))
    parser.add_argument('--www-dir', type=Path, default=Path('/www'))
    parser.add_argument('--config', type=Path, default=Path('/config/ckpool.conf'))
    parser.add_argument('--interval', type=int, default=900)
    args = parser.parse_args()

    state = AppState(args.ui_dir, args.www_dir, args.config, args.interval)
    state.refresh_sv2()
    worker = threading.Thread(target=state.background_loop, daemon=True)
    worker.start()

    # Internal container HTTP listener behind Umbrel's authenticating app_proxy.
    server = ThreadingHTTPServer((args.host, args.port), make_handler(state))  # NOSONAR
    try:
        server.serve_forever()  # NOSONAR
    except KeyboardInterrupt:
        pass
    finally:
        state.stop_event.set()
        server.server_close()


if __name__ == '__main__':
    main()
