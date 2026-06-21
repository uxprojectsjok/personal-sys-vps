#!/usr/bin/env python3
"""One-time interactive Garmin login with MFA support.

After running this script the OAuth tokens are saved and the automatic
sync (health_sync.py) runs without MFA prompts until the tokens expire.

Usage:  python3 /opt/sys/health-sync/garmin_login.py
"""
import json
import sys
from pathlib import Path

CONFIG_DIR = Path("/var/lib/sys/config")
TOKEN_BASE  = Path("/var/lib/sys/config/garmin_tokens")

# Find soul config
configs = list(CONFIG_DIR.glob("health_sync_*.json"))
if not configs:
    print("No health_sync config found. Set up Health Sync in Settings first.")
    sys.exit(1)

config_path = configs[0]
with open(config_path) as f:
    config = json.load(f)

soul_id   = config.get("soul_id", config_path.stem.replace("health_sync_", ""))
email     = config["garmin_email"]
password  = config["garmin_password"]
token_dir = TOKEN_BASE / soul_id
token_dir.mkdir(parents=True, exist_ok=True)

print(f"\n  Garmin login for: {email}")
print(f"  Tokens will be saved to: {token_dir}\n")

# Add venv site-packages if present
sys.path.insert(0, str(Path(__file__).parent))
venv_site = Path(__file__).parent / ".venv/lib"
for p in venv_site.glob("python*/site-packages"):
    sys.path.insert(0, str(p))

try:
    from garminconnect import Garmin
except ImportError:
    print("ERROR: garminconnect not installed. Run: pip3 install garminconnect")
    sys.exit(1)


def mfa_prompt() -> str:
    print("\n  Garmin requires a verification code.")
    print("  Check your email or authenticator app.")
    return input("  MFA code: ").strip()


api = Garmin(email, password, prompt_mfa=mfa_prompt)

# Skip slow portal strategies — they fail the same way as mobile but take longer
try:
    api.client.skip_strategies = {"portal+cffi", "portal+requests"}
except AttributeError:
    pass

print("  Logging in…")
try:
    mfa_status, _ = api.login(tokenstore=str(token_dir))
    if mfa_status:
        print(f"  Unexpected MFA status: {mfa_status}")
        sys.exit(1)
except Exception as e:
    print(f"\n  Login failed: {e}")
    print("  If Garmin says 429 (rate limited): wait 2-4 hours and try again.")
    sys.exit(1)

print(f"  Tokens saved to {token_dir}")

# Quick data test
try:
    import datetime
    stats = api.get_stats(str(datetime.date.today()))
    rhr = stats.get("restingHeartRate", "?")
    print(f"  Connection OK — resting HR today: {rhr} bpm")
    print("\n  Done. The automatic sync will now run without MFA.\n")
except Exception as e:
    print(f"  Logged in but data fetch failed: {e}")
    print("  Tokens are saved — the sync should work anyway.\n")
