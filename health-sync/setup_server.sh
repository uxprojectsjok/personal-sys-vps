#!/usr/bin/env bash
# Non-interactive SYS Health Sync setup — called via sudo from Lua/nginx.
# Credentials must already be saved via /api/health/config before running this.
set -euo pipefail

INSTALL_DIR="/opt/sys/health-sync"
VENV="$INSTALL_DIR/.venv"
CRON_FILE="/etc/cron.d/sys-health-sync"

# python3-venv installieren falls nötig
apt-get install -y -qq python3-venv 2>/dev/null || true

# Venv anlegen / aktualisieren
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip garminconnect

# Venv für www-data beschreibbar machen (pip install ohne sudo)
chown -R www-data:www-data "$VENV"

# System-Cron anlegen (läuft als www-data, jeden Montag 06:00)
cat > "$CRON_FILE" <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 6 * * 1 www-data /opt/sys/health-sync/.venv/bin/python3 /opt/sys/health-sync/health_sync.py >> /var/log/sys_health_sync.log 2>&1
EOF
chmod 644 "$CRON_FILE"

echo '{"ok":true,"message":"Setup abgeschlossen. Garmin-Login als nächsten Schritt ausführen."}'
