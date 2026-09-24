import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]

class DeployCLI(unittest.TestCase):
    def test_build_then_deploy_without_secret_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / 'gcloud'
            fake.write_text('#!/usr/bin/env python3\nimport json, os, sys\nwith open(os.environ["CALLS"], "a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n')
            fake.chmod(0o755)
            calls = Path(tmp) / 'calls'
            result = subprocess.run([sys.executable, str(ROOT/'scripts/deploy-commerce.py'), 'deploy',
                '--project', 'test-project', '--service-account', 'runtime@test-project.iam.gserviceaccount.com', '--dry-run'],
                env={**os.environ, 'PATH':tmp+os.pathsep+os.environ['PATH'], 'CALLS':str(calls),
                     'DATABASE_URL':'postgres://SECRET_MARKER@host/db'}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(calls.exists(), 'dry-run must not contact GCP')
            self.assertNotIn('SECRET_MARKER', result.stdout+result.stderr)
            self.assertNotIn('_DATABASE_URL', result.stdout)
            self.assertLess(result.stdout.index('gcloud builds submit'), result.stdout.index('gcloud run deploy'))
            self.assertIn('DATABASE_URL=commerce_DB_URL:latest', result.stdout)
            self.assertIn('--no-cpu-throttling', result.stdout)
            self.assertNotIn('db:migrate', result.stdout)
            self.assertNotIn('seed', result.stdout)

    def test_failed_build_stops_before_deploy(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / 'gcloud'
            fake.write_text('#!/usr/bin/env python3\nimport json, os, sys\nwith open(os.environ["CALLS"], "a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\nsys.exit(17)\n')
            fake.chmod(0o755)
            git = Path(tmp) / 'git'
            git.write_text('#!/bin/sh\nif [ "$1" = "rev-parse" ]; then echo 0123456789abcdef; fi\n')
            git.chmod(0o755)
            calls = Path(tmp) / 'calls'
            result = subprocess.run([sys.executable, str(ROOT/'scripts/deploy-commerce.py'), 'deploy',
                '--project', 'test-project', '--service-account', 'runtime@test-project.iam.gserviceaccount.com'],
                env={**os.environ, 'PATH':tmp+os.pathsep+os.environ['PATH'], 'CALLS':str(calls)},
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 17, result.stdout+result.stderr)
            commands = [json.loads(line) for line in calls.read_text().splitlines()]
            self.assertEqual(len(commands), 1)
            self.assertEqual(commands[0][:2], ['builds', 'submit'])

if __name__ == '__main__':
    unittest.main()
