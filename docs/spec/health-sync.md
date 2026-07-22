# Health Sync — Garmin Implementation

> ⚠️ **Experiment** — not a core SYS feature. Use at your own risk.

## Overview

Health Sync reads health data from Garmin Connect and writes it as `health.md` into the Soul Vault. The AI reads the file automatically as context — no special handling required.

**Important:** Garmin has no public API. The implementation uses the unofficial `python-garminconnect` library, which reverse-engineers Garmin Connect's private web API. May break after Garmin updates.

Sync is always triggered manually — there is no cron job. Trigger it via the CLI, the `/health` page's Sync button, or the `health_sync` MCP tool (the AI can run it on request).

---

## Dependencies

```bash
pip3 install garminconnect --break-system-packages
```

Must be reinstalled after system updates if sync fails.

---

## Setup

Credential entry happens only via the CLI installer — the in-app Settings UI has no credential form, only status and a login-repair button (see below).

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

Runs a first sync immediately after saving the config.

---

## Manual Sync

Three equivalent ways to trigger a sync, all running the same `health_sync.py`:

| Method | How |
|--------|-----|
| CLI | `python3 /opt/sys/health-sync/health_sync.py` |
| `/health` page | "Sync" button → `POST /api/health-sync` |
| Chat / MCP | `health_sync` tool (owner-only) — ask the AI to sync |

No cron. Multi-hoster: a single run syncs all configured souls sequentially.

---

## In-App Garmin Login (MFA handling)

Settings → Gesundheit shows sync status and a **"Garmin Login"** button. It runs `garmin_login.py` on the server in the background and surfaces an MFA code prompt directly in the UI if Garmin challenges the login (`POST /api/health/login`, then `POST /api/health/mfa` with the code) — no SSH session needed for the common MFA case.

**Scope:** this button still logs in from the *server's* IP — same as running `garmin_login.py` over SSH. It fixes an MFA challenge, but it does **not** help when Garmin has rate-limited the server IP itself (see below); that requires logging in from a different IP entirely.

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
last_sync: YYYY-MM-DD HH:MM:SS
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

**Important:** `Food Log` and `Annual Journal` are preserved on every sync — never overwritten (`writer.py` re-reads and re-inserts both sections from the existing file before writing).

---

## Architecture

```
health_sync.py              Entry point — finds all health_sync_{soul_id}.json
    └── adapters/garmin.py       Fetches data from Garmin Connect API
    └── writer.py                Writes health.md, registers in api_context.json
garmin_login.py              Interactive/MFA login — saves OAuth tokens
garmin_token_export.py       Run on a non-rate-limited machine to export a token
garmin_token_import.py       Run on the server to import an exported token

lua/health_config.lua        GET/POST /api/health/config — status read, credential write
lua/health_login.lua         POST /api/health/login — runs garmin_login.py, waits for result/MFA
lua/health_mfa.lua           POST /api/health/mfa — submits the MFA code to a waiting login
lua/health_sync_trigger.lua  POST /api/health-sync — runs health_sync.py in the background
lua/health_sync_status.lua   GET /api/health/sync-status — last sync result
soul-mcp/tools/health_sync.mjs  MCP tool wrapping POST /api/health-sync
```

`writer.py` automatically adds `health.md` to `api_context.json → synced_files.context` so the AI reads it as vault context.

---

## Multi-Hoster

One config file per soul with its own Garmin credentials. A single manual `health_sync.py` run syncs all souls sequentially.

---

## Troubleshooting

### Garmin rate limit (429)

**Why it happens**

Garmin rate-limits server IP addresses that attempt too many logins in a short time. This typically occurs when both OAuth tokens have expired and `health_sync.py` or a login attempt retries the full login repeatedly. Home and mobile IPs are treated more leniently than data-center IPs.

**Symptoms**

```
mobile+cffi returned 429: Mobile login returned 429 — IP rate limited by Garmin
mobile+requests returned 429: Mobile login returned 429 — IP rate limited by Garmin
widget+cffi failed: Widget login: unexpected title 'GARMIN Authentication Application'
```

