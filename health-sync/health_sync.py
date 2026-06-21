#!/usr/bin/env python3
"""Health Sync — entry point.

Discovers all per-soul config files at /var/lib/sys/config/health_sync_*.json
and syncs each one. Supports Personal Node (one config) and Multi-Hoster
(one config per soul, each with independent credentials).

Legacy fallback: if no per-soul configs exist, tries health_sync.json.
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
        print(f"  [error] could not load adapter '{adapter_name}': {e}")
        return False

    try:
        data = adapter.get_data(config, soul_id=soul_id)
    except Exception as e:
        print(f"  [error] fetch failed: {e}")
        return False

    from writer import write_health_md
    write_health_md(data, soul_id)
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
