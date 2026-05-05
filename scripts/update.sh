#!/bin/bash
# Personal SYS VPS — Update Script
# Aktualisiert Lua-Skripte und Frontend OHNE master.json oder Config anzufassen.
# Verwendung: cd /opt/sys && git pull origin editorial-v2 && bash scripts/update.sh

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Domain erkennen ───────────────────────────────────────────────────────────
DOMAIN=$(ls /etc/openresty/sites-enabled/ 2>/dev/null | head -1)
if [ -z "$DOMAIN" ]; then
  read -p "  Domain (z.B. soul.deinname.de): " DOMAIN
fi
[ -z "$DOMAIN" ] && error "Domain nicht gefunden."
info "Domain: $DOMAIN"

# ── Lua-Skripte kopieren ──────────────────────────────────────────────────────
info "Lua-Skripte aktualisieren..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/
info "Lua-Skripte kopiert ✓"

# ── Frontend rebuild ──────────────────────────────────────────────────────────
info "Frontend neu bauen (npm install + generate)..."
cd "$SCRIPT_DIR"
npm install --silent
NODE_OPTIONS="--max-old-space-size=2048" npm run generate

info "CSP-Meta-Tags entfernen..."
cd "$SCRIPT_DIR/utils" && node killMetas.mjs
cd "$SCRIPT_DIR"

# ── Deploy ─────────────────────────────────────────────────────────────────────
info "Frontend deployen nach /var/www/$DOMAIN..."
cp -r "$SCRIPT_DIR/.output/public/." /var/www/"$DOMAIN"/
chown -R www-data:www-data /var/www/"$DOMAIN"
info "Frontend deployed ✓"

# ── OpenResty neu starten ─────────────────────────────────────────────────────
info "OpenResty neu starten..."
systemctl restart openresty
info "OpenResty gestartet ✓"

echo ""
echo -e "${GREEN}✓ Update abgeschlossen.${NC}"
echo "  URL: https://$DOMAIN"
echo ""
