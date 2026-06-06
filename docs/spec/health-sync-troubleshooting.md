# Health Sync — Troubleshooting

## garminconnect not installed

**Symptom:** Sync fails with `python-garminconnect not installed`

**Cause:** The package can be lost after system updates or pip cleanups. `install.sh` only sets up credentials and config — it does not install Python packages persistently.

**Fix:**
```bash
pip3 install garminconnect --break-system-packages
```

Then test manually:
```bash
python3 /opt/sys/health-sync/health_sync.py
```

Success when output ends with: `Done. 1/1 soul(s) synced.`

---

## Garmin 429 Rate Limit

**Symptom:** `Mobile login returned 429 — IP rate limited by Garmin`

**Cause:** Too many login attempts in a short time. Garmin temporarily blocks the IP.

**Fix:** Wait 10–30 minutes, then try again. Often occurs when `health_sync.py` is run multiple times in quick succession.

---

## Stale Data

**Symptom:** health.md shows data older than 7 days.

**Steps:**
1. Run `python3 /opt/sys/health-sync/health_sync.py` manually
2. Check error output
3. On `garminconnect not installed` → fix above
4. On `429` → wait
5. On other errors → check Garmin credentials in `/var/lib/sys/config/health_sync_{soul_id}.json`

**Note:** Health Sync must be triggered manually — no cron, no automatic trigger.
