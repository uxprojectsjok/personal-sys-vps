# Health Sync

> *Experiment — not a core SYS feature. See [`docs/spec/health-sync.md`](../docs/spec/health-sync.md) for the full concept, setup, and troubleshooting.*

Fetches health data from your wearable's cloud and writes it to `vault/context/health.md`. The SoulKI reads it automatically as context — no special handling required. Sync is always triggered manually — there is no cron job.

## Setup

```bash
bash /opt/sys/health-sync/install.sh
```

The script asks for your adapter (default: `garmin`), your Garmin credentials, and runs a first sync immediately.

On **Multi-Hoster** nodes run the script once per soul — each soul gets their own config file (`health_sync_{soul_id}.json`) and independent credentials. A single manual `health_sync.py` run syncs all configured souls sequentially.

## Uninstall

1. Delete the config(s): `rm /var/lib/sys/config/health_sync_*.json`
2. Optionally delete the output: `rm /var/lib/sys/souls/*/vault/context/health.md`

## Adapters

| Adapter | Status | Notes |
|---------|--------|-------|
| `garmin` | ✅ Working | Uses unofficial API — can break after Garmin updates |
| `apple_health` | 🔧 Stub | Requires manual XML export from iOS |
| `oura` | 🔧 Stub | Official API available, not yet wired up |
