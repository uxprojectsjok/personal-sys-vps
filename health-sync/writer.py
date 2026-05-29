"""Writes health.md to vault/context/ — device-agnostic.

Preserves ## Food Log and ## Annual Journal sections so that
the weekly health sync does not wipe manually logged meals.
"""

import re
from datetime import date
from pathlib import Path


def _extract_section(text: str, header: str) -> str:
    """Return the content of a ## section (without the header line), or ''."""
    pattern = rf"## {re.escape(header)}\n([\s\S]*?)(?=\n## |\Z)"
    m = re.search(pattern, text)
    return m.group(1).rstrip() if m else ""


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

    monthly    = data.get("monthly", {})
    activities = data.get("recent_activities", [])

    out_path = Path(f"/var/lib/sys/souls/{soul_id}/vault/context/health.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if activities:
        act_lines = []
        for a in activities:
            label = a.get("type", "unknown").replace("_", " ")
            parts = [f"- {a.get('date', '?')}  {label}"]
            dur = a.get("duration_min", 0)
            dist = a.get("distance_km", 0)
            hr = a.get("avg_hr")
            if dur:   parts.append(f"{dur} min")
            if dist:  parts.append(f"{dist} km")
            if hr:    parts.append(f"♥ {hr} bpm")
            act_lines.append("  ".join(parts))
        activities_block = "\n## Recent Activities\n" + "\n".join(act_lines) + "\n"
    else:
        activities_block = ""

    # Preserve Food Log and Annual Journal from previous write
    food_log_block    = ""
    annual_journal_block = ""
    if out_path.exists():
        existing = out_path.read_text(encoding="utf-8")
        fl = _extract_section(existing, "Food Log")
        aj = _extract_section(existing, "Annual Journal")
        if fl:
            food_log_block = f"\n\n## Food Log\n{fl}"
        if aj:
            annual_journal_block = f"\n\n## Annual Journal\n{aj}"

    content = (
        f"---\n"
        f"source: {data.get('source', 'unknown')}\n"
        f"last_sync: {today.isoformat()}\n"
        f"---\n"
        f"\n"
        f"## This Week ({week_label})\n"
        f"- Resting HR: {fmt_hr(data.get('resting_hr'))}\n"
        f"- Sleep: {fmt_sleep(data.get('sleep_minutes'))}\n"
        f"- Steps: {fmt_steps(data.get('steps'))}\n"
        f"- Active days: {data.get('active_days', '–')}\n"
        f"{activities_block}"
        f"\n"
        f"## Monthly Summary ({month_label})\n"
        f"- Resting HR: {fmt_hr(monthly.get('resting_hr'))}\n"
        f"- Sleep: {fmt_sleep(monthly.get('sleep_minutes'))}\n"
        f"- Active days: {monthly.get('active_days', '–')} / {today.day}"
        f"{food_log_block}"
        f"{annual_journal_block}\n"
    )

    out_path.write_text(content, encoding="utf-8")
    try:
        import shutil
        shutil.chown(out_path, user="www-data", group="www-data")
    except Exception:
        pass
    print(f"  Written: {out_path}")
