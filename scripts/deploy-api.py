#!/usr/bin/env python3
"""Build and deploy the Path A API + worker using runtime Secret Manager bindings."""
import argparse
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SECRET_BINDINGS = ','.join([
    'DATABASE_URL=flo-api_DATABASE_URL:latest', 'GEMINI_API_KEY=flo-api_GEMINI_API_KEY:latest',
])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'deploy'])
    parser.add_argument('--project', required=True)
    parser.add_argument('--region', default='us-central1')
    parser.add_argument('--repository', default='flo-api')
    parser.add_argument('--service-account', help='Runtime identity with access to the two secrets')
    parser.add_argument('--dry-run', action='store_true', help='Print commands without contacting GCP')
    args = parser.parse_args()
    if args.action != 'build' and not args.service_account:
        parser.error('--service-account is required for runtime operations')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if not args.dry_run and subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        parser.error('Commit changes first: the image tag must identify the exact source tree')
    image = f'{args.region}-docker.pkg.dev/{args.project}/{args.repository}/api:{revision}'
    common = [f'--project={args.project}', f'--region={args.region}']

    def run(command):
        print(shlex.join(command), flush=True)
        if not args.dry_run:
            subprocess.run(command, cwd=ROOT, check=True)

    if args.action in ('build', 'deploy'):
        run(['gcloud', 'builds', 'submit', '.', f'--project={args.project}',
             '--config=cloudbuild-api.yaml', f'--substitutions=_IMG={image}'])
    if args.action == 'deploy':
        base = [f'--image={image}', f'--service-account={args.service_account}',
                f'--update-secrets={SECRET_BINDINGS}',
                '--update-env-vars=NODE_ENV=development', '--cpu=1', '--memory=1Gi',
                '--min-instances=1', '--max-instances=3', '--no-cpu-throttling']
        # One image, two services: the API serves HTTP, the worker drains queues.
        run(['gcloud', 'run', 'deploy', 'flo-api', *common, *base, '--port=8080', '--cpu-boost'])
        run(['gcloud', 'run', 'deploy', 'flo-worker', *common, *base,
             '--command=npm', '--args=run,start:worker'])


if __name__ == '__main__':
    main()
