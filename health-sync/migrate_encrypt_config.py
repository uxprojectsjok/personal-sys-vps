#!/usr/bin/env python3
"""One-time migration: encrypts plaintext Garmin credentials in existing
health_sync_<soul_id>.json config files.

Run once after deploying the Garmin-credential-encryption feature:
    python3 /opt/sys/health-sync/migrate_encrypt_config.py

Idempotent — a config already storing encrypted fields (base64 + SYS\\x01
magic) or a soul without a vault_key_hex (cipher_mode="open") is left
untouched. Safe to re-run.
"""
import base64
import glob
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vault_crypto

CONFIG_GLOB = "/var/lib/sys/config/health_sync_*.json"


def _looks_encrypted(value: str) -> bool:
    if not value:
        return False
    try:
        return base64.b64decode(value, validate=True).startswith(vault_crypto.MAGIC)
    except Exception:
        return False


def migrate_one(config_path: str) -> str:
    with open(config_path) as f:
        config = json.load(f)

    soul_id = config.get("soul_id", Path(config_path).stem.replace("health_sync_", ""))
    vault_key = vault_crypto.read_vault_key(soul_id)

    if not vault_key:
        return f"skip (no vault_key_hex / cipher_mode=open): {soul_id[:8]}…"

    changed = False
    for field in ("garmin_email", "garmin_password"):
        value = config.get(field)
        if value and not _looks_encrypted(value):
            config[field] = vault_crypto.encrypt_field(value, vault_key)
            changed = True

    if not changed:
        return f"already encrypted / nothing to do: {soul_id[:8]}…"

    Path(config_path).write_text(json.dumps(config, indent=2))
    Path(config_path).chmod(0o600)
    return f"encrypted: {soul_id[:8]}…"


def main():
    configs = sorted(glob.glob(CONFIG_GLOB))
    if not configs:
        print("No health_sync_*.json configs found.")
        return
    for cfg in configs:
        print(f"  {migrate_one(cfg)}")


if __name__ == "__main__":
    main()
