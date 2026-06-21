# Health Sync — Troubleshooting

## Garmin rate limit (429)

### Why it happens

Garmin rate-limits server IP addresses that attempt too many logins in a short
time. This typically occurs when the stored OAuth token expires and
`health_sync.py` retries the full login repeatedly (e.g. from failed cron runs).
Home and mobile IPs are treated more leniently than data-center IPs.

### Symptoms

```
mobile+cffi returned 429: Mobile login returned 429 — IP rate limited by Garmin
mobile+requests returned 429: Mobile login returned 429 — IP rate limited by Garmin
widget+cffi failed: Widget login: unexpected title 'GARMIN Authentication Application'
```

`health_sync_status_{soul_id}.json` will contain `error_type: "rate_limit"` or
`error_type: "mfa_required"` (the widget fallback hits Garmin's auth challenge
page which looks like an MFA prompt but is actually bot detection).

### Fix: transfer token from a non-rate-limited machine

The OAuth token is a single small JSON file. Generate it on any machine whose
IP Garmin does not block (your laptop, a home server, etc.) and copy it to the
server.

**Step 1 — on your local machine:**

```bash
pip3 install garminconnect          # if not already installed
python3 /opt/sys/health-sync/garmin_token_export.py
```

Enter your Garmin email and password when prompted.  
The script prints one line:

```
TOKEN:eyJ...
```

Copy that line.

**Step 2 — on the server:**

```bash
python3 /opt/sys/health-sync/garmin_token_import.py
```

Paste the `TOKEN:...` line when prompted. The script saves the token and runs a
quick connection test.

After this, `health_sync.py` will load the cached token instead of logging in
and the rate limit becomes irrelevant.

---

## Token lifetime and automatic renewal

Garmin OAuth tokens consist of:

| Token | Lifetime | Purpose |
|---|---|---|
| `di_token` | hours | API access |
| `di_refresh_token` | ~30 days (rolling) | renews di_token |

Every time `health_sync.py` runs it calls `api.login(tokenstore=path)`.
If the access token is about to expire, garminconnect refreshes it silently via
the refresh token — **no new login, no rate-limit risk**.

As long as the weekly cron runs, the refresh token renews itself and tokens
stay valid indefinitely. The export/import workaround is only needed when both
tokens expire (long gap without syncs) or the server IP was already blocked
before the first successful login.

---

## Fresh server — no workaround needed

`init.sh` includes an optional Garmin Health Sync setup step.  
Running it on a newly provisioned server avoids the rate-limit problem entirely:
the IP is clean, `garmin_login.py` succeeds on the first attempt, and the
weekly cron keeps the token fresh from then on.

```
init.sh
  …
  Set up Garmin Health Sync? [y/N]  →  y
  Garmin email / password           →  enter credentials
  Logging in…                       →  token saved
  Cron: every Monday 06:00          →  set
```

---

## MFA / "GARMIN Authentication Application"

This title appears on Garmin's bot-detection page — it is **not** a two-factor
authentication prompt. Garmin does not send any code by email in this scenario.

The cause is always the same: the server IP is rate-limited or flagged.  
The fix is the token export/import above, not an MFA code.

---

## Checking sync status

```bash
# Last sync result
cat /var/lib/sys/config/health_sync_status_<soul_id>.json

# Sync log
tail -50 /var/log/sys_health_sync.log

# Run manually
python3 /opt/sys/health-sync/health_sync.py
```

## Files

| Path | Purpose |
|---|---|
| `/var/lib/sys/config/health_sync_{soul_id}.json` | Garmin credentials + adapter config |
| `/var/lib/sys/config/health_sync_status_{soul_id}.json` | Last sync result (ok/error_type/message) |
| `/var/lib/sys/config/garmin_tokens/{soul_id}/garmin_tokens.json` | OAuth token cache |
| `/var/log/sys_health_sync.log` | Cron output |
| `/opt/sys/health-sync/garmin_token_export.py` | Run locally to export token |
| `/opt/sys/health-sync/garmin_token_import.py` | Run on server to import token |
