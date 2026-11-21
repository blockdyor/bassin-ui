from pathlib import Path
import unittest


class UiImageTest(unittest.TestCase):
    def test_effective_user_matches_umbrel(self):
        dockerfile = (Path(__file__).parents[1] / 'Dockerfile').read_text()
        users = [line.split()[1] for line in dockerfile.splitlines() if line.startswith('USER ')]
        self.assertEqual(users[-1:], ['1000:1000'])
