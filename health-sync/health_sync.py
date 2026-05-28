#!/usr/bin/env python3
"""Health Sync — entry point. Reads config, loads adapter, writes health.md."""

import importlib
import json
import sys
from datetime import datetime
from pathlib import Path

CONFIG_PATH = Path("/var/lib/sys/config/health_sync.json")


def main():
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M')}] SYS Health Sync starting…")

    if not CONFIG_PATH.exists():
        print(f"Error: config not found at {CONFIG_PATH}. Run install.sh first.")
        sys.exit(1)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    adapter_name = config.get("adapter", "garmin")
    soul_id = config.get("soul_id")

    if not soul_id:
        print("Error: soul_id missing from config. Run install.sh again.")
        sys.exit(1)

    sys.path.insert(0, str(Path(__file__).parent))

    try:
        adapter = importlib.import_module(f"adapters.{adapter_name}")
    except ImportError as e:
        print(f"Error: could not load adapter '{adapter_name}': {e}")
        sys.exit(1)

    print(f"  Adapter: {adapter_name}  |  Soul: {soul_id[:8]}…")

    try:
        data = adapter.get_data(config)
    except Exception as e:
        print(f"Error fetching health data: {e}")
        sys.exit(1)

    from writer import write_health_md
    write_health_md(data, soul_id)

    print("Done.\n")


if __name__ == "__main__":
    main()
