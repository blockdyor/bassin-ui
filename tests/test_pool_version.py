import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import threading
import time
import unittest

START = Path(__file__).parents[1] / 'deploy/ckpool-start.sh'


class PoolVersionTest(unittest.TestCase):
    def test_compiled_version_and_process_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary, output, args = root / 'pool', root / 'www/pool/version.json', root / 'args'
            env = {**os.environ, 'CKPOOL_BINARY': str(binary), 'CKPOOL_VERSION_FILE': str(output), 'CAPTURE_ARGS': str(args)}
            for embedded, expected in [('ckpool/1.2.0', '1.2.0'), ('ckpool/9.8.7-rc.1', '9.8.7-rc.1'), ('unavailable', None)]:
                binary.write_bytes(b'#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE_ARGS"\nexit 0\n\x00' + embedded.encode() + b'\x00')
                binary.chmod(0o755)
                subprocess.run(['sh', str(START), '-k', '-B', '-c', '/config/ckpool.conf'], env=env, check=True)
                value = json.loads(output.read_text())
                self.assertEqual(value, {'software': 'ckpool', 'version': expected} if expected else None)
                self.assertEqual(args.read_text().splitlines(), ['-k', '-B', '-c', '/config/ckpool.conf'])
                self.assertEqual(output.stat().st_mode & 0o777, 0o644)
                self.assertEqual(list(output.parent.glob('version.json.*')), [])
            env['CKPOOL_VERSION_FILE'] = str(binary / 'impossible.json')
            subprocess.run(['sh', str(START), '--test'], env=env, check=True, capture_output=True)
            self.assertEqual(args.read_text().strip(), '--test')

    def test_reloads_only_on_explicit_trigger_and_waits_for_ipc_when_enabled(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / 'pool'
            output = root / 'www/pool/version.json'
            config = root / 'ckpool.conf'
            trigger = root / '.reload-trigger'
            ipc_sock = root / 'node.sock'
            starts = root / 'starts.log'
            config.write_text('{"mindiff": 1}\n', encoding='utf-8')
            binary.write_bytes(
                b'#!/bin/sh\n'
                b'sock_present=0\n'
                b'[ -S "$TEST_IPC_SOCK" ] && sock_present=1\n'
                b'echo "start $$ sock=$sock_present" >> "$STARTS_LOG"\n'
                b'trap "echo term $$ >> \\"$STARTS_LOG\\"; exit 0" TERM INT\n'
                b'while true; do sleep 0.2; done\n'
                b'\x00ckpool/1.2.0\x00'
            )
            binary.chmod(0o755)

            # Create the Unix socket ~1s after startup to verify bounded IPC wait works.
            sock_holder = []
            def create_socket_later():
                time.sleep(0.8)
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.bind(str(ipc_sock))
                sock_holder.append(s)
            t = threading.Thread(target=create_socket_later, daemon=True)
            t.start()

            env = {
                **os.environ,
                'CKPOOL_BINARY': str(binary),
                'CKPOOL_VERSION_FILE': str(output),
                'CKPOOL_RELOAD_INTERVAL': '1',
                'CKPOOL_IPC_WAIT_SECONDS': '5',
                'CKPOOL_IPC_SOCKET': str(ipc_sock),
                'APP_BITCOIN_IPC_ENABLED': 'true',
                'TEST_IPC_SOCK': str(ipc_sock),
                'STARTS_LOG': str(starts),
            }
            proc = subprocess.Popen(['sh', str(START), '-k', '-B', '-c', str(config)], env=env)
            try:
                deadline = time.time() + 6
                while time.time() < deadline and (not starts.exists() or len(starts.read_text().splitlines()) < 1):
                    time.sleep(0.1)
                first_lines = starts.read_text().splitlines()
                self.assertEqual(len(first_lines), 1)
                self.assertIn('sock=1', first_lines[0])

                # Editing ckpool.conf alone must NOT restart CKPool!
                config.write_text('{"mindiff": 2}\n', encoding='utf-8')
                time.sleep(2.2)
                self.assertEqual(len(starts.read_text().splitlines()), 1)

                # Writing explicit .reload-trigger DOES restart CKPool cleanly.
                trigger.write_text('1000-abc\n', encoding='utf-8')
                deadline = time.time() + 6
                while time.time() < deadline:
                    lines = starts.read_text().splitlines()
                    if sum(1 for l in lines if l.startswith('start ')) >= 2:
                        break
                    time.sleep(0.1)
                lines = starts.read_text().splitlines()
                self.assertGreaterEqual(sum(1 for l in lines if l.startswith('start ')), 2, lines)
                self.assertGreaterEqual(sum(1 for l in lines if l.startswith('term ')), 1, lines)

                t0 = time.time()
                proc.send_signal(signal.SIGTERM)
                self.assertEqual(proc.wait(timeout=5), 0)
                self.assertLess(time.time() - t0, 3.0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()
                for s in sock_holder:
                    s.close()


if __name__ == '__main__':
    unittest.main()
