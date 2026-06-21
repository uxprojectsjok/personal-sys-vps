#!/usr/bin/env bash
# SYS Health Sync — Experiment Installer
# Docs: /opt/sys/docs/experiments/health-sync.md
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="/var/lib/sys/config"
SOULS_DIR="/var/lib/sys/souls"
LOG_FILE="/var/log/sys_health_sync.log"

echo ""
echo "=== SYS Health Sync — Experiment Setup ==="
echo ""
echo "⚠  This is an experiment, not a core SYS feature."
echo "   Use at your own risk. See docs/experiments/health-sync.md."
echo ""
read -p "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[yY]$ ]] || { echo "Aborted."; exit 0; }

# ── Dependencies ──────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required."
  exit 1
fi

echo ""
echo "Installing python3-venv…"
apt-get install -y python3-venv -qq

VENV="$INSTALL_DIR/.venv"
echo "Setting up virtual environment…"
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q garminconnect
echo "python-garminconnect installed in $VENV"

# ── Detect souls ──────────────────────────────────────────────────────────────
souls=()
for d in "$SOULS_DIR"/*/; do
  [[ -d "$d" ]] && souls+=("$(basename "$d")")
done

if [[ ${#souls[@]} -eq 0 ]]; then
  echo "Error: no souls found at $SOULS_DIR. Set up your node first."
  exit 1
fi

echo ""
if [[ ${#souls[@]} -eq 1 ]]; then
  SOUL_ID="${souls[0]}"
  echo "Soul detected: ${SOUL_ID:0:8}…"
else
  echo "Multiple souls found:"
  for i in "${!souls[@]}"; do
    echo "  $((i+1)). ${souls[$i]}"
  done
  read -p "Select soul (1-${#souls[@]}): " choice
  SOUL_ID="${souls[$((choice-1))]}"
fi

# ── Adapter selection ─────────────────────────────────────────────────────────
echo ""
echo "Available adapters: garmin, apple_health, oura"
read -p "Adapter [garmin]: " ADAPTER
ADAPTER="${ADAPTER:-garmin}"

GARMIN_MODEL="garmin_fr235"
if [[ "$ADAPTER" == "garmin" ]]; then
  read -p "Garmin device model [garmin_fr235]: " model_input
  GARMIN_MODEL="${model_input:-garmin_fr235}"
fi

# ── Per-soul config path ──────────────────────────────────────────────────────
CONFIG_FILE="$CONFIG_DIR/health_sync_${SOUL_ID}.json"

# ── Credentials ───────────────────────────────────────────────────────────────
echo ""
if [[ "$ADAPTER" == "garmin" ]]; then
  echo "=== Garmin Connect Credentials ==="
  echo "Stored in $CONFIG_FILE (chmod 600). Never leave this server."
  echo ""
  read -p "Garmin email: " GARMIN_EMAIL
  read -s -p "Garmin password: " GARMIN_PASSWORD
  echo ""
fi

# ── Write config ──────────────────────────────────────────────────────────────
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" <<EOF
{
  "adapter": "$ADAPTER",
  "soul_id": "$SOUL_ID",
  "garmin_email": "${GARMIN_EMAIL:-}",
  "garmin_password": "${GARMIN_PASSWORD:-}",
  "garmin_model": "$GARMIN_MODEL"
}
EOF
chown www-data:www-data "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
echo "Config written to $CONFIG_FILE (permissions: 600, owner: www-data)"

# ── Cron job ──────────────────────────────────────────────────────────────────
CRON_CMD="0 6 * * 1 $VENV/bin/python $INSTALL_DIR/health_sync.py >> $LOG_FILE 2>&1"
(crontab -l 2>/dev/null | grep -v "health_sync.py"; echo "$CRON_CMD") | crontab -
echo "Cron added: every Monday 06:00 → $LOG_FILE"

# ── First sync ────────────────────────────────────────────────────────────────
echo ""
echo "Running first sync (this may take ~30 seconds for 30 days of data)…"
echo ""
SYNC_OK=0
"$VENV/bin/python" "$INSTALL_DIR/health_sync.py" && SYNC_OK=1 || true

# Check structured status file for MFA requirement
STATUS_FILE="$CONFIG_DIR/health_sync_status_${SOUL_ID}.json"
if [ "$SYNC_OK" -eq 0 ] && [ -f "$STATUS_FILE" ]; then
  ERROR_TYPE=$(python3 -c "import json,sys; d=json.load(open('$STATUS_FILE')); print(d.get('error_type',''))" 2>/dev/null || echo "")
  if [[ "$ERROR_TYPE" == "mfa_required" || "$ERROR_TYPE" == "rate_limit" ]]; then
    echo ""
    echo "┌─────────────────────────────────────────────────────────────┐"
    echo "│  Garmin requires a one-time MFA verification.               │"
    echo "│  Run the interactive login now:                             │"
    echo "│                                                             │"
    echo "│    python3 $INSTALL_DIR/garmin_login.py  │"
    echo "│                                                             │"
    echo "│  After that, automatic sync runs without MFA.               │"
    echo "└─────────────────────────────────────────────────────────────┘"
    echo ""
    read -p "Run Garmin MFA login now? [Y/n] " do_mfa
    if [[ ! "$do_mfa" =~ ^[nN]$ ]]; then
      "$VENV/bin/python" "$INSTALL_DIR/garmin_login.py"
    else
      echo "  Skipped. Run later: python3 $INSTALL_DIR/garmin_login.py"
    fi
  fi
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "health.md → $SOULS_DIR/$SOUL_ID/vault/context/health.md"
echo "Logs      → $LOG_FILE"
echo "Config    → $CONFIG_FILE"
echo "Remove    → crontab -e  (delete the health_sync.py line) + rm $CONFIG_FILE"
echo ""
