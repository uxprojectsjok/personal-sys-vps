#!/usr/bin/env python3
"""Run this on your LOCAL machine (laptop/desktop) — NOT on the server.

Logs in to Garmin Connect and prints a token string you can paste into
garmin_token_import.py on the server.

Requirements on your local machine:
    pip3 install garminconnect

Usage:
    python3 garmin_token_export.py
    → prints a token line starting with TOKEN:
    → copy that line and paste into garmin_token_import.py on the server
"""
import sys, json, base64, tempfile, os
from pathlib import Path

print("\n  === Garmin Token Export (run on local machine) ===\n")

try:
    from garminconnect import Garmin
except ImportError:
    print("ERROR: garminconnect not installed.")
    print("  Run:  pip3 install garminconnect")
    sys.exit(1)

email    = input("  Garmin email:    ").strip()
password = input("  Garmin password: ").strip()

api = Garmin(email, password)

try:
    api.client.skip_strategies = {"portal+cffi", "portal+requests"}
except AttributeError:
    pass

print("\n  Logging in…")
try:
    api.login()
except Exception as e:
    print(f"\n  Login failed: {e}")
    sys.exit(1)

# Dump token to temp dir and read it back
tmp = tempfile.mkdtemp()
api.client.dump(tmp)
token_file = Path(tmp) / "garmin_tokens.json"

if not token_file.exists():
    print("ERROR: token file not created — login may have failed silently.")
    sys.exit(1)

token_json = token_file.read_text()
token_b64  = base64.b64encode(token_json.encode()).decode()

# Cleanup
token_file.unlink()
os.rmdir(tmp)

print("\n  Login OK. Copy the line below and run garmin_token_import.py on the server:\n")
print(f"TOKEN:{token_b64}")
print()
