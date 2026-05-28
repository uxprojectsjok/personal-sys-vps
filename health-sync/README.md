# Health Sync

> ⚠️ **Experiment** — not a core SYS feature. See [`docs/experiments/health-sync.md`](../docs/experiments/health-sync.md) for the full concept and risk list.

Fetches health data from your wearable's cloud weekly and writes it to `vault/context/health.md`. The SoulKI reads it automatically as context — no special handling required.

## Setup

```bash
bash /opt/sys/health-sync/install.sh
```

The script asks for your adapter (default: `garmin`), your Garmin credentials, and runs a first sync immediately. A cron job runs every Monday at 06:00.

## Uninstall

1. Remove the cron entry: `crontab -e` → delete the `health_sync.py` line
2. Delete the config: `rm /var/lib/sys/config/health_sync.json`
3. Optionally delete the output: `rm /var/lib/sys/souls/*/vault/context/health.md`

## Adapters

| Adapter | Status | Notes |
|---------|--------|-------|
| `garmin` | ✅ Working | Uses unofficial API — can break after Garmin updates |
| `apple_health` | 🔧 Stub | Requires manual XML export from iOS |
| `oura` | 🔧 Stub | Official API available, not yet wired up |
