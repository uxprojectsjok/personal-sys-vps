#!/bin/bash
# recover-password.sh — Set a new gate password without losing soul data.
# Run on the VPS with SSH/root access when the gate password is forgotten.
# The soul and all vault data are preserved.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo "  Password Recovery"
echo "  ─────────────────────────"
echo "  Apache License 2.0 · github.com/uxprojectsjok/sys-installer"
echo "  Use at your own risk. No warranty. Always back up your data."
echo ""

# ── Domain detection ──────────────────────────────────────────────────────────
DOMAIN=""
for SITES_DIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  if [ -d "$SITES_DIR" ]; then
    DOMAIN=$(ls "$SITES_DIR" 2>/dev/null | grep -v '^00-default' | head -1)
    [ -n "$DOMAIN" ] && break
  fi
done

# master.json: domain-specific → global → any subdirectory
MASTER_PATH=""
if [ -n "$DOMAIN" ] && [ -f "/var/lib/sys/config/$DOMAIN/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/$DOMAIN/master.json"
elif [ -f "/var/lib/sys/config/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/master.json"
else
  MASTER_PATH=$(find /var/lib/sys/config -name "master.json" 2>/dev/null | head -1)
fi

[ -n "$MASTER_PATH" ] || error "master.json not found. Run init.sh first."

[ -n "$DOMAIN" ] && info "Domain: $DOMAIN" || info "Domain: (not detected)"
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
  error "soul_master_key missing or has wrong format."

# Strip 'sys_' prefix to get the raw 64-char hex key
RAW_KEY="${MASTER_KEY#sys_}"

# ── New password ──────────────────────────────────────────────────────────────
echo -e "${YELLOW}  New access password (at least 8 characters):${NC}"
while true; do
  read -s -p "  New password:               " NEW_PWD; echo ""
  read -s -p "  Confirm password:           " NEW_PWD2; echo ""
  if [[ "${#NEW_PWD}" -lt 8 ]]; then
    warn "Minimum 8 characters required."
  elif [[ "$NEW_PWD" != "$NEW_PWD2" ]]; then
    warn "Passwords do not match."
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

# Also update global fallback (backward compatibility)
GLOBAL_MASTER="/var/lib/sys/config/master.json"
if [ -f "$GLOBAL_MASTER" ] && [ "$MASTER_PATH" != "$GLOBAL_MASTER" ]; then
  python3 -c "
import json
with open('$GLOBAL_MASTER') as f:
    d = json.load(f)
d['access_password_hash'] = '$NEW_HASH'
with open('$GLOBAL_MASTER', 'w') as f:
    json.dump(d, f, indent=2)
"
  info "Global fallback master.json also updated."
fi

info "access_password_hash updated."

# ── Restart/Reload OpenResty to clear shared dict cache ──────────────────────
# On shared servers: reload only (other sites stay active, gate_sessions TTL 2 min)
_NON_DEFAULT_SITES=0
for _SDIR in /etc/openresty/sites-enabled /usr/local/openresty/nginx/conf/sites-enabled; do
  [ -d "$_SDIR" ] || continue
  for _F in "$_SDIR"/*; do
    [ -f "$_F" ] || continue
    [[ "$(basename "$_F")" == "00-default"* ]] && continue
    _NON_DEFAULT_SITES=$((_NON_DEFAULT_SITES + 1))
  done
done

if [ "$_NON_DEFAULT_SITES" -gt 1 ]; then
  info "Shared server: reloading OpenResty (other sites remain active)."
  info "(gate_sessions expire naturally within 2 minutes)"
  openresty -t && systemctl reload openresty 2>/dev/null || true
else
  info "Restarting OpenResty (clearing gate cache)..."
  systemctl restart openresty
fi

echo ""
echo -e "${GREEN}✓ Password changed successfully.${NC}"
echo "  Open https://$DOMAIN and sign in with the new password."
echo ""
