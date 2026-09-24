#!/usr/bin/env python3
"""Validate commerce runtime secrets without printing their contents."""
import argparse
import ipaddress
import subprocess
import sys
from urllib.parse import parse_qs, urlsplit


def check_url(value, redis=False):
    try:
        url = urlsplit(value)
        host = url.hostname or ''
        port = url.port  # Validate an explicitly supplied port without printing it.
        if not host or not url.password:
            return 'BAD: malformed endpoint'
        try:
            local = not ipaddress.ip_address(host).is_global
        except ValueError:
            local = '.' not in host or host.endswith(('.localhost', '.local', '.internal'))
        if local:
            return 'BAD: requires an external endpoint'
        if redis:
            if url.scheme != 'rediss':
                return 'BAD: Redis requires TLS (rediss)'
        elif url.scheme not in ('postgres', 'postgresql') or parse_qs(url.query).get('sslmode') not in (['require'], ['verify-full']):
            return 'BAD: Postgres requires TLS (sslmode=require or verify-full)'
        # Neither raw URLs, hosts, paths nor query strings are safe diagnostic output.
        return 'OK: external TLS endpoint'
    except ValueError:
        return 'BAD: malformed endpoint'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    args = parser.parse_args()
    failed = False
    for name in ('commerce_DB_URL', 'commerce_REDIS_URL', 'commerce_JWT_SECRET', 'commerce_COOKIE_SECRET'):
        result = subprocess.run(['gcloud', 'secrets', 'versions', 'access', 'latest',
                                 '--secret='+name, '--project='+args.project], capture_output=True, text=True)
        value = result.stdout.rstrip('\n')
        if result.returncode or not value:
            verdict = 'BAD: fetch failed or secret empty'
        elif name.endswith('DB_URL'):
            verdict = check_url(value)
        elif name.endswith('REDIS_URL'):
            verdict = check_url(value, redis=True)
        else:
            verdict = 'OK: configured'
        print(f'{name}: {verdict}')
        failed |= verdict.startswith('BAD')
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