`health_sync_status_{soul_id}.json` will contain `error_type: "rate_limit"` or `error_type: "mfa_required"` (the widget fallback hits Garmin's auth challenge page which looks like an MFA prompt but is actually bot detection).

**Fix: transfer a token from a non-rate-limited machine**

The in-app "Garmin Login" button does **not** fix this — it logs in from the same (blocked) server IP. The OAuth token is a single small JSON file; generate it on any machine whose IP Garmin does not block (your laptop, a home server, etc.) and copy it to the server.

**Step 1 — on your local machine:**

```bash
pip3 install garminconnect          # if not already installed
python3 /opt/sys/health-sync/garmin_token_export.py
```

Enter your Garmin email and password when prompted. The script prints one line:

```
TOKEN:eyJ...
```

Copy that line.

**Step 2 — on the server:**

```bash
python3 /opt/sys/health-sync/garmin_token_import.py
```

Paste the `TOKEN:...` line when prompted. The script saves the token and runs a quick connection test.

After this, `health_sync.py` will load the cached token instead of logging in and the rate limit becomes irrelevant.

---

### Token lifetime and automatic renewal

Garmin OAuth tokens consist of:

| Token | Lifetime | Purpose |
|---|---|---|
| `di_token` | hours | API access |
| `di_refresh_token` | ~30 days (rolling) | renews di_token |

Every sync calls `api.login(tokenstore=path)`. If the access token is about to expire, garminconnect refreshes it silently via the refresh token — **no new login, no rate-limit risk**.

As long as you sync at least once within that ~30-day window (via CLI, the `/health` page, or the `health_sync` MCP tool), the refresh token renews itself and tokens stay valid indefinitely. The export/import workaround above is only needed when both tokens expire (long gap without syncs) or the server IP was already blocked before the first successful login.

---

### Fresh server — no workaround needed

Running `install.sh` on a newly provisioned server avoids the rate-limit problem entirely: the IP is clean, the first login succeeds on the first attempt, and subsequent manual syncs keep the token fresh from then on.

---

### MFA / "GARMIN Authentication Application"

This title appears on Garmin's bot-detection page — it is **not** a two-factor authentication prompt. Garmin does not send any code by email in this scenario.

The cause is always the same: the server IP is rate-limited or flagged. If the in-app "Garmin Login" button (Settings → Gesundheit) reports this, the fix is the token export/import above, not an MFA code — the button re-tries from the same flagged IP and will hit the same wall.

If Garmin genuinely requests an MFA code (a real SMS code arrives), the in-app "Garmin Login" button handles that case directly — no SSH needed.

---

### Checking sync status

```bash
# Last sync result
cat /var/lib/sys/config/health_sync_status_<soul_id>.json

# Sync log
tail -50 /var/log/sys/health_sync.log

# Run manually
python3 /opt/sys/health-sync/health_sync.py
```

Or in-app: `/health` page (sync result banner) or Settings → Gesundheit (status line).

---

## Known Limitations

- Unofficial API — can break without warning
- Rate limit: `429` errors on too many login attempts → wait 2–4 hours, or use the token export/import workaround
- Sleep data sometimes missing (Garmin API inconsistency) → fallback to `get_stats()`
- Garmin authentication only works with email + password entered via the CLI installer, no OAuth and no in-app credential form
- The in-app "Garmin Login" button only resolves MFA challenges, not IP rate-limiting — both run from the server's IP

---

## Files

| Path | Purpose |
|---|---|
| `/var/lib/sys/config/health_sync_{soul_id}.json` | Garmin credentials + adapter config |
| `/var/lib/sys/config/health_sync_status_{soul_id}.json` | Last sync result (ok/error_type/message) |
| `/var/lib/sys/config/garmin_tokens/{soul_id}/garmin_tokens.json` | OAuth token cache |
| `/var/log/sys/health_sync.log` | Sync run output |
| `/opt/sys/health-sync/garmin_token_export.py` | Run locally to export a token |
| `/opt/sys/health-sync/garmin_token_import.py` | Run on the server to import a token |
