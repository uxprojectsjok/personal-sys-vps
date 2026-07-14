#!/usr/bin/env python3
"""One-time Garmin login — saves OAuth tokens for automatic syncs.

Supports MFA (SMS code) via file-based IPC when called from the web UI,
or interactively when run from the terminal.

Usage:  python3 /opt/sys/health-sync/garmin_login.py [--soul-id UUID] [--mfa-file /tmp/...] [--status-file /tmp/...]
"""
import json
import sys
import time
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vault_crypto

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--soul-id",     default=None)
parser.add_argument("--mfa-file",    default=None, help="Path to file where MFA code will appear")
parser.add_argument("--status-file", default=None, help="Path to write status (waiting_mfa / ok / error:...)")
args, _ = parser.parse_known_args()

CONFIG_DIR = Path("/var/lib/sys/config")
TOKEN_BASE  = Path("/var/lib/sys/config/garmin_tokens")

# Resolve config
if args.soul_id:
    config_path = CONFIG_DIR / f"health_sync_{args.soul_id}.json"
else:
    configs = list(CONFIG_DIR.glob("health_sync_*.json"))
    if not configs:
        print("No health_sync config found.")
        if args.status_file:
            Path(args.status_file).write_text("error:no_config")
        sys.exit(1)
    config_path = configs[0]

with open(config_path) as f:
    config = json.load(f)

soul_id   = config.get("soul_id", config_path.stem.replace("health_sync_", ""))
vault_key = vault_crypto.read_vault_key(soul_id)
email     = vault_crypto.decrypt_field(config["garmin_email"], vault_key)
password  = vault_crypto.decrypt_field(config["garmin_password"], vault_key)
token_dir = TOKEN_BASE / soul_id
token_dir.mkdir(parents=True, exist_ok=True)

print(f"  Garmin login for: {email}")

sys.path.insert(0, str(Path(__file__).parent))
venv_site = Path(__file__).parent / ".venv/lib"
for p in venv_site.glob("python*/site-packages"):
    sys.path.insert(0, str(p))

try:
    from garminconnect import Garmin
except ImportError:
    msg = "garminconnect not installed"
    print(f"ERROR: {msg}")
    if args.status_file: Path(args.status_file).write_text(f"error:{msg}")
    sys.exit(1)

# MFA prompt: file-based IPC when called from web, interactive in terminal
def prompt_mfa():
    if args.mfa_file and args.status_file:
        # Signal the web UI that MFA is needed
        Path(args.status_file).write_text("waiting_mfa")
        mfa_path = Path(args.mfa_file)
        print("  MFA required — waiting for code via web UI…", flush=True)
        for _ in range(300):  # wait up to 10 min
            if mfa_path.exists():
                code = mfa_path.read_text().strip()
                mfa_path.unlink(missing_ok=True)
                Path(args.status_file).write_text("mfa_received")
                print(f"  MFA code received.", flush=True)
                return code
            time.sleep(2)
        Path(args.status_file).write_text("error:mfa_timeout")
        raise Exception("MFA timeout — no code received within 10 minutes")
    else:
        # Interactive terminal fallback
        return input("  Enter MFA code from SMS: ").strip()

api = Garmin(email, password, prompt_mfa=prompt_mfa)

try:
    api.client.skip_strategies = {"portal+cffi", "portal+requests"}
except AttributeError:
    pass

print("  Logging in…", flush=True)
try:
    api.login(tokenstore=str(token_dir))
except Exception as e:
    msg = str(e)
    low = msg.lower()
    if "429" in low or "too many" in low or "rate" in low:
        detail = "rate_limited"
        print("\n  Garmin rate-limiting this IP (429). Wait 2-4 hours.")
    else:
        detail = msg.replace(":", "_")[:80]
        print(f"\n  Login failed: {e}")
    if args.status_file:
        Path(args.status_file).write_text(f"error:{detail}")
    sys.exit(1)

if args.status_file:
    Path(args.status_file).write_text("ok")

print("  Tokens saved.", flush=True)

try:
    import datetime
    stats = api.get_stats(str(datetime.date.today()))
    rhr = stats.get("restingHeartRate", "?")
    print(f"  OK — resting HR: {rhr} bpm\n")
except Exception as e:
    print(f"  Logged in — data fetch test failed: {e}\n")
