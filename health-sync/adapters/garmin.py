"""Garmin Connect adapter — uses python-garminconnect (unofficial API).

WARNING: Garmin Connect has no public API. This library reverse-engineers the
private web API and can break without notice after Garmin app updates.

Session persistence: after first login the OAuth tokens are saved to
TOKEN_DIR and reused on subsequent syncs — no MFA prompt needed again.
"""

import os
import time
from datetime import date, timedelta
from statistics import mean

TOKEN_DIR_BASE = "/var/lib/sys/config/garmin_tokens"


def get_data(config: dict, soul_id: str = None) -> dict:
    try:
        from garminconnect import Garmin
    except ImportError:
        raise RuntimeError(
            "python-garminconnect not installed. Run: pip3 install garminconnect"
        )

    token_dir = os.path.join(TOKEN_DIR_BASE, soul_id) if soul_id else None
    if token_dir:
        os.makedirs(token_dir, exist_ok=True)

    api = Garmin(config["garmin_email"], config["garmin_password"])

    # 1. Try saved session (no MFA needed)
    logged_in = False
    if token_dir and os.path.isdir(token_dir) and os.listdir(token_dir):
        try:
            api.login(tokenstore=token_dir)
            logged_in = True
        except Exception as e:
            print(f"  Session expired or invalid ({e}), re-authenticating…")

    # 2. Fresh login — Garmin may require MFA here
    if not logged_in:
        api.login()
        # Save session for future headless syncs
        if token_dir:
            try:
                api.garth.dump(token_dir)
            except Exception:
                pass

    today = date.today()

    def fetch_sleep(d_str):
        try:
            s = api.get_sleep_data(d_str)
            daily = s.get("dailySleepDTO") or {}
            sec = daily.get("sleepTimeSeconds") or daily.get("totalSleepTimeInSeconds")
            if sec and sec > 0:
                return sec // 60
        except Exception:
            pass
        try:
            stats = api.get_stats(d_str)
            sec = stats.get("totalSleepTimeInSeconds")
            if sec and sec > 0:
                return sec // 60
        except Exception:
            pass
        return None

    def fetch_activities(limit=15):
        try:
            acts = api.get_activities(0, limit)
            result = []
            for a in acts:
                type_key = (a.get("activityType") or {}).get("typeKey", "unknown")
                dist_m   = a.get("distance") or 0
                dur_s    = a.get("duration") or 0
                result.append({
                    "date":         (a.get("startTimeLocal") or "")[:10],
                    "type":         type_key,
                    "duration_min": round(dur_s / 60) if dur_s else 0,
                    "distance_km":  round(dist_m / 1000, 1) if dist_m else 0,
                    "avg_hr":       a.get("averageHR"),
                })
            return result
        except Exception:
            return []

    def fetch_days(count, start_offset=0):
        hr_vals, sleep_vals, step_vals = [], [], []
        active = 0
        for i in range(start_offset, start_offset + count):
            d = (today - timedelta(days=i)).isoformat()
            try:
                stats = api.get_stats(d)
                rhr   = stats.get("restingHeartRate")
                steps = stats.get("totalSteps")
                highly = stats.get("highlyActiveSeconds") or 0
                if rhr:
                    hr_vals.append(rhr)
                if steps:
                    step_vals.append(steps)
                if highly >= 1800:
                    active += 1
            except Exception:
                pass
            mins = fetch_sleep(d)
            if mins:
                sleep_vals.append(mins)
            time.sleep(0.3)
        return hr_vals, sleep_vals, step_vals, active

    print("  Fetching last 7 days…")
    w_hr, w_sleep, w_steps, w_active = fetch_days(7, start_offset=0)

    print("  Fetching last 30 days…")
    m_hr, m_sleep, _, m_active = fetch_days(30, start_offset=0)

    print("  Fetching recent activities…")
    activities = fetch_activities(20)

    return {
        "source": config.get("garmin_model", "garmin_fr235"),
        "resting_hr":    round(mean(w_hr))    if w_hr    else None,
        "sleep_minutes": round(mean(w_sleep)) if w_sleep else None,
        "steps":         round(mean(w_steps)) if w_steps else None,
        "active_days":   w_active,
        "recent_activities": [a for a in activities if a["date"] >= (today - timedelta(days=14)).isoformat()],
        "monthly": {
            "resting_hr":    round(mean(m_hr))    if m_hr    else None,
            "sleep_minutes": round(mean(m_sleep)) if m_sleep else None,
            "active_days":   m_active,
        },
    }
