import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]

class ProbeCLI(unittest.TestCase):
    def probe(self, database, redis):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp)/'gcloud'
            fake.write_text('''#!/usr/bin/env python3
import os, sys
name = next(a.split('=', 1)[1] for a in sys.argv if a.startswith('--secret='))
print(os.environ['DB'] if name.endswith('DB_URL') else os.environ['REDIS'] if name.endswith('REDIS_URL') else 'SECRET_MARKER')
''')
            fake.chmod(0o755)
            return subprocess.run([sys.executable, str(ROOT/'scripts/probe-secrets.py'), '--project', 'fixture'],
                env={**os.environ,'PATH':tmp+os.pathsep+os.environ['PATH'],'DB':database,'REDIS':redis},capture_output=True,text=True)

    def test_rejects_insecure_url_without_leaking_query_credentials(self):
        r=self.probe('postgres://user:SECRET_MARKER@db.example/book?sslmode=verify-full',
                     'redis://user:SECRET_MARKER@cache.example:6379?token=SECRET_MARKER')
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn('SECRET_MARKER',r.stdout+r.stderr)

    def test_accepts_external_tls_endpoints_and_encoded_credentials(self):
        r=self.probe('postgres://user:p%40ss@db.example/book?sslmode=verify-full',
                     'rediss://:p%40ss@cache.example:6379/0')
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertNotIn('p%40ss',r.stdout+r.stderr)

if __name__ == '__main__': unittest.main()
