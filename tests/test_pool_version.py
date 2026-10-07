import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

START = Path(__file__).parents[1] / 'deploy/ckpool-start.sh'

class PoolVersionTest(unittest.TestCase):
    def test_compiled_version_and_process_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary, output, args = root/'pool', root/'www/pool/version.json', root/'args'
            env = {**os.environ, 'CKPOOL_BINARY':str(binary), 'CKPOOL_VERSION_FILE':str(output), 'CAPTURE_ARGS':str(args)}
            for embedded, expected in [('ckpool/1.2.0', '1.2.0'), ('ckpool/9.8.7-rc.1', '9.8.7-rc.1'), ('unavailable', None)]:
                # NUL-delimited compiled identifier after an executable test stub.
                binary.write_bytes(b'#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE_ARGS"\nexit 0\n\x00' + embedded.encode() + b'\x00')
                binary.chmod(0o755)
                subprocess.run(['sh',str(START),'-k','-B','-c','/config/ckpool.conf'],env=env,check=True)
                value = json.loads(output.read_text())
                self.assertEqual(value, {'software':'ckpool','version':expected} if expected else None)
                self.assertEqual(args.read_text().splitlines(), ['-k','-B','-c','/config/ckpool.conf'])
                self.assertEqual(output.stat().st_mode & 0o777, 0o644)
                self.assertEqual(list(output.parent.glob('version.json.*')), [])
            # A broken metadata path does not stop the mining process.
            env['CKPOOL_VERSION_FILE'] = str(binary/'impossible.json')
            subprocess.run(['sh',str(START),'--test'],env=env,check=True,capture_output=True)
            self.assertEqual(args.read_text().strip(), '--test')

if __name__ == '__main__': unittest.main()
