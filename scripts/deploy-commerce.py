#!/usr/bin/env python3
"""Build and deploy the commerce sandbox using runtime Secret Manager bindings."""
import argparse
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SECRET_BINDINGS = ','.join([
    'DATABASE_URL=commerce_DB_URL:latest', 'REDIS_URL=commerce_REDIS_URL:latest',
    'JWT_SECRET=commerce_JWT_SECRET:latest', 'COOKIE_SECRET=commerce_COOKIE_SECRET:latest',
])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'deploy', 'migrate', 'seed'])
    parser.add_argument('--project', required=True)
    parser.add_argument('--region', default='us-central1')
    parser.add_argument('--repository', default='flo-commerce')
    parser.add_argument('--service', default='flo-commerce-backend')
    parser.add_argument('--service-account', help='Runtime identity with access to the four secrets')
    parser.add_argument('--dry-run', action='store_true', help='Print commands without contacting GCP')
    args = parser.parse_args()
    if args.action != 'build' and not args.service_account:
        parser.error('--service-account is required for runtime operations')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if not args.dry_run and subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        parser.error('Commit changes first: the image tag must identify the exact source tree')
    image = f'{args.region}-docker.pkg.dev/{args.project}/{args.repository}/commerce:{revision}'
    common = [f'--project={args.project}', f'--region={args.region}']
    runtime = [f'--image={image}', f'--service-account={args.service_account}',
               f'--update-secrets={SECRET_BINDINGS}', '--update-env-vars=NODE_ENV=development,COMMERCE_SANDBOX=true',
               '--cpu=2', '--memory=3Gi']

    def run(command):
        print(shlex.join(command), flush=True)
        if not args.dry_run:
            subprocess.run(command, cwd=ROOT, check=True)

    if args.action in ('build', 'deploy'):
        run(['gcloud', 'builds', 'submit', '.', f'--project={args.project}',
             '--config=cloudbuild-commerce.yaml', f'--substitutions=_IMG={image}'])
    if args.action == 'deploy':
        run(['gcloud', 'run', 'deploy', args.service, *common, *runtime,
             '--port=9000', '--min-instances=1', '--max-instances=3',
             '--no-cpu-throttling', '--cpu-boost'])
    elif args.action in ('migrate', 'seed'):
        # Explicit one-off jobs; neither operation is part of normal service boot.
        job = f'{args.service}-{args.action}'
        run(['gcloud', 'run', 'jobs', 'deploy', job, *common, *runtime,
             '--command=npm', f'--args=run,{args.action}', '--tasks=1',
             '--max-retries=0', '--task-timeout=10m'])
        run(['gcloud', 'run', 'jobs', 'execute', job, *common, '--wait'])


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
