"""Writes health.md to vault/context/ — device-agnostic."""

from datetime import date
from pathlib import Path


def write_health_md(data: dict, soul_id: str) -> None:
    today = date.today()
    iso_cal = today.isocalendar()
    week_label = f"{iso_cal[0]}-W{iso_cal[1]:02d}"
    month_label = today.strftime("%Y-%m")

    def fmt_hr(v):
        return f"{v} bpm (avg)" if v is not None else "–"

    def fmt_sleep(minutes):
        if minutes is None:
            return "–"
        return f"{minutes // 60}h {minutes % 60:02d}min (avg)"

    def fmt_steps(v):
        return f"{v:,} (avg)".replace(",", ".") if v is not None else "–"

    monthly = data.get("monthly", {})

    content = f"""---
source: {data.get("source", "unknown")}
last_sync: {today.isoformat()}
---

## This Week ({week_label})
- Resting HR: {fmt_hr(data.get("resting_hr"))}
- Sleep: {fmt_sleep(data.get("sleep_minutes"))}
- Steps: {fmt_steps(data.get("steps"))}
- Active days: {data.get("active_days", "–")}

## Monthly Summary ({month_label})
- Resting HR: {fmt_hr(monthly.get("resting_hr"))}
- Sleep: {fmt_sleep(monthly.get("sleep_minutes"))}
- Active days: {monthly.get("active_days", "–")} / {today.day}
"""

    out_path = Path(f"/var/lib/sys/souls/{soul_id}/vault/context/health.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    print(f"  Written: {out_path}")
