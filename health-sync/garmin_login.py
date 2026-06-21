#!/usr/bin/env python3
"""Einmalige interaktive Garmin-Anmeldung mit MFA.
Danach sind die Session-Token gespeichert und der automatische Sync läuft ohne MFA.

Aufruf: python3 /opt/sys/health-sync/garmin_login.py
"""
import json, os, sys
from pathlib import Path

CONFIG_DIR = Path("/var/lib/sys/config")
TOKEN_BASE  = Path("/var/lib/sys/config/garmin_tokens")

# Soul-ID aus Config ermitteln
configs = list(CONFIG_DIR.glob("health_sync_*.json"))
if not configs:
    print("Keine health_sync-Config gefunden. Erst in den Settings einrichten.")
    sys.exit(1)

config_path = configs[0]
with open(config_path) as f:
    config = json.load(f)

soul_id  = config.get("soul_id", config_path.stem.replace("health_sync_", ""))
email    = config["garmin_email"]
password = config["garmin_password"]
token_dir = TOKEN_BASE / soul_id
token_dir.mkdir(parents=True, exist_ok=True)

print(f"\n  Garmin Login für: {email}")
print(f"  Session wird gespeichert in: {token_dir}\n")

sys.path.insert(0, str(Path(__file__).parent))
venv_site = Path(__file__).parent / ".venv/lib"
for p in venv_site.glob("python*/site-packages"):
    sys.path.insert(0, str(p))

from garminconnect import Garmin

def mfa_prompt():
    print("\n  Garmin verlangt einen Bestätigungscode.")
    print("  Schau in deine E-Mail oder Authenticator-App.")
    return input("  MFA-Code eingeben: ").strip()

api = Garmin(email, password, prompt_mfa=mfa_prompt)

print("  Anmelden…")
try:
    api.login(tokenstore=str(token_dir))
    print("  Session aus Token geladen — kein MFA nötig.")
except Exception:
    api.login()

try:
    api.garth.dump(str(token_dir))
    print(f"\n  Session gespeichert. Automatischer Sync läuft jetzt ohne MFA.")
except Exception as e:
    print(f"  Session konnte nicht gespeichert werden: {e}")

# Kurztest
try:
    stats = api.get_stats(str(__import__("datetime").date.today()))
    rhr = stats.get("restingHeartRate", "?")
    print(f"  Test OK — Ruhepuls heute: {rhr} bpm")
except Exception as e:
    print(f"  Verbunden, aber Datenabruf fehlgeschlagen: {e}")
