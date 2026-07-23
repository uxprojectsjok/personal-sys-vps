#!/bin/bash
# Personal SYS VPS — Complete Uninstall
# Removes everything init.sh installed and leaves a clean Ubuntu server.
# Does NOT affect the OS, firewall rules, or any non-SYS packages.
#
# Difference to reset.sh:
#   reset.sh   — removes one Soul, server stays installed and running
#   deinstall.sh — removes the entire SYS installation, naked Ubuntu remains

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo "  ██████╗ ███████╗███████╗███████╗████████╗"
echo "  ██╔══██╗██╔════╝██╔════╝██╔════╝╚══██╔══╝"
echo "  ██████╔╝█████╗  ███████╗█████╗     ██║   "
echo "  ██╔══██╗██╔══╝  ╚════██║██╔══╝     ██║   "
echo "  ██║  ██║███████╗███████║███████╗   ██║   "
echo "  ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   "
echo "  Personal SYS VPS — Complete Uninstall"
echo "  Apache License 2.0 · github.com/uxprojectsjok/sys-installer"
echo "  Use at your own risk. No warranty. Always back up your data."
echo ""

read -p "Domain that was configured (e.g. soul.yourdomain.com): " DOMAIN
[[ -z "$DOMAIN" ]] && error "Domain required."

