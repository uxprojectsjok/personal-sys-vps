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
echo "  ███████╗██╗   ██╗███████╗    ██╗███╗   ██╗██╗████████╗"
echo "  ██╔════╝╚██╗ ██╔╝██╔════╝    ██║████╗  ██║██║╚══██╔══╝"
echo "  ███████╗ ╚████╔╝ ███████╗    ██║██╔██╗ ██║██║   ██║   "
echo "  ╚════██║  ╚██╔╝  ╚════██║    ██║██║╚██╗██║██║   ██║   "
echo "  ███████║   ██║   ███████║    ██║██║ ╚████║██║   ██║   "
echo "  ╚══════╝   ╚═╝   ╚══════╝    ╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝   "
echo "  Personal SYS VPS Setup"
echo ""
echo -e "${YELLOW}  Hinweis: Du brauchst eine Domain (z.B. soul.deinname.de) die per${NC}"
echo -e "${YELLOW}  A-Eintrag auf die IP dieses Servers zeigt. Ohne DNS-Eintrag${NC}"
echo -e "${YELLOW}  schlägt die SSL-Zertifizierung fehl. (Keine Pflicht — nur Info.)${NC}"
echo ""

# ── 1. Input ──────────────────────────────────────────────────────────────────
read -p "  Deine Domain (z.B. soul.deinname.de):      " DOMAIN
read -p "  Deine E-Mail (für SSL-Zertifikat):         " EMAIL
read -p "  Anthropic API Key (sk-ant-...):            " ANTHROPIC_KEY
[[ -z "$DOMAIN" || -z "$EMAIL" || -z "$ANTHROPIC_KEY" ]] && error "Domain, E-Mail und API Key sind erforderlich."

echo ""
echo -e "${YELLOW}  Optional: WalletConnect Project ID (für Blockchain-Anchoring).${NC}"
echo -e "${YELLOW}  Kostenlos erstellen: cloud.walletconnect.com → New Project${NC}"
echo -e "${YELLOW}  Leer lassen → Anchoring-Feature deaktiviert.${NC}"
read -p "  WalletConnect Project ID (optional):      " WC_PROJECT_ID

echo ""
echo -e "${YELLOW}  Zugangspasswort für den Gate-Schutz deines Nodes.${NC}"
echo -e "${YELLOW}  Mindestens 8 Zeichen. Dieses Passwort schützt die gesamte Oberfläche.${NC}"
while true; do
  read -s -p "  Zugangspasswort:             " ACCESS_PWD; echo ""
  read -s -p "  Zugangspasswort bestätigen: " ACCESS_PWD2; echo ""
  [[ "${#ACCESS_PWD}" -ge 8 ]] && [[ "$ACCESS_PWD" == "$ACCESS_PWD2" ]] && break
  if [[ "${#ACCESS_PWD}" -lt 8 ]]; then
    warn "Mindestens 8 Zeichen erforderlich."
  else
    warn "Passwörter stimmen nicht überein."
  fi
done
echo ""

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

# lua-resty-http für server-seitige HTTP-Callbacks (Cross-Domain Peer-Handshake)
info "Installing lua-resty-http..."
/usr/local/openresty/bin/opm install ledgetech/lua-resty-http

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

# ── 8. Master Key + Gate-Passwort-Hash ───────────────────────────────────────
info "Generating Soul Master Key..."
RAW_KEY=$(openssl rand -hex 32)
MASTER_KEY="sys_${RAW_KEY}"

# Gate-Passwort-Hash: HMAC-SHA256(master_key_raw, "gate_pw:" + password)
# master_key ohne sys_-Prefix als ASCII-String (64 Hex-Zeichen) → passt zu hmac_helper.lua
GATE_HASH=$(printf '%s' "gate_pw:${ACCESS_PWD}" \
  | openssl dgst -sha256 -mac HMAC -macopt "key:${RAW_KEY}" \
  | awk '{print $2}')

mkdir -p /var/lib/sys/config/"$DOMAIN"
cat > /var/lib/sys/config/"$DOMAIN"/master.json <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "${GATE_HASH}"
}
EOF
chmod 600 /var/lib/sys/config/"$DOMAIN"/master.json
chown www-data:www-data /var/lib/sys/config/"$DOMAIN"/master.json

