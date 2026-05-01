#!/bin/bash
# Personal SYS VPS — Init Script
# Runs on a fresh Ubuntu 24.04 VPS.
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/SaveYourSoul_init/main/init.sh | bash
# Or:    bash init.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[soul]${NC} $1"; }
warn()    { echo -e "${YELLOW}[warn]${NC} $1"; }
error()   { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ── 1. Input ──────────────────────────────────────────────────────────────────
echo ""
echo "  ███████╗ ██████╗ ██╗   ██╗██╗     "
echo "  ██╔════╝██╔═══██╗██║   ██║██║     "
echo "  ███████╗██║   ██║██║   ██║██║     "
echo "  ╚════██║██║   ██║██║   ██║██║     "
echo "  ███████║╚██████╔╝╚██████╔╝███████╗"
echo "  ╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝"
echo "  Personal SYS VPS Setup"
echo ""

read -p "Your domain (e.g. soul.yourdomain.com): " DOMAIN
read -p "Your email (for SSL certificate): " EMAIL
[[ -z "$DOMAIN" || -z "$EMAIL" ]] && error "Domain and email are required."

# ── 2. System packages ────────────────────────────────────────────────────────
info "Installing system packages..."
apt-get update -qq
apt-get install -y -qq openresty certbot python3-certbot-nginx unzip curl

# ── 3. Directory structure ────────────────────────────────────────────────────
info "Creating directory structure..."
mkdir -p /var/lib/sys/config
mkdir -p /var/lib/sys/souls
mkdir -p /var/www/"$DOMAIN"
mkdir -p /etc/openresty/lua
mkdir -p /etc/openresty/sites-enabled

chown -R www-data:www-data /var/lib/sys
chmod 750 /var/lib/sys/config

# ── 4. Lua scripts ────────────────────────────────────────────────────────────
info "Installing Lua scripts..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/

# ── 5. Master Key generieren ──────────────────────────────────────────────────
info "Generating Soul Master Key..."
RAW_KEY=$(openssl rand -hex 32)
MASTER_KEY="sys_${RAW_KEY}"

cat > /var/lib/sys/config/master.json <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0
}
EOF
chmod 600 /var/lib/sys/config/master.json
chown www-data:www-data /var/lib/sys/config/master.json

# ── 6. nginx config ───────────────────────────────────────────────────────────
info "Configuring nginx for $DOMAIN..."

# nginx.conf — nur schreiben wenn noch nicht vorhanden
if [ ! -f /etc/openresty/nginx.conf ] || ! grep -q "sites-enabled" /etc/openresty/nginx.conf 2>/dev/null; then
  sed "s/{{DOMAIN}}/$DOMAIN/g" \
    "$SCRIPT_DIR/server/openresty/nginx.conf.template" \
    > /etc/openresty/nginx.conf
fi

# vhost
mkdir -p /etc/openresty/sites-enabled
sed "s/{{DOMAIN}}/$DOMAIN/g; s/{{EMAIL}}/$EMAIL/g" \
  "$SCRIPT_DIR/server/openresty/vhost.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

# ── 7. SSL ────────────────────────────────────────────────────────────────────
info "Requesting SSL certificate for $DOMAIN..."
# certonly --webroot: Certbot legt Validierungsdateien unter webroot ab,
# OpenResty (kein nginx-Plugin) serviert sie über /.well-known/acme-challenge/.
# Der vhost muss dafür bereits laufen (openresty -s reload davor).
openresty -t && openresty -s reload
certbot certonly --webroot \
  -w /var/www/"$DOMAIN" \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

# ── 8. OpenResty neu starten ──────────────────────────────────────────────────
info "Starting OpenResty..."
systemctl enable openresty
systemctl restart openresty

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Your Soul Node is ready.${NC}"
echo ""
echo "  URL:    https://$DOMAIN"
echo "  Data:   /var/lib/sys/souls/"
echo "  Config: /var/lib/sys/config/master.json"
echo ""
echo "  Open https://$DOMAIN in your browser to create your Soul."
echo "  This node accepts exactly one Soul — the first one to register is the owner."
echo ""
warn "Change your root password now: passwd"
echo ""
