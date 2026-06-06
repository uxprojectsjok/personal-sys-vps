# Health Sync — Troubleshooting

## garminconnect nicht installiert

**Symptom:** Sync schlägt fehl mit `python-garminconnect not installed`

**Ursache:** Nach System-Updates oder pip-Cleanups kann das Paket verloren gehen. `install.sh` richtet nur Credentials und Config ein, installiert keine Python-Pakete persistent.

**Fix:**
```bash
pip3 install garminconnect --break-system-packages
```

Danach manuell testen:
```bash
python3 /opt/sys/health-sync/health_sync.py
```

Erfolgreich wenn Ausgabe endet mit: `Done. 1/1 soul(s) synced.`

---

## Garmin 429 Rate Limit

**Symptom:** `Mobile login returned 429 — IP rate limited by Garmin`

**Ursache:** Zu viele Login-Versuche in kurzer Zeit. Garmin blockiert die IP temporär.

**Fix:** 10–30 Minuten warten, dann erneut versuchen. Tritt oft auf wenn `health_sync.py` mehrfach schnell hintereinander ausgeführt wird.

---

## Daten veraltet

**Symptom:** health.md zeigt Daten die älter als 7 Tage sind.

**Vorgehen:**
1. `python3 /opt/sys/health-sync/health_sync.py` manuell ausführen
2. Fehlerausgabe prüfen
3. Bei `garminconnect not installed` → Fix oben
4. Bei `429` → warten
5. Bei anderen Fehlern → Garmin-Credentials in `/var/lib/sys/config/health_sync_{soul_id}.json` prüfen

**Hinweis:** Health Sync ist manuell auszulösen — kein Cron, kein automatischer Trigger.
