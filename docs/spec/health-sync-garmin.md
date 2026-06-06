# Health Sync — Garmin Implementation

## Overview

Health Sync reads health data from Garmin Connect and writes it as `health.md` into the Soul Vault. The AI reads the file automatically as context — no special handling required.

**Important:** Garmin has no public API. The implementation uses the unofficial `python-garminconnect` library, which reverse-engineers Garmin Connect's private web API. May break after Garmin updates.

---

## Dependencies

```bash
pip3 install garminconnect --break-system-packages
```

Must be reinstalled after system updates if sync fails.

---

## Setup

```bash
bash /opt/sys/health-sync/install.sh
```

Creates: `/var/lib/sys/config/health_sync_{soul_id}.json`

```json
{
  "adapter": "garmin",
  "soul_id": "{soul_id}",
  "garmin_email": "...",
  "garmin_password": "...",
  "garmin_model": "garmin_fr235"
}
```

---

## Manual Sync

```bash
python3 /opt/sys/health-sync/health_sync.py
```

No cron — always trigger manually. Multi-hoster: all souls are synced in a single run.

---

## What Gets Fetched

| Data point | Period | Source |
|------------|--------|--------|
| Resting HR (avg) | 7 days | `get_stats()` |
| Sleep (avg) | 7 days | `get_sleep_data()` → fallback `get_stats()` |
| Steps (avg) | 7 days | `get_stats()` |
| Active days | 7 days | `highlyActiveSeconds ≥ 1800s` |
| Resting HR, Sleep, Active days | 30 days | `get_stats()` |
| Recent Activities | last 14 days | `get_activities()` — type, duration, distance, avg HR |

---

## Output: health.md

Written to: `/var/lib/sys/souls/{soul_id}/vault/context/health.md`

```markdown
---
source: garmin_fr235
last_sync: YYYY-MM-DD
---

## This Week (YYYY-Www)
- Resting HR: 55 bpm (avg)
- Sleep: 7h 23min/night (avg)
- Steps: 11,131 (avg)
- Active days: 3

## Recent Activities
- 2026-06-05  running  42 min  6.2 km  ♥ 148 bpm

## Monthly Summary (YYYY-MM)
- Resting HR: 56 bpm (avg)
- Sleep: 7h 15min/night (avg)
- Active days: 18 / 30

## Food Log
(not overwritten — preserved on each sync)

## Annual Journal
(not overwritten — preserved on each sync)
```

**Important:** `Food Log` and `Annual Journal` are preserved on every sync — never overwritten.

---

## Architecture

```
health_sync.py          Entry point — finds all health_sync_{soul_id}.json
    └── adapters/garmin.py   Fetches data from Garmin Connect API
    └── writer.py            Writes health.md, registers in api_context.json
```

`writer.py` automatically adds `health.md` to `api_context.json → synced_files.context` so the AI reads it as vault context.

---

## Multi-Hoster

One config file per soul with its own Garmin credentials. A single `health_sync.py` call syncs all souls sequentially.

---

## Known Limitations

- Unofficial API — can break without warning
- Rate limit: `429` errors on too many login attempts → wait 10–30 minutes
- Sleep data sometimes missing (Garmin API inconsistency) → fallback to `get_stats()`
- Garmin authentication only works with email + password, no OAuth
