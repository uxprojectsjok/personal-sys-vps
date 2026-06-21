#!/usr/bin/env python3
"""One-time interactive Garmin login to refresh OAuth tokens.

Run this when health_sync.py reports auth errors or expired tokens.
Tokens are saved and reused automatically — no login needed on next sync.

Usage:  python3 /opt/sys/health-sync/garmin_login.py
"""
import json
import sys
from pathlib import Path

CONFIG_DIR = Path("/var/lib/sys/config")
TOKEN_BASE  = Path("/var/lib/sys/config/garmin_tokens")

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

sys.path.insert(0, str(Path(__file__).parent))
venv_site = Path(__file__).parent / ".venv/lib"
for p in venv_site.glob("python*/site-packages"):
    sys.path.insert(0, str(p))

try:
    from garminconnect import Garmin
except ImportError:
    print("ERROR: garminconnect not installed. Run: pip3 install garminconnect")
    sys.exit(1)

api = Garmin(email, password)

# Skip slow portal strategies
try:
    api.client.skip_strategies = {"portal+cffi", "portal+requests"}
except AttributeError:
    pass

print("  Logging in…")
try:
    api.login(tokenstore=str(token_dir))
except Exception as e:
    msg = str(e).lower()
    if "429" in msg or "too many" in msg or "rate" in msg:
        print(f"\n  Garmin is rate-limiting this server's IP (429).")
        print("  This is temporary — wait 2-4 hours and try again.")
        print("  The sync will resume automatically once Garmin lifts the limit.")
    else:
        print(f"\n  Login failed: {e}")
    sys.exit(1)

print(f"  Tokens saved.")

try:
    import datetime
    stats = api.get_stats(str(datetime.date.today()))
    rhr = stats.get("restingHeartRate", "?")
    print(f"  Connection OK — resting HR today: {rhr} bpm")
    print("\n  Done. The automatic sync will now run without re-login.\n")
except Exception as e:
    print(f"  Logged in but data fetch failed: {e}")
    print("  Tokens are saved — the sync should still work.\n")
