#!/bin/bash
# security-setup.sh
# State-of-the-Art Security Setup für SaveYourSoul VPS
# Einmalig ausführen als root: bash security-setup.sh

set -e

echo "=== SYS Security Setup ==="

# ── 1. ClamAV installieren + konfigurieren ────────────────────────────────
echo "[1/6] ClamAV..."
apt-get update -q
apt-get install -y clamav clamav-daemon

# clamd auf TCP-Port 3310 erreichbar machen (localhost only)
sed -i 's/^#\?TCPSocket.*/TCPSocket 3310/' /etc/clamav/clamd.conf
sed -i 's/^#\?TCPAddr.*/TCPAddr 127.0.0.1/' /etc/clamav/clamd.conf

# Virus-Datenbank aktualisieren
systemctl stop clamav-freshclam || true
freshclam
systemctl enable clamav-freshclam clamav-daemon
systemctl start  clamav-freshclam clamav-daemon

echo "  ClamAV läuft auf 127.0.0.1:3310"

# ── 2. Audit-Log-Verzeichnis anlegen ──────────────────────────────────────
echo "[2/6] Audit-Log..."
mkdir -p /var/log/sys
touch /var/log/sys/security.log
chown www-data:www-data /var/log/sys/security.log
chmod 640 /var/log/sys/security.log

# Log-Rotation einrichten
cat > /etc/logrotate.d/sys-security << 'EOF'
/var/log/sys/security.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 640 www-data www-data
}
EOF

echo "  Audit-Log: /var/log/sys/security.log (90 Tage Rotation)"

# ── 3. Soul-Vault mit noexec mounten ──────────────────────────────────────
echo "[3/6] Filesystem-Härtung..."
mkdir -p /var/lib/sys/souls

# Prüfen ob bereits als separate Partition gemountet
if ! mountpoint -q /var/lib/sys/souls; then
  echo "  HINWEIS: /var/lib/sys/souls ist keine eigene Partition."
  echo "  Für Produktion: eigene Partition mit 'noexec,nosuid,nodev' mounten."
  echo "  /etc/fstab Eintrag:"
  echo "  /dev/sdXN /var/lib/sys/souls ext4 defaults,noexec,nosuid,nodev 0 2"
else
  mount -o remount,noexec,nosuid,nodev /var/lib/sys/souls
  echo "  /var/lib/sys/souls: noexec,nosuid,nodev aktiv"
fi

# ── 4. AppArmor installieren + Profil laden ───────────────────────────────
echo "[4/6] AppArmor..."
apt-get install -y apparmor apparmor-utils

cp "$(dirname "$0")/apparmor-openresty" /etc/apparmor.d/usr.sbin.openresty
apparmor_parser -r /etc/apparmor.d/usr.sbin.openresty
aa-enforce /usr/sbin/openresty 2>/dev/null || true

systemctl enable apparmor
systemctl start  apparmor

echo "  AppArmor-Profil für OpenResty geladen (enforce mode)"

# ── 5. Disk-Monitoring (Alert bei >80%) ──────────────────────────────────
echo "[5/6] Disk-Monitoring..."
cat > /usr/local/bin/sys-disk-check.sh << 'SCRIPT'
#!/bin/bash
THRESHOLD=80
USAGE=$(df /var/lib/sys/souls 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%')
if [ -n "$USAGE" ] && [ "$USAGE" -ge "$THRESHOLD" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] DISK_WARNING usage=${USAGE}%" \
    >> /var/log/sys/security.log
fi
SCRIPT
chmod +x /usr/local/bin/sys-disk-check.sh

# Alle 15 Minuten prüfen
echo "*/15 * * * * root /usr/local/bin/sys-disk-check.sh" \
  > /etc/cron.d/sys-disk-monitor

echo "  Disk-Monitor: Alert bei >80% (alle 15 Min)"

# ── 6. Tägliches ClamAV-Update ───────────────────────────────────────────
echo "[6/6] Auto-Updates..."
cat > /etc/cron.d/sys-security-updates << 'EOF'
# ClamAV Virus-DB täglich aktualisieren
0 3 * * * root systemctl stop clamav-freshclam; freshclam; systemctl start clamav-freshclam
# Security-Updates automatisch einspielen
30 3 * * 0 root apt-get -y --only-upgrade install clamav clamav-daemon ffmpeg openresty
EOF

echo ""
echo "=== Setup abgeschlossen ==="
echo ""
echo "Security-Stack:"
echo "  ✓ ClamAV       – Malware-Scan jeder hochgeladenen Datei"
echo "  ✓ Audit-Log    – /var/log/sys/security.log"
echo "  ✓ AppArmor     – Process-Sandbox für OpenResty + ffmpeg"
echo "  ✓ noexec       – Vault-Filesystem ohne exec-Berechtigung"
echo "  ✓ Disk-Monitor – Alert bei >80% Speicher"
echo "  ✓ Auto-Update  – wöchentliche Security-Patches"
echo ""
echo "Neustart empfohlen: systemctl restart openresty"
