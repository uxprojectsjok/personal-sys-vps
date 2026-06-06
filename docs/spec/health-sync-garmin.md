# Health Sync — Garmin Implementierung

## Übersicht

Health Sync liest Gesundheitsdaten aus Garmin Connect und schreibt sie als `health.md` in den Soul-Vault. Die KI liest die Datei automatisch als Kontext — kein spezielles Handling nötig.

**Wichtig:** Garmin hat keine öffentliche API. Die Implementierung nutzt die inoffizielle `python-garminconnect`-Library, die die private Web-API von Garmin Connect reverse-engineered. Kann nach Garmin-Updates brechen.

---

## Abhängigkeiten

```bash
pip3 install garminconnect --break-system-packages
```

Muss nach System-Updates erneut installiert werden wenn der Sync fehlschlägt.

---

## Setup

```bash
bash /opt/sys/health-sync/install.sh
```

Legt an: `/var/lib/sys/config/health_sync_{soul_id}.json`

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

## Manueller Sync

```bash
python3 /opt/sys/health-sync/health_sync.py
```

Kein Cron — immer manuell auslösen. Multi-Hoster: alle Souls werden in einem Durchlauf gesynct.

---

## Was wird geholt

| Datenpunkt | Zeitraum | Quelle |
|------------|----------|--------|
| Ruhepuls (avg) | 7 Tage | `get_stats()` |
| Schlaf (avg) | 7 Tage | `get_sleep_data()` → Fallback `get_stats()` |
| Schritte (avg) | 7 Tage | `get_stats()` |
| Aktive Tage | 7 Tage | `highlyActiveSeconds ≥ 1800s` |
| Ruhepuls, Schlaf, Aktive Tage | 30 Tage | `get_stats()` |
| Recent Activities | letzte 14 Tage | `get_activities()` — Typ, Dauer, Distanz, Ø-HR |

---

## Output: health.md

Geschrieben nach: `/var/lib/sys/souls/{soul_id}/vault/context/health.md`

```markdown
---
source: garmin_fr235
last_sync: YYYY-MM-DD
---

## This Week (YYYY-Www)
- Resting HR: 55 bpm (avg)
- Sleep: 7h 23min/Nacht (Ø)
- Steps: 11.131 (avg)
- Active days: 3

## Recent Activities
- 2026-06-05  running  42 min  6.2 km  ♥ 148 bpm

## Monthly Summary (YYYY-MM)
- Resting HR: 56 bpm (avg)
- Sleep: 7h 15min/Nacht (Ø)
- Active days: 18 / 30

## Food Log
(wird nicht überschrieben — bleibt erhalten)

## Annual Journal
(wird nicht überschrieben — bleibt erhalten)
```

**Wichtig:** `Food Log` und `Annual Journal` bleiben bei jedem Sync erhalten — werden nie überschrieben.

---

## Architektur

```
health_sync.py          Entry point — findet alle health_sync_{soul_id}.json
    └── adapters/garmin.py   Holt Daten von Garmin Connect API
    └── writer.py            Schreibt health.md, registriert in api_context.json
```

`writer.py` trägt `health.md` automatisch in `api_context.json → synced_files.context` ein, damit die KI die Datei als Vault-Kontext liest.

---

## Multi-Hoster

Pro Soul eine eigene Config-Datei mit eigenen Garmin-Credentials. Ein einziger `health_sync.py`-Aufruf synct alle Souls sequenziell.

---

## Bekannte Einschränkungen

- Inoffizielle API — kann ohne Vorwarnung brechen
- Rate Limit: `429`-Fehler bei zu vielen Login-Versuchen → 10–30 Minuten warten
- Schlaf-Daten fehlen manchmal (Garmin-API-Inkonsistenz) → Fallback auf `get_stats()`
- Garmin Authentifizierung funktioniert nur mit E-Mail + Passwort, kein OAuth
