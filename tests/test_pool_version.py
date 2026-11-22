import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
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
                # NUL-delimited compiled identifier after an executable test stub.
                binary.write_bytes(b'#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE_ARGS"\nexit 0\n\x00' + embedded.encode() + b'\x00')
                binary.chmod(0o755)
                subprocess.run(['sh', str(START), '-k', '-B', '-c', '/config/ckpool.conf'], env=env, check=True)
                value = json.loads(output.read_text())
                self.assertEqual(value, {'software': 'ckpool', 'version': expected} if expected else None)
                self.assertEqual(args.read_text().splitlines(), ['-k', '-B', '-c', '/config/ckpool.conf'])
                self.assertEqual(output.stat().st_mode & 0o777, 0o644)
                self.assertEqual(list(output.parent.glob('version.json.*')), [])
            # A broken metadata path does not stop the mining process.
            env['CKPOOL_VERSION_FILE'] = str(binary / 'impossible.json')
            subprocess.run(['sh', str(START), '--test'], env=env, check=True, capture_output=True)
            self.assertEqual(args.read_text().strip(), '--test')

    def test_reloads_on_config_change_and_stops_cleanly_on_sigterm(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / 'pool'
            output = root / 'www/pool/version.json'
            config = root / 'ckpool.conf'
            starts = root / 'starts.log'
            config.write_text('{"mindiff": 1}\n', encoding='utf-8')
            binary.write_bytes(
                b'#!/bin/sh\n'
                b'echo "start $$" >> "$STARTS_LOG"\n'
                b'trap "echo term $$ >> \\"$STARTS_LOG\\"; exit 0" TERM INT\n'
                b'while true; do sleep 0.2; done\n'
                b'\x00ckpool/1.2.0\x00'
            )
            binary.chmod(0o755)
            env = {
                **os.environ,
                'CKPOOL_BINARY': str(binary),
                'CKPOOL_VERSION_FILE': str(output),
                'CKPOOL_RELOAD_INTERVAL': '1',
                'STARTS_LOG': str(starts),
            }
            proc = subprocess.Popen(['sh', str(START), '-k', '-B', '-c', str(config)], env=env)
            try:
                deadline = time.time() + 5
                while time.time() < deadline and (not starts.exists() or len(starts.read_text().splitlines()) < 1):
                    time.sleep(0.1)
                self.assertEqual(len(starts.read_text().splitlines()), 1)

                # Modify config -> supervisor sends SIGTERM to old child and spawns a new child.
                config.write_text('{"mindiff": 2}\n', encoding='utf-8')
                deadline = time.time() + 6
                while time.time() < deadline:
                    lines = starts.read_text().splitlines()
                    if sum(1 for l in lines if l.startswith('start ')) >= 2:
                        break
                    time.sleep(0.1)
                lines = starts.read_text().splitlines()
                self.assertGreaterEqual(sum(1 for l in lines if l.startswith('start ')), 2, lines)
                self.assertGreaterEqual(sum(1 for l in lines if l.startswith('term ')), 1, lines)

                # SIGTERM to supervisor stops child cleanly and exits 0 promptly.
                t0 = time.time()
                proc.send_signal(signal.SIGTERM)
                rc = proc.wait(timeout=5)
                self.assertEqual(rc, 0)
                self.assertLess(time.time() - t0, 3.0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()


if __name__ == '__main__':
    unittest.main()
