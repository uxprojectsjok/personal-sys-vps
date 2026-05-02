#!/bin/bash
# Personal SYS VPS — Init Script
# Runs on a fresh Ubuntu 24.04 VPS.
# Usage: bash init.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[soul]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo "  ███████╗ ██████╗ ██╗   ██╗██╗     "
echo "  ██╔════╝██╔═══██╗██║   ██║██║     "
echo "  ███████╗██║   ██║██║   ██║██║     "
echo "  ╚════██║██║   ██║██║   ██║██║     "
echo "  ███████║╚██████╔╝╚██████╔╝███████╗"
echo "  ╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝"
echo "  Personal SYS VPS Setup"
echo ""
echo -e "${YELLOW}  Hinweis: Du brauchst eine Domain (z.B. soul.deinname.de) die per${NC}"
echo -e "${YELLOW}  A-Eintrag auf die IP dieses Servers zeigt. Ohne DNS-Eintrag${NC}"
echo -e "${YELLOW}  schlägt die SSL-Zertifizierung fehl. (Keine Pflicht — nur Info.)${NC}"
echo ""

# ── 1. Input ──────────────────────────────────────────────────────────────────
read -p "  Deine Domain (z.B. soul.deinname.de): " DOMAIN
read -p "  Deine E-Mail (für SSL-Zertifikat):     " EMAIL
[[ -z "$DOMAIN" || -z "$EMAIL" ]] && error "Domain und E-Mail sind erforderlich."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 2. OpenResty repository ───────────────────────────────────────────────────
info "Adding OpenResty repository..."
curl -fsSL https://openresty.org/package/pubkey.gpg | apt-key add -
echo "deb http://openresty.org/package/ubuntu $(lsb_release -cs) main" \
  > /etc/apt/sources.list.d/openresty.list
apt-get update -qq

# ── 3. System packages ────────────────────────────────────────────────────────
info "Installing system packages..."

# Prevent services from auto-starting during apt (nginx would block port 80)
echo '#!/bin/sh
exit 101' > /usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d

apt-get install -y -qq openresty certbot unzip curl git

rm /usr/sbin/policy-rc.d

systemctl stop nginx    2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
systemctl start openresty

# ── 4. Node.js 20 ─────────────────────────────────────────────────────────────
info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

# ── 5. Swap (2 GB) ────────────────────────────────────────────────────────────
# Nuxt build exceeds 2 GB RAM without swap on small VPS instances
info "Setting up swap (2 GB)..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap  /swapfile
  swapon  /swapfile
fi

# ── 6. Directory structure ────────────────────────────────────────────────────
info "Creating directory structure..."
mkdir -p /var/lib/sys/config
mkdir -p /var/lib/sys/souls
mkdir -p /var/www/"$DOMAIN"
mkdir -p /etc/openresty/lua
mkdir -p /etc/openresty/sites-enabled

chown -R www-data:www-data /var/lib/sys
chmod 750 /var/lib/sys/config
chown -R www-data:www-data /var/www/"$DOMAIN"
chmod -R 755 /var/www/"$DOMAIN"

# ── 7. Lua scripts ────────────────────────────────────────────────────────────
info "Installing Lua scripts..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/

# ── 8. Master Key ─────────────────────────────────────────────────────────────
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

# ── 9. nginx config — Phase 1: HTTP-only ──────────────────────────────────────
info "Configuring OpenResty (HTTP-only, Phase 1)..."
mkdir -p /usr/local/openresty/nginx/logs
sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/nginx.conf.template" \
  > /etc/openresty/nginx.conf

sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/vhost-http.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

openresty -t && systemctl restart openresty

# ── 10. SSL certificate ───────────────────────────────────────────────────────
info "Requesting SSL certificate for $DOMAIN..."
certbot certonly --webroot \
  -w /var/www/"$DOMAIN" \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

# ── 11. nginx config — Phase 2: HTTPS ─────────────────────────────────────────
info "Activating HTTPS vhost (Phase 2)..."
sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/vhost.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

