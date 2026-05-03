#!/bin/bash
# recover-password.sh — Set a new gate password without losing soul data.
# Run on the VPS with SSH/root access when the gate password is forgotten.
# The soul and all vault data are preserved.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[soul]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo "  Passwort-Wiederherstellung"
echo "  ─────────────────────────"
echo ""

# ── Domain detection ──────────────────────────────────────────────────────────
DOMAIN=$(ls /etc/openresty/sites-enabled/ 2>/dev/null \
  | grep -v '^00-default' | head -1)

if [ -z "$DOMAIN" ]; then
  error "Keine Domain in /etc/openresty/sites-enabled/ gefunden."
fi

if [ -f "/var/lib/sys/config/$DOMAIN/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/$DOMAIN/master.json"
else
  MASTER_PATH="/var/lib/sys/config/master.json"
  [ -f "$MASTER_PATH" ] || error "master.json nicht gefunden."
fi

info "Domain: $DOMAIN"
info "Config: $MASTER_PATH"
echo ""

# ── Read current master key ───────────────────────────────────────────────────
MASTER_KEY=$(python3 -c "
import json, sys
with open('$MASTER_PATH') as f:
    d = json.load(f)
print(d.get('soul_master_key', ''))
")

[ -z "$MASTER_KEY" ] || [[ "$MASTER_KEY" != sys_* ]] && \
  error "soul_master_key fehlt oder hat falsches Format."

# Strip 'sys_' prefix to get the raw 64-char hex key
RAW_KEY="${MASTER_KEY#sys_}"

# ── New password ──────────────────────────────────────────────────────────────
echo -e "${YELLOW}  Neues Zugangspasswort (mindestens 8 Zeichen):${NC}"
while true; do
  read -s -p "  Neues Passwort:             " NEW_PWD; echo ""
  read -s -p "  Passwort bestätigen:        " NEW_PWD2; echo ""
  if [[ "${#NEW_PWD}" -lt 8 ]]; then
    warn "Mindestens 8 Zeichen erforderlich."
  elif [[ "$NEW_PWD" != "$NEW_PWD2" ]]; then
    warn "Passwörter stimmen nicht überein."
  else
    break
  fi
done
echo ""

# ── Compute new HMAC hash ─────────────────────────────────────────────────────
NEW_HASH=$(printf '%s' "gate_pw:${NEW_PWD}" \
  | openssl dgst -sha256 -mac HMAC -macopt "key:${RAW_KEY}" \
  | awk '{print $2}')

# ── Update master.json ────────────────────────────────────────────────────────
python3 -c "
import json
with open('$MASTER_PATH') as f:
    d = json.load(f)
d['access_password_hash'] = '$NEW_HASH'
with open('$MASTER_PATH', 'w') as f:
    json.dump(d, f, indent=2)
"

info "access_password_hash aktualisiert."

# ── Restart OpenResty to clear shared dict cache ──────────────────────────────
info "OpenResty neu starten (Gate-Cache leeren)..."
systemctl restart openresty

echo ""
echo -e "${GREEN}✓ Passwort erfolgreich geändert.${NC}"
echo "  Öffne https://$DOMAIN und melde dich mit dem neuen Passwort an."
echo ""
