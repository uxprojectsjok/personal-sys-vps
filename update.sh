#!/bin/bash
# Personal SYS VPS — Update Script
# Zieht den aktuellen Stand von Git und deployed Lua + Frontend neu.
# Usage: bash /opt/sys/update.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info "Pulling latest changes from git..."
git -C "$SCRIPT_DIR" pull --ff-only || error "git pull fehlgeschlagen. Bitte manuell prüfen."

# ── Lua-Files deployen ────────────────────────────────────────────────────────
info "Deploying Lua files to /etc/openresty/lua/ ..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/
info "Lua files updated."

# ── OpenResty neu laden ───────────────────────────────────────────────────────
info "Reloading OpenResty..."
systemctl reload openresty && info "OpenResty reloaded ✓" || warn "OpenResty reload fehlgeschlagen."

# ── Frontend neu bauen (optional) ─────────────────────────────────────────────
if [ -d "$SCRIPT_DIR/app" ]; then
  DOMAIN=$(ls /etc/openresty/sites-enabled/ 2>/dev/null | grep -v "default\|\.conf" | head -1)
  if [ -z "$DOMAIN" ]; then
    warn "Domain konnte nicht automatisch ermittelt werden — Frontend nicht neu gebaut."
    warn "Manuell: cd $SCRIPT_DIR/app && npm run generate && cp -r .output/public/. /var/www/<DOMAIN>/"
  else
    info "Building frontend for $DOMAIN ..."
    cd "$SCRIPT_DIR/app"
    npm run generate -- --dotenv "$SCRIPT_DIR/.env" 2>&1 | tail -5
    node "$SCRIPT_DIR/utils/killMetas.mjs" 2>/dev/null || true
    cp -r .output/public/. /var/www/"$DOMAIN"/
    chown -R www-data:www-data /var/www/"$DOMAIN"
    info "Frontend deployed to /var/www/$DOMAIN/ ✓"
    cd "$SCRIPT_DIR"
  fi
fi

# ── soul-mcp neu starten ──────────────────────────────────────────────────────
if systemctl is-active --quiet soul-mcp 2>/dev/null; then
  info "Restarting soul-mcp..."
  systemctl restart soul-mcp && info "soul-mcp restarted ✓" || warn "soul-mcp restart fehlgeschlagen."
fi

echo ""
info "Update abgeschlossen."
node "$SCRIPT_DIR/utils/project-hash.mjs" 2>/dev/null | tail -3 || true
