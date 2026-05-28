# Health Sync — Experiment

> ⚠️ **This is an experimental concept, not a core SYS feature.**
> It is documented here to explore the idea and make it reproducible — not because it is recommended, supported, or stable. Use at your own risk.

---

## The Idea

Your body produces data every day — resting heart rate, sleep duration, activity. This data currently lives in device manufacturer clouds (Garmin Connect, Apple Health, Oura) and is never part of any AI context.

Health Sync explores one question:

> **Does the quality of AI interaction improve when the AI knows your physical state — without you having to explain it?**

If yes, `health.md` is a meaningful building block of the SYS protocol. If not, the experiment tells us that too.

---

## What It Does

A sync script runs weekly on your VPS via cron. It fetches health data from your device's cloud, formats it into a standardized `health.md`, and writes it to your vault context folder. The `health_check` MCP tool reads it, applies evidence-based reference ranges, and gives the SoulKI a structured analysis — resting HR, sleep, steps, active days, trends and recommendations — ready to use in conversation.

```
Garmin Watch → Garmin Connect (cloud) → health_sync.py → health.md → vault/context/
                                                                            ↓
                                                                      health_check tool
                                                                            ↓
                                                                        SoulKI responds
```

---

## health.md Format

Device-agnostic. Every adapter writes the same structure:

```markdown
---
source: garmin_fr235
last_sync: 2026-05-28
---

## This Week (2026-W22)
- Resting HR: 52 bpm (avg)
- Sleep: 7h 12min (avg)
- Steps: 8,432 (avg)

## Monthly Summary (2026-05)
- Resting HR: 54 bpm (avg)
- Sleep: 6h 58min (avg)
- Active days: 18 / 31
```

The AI sees this as plain context. No special handling required.

---

## Repository Structure

```
health-sync/
  README.md          — Setup instructions
  install.sh         — One command: configures cron + credentials
  health_sync.py     — Entry point
  writer.py          — Writes health.md (device-agnostic)
  adapters/
    garmin.py        — Garmin Connect implementation (uses python-garminconnect)
    apple_health.py  — Stub: template for Apple Health XML export
    oura.py          — Stub: template for Oura API
```

### Adapter Interface

Each adapter implements one function:

```python
def get_data(config: dict) -> dict:
    return {
        "source": "garmin_fr235",
        "resting_hr": 52,        # bpm, weekly avg
        "sleep_minutes": 432,    # weekly avg
        "steps": 8432,           # daily avg
        "active_days": 5,        # days with activity this week
    }
```

New device? Write a new adapter, point `install.sh` to it. Nothing else changes.

---

## health_check Tool

`health_check` is an MCP tool registered in the soul-mcp server and the in-app KI. It has no parameters — it always reads your own `health.md`.

### What it returns

```json
{
  "available": true,
  "source": "garmin_fr235",
  "last_sync": "2026-05-28",
  "data_age_days": 0,
  "data_stale": false,
  "weekly": {
    "resting_hr":  { "value": 52, "status": "athletic", "label": "Athletisch",  "tip": "Unter 60 bpm — Zeichen guter kardiovaskulärer Fitness." },
    "sleep":       { "value": 432, "formatted": "7h 12min", "status": "optimal", "label": "Optimal", "tip": "7–9h — idealer Bereich." },
    "steps":       { "value": 8432, "formatted": "8.432", "status": "active",   "label": "Aktiv",    "tip": "7.500–10.000 Schritte — im empfohlenen Bereich." },
    "active_days": { "value": 5, "of": 7, "status": "good", "label": "Gut" }
  },
  "monthly": {
    "resting_hr":  { "value": 54, "formatted": "54 bpm" },
    "sleep":       { "value": 418, "formatted": "6h 58min" },
    "active_days": { "value": 18 }
  },
  "hr_trend": "improving",
  "overall":  { "status": "excellent", "label": "Sehr gut" },
  "tips": []
}
```

### Reference ranges

| Metric | Source | Ranges |
|--------|--------|--------|
| **Resting HR** | ESC guidelines | < 40 very low · 40–60 athletic · 60–70 good · 70–80 normal · 80–100 elevated · > 100 high |
| **Sleep** | National Sleep Foundation | < 5h critical · 5–6h too low · 6–7h borderline · 7–9h optimal · > 9h long |
| **Steps/day** | WHO physical activity guidelines | < 3k sedentary · 3–5k low · 5–7.5k moderate · 7.5–10k active · > 10k very active |
| **Active days** | — | 0–1 low · 2–3 moderate · 4–5 good · 6–7 great |

`tips` only contains entries for metrics that need attention — no noise when everything is fine.

### Trigger phrases

The SoulKI calls `health_check` automatically when body, health, pulse, sleep, steps or wellbeing come up in conversation. No command needed.

If `health.md` does not exist yet, the tool returns `"available": false` with setup instructions.

---

## Get Started

**Requirements:** Node already running (`init.sh` complete), SSH access, Garmin account.

### 1 — Clone or pull the latest version

If your node was set up before this experiment existed:

```bash
cd /opt/sys && git pull
```

### 2 — Run the installer

```bash
bash /opt/sys/health-sync/install.sh
```

The script:
1. Asks which adapter to use (default: `garmin`)
2. Asks for your Garmin device model (default: `garmin_fr235`)
3. Asks for your Garmin Connect email + password
4. Stores credentials in `/var/lib/sys/config/health_sync.json` (chmod 600)
5. Adds a weekly cron job (every Monday 06:00)
6. Runs the first sync immediately

The first sync fetches 30 days of history — takes about 30 seconds.

### 3 — Verify

```bash
cat /var/lib/sys/souls/<your-soul-id>/vault/context/health.md
```

The file should contain your weekly and monthly stats. If you open a new chat session, the SoulKI will read it automatically — no further setup needed.

### Uninstall

```bash
crontab -e                                                    # remove the health_sync.py line
rm /var/lib/sys/config/health_sync.json
rm /var/lib/sys/souls/<your-soul-id>/vault/context/health.md
```

Credentials never leave the server. The sync script runs locally.

---

## Limitations & Risks

| Risk | Detail |
|------|--------|
| **Unofficial API** | `python-garminconnect` uses Garmin's private API. Garmin can break it without notice. |
| **Credentials on server** | Garmin login is stored on your VPS. Treat the server accordingly. |
| **No real-time** | Weekly sync only. The AI sees last week's data, not today's. |
| **FR235 limits** | No sleep phases (watch too old). Resting HR + sleep duration + steps only. |
| **Single user** | Designed for Personal Node. Multi-Hoster: each soul would need separate credentials. |

---

## What This Is Not

- Not a SYS protocol feature
- Not part of `init.sh` or the node setup
- Not maintained on the same schedule as the core node
- Not tested across devices or Garmin account configurations

---

## If the Experiment Succeeds

If health context demonstrably improves AI interaction quality, the next steps would be:

1. Stabilize the adapter interface as a mini-spec
2. Add Apple Health (XML export → cron) and Oura (official API) adapters
3. Consider a lightweight UI in Settings to show sync status
4. Propose `health.md` as an optional SYS protocol extension

None of this is planned. It depends on the experiment.

---

*Experiment initiated: 2026-05-28*
*Author: Jan-Oliver Karo*
