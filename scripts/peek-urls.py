#!/usr/bin/env python3
"""Compatibility entry point for the consolidated, redacted secret probe."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('probe-secrets.py')), run_name='__main__')