# ── Shared server detection ───────────────────────────────────────────────────
# Checks whether other sites beside the SYS domain are active.
# If yes: OpenResty, Node.js and /etc/openresty are left untouched.
SHARED_SERVER=false
for _SDIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  [ -d "$_SDIR" ] || continue
  for _F in "$_SDIR"/*; do
    [ -f "$_F" ] || continue
    _BASE=$(basename "$_F")
    [[ "$_BASE" == "00-default"* ]]      && continue
    [[ "$_BASE" == "$DOMAIN" ]]          && continue
    [[ "$_BASE" == "internal-soul-api" ]] && continue
    SHARED_SERVER=true
    break 2
  done
done

echo ""
if $SHARED_SERVER; then
  warn "Shared server detected — other sites are active."
  warn "WARNING: The following SYS data will be permanently deleted:"
  warn "  · Soul data under /var/lib/sys/"
  warn "  · SSL certificate for $DOMAIN (optional)"
  warn "  · /var/www/$DOMAIN/"
  warn "  · SYS Lua scripts in /etc/openresty/lua/"
  warn "  · SYS vhost config for $DOMAIN"
  warn "  · soul-mcp service"
  warn "  · Claude Code MCP config for $DOMAIN"
  warn ""
  warn "NOT deleted (used by other sites):"
  warn "  · OpenResty (package + /etc/openresty/)"
  warn "  · Node.js"
  warn "  · Certbot"
  warn "  · Swap file"
else
  warn "WARNING: All SYS data on this VPS will be permanently deleted."
  warn "  · All soul data under /var/lib/sys/"
  warn "  · SSL certificate for $DOMAIN"
  warn "  · OpenResty, Node.js, Certbot"
  warn "  · Claude Code CLI + MCP config"
  warn "  · /var/www/$DOMAIN/"
  warn "  · Swap file /swapfile"
  warn "  · /etc/openresty/"
fi
echo ""
warn "Make sure you have a backup of your soul (.soul-bundle or sys.md)."
echo ""
read -p "Really uninstall? (yes/no): " CONFIRM
[[ "$CONFIRM" != "yes" ]] && error "Cancelled."

# ── 0. Network deregistration (before stopping services) ─────────────────────
# Deregister all souls — important for multi-hoster where multiple UUIDs may exist.
info "Deregistering souls from network..."
SOUL_DATA_DIR="/var/lib/sys/souls"
DEREGISTER_SOUL_IDS=()
if [ -d "$SOUL_DATA_DIR" ]; then
  for d in "$SOUL_DATA_DIR"/*/; do
    [ -d "$d" ] || continue
    CANDIDATE=$(basename "$d")
    if [[ "$CANDIDATE" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      DEREGISTER_SOUL_IDS+=("$CANDIDATE")
    fi
  done
fi

if [ ${#DEREGISTER_SOUL_IDS[@]} -eq 0 ]; then
  info "No souls found — skipping deregistration."
else
  # ── 0a. Peer-Verbindungen trennen (vor Service-Stop, damit Verify-Callback noch geht) ──
  info "Disconnecting peer connections..."
  for DEREGISTER_SOUL_ID in "${DEREGISTER_SOUL_IDS[@]}"; do
    CONN_FILE="$SOUL_DATA_DIR/$DEREGISTER_SOUL_ID/soul_connections.json"
    [ -f "$CONN_FILE" ] || continue

    # Cert berechnen (HMAC-SHA256, gleiche Logik wie hmac_helper.lua)
    _MASTER_JSON="/var/lib/sys/config/master.json"
    _SOUL_ADMIN="$SOUL_DATA_DIR/$DEREGISTER_SOUL_ID/soul_admin.json"
    _RAW_KEY=""
    # Per-soul key (Multi-Hoster) hat Vorrang
    if [ -f "$_SOUL_ADMIN" ]; then
      _RAW_KEY=$(python3 -c "
import json, sys
try:
  d=json.load(open('$_SOUL_ADMIN'))
  k=d.get('soul_master_key','')
  print(k[4:] if k.startswith('sys_') and len(k)==68 else '')
except: print('')
" 2>/dev/null || echo "")
    fi
    if [ -z "$_RAW_KEY" ] && [ -f "$_MASTER_JSON" ]; then
      _RAW_KEY=$(python3 -c "
import json
try:
  d=json.load(open('$_MASTER_JSON'))
  k=d.get('soul_master_key','')
  print(k[4:] if k.startswith('sys_') and len(k)==68 else '')
except: print('')
" 2>/dev/null || echo "")
    fi

    if [ -z "$_RAW_KEY" ]; then
      warn "No master key found for $DEREGISTER_SOUL_ID — skipping peer disconnect."
    else
      # cert_version aus api_context.json
      _CV=$(python3 -c "
import json
try:
  d=json.load(open('$SOUL_DATA_DIR/$DEREGISTER_SOUL_ID/api_context.json'))
  print(d.get('soul_cert_version', d.get('cert_version', 0)))
except: print(0)
" 2>/dev/null || echo "0")
      if [ "$_CV" -gt 0 ] 2>/dev/null; then
        _HMAC_MSG="${DEREGISTER_SOUL_ID}:${_CV}"
      else
        _HMAC_MSG="$DEREGISTER_SOUL_ID"
      fi
      _CERT=$(printf '%s' "$_HMAC_MSG" | openssl dgst -sha256 -hmac "$_RAW_KEY" 2>/dev/null \
        | awk '{print $2}' | cut -c1-32)

      # Alle Peer-Verbindungen per DELETE-API trennen (gleicher Pfad wie UI-Button)
      _PEERS=$(python3 -c "
import json
try:
  d=json.load(open('$CONN_FILE'))
  conns=d if isinstance(d,list) else d.get('connections',[])
  for c in conns:
    sid=c.get('soul_id','')
    if sid: print(sid)
except: pass
" 2>/dev/null || true)

      for _PEER_ID in $_PEERS; do
        _HTTP_RES=$(curl -s -o /dev/null -w "%{http_code}" -m 10 \
          -X DELETE "https://$DOMAIN/api/vault/connections/$_PEER_ID" \
          -H "Authorization: Bearer ${DEREGISTER_SOUL_ID}.${_CERT}" 2>/dev/null || echo "000")
        if [ "$_HTTP_RES" = "200" ]; then
          info "  Peer disconnected: $_PEER_ID"
        else
          warn "  Peer disconnect failed (HTTP $_HTTP_RES): $_PEER_ID — remote may still show connection."
        fi
      done
    fi
  done

  for DEREGISTER_SOUL_ID in "${DEREGISTER_SOUL_IDS[@]}"; do
    # Notify local indexer — remove soul from index immediately
    curl -s -m 5 -X POST http://127.0.0.1:3098/internal/deregister-soul \
      -H 'Content-Type: application/json' \
      -d "{\"soul_id\":\"$DEREGISTER_SOUL_ID\"}" 2>/dev/null && \
      info "Soul removed from local index ($DEREGISTER_SOUL_ID)." || true

    # Look for Pinata JWT — for IPFS-wide deregistration (other nodes see active:false)
    PINATA_JWT_VAL=""
    for jwt_file in \
      "$SOUL_DATA_DIR/$DEREGISTER_SOUL_ID/pinata_jwt" \
      "/var/lib/sys/pinata_jwt"; do
      if [ -f "$jwt_file" ]; then
        PINATA_JWT_VAL=$(cat "$jwt_file" 2>/dev/null | tr -d '[:space:]')
        [ -n "$PINATA_JWT_VAL" ] && break
      fi
    done

    if [ -n "$PINATA_JWT_VAL" ]; then
      DEREG_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      DEREG_JSON="{\"active\":false,\"soul_id\":\"$DEREGISTER_SOUL_ID\",\"deregistered\":\"$DEREG_TS\",\"protocol\":\"saveyoursoul/1.0\"}"
      DEREG_BODY="{\"pinataContent\":$DEREG_JSON,\"pinataMetadata\":{\"name\":\"soul-deregister-$DEREGISTER_SOUL_ID\"}}"
      PINATA_RESP=$(curl -s -m 15 -X POST "https://api.pinata.cloud/pinning/pinJSONToIPFS" \
        -H "Authorization: Bearer $PINATA_JWT_VAL" \
        -H "Content-Type: application/json" \
        -d "$DEREG_BODY" 2>/dev/null || true)
      NEW_CID=$(echo "$PINATA_RESP" | grep -oP '(?<="IpfsHash":")[^"]+' || true)
      if [ -n "$NEW_CID" ]; then
        info "Soul deregistered from IPFS network: $DEREGISTER_SOUL_ID (CID: $NEW_CID)."
      else
        warn "IPFS deregistration failed for $DEREGISTER_SOUL_ID (Pinata unreachable or JWT invalid)."
      fi
    else
      warn "No Pinata JWT for $DEREGISTER_SOUL_ID — deregistered locally only."
    fi
  done
fi

# ── 1. Stop services ──────────────────────────────────────────────────────────
info "Stopping services..."

# soul-mcp always stopped (belongs to SYS)
if command -v pm2 &>/dev/null; then
  if $SHARED_SERVER; then
    # Shared Server: nur soul-mcp entfernen, andere PM2-Prozesse unangetastet
    timeout 10 pm2 stop   soul-mcp 2>/dev/null || true
    timeout 10 pm2 delete soul-mcp 2>/dev/null || true
  else
    timeout 10 pm2 stop all    2>/dev/null || true
    timeout 10 pm2 delete all  2>/dev/null || true
    timeout 10 pm2 kill        2>/dev/null || true
  fi
fi
timeout 10 systemctl stop    soul-mcp  2>/dev/null || true
timeout 10 systemctl disable soul-mcp  2>/dev/null || true

# Stop OpenResty only on dedicated servers
if $SHARED_SERVER; then
  info "Shared server: OpenResty stays active (other sites still running)."
else
  timeout 10 systemctl stop    openresty 2>/dev/null || true
  timeout 10 systemctl disable openresty 2>/dev/null || true
  if systemctl list-units --type=service 2>/dev/null | grep -q 'nginx.service'; then
    timeout 10 systemctl stop    nginx 2>/dev/null || true
    timeout 10 systemctl disable nginx 2>/dev/null || true
  fi
fi

# ── 2. SSL-Zertifikat ────────────────────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
DELETE_CERT=true

if [ -f "$CERT_PATH" ]; then
  # Check whether certificate is still valid (not expired)
  if openssl x509 -checkend 0 -noout -in "$CERT_PATH" 2>/dev/null; then
    CERT_EXPIRY=$(openssl x509 -noout -enddate -in "$CERT_PATH" 2>/dev/null \
      | cut -d= -f2)
    echo ""
    echo -e "${GREEN}  ✓ Valid Let's Encrypt certificate found.${NC}"
    echo -e "    Expires: $CERT_EXPIRY"
    echo ""
    echo -e "${YELLOW}  Recommendation: keep the certificate.${NC}"
    echo -e "${YELLOW}  Let's Encrypt allows only 5 certificates per domain in 7 days.${NC}"
    echo -e "${YELLOW}  If you reinstall the same node, you can reuse this certificate${NC}"
    echo -e "${YELLOW}  in init.sh by entering the paths when prompted.${NC}"
    echo ""
    read -p "  Delete certificate anyway? (yes/no) [no]: " DEL_CONFIRM
    [[ "$DEL_CONFIRM" == "yes" ]] && DELETE_CERT=true || DELETE_CERT=false
  else
    echo ""
    warn "Certificate expired — will be deleted."
  fi
fi

if $DELETE_CERT; then
  info "Removing SSL certificate for $DOMAIN..."
  if command -v certbot &>/dev/null; then
    certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || \
      warn "  certbot delete failed — certificate may already be removed."
  fi
  rm -rf /etc/letsencrypt/live/"$DOMAIN"    2>/dev/null || true
  rm -rf /etc/letsencrypt/archive/"$DOMAIN" 2>/dev/null || true
  rm -f  /etc/letsencrypt/renewal/"$DOMAIN".conf 2>/dev/null || true
else
  info "SSL certificate kept: $CERT_PATH"
  echo -e "  → Enter these paths the next time you run init.sh:"
  echo -e "    fullchain.pem: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  echo -e "    privkey.pem:   /etc/letsencrypt/live/$DOMAIN/privkey.pem"
  echo ""
fi

# ── 2b. Remove Claude Code ───────────────────────────────────────────────────
# init.sh registers the MCP server as "SaveYourSoul-<domain>" (dots preserved).
# Claude Code may also normalise dots→underscores internally, so try both forms.
MCP_NAME_DOT="SaveYourSoul-${DOMAIN}"
MCP_NAME_US="SaveYourSoul-${DOMAIN//./_}"

# Always remove the MCP server entry for this domain (user-level config)
if command -v claude &>/dev/null; then
  info "Removing Claude Code MCP config for $DOMAIN..."
  _MCP_REMOVED=false
  claude mcp remove "$MCP_NAME_DOT" 2>/dev/null && _MCP_REMOVED=true || true
  claude mcp remove "$MCP_NAME_US"  2>/dev/null && _MCP_REMOVED=true || true
  if $_MCP_REMOVED; then
    info "  Claude Code MCP server removed."
  else
    info "  No Claude Code MCP entry found — already removed or never registered."
  fi
fi

# Remove .bashrc snippet added by init.sh
if grep -q "sys-claude-key" /root/.bashrc 2>/dev/null; then
  info "Removing ANTHROPIC_API_KEY loader from /root/.bashrc..."
  # Remove lines between the comment and the closing fi (inclusive)
  sed -i '/# sys-claude-key:/,/^fi$/d' /root/.bashrc 2>/dev/null || true
fi

if $SHARED_SERVER; then
  info "Shared server: Claude Code package kept (may be used outside SYS)."
else
  # Dedicated server: uninstall the package while Node.js is still present
  if command -v npm &>/dev/null; then
    info "Uninstalling Claude Code..."
    npm uninstall -g @anthropic-ai/claude-code 2>/dev/null && \
      info "  Claude Code uninstalled." || \
      warn "  npm uninstall failed — remove manually: npm uninstall -g @anthropic-ai/claude-code"
  fi
fi

# ── 3. Remove packages ────────────────────────────────────────────────────────
if $SHARED_SERVER; then
  info "Shared server: packages (OpenResty, Node.js, Certbot) remain installed."
else
  info "Removing OpenResty..."
  apt-get remove --purge -y openresty 2>/dev/null || true

  info "Removing Certbot..."
  if $DELETE_CERT; then
    apt-get remove --purge -y certbot 2>/dev/null || true
  else
    apt-get remove -y certbot 2>/dev/null || true
  fi

  info "Removing Node.js..."
  apt-get remove --purge -y nodejs 2>/dev/null || true

  apt-get autoremove -y 2>/dev/null || true

  info "Removing package repositories..."
  rm -f /etc/apt/sources.list.d/openresty.list
  rm -f /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq 2>/dev/null || true

  info "Removing swap..."
  if swapon --show | grep -q /swapfile 2>/dev/null; then
    swapoff /swapfile
  fi
  rm -f /swapfile
  sed -i '/\/swapfile/d' /etc/fstab 2>/dev/null || true
fi

# ── 4. Remove SYS systemd drop-in ────────────────────────────────────────────
info "Removing SYS systemd environment files..."
rm -f /etc/systemd/system/soul-mcp.service 2>/dev/null || true
rm -f /etc/systemd/system/openresty.service.d/sys-node.conf 2>/dev/null || true
# Older installs wrote env.conf — only remove on dedicated servers
# (on shared servers env.conf may contain variables belonging to other apps)
if ! $SHARED_SERVER; then
  rm -f /etc/systemd/system/openresty.service.d/env.conf 2>/dev/null || true
fi
systemctl daemon-reload

# ── 5. Remove SYS nginx config ───────────────────────────────────────────────
info "Removing SYS vhost and nginx config..."

# Remove vhost for this domain from sites-available and sites-enabled
for _SDIR in \
  /etc/openresty/sites-available \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-available \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  rm -f "$_SDIR/$DOMAIN" 2>/dev/null || true
  # internal-soul-api: immer SYS-eigen (127.0.0.1:8081), nie fremd — sicher zu entfernen
  rm -f "$_SDIR/internal-soul-api" 2>/dev/null || true
done

if $SHARED_SERVER; then
  # Remove only SYS-owned Lua scripts (via manifest written by init.sh)
  _LUA_MANIFEST=/var/lib/sys/config/lua-manifest.txt
  if [ -f "$_LUA_MANIFEST" ]; then
    while IFS= read -r _SCRIPT; do
      rm -f "/etc/openresty/lua/$_SCRIPT" 2>/dev/null || true
      rm -f "/usr/local/openresty/nginx/conf/lua/$_SCRIPT" 2>/dev/null || true
    done < "$_LUA_MANIFEST"
    info "SYS Lua scripts removed ($(wc -l < "$_LUA_MANIFEST") files)."
  else
    warn "No Lua manifest found — Lua scripts NOT removed."
    warn "Clean up manually: /etc/openresty/lua/soul_*.lua, gate_*.lua, vault_*.lua etc."
  fi

  # Remove sys-node-globals.conf + include line from nginx.conf
  rm -f /etc/openresty/sys-node-globals.conf 2>/dev/null || true
  for _NC in /etc/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf; do
    [ -f "$_NC" ] || continue
    if grep -q "sys-node-globals.conf" "$_NC"; then
      sed -i '/sys-node-globals.conf/d' "$_NC"
      info "SYS include removed from $_NC."
    fi
  done

  # Reload OpenResty (no downtime for other sites)
  info "Reloading OpenResty (other sites remain active)..."
  openresty -t && systemctl reload openresty 2>/dev/null || \
    warn "OpenResty reload failed — check manually."
else
  # Dedicated server: remove entire /etc/openresty
  rm -rf /etc/openresty
fi

# ── 6. Remove data directories ───────────────────────────────────────────────
info "Removing data directories..."
rm -rf /var/lib/sys
rm -rf /var/www/"$DOMAIN"
rm -rf /opt/sys

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ SYS completely uninstalled.${NC}"
echo ""
echo "  The Ubuntu OS and all other packages are untouched."
echo ""
warn "DNS: The A record for $DOMAIN must be deleted manually at your DNS provider."
echo ""
echo "  To reinstall:"
echo "    cd /root"
echo "    git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys"
echo "    cd /opt/sys && bash init.sh"
echo ""
