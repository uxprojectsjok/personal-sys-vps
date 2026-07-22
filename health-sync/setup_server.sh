#!/usr/bin/env bash
# Non-interactive SYS Health Sync setup — called via sudo from Lua/nginx.
# Credentials must already be saved via /api/health/config before running this.
set -euo pipefail

INSTALL_DIR="/opt/sys/health-sync"
VENV="$INSTALL_DIR/.venv"

# python3-venv installieren falls nötig
apt-get install -y -qq python3-venv 2>/dev/null || true

# Venv anlegen / aktualisieren
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip garminconnect cryptography

# Venv für www-data beschreibbar machen (pip install ohne sudo)
chown -R www-data:www-data "$VENV"

# Log-Verzeichnis für www-data beschreibbar machen — /var/log selbst gehört
# root:syslog (775), www-data kann dort keine neue Datei anlegen
mkdir -p /var/log/sys
chown www-data:www-data /var/log/sys
chmod 750 /var/log/sys

echo '{"ok":true,"message":"Setup abgeschlossen. Garmin-Login als nächsten Schritt ausführen."}'
