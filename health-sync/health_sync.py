#!/usr/bin/env python3
"""Health Sync — entry point.

Discovers all per-soul config files at /var/lib/sys/config/health_sync_*.json
and syncs each one. Supports Personal Node (one config) and Multi-Hoster
(one config per soul, each with independent credentials).

Legacy fallback: if no per-soul configs exist, tries health_sync.json.

After each sync (success or failure) writes a structured status file to
/var/lib/sys/config/health_sync_status_{soul_id}.json so the UI can show
precise error messages instead of parsing log output.
"""

import glob
import importlib
import json
import sys
from datetime import datetime
from pathlib import Path

CONFIG_DIR  = Path("/var/lib/sys/config")
CONFIG_GLOB = str(CONFIG_DIR / "health_sync_*.json")
LEGACY_CONFIG = CONFIG_DIR / "health_sync.json"


def _write_status(soul_id: str, ok: bool, error_type, message: str):
    status = {
        "ok": ok,
        "error_type": error_type,
        "message": message,
        "ts": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }
    path = CONFIG_DIR / f"health_sync_status_{soul_id}.json"
    try:
        path.write_text(json.dumps(status, ensure_ascii=False))
        path.chmod(0o600)
    except Exception as e:
        print(f"  [warn] could not write status file: {e}")


def sync_one(config_path: str) -> bool:
    with open(config_path) as f:
        config = json.load(f)

    adapter_name = config.get("adapter", "garmin")
    soul_id      = config.get("soul_id")

    if not soul_id:
        print(f"  [skip] soul_id missing in {config_path}")
        return False

    print(f"  Adapter: {adapter_name}  |  Soul: {soul_id[:8]}…")

    sys.path.insert(0, str(Path(__file__).parent))

    try:
        adapter = importlib.import_module(f"adapters.{adapter_name}")
    except ImportError as e:
        msg = f"Adapter '{adapter_name}' nicht gefunden: {e}"
        print(f"  [error] {msg}")
        _write_status(soul_id, False, "install_error", msg)
        return False

    # Import typed exceptions (only available for garmin adapter)
    try:
        from adapters.garmin import (
            GarminRateLimitError,
            GarminMFARequired,
            GarminAuthError,
            GarminNetworkError,
        )
    except ImportError:
        GarminRateLimitError = GarminMFARequired = GarminAuthError = GarminNetworkError = None

    try:
        data = adapter.get_data(config, soul_id=soul_id)
    except Exception as e:
        error_type = "unknown"
        message = f"Sync-Fehler: {e}"

        if GarminRateLimitError and isinstance(e, GarminRateLimitError):
            error_type = "rate_limit"
            message = (
                "Garmin drosselt Anmeldungen (Rate Limit 429). "
                "Bitte 2–4 Stunden warten, dann erneut versuchen."
            )
        elif GarminMFARequired and isinstance(e, GarminMFARequired):
            error_type = "mfa_required"
            message = (
                "Garmin verlangt MFA-Bestätigung. "
                "Führe einmalig aus: python3 /opt/sys/health-sync/garmin_login.py"
            )
        elif GarminAuthError and isinstance(e, GarminAuthError):
            error_type = "auth_error"
            message = (
                "Garmin-Anmeldung fehlgeschlagen — "
                "E-Mail oder Passwort in den Health-Settings prüfen."
            )
        elif GarminNetworkError and isinstance(e, GarminNetworkError):
            error_type = "network_error"
            message = "Netzwerkfehler — Garmin Connect nicht erreichbar."

        print(f"  [error] {error_type}: {e}")
        _write_status(soul_id, False, error_type, message)
        return False

    from writer import write_health_md
    write_health_md(data, soul_id)
    _write_status(soul_id, True, None, "Sync erfolgreich.")
    return True


def main():
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M')}] SYS Health Sync starting…")

    configs = sorted(glob.glob(CONFIG_GLOB))

    if not configs:
        if LEGACY_CONFIG.exists():
            print(f"  Migrating legacy config → health_sync_<soul_id>.json")
            with open(LEGACY_CONFIG) as f:
                legacy = json.load(f)
            soul_id = legacy.get("soul_id", "")
            if soul_id:
                new_path = CONFIG_DIR / f"health_sync_{soul_id}.json"
                new_path.write_text(json.dumps(legacy, indent=2))
                new_path.chmod(0o600)
                LEGACY_CONFIG.unlink()
                configs = [str(new_path)]
                print(f"  Migrated → {new_path}")
            else:
                configs = [str(LEGACY_CONFIG)]
        else:
            print("Error: no config found. Run install.sh first.")
            sys.exit(1)

    ok = 0
    for cfg in configs:
        print(f"\n→ {Path(cfg).name}")
        if sync_one(cfg):
            ok += 1

    print(f"\nDone. {ok}/{len(configs)} soul(s) synced.\n")


if __name__ == "__main__":
    main()