# ── 12. .env setup ────────────────────────────────────────────────────────────
info "Setting up .env..."
cd "$SCRIPT_DIR"
[ ! -f .env ] && cp .env.example .env

echo ""
echo "  ── API-Keys eingeben ──────────────────────────────────────────"
echo ""

# Anthropic API Key (Pflicht)
read -p "  Anthropic API Key (sk-ant-...): " ANTHROPIC_KEY
while [[ -z "$ANTHROPIC_KEY" ]]; do
  warn "Anthropic API Key ist erforderlich."
  read -p "  Anthropic API Key (sk-ant-...): " ANTHROPIC_KEY
done
sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env

# Optionale Keys — Enter überspringt
echo ""
echo -e "  ${YELLOW}Optionale Dienste — einfach Enter drücken zum Überspringen${NC}"
echo ""
read -p "  WalletConnect Project ID  (Enter = überspringen): " WC_KEY
[ -n "$WC_KEY" ] && sed -i "s|^WALLETCONNECT_PROJECT_ID=.*|WALLETCONNECT_PROJECT_ID=$WC_KEY|" .env

read -p "  Spotify Client ID         (Enter = überspringen): " SP_KEY
[ -n "$SP_KEY" ] && sed -i "s|^SPOTIFY_CLIENT_ID=.*|SPOTIFY_CLIENT_ID=$SP_KEY|" .env

read -p "  YouTube Client ID         (Enter = überspringen): " YT_KEY
[ -n "$YT_KEY" ] && sed -i "s|^YOUTUBE_CLIENT_ID=.*|YOUTUBE_CLIENT_ID=$YT_KEY|" .env

# SOUL_MASTER_KEY auto-inject aus master.json (bereits generiert in Schritt 8)
GENERATED_KEY=$(python3 -c "import json; d=json.load(open('/var/lib/sys/config/master.json')); print(d.get('soul_master_key',''))" 2>/dev/null || echo "")
if [ -n "$GENERATED_KEY" ]; then
  sed -i "s|^SOUL_MASTER_KEY=.*|SOUL_MASTER_KEY=$GENERATED_KEY|" .env
  info "SOUL_MASTER_KEY automatisch eingetragen"
fi
echo ""

# ── 13. Frontend build ────────────────────────────────────────────────────────
info "Building frontend (npm install + generate)..."
cd "$SCRIPT_DIR"
npm install --silent
NODE_OPTIONS="--max-old-space-size=2048" npm run generate

info "Stripping CSP meta tags..."
cd "$SCRIPT_DIR/utils" && node killMetas.mjs
cd "$SCRIPT_DIR"

info "Deploying frontend to /var/www/$DOMAIN..."
cp -r "$SCRIPT_DIR/.output/public/." /var/www/"$DOMAIN"/
chown -R www-data:www-data /var/www/"$DOMAIN"

# ── 14. OpenResty final restart ───────────────────────────────────────────────
info "Restarting OpenResty..."
systemctl enable openresty
systemctl restart openresty

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Dein Soul Node ist ready.${NC}"
echo ""
echo "  URL:    https://$DOMAIN"
echo "  Data:   /var/lib/sys/souls/"
echo "  Config: /var/lib/sys/config/master.json"
echo ""
echo "  Öffne https://$DOMAIN im Browser um deine Soul zu erstellen."
echo "  Dieser Node akzeptiert genau eine Soul — wer sich zuerst registriert, ist Eigentümer."
echo ""
echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${RED}│  ⚠️  Wichtig: Ändere jetzt dein Server-Passwort!                 │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│  Tippe im schwarzen Fenster:                                     │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│      passwd                                                      │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│  Vergib ein neues sicheres Passwort — das ist dein Schutz        │${NC}"
echo -e "${RED}│  gegen unbefugten Zugriff auf diesen Server.                     │${NC}"
echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