# ── 9. nginx config — Phase 1: HTTP-only ──────────────────────────────────────
info "Configuring OpenResty (HTTP-only, Phase 1)..."
mkdir -p /usr/local/openresty/nginx/logs

if [ ! -f /etc/openresty/nginx.conf ]; then
  sed "s/{{DOMAIN}}/$DOMAIN/g" \
    "$SCRIPT_DIR/server/openresty/nginx.conf.template" \
    > /etc/openresty/nginx.conf
  info "nginx.conf erstellt."
else
  info "nginx.conf bereits vorhanden — überspringe Überschreibung."
  # Fehlende Zonen idempotent eintragen
  for ZONE_LINE in \
    "limit_req_zone \$binary_remote_addr zone=chat_api:10m rate=2r/s;" \
    "limit_req_zone \$binary_remote_addr zone=vault_upload:10m rate=5r/s;" \
    "limit_req_zone \$binary_remote_addr zone=gate:10m rate=5r/m;"; do
    ZONE_NAME=$(echo "$ZONE_LINE" | grep -oP 'zone=\K[^:]+')
    if ! grep -q "zone=${ZONE_NAME}" /etc/openresty/nginx.conf; then
      sed -i "/# Rate limit zones/a\\  ${ZONE_LINE}" /etc/openresty/nginx.conf
      info "Zone ${ZONE_NAME} zu nginx.conf hinzugefügt."
    fi
  done
fi

sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/vhost-http.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

openresty -t && systemctl restart openresty

# ── 10. SSL certificate ───────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}  SSL-Zertifikat — leer lassen für Let's Encrypt (automatisch).${NC}"
echo -e "${YELLOW}  Oder Pfade zu vorhandenem Zertifikat eintragen (z.B. Wildcard).${NC}"
read -p "  fullchain.pem (leer = Let's Encrypt): " SSL_CERT
read -p "  privkey.pem   (leer = Let's Encrypt): " SSL_KEY

if [[ -n "$SSL_CERT" || -n "$SSL_KEY" ]]; then
  [[ ! -f "$SSL_CERT" ]] && error "Zertifikat nicht gefunden: $SSL_CERT"
  [[ ! -f "$SSL_KEY"  ]] && error "Schlüssel nicht gefunden: $SSL_KEY"
  info "Vorhandenes Zertifikat wird verwendet."
else
  info "Requesting SSL certificate for $DOMAIN..."
  certbot certonly --webroot \
    -w /var/www/"$DOMAIN" \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive
  SSL_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  SSL_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
fi

# ── 11. nginx config — Phase 2: HTTPS ─────────────────────────────────────────
info "Activating HTTPS vhost (Phase 2)..."
sed \
  -e "s|{{DOMAIN}}|$DOMAIN|g" \
  -e "s|{{SSL_CERT}}|$SSL_CERT|g" \
  -e "s|{{SSL_KEY}}|$SSL_KEY|g" \
  "$SCRIPT_DIR/server/openresty/vhost.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

# ── 12. .env setup ────────────────────────────────────────────────────────────
info "Setting up .env..."
cd "$SCRIPT_DIR"
[ ! -f .env ] && cp .env.example .env

sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|"    .env
sed -i "s|^SOUL_MASTER_KEY=.*|SOUL_MASTER_KEY=$MASTER_KEY|"           .env
sed -i "s|^API_SIGNING_KEY=.*|API_SIGNING_KEY=$(openssl rand -hex 32)|" .env
[ -n "$WC_PROJECT_ID" ] && \
  sed -i "s|^WALLETCONNECT_PROJECT_ID=.*|WALLETCONNECT_PROJECT_ID=$WC_PROJECT_ID|" .env

info "ANTHROPIC_API_KEY, SOUL_MASTER_KEY und API_SIGNING_KEY eingetragen"
[ -n "$WC_PROJECT_ID" ] && info "WALLETCONNECT_PROJECT_ID eingetragen" || \
  warn "Kein WalletConnect Project ID — Blockchain-Anchoring deaktiviert."
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
echo "  Config: /var/lib/sys/config/$DOMAIN/master.json"
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
