"""Garmin Connect adapter — uses python-garminconnect (unofficial API).

WARNING: Garmin Connect has no public API. This library reverse-engineers the
private web API and can break without notice after Garmin app updates.
"""

import time
from datetime import date, timedelta
from statistics import mean


def get_data(config: dict) -> dict:
    try:
        from garminconnect import Garmin
    except ImportError:
        raise RuntimeError(
            "python-garminconnect not installed. Run: pip3 install garminconnect"
        )

    api = Garmin(config["garmin_email"], config["garmin_password"])
    api.login()

    today = date.today()

    def fetch_days(count, start_offset=1):
        hr_vals, sleep_vals, step_vals, active = [], [], [], 0
        for i in range(start_offset, start_offset + count):
            d = (today - timedelta(days=i)).isoformat()
            try:
                stats = api.get_stats(d)
                rhr = stats.get("restingHeartRate")
                sleep_sec = stats.get("totalSleepTimeInSeconds")
                steps = stats.get("totalSteps")
                if rhr:
                    hr_vals.append(rhr)
                if sleep_sec:
                    sleep_vals.append(sleep_sec // 60)
                if steps:
                    step_vals.append(steps)
                    if steps > 500:
                        active += 1
            except Exception:
                pass
            time.sleep(0.3)
        return hr_vals, sleep_vals, step_vals, active

    print("  Fetching last 7 days…")
    w_hr, w_sleep, w_steps, w_active = fetch_days(7, start_offset=1)

    print("  Fetching last 30 days…")
    m_hr, m_sleep, _, m_active = fetch_days(30, start_offset=1)

    return {
        "source": config.get("garmin_model", "garmin_fr235"),
        "resting_hr":    round(mean(w_hr))    if w_hr    else None,
        "sleep_minutes": round(mean(w_sleep)) if w_sleep else None,
        "steps":         round(mean(w_steps)) if w_steps else None,
        "active_days":   w_active,
        "monthly": {
            "resting_hr":    round(mean(m_hr))    if m_hr    else None,
            "sleep_minutes": round(mean(m_sleep)) if m_sleep else None,
            "active_days":   m_active,
        },
    }
