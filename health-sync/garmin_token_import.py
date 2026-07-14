#!/usr/bin/env python3
"""Run this on the SERVER after garmin_token_export.py on your local machine.

Paste the TOKEN:... line from garmin_token_export.py when prompted.

Usage:
    python3 /opt/sys/health-sync/garmin_token_import.py
"""
import json, sys, base64
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vault_crypto

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
token_dir = TOKEN_BASE / soul_id
token_dir.mkdir(parents=True, exist_ok=True)

print("\n  === Garmin Token Import ===\n")
print("  Paste the TOKEN:... line from garmin_token_export.py:")
line = input("  > ").strip()

if not line.startswith("TOKEN:"):
    print("ERROR: expected line starting with TOKEN:")
    sys.exit(1)

try:
    token_json = base64.b64decode(line[6:]).decode()
    token_data = json.loads(token_json)
except Exception as e:
    print(f"ERROR: could not decode token: {e}")
    sys.exit(1)

required = {"di_token", "di_refresh_token", "di_client_id"}
if not required.issubset(token_data.keys()):
    print(f"ERROR: token missing fields — got: {list(token_data.keys())}")
    sys.exit(1)

token_file = token_dir / "garmin_tokens.json"
token_file.write_text(token_json)
token_file.chmod(0o600)
token_dir.chmod(0o700)

print(f"\n  Token saved to {token_file}")
print("  Testing sync…\n")

try:
    from garminconnect import Garmin
    garmin_config = json.loads(Path(config_path).read_text())
    vault_key = vault_crypto.read_vault_key(soul_id)
    email    = vault_crypto.decrypt_field(garmin_config["garmin_email"], vault_key)
    password = vault_crypto.decrypt_field(garmin_config["garmin_password"], vault_key)
    api = Garmin(email, password)
    api.login(tokenstore=str(token_dir))
    import datetime
    stats = api.get_stats(str(datetime.date.today()))
    rhr = stats.get("restingHeartRate", "?")
    print(f"  Connection OK — resting HR today: {rhr} bpm")
    print("  health_sync.py will now run without re-login.\n")
except Exception as e:
    print(f"  Token saved but test failed: {e}")
    print("  Try running health_sync.py manually.\n")
