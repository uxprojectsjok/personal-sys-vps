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
echo -e "${YELLOW}  (Eingabe wird aus Sicherheitsgründen nicht angezeigt — das ist normal.)${NC}"
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
mkdir -p /etc/apt/keyrings
curl -fsSL https://openresty.org/package/pubkey.gpg \
  | gpg --dearmor -o /etc/apt/keyrings/openresty.gpg
chmod a+r /etc/apt/keyrings/openresty.gpg
echo "deb [signed-by=/etc/apt/keyrings/openresty.gpg] http://openresty.org/package/ubuntu $(lsb_release -cs) main" \
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

MASTER_JSON=$(cat <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "${GATE_HASH}"
}
EOF
)

# Domain-spezifisch (für neue Lua-Skripte, Multi-Domain-Unterstützung)
mkdir -p /var/lib/sys/config/"$DOMAIN"
echo "$MASTER_JSON" > /var/lib/sys/config/"$DOMAIN"/master.json
chmod 600 /var/lib/sys/config/"$DOMAIN"/master.json
chown www-data:www-data /var/lib/sys/config/"$DOMAIN"/master.json

# Global-Fallback (für ältere Lua-Skripte aus git-Clone die MASTER_PATH hardcoded haben)
echo "$MASTER_JSON" > /var/lib/sys/config/master.json
chmod 600 /var/lib/sys/config/master.json
chown www-data:www-data /var/lib/sys/config/master.json

# ── 9. nginx config — Phase 1: HTTP-only ──────────────────────────────────────
info "Configuring OpenResty (HTTP-only, Phase 1)..."
mkdir -p /usr/local/openresty/nginx/logs

if grep -q "lua_package_path" /etc/openresty/nginx.conf 2>/dev/null; then
  # Unsere Config ist bereits aktiv — nur fehlende Zonen idempotent eintragen
  info "nginx.conf (SYS) bereits vorhanden — überspringe Überschreibung."
  for ZONE_LINE in \
    "limit_req_zone \$binary_remote_addr zone=chat:10m rate=1r/s;" \
    "limit_req_zone \$binary_remote_addr zone=chat_api:10m rate=2r/s;" \
    "limit_req_zone \$binary_remote_addr zone=vault_upload:10m rate=5r/s;" \
    "limit_req_zone \$binary_remote_addr zone=gate:10m rate=5r/m;"; do
    ZONE_NAME=$(echo "$ZONE_LINE" | grep -oP 'zone=\K[^:]+')
    if ! grep -q "zone=${ZONE_NAME}" /etc/openresty/nginx.conf; then
      sed -i "/# Rate limit zones/a\\  ${ZONE_LINE}" /etc/openresty/nginx.conf
      info "Zone ${ZONE_NAME} zu nginx.conf hinzugefügt."
    fi
  done
else
  # Keine oder Standard-OpenResty-Config → durch unser Template ersetzen
  sed "s/{{DOMAIN}}/$DOMAIN/g" \
    "$SCRIPT_DIR/server/openresty/nginx.conf.template" \
    > /etc/openresty/nginx.conf
  info "nginx.conf erstellt."
fi

sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/vhost-http.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

openresty -t && systemctl restart openresty

# ── 10. SSL certificate ───────────────────────────────────────────────────────
LE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

echo ""
# Hinweis: vorhandene (bewahrte) Let's Encrypt Zertifikate anzeigen
if [ -f "$LE_CERT" ] && openssl x509 -checkend 0 -noout -in "$LE_CERT" 2>/dev/null; then
  LE_EXPIRY=$(openssl x509 -noout -enddate -in "$LE_CERT" 2>/dev/null | cut -d= -f2)
  echo -e "${GREEN}  ✓ Vorhandenes Let's Encrypt Zertifikat für $DOMAIN gefunden.${NC}"
  echo -e "    Gültig bis: $LE_EXPIRY"
  echo -e "${YELLOW}  → Einfach leer lassen — wird automatisch wiederverwendet.${NC}"
  echo ""
fi

echo -e "${YELLOW}  SSL-Zertifikat — leer lassen für Let's Encrypt (automatisch).${NC}"
echo -e "${YELLOW}  Oder Pfade zu einem vorhandenen Zertifikat eintragen (z.B. Wildcard).${NC}"
echo -e "${YELLOW}  Bewahrte Let's Encrypt Pfade falls vorhanden:${NC}"
echo -e "${YELLOW}    fullchain.pem: /etc/letsencrypt/live/$DOMAIN/fullchain.pem${NC}"
echo -e "${YELLOW}    privkey.pem:   /etc/letsencrypt/live/$DOMAIN/privkey.pem${NC}"
read -p "  fullchain.pem (leer = Let's Encrypt): " SSL_CERT
read -p "  privkey.pem   (leer = Let's Encrypt): " SSL_KEY

if [[ -n "$SSL_CERT" || -n "$SSL_KEY" ]]; then
  # Dateien vorhanden?
  [[ ! -f "$SSL_CERT" ]] && error "Zertifikat nicht gefunden: $SSL_CERT"
  [[ ! -f "$SSL_KEY"  ]] && error "Schlüssel nicht gefunden: $SSL_KEY"

  # Gültiges X.509-Zertifikat?
  openssl x509 -in "$SSL_CERT" -noout 2>/dev/null \
    || error "Ungültiges Zertifikat (kein X.509): $SSL_CERT"

  # Gültiger privater Schlüssel?
  openssl pkey -in "$SSL_KEY" -check -noout 2>/dev/null \
    || error "Ungültiger privater Schlüssel: $SSL_KEY"

  # Cert und Key zusammengehörig? (Modulus-Vergleich)
  CERT_MOD=$(openssl x509 -noout -modulus -in "$SSL_CERT" 2>/dev/null | openssl md5)
  KEY_MOD=$(openssl pkey -noout -modulus -in "$SSL_KEY"   2>/dev/null | openssl md5)
  [[ "$CERT_MOD" != "$KEY_MOD" ]] \
    && error "Zertifikat und Schlüssel passen nicht zusammen."

  # Deckt das Zertifikat die Domain ab? (CN oder SAN)
  CERT_DOMAINS=$(openssl x509 -noout -text -in "$SSL_CERT" 2>/dev/null \
    | grep -oP '(?<=DNS:)[^,\s]+')
  DOMAIN_MATCH=false
  for cd in $CERT_DOMAINS; do
    # Exakter Treffer oder Wildcard (*.example.com deckt sub.example.com)
    if [[ "$cd" == "$DOMAIN" ]] || \
       [[ "$cd" == "*."* && "$DOMAIN" == *".${cd#\*.}" ]]; then
      DOMAIN_MATCH=true; break
    fi
  done
  $DOMAIN_MATCH || warn "Zertifikat deckt '$DOMAIN' möglicherweise nicht ab. Gefundene SANs: $CERT_DOMAINS"

  # Zertifikat abgelaufen?
  openssl x509 -checkend 0 -noout -in "$SSL_CERT" 2>/dev/null \
    || error "Zertifikat ist abgelaufen."

  info "Zertifikat validiert — Cert, Key und Domain passen zusammen."
else
  # Vorhandenes Let's Encrypt Zertifikat wiederverwenden wenn gültig
  if [ -f "$LE_CERT" ] && openssl x509 -checkend 0 -noout -in "$LE_CERT" 2>/dev/null; then
    info "Vorhandenes Let's Encrypt Zertifikat wird wiederverwendet."
    SSL_CERT="$LE_CERT"
    SSL_KEY="$LE_KEY"
  else
    info "Requesting SSL certificate for $DOMAIN..."
  CERTBOT_OUT=$(certbot certonly --webroot \
    -w /var/www/"$DOMAIN" \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive 2>&1) || true

  if echo "$CERTBOT_OUT" | grep -q "too many certificates"; then
    RETRY=$(echo "$CERTBOT_OUT" | grep -oP 'retry after \K[^\:]+:[^\s]+' || true)
    echo ""
    echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${RED}│  Let's Encrypt Rate-Limit erreicht                               │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Zu viele Zertifikate für $DOMAIN in den letzten 7 Tagen.        │${NC}"
    [ -n "$RETRY" ] && \
    echo -e "${RED}│  Retry ab: $RETRY                          │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Danach manuell nachholen:                                       │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│    certbot certonly --webroot \\                                  │${NC}"
    echo -e "${RED}│      -w /var/www/$DOMAIN \\                                       │${NC}"
    echo -e "${RED}│      -d $DOMAIN --email $EMAIL \\                                 │${NC}"
    echo -e "${RED}│      --agree-tos --non-interactive                               │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Dann HTTPS-vhost aktivieren:                                    │${NC}"
    echo -e "${RED}│    bash /opt/sys/scripts/activate-https.sh                       │${NC}"
    echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo "$CERTBOT_OUT"
    exit 1
  elif ! echo "$CERTBOT_OUT" | grep -q "Successfully received certificate"; then
    echo "$CERTBOT_OUT"
    error "certbot fehlgeschlagen — siehe Ausgabe oben."
  fi

    SSL_CERT="$LE_CERT"
    SSL_KEY="$LE_KEY"
  fi
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

API_SIGNING_KEY=$(openssl rand -hex 32)

sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|"       .env
sed -i "s|^SOUL_MASTER_KEY=.*|SOUL_MASTER_KEY=$MASTER_KEY|"              .env
sed -i "s|^API_SIGNING_KEY=.*|API_SIGNING_KEY=$API_SIGNING_KEY|"         .env
[ -n "$WC_PROJECT_ID" ] && \
  sed -i "s|^WALLETCONNECT_PROJECT_ID=.*|WALLETCONNECT_PROJECT_ID=$WC_PROJECT_ID|" .env

# WalletConnect direkt in nuxt.config.js eintragen (statischer Build liest .env nicht immer)
if [ -n "$WC_PROJECT_ID" ]; then
  sed -i "s|walletConnectProjectId:.*process\.env\.WALLETCONNECT_PROJECT_ID.*|walletConnectProjectId: \"$WC_PROJECT_ID\",|" nuxt.config.js
fi

info "ANTHROPIC_API_KEY, SOUL_MASTER_KEY und API_SIGNING_KEY eingetragen"
[ -n "$WC_PROJECT_ID" ] && info "WALLETCONNECT_PROJECT_ID eingetragen" || \
  warn "Kein WalletConnect Project ID — Blockchain-Anchoring deaktiviert."
echo ""

# ── 12b. systemd override — Umgebungsvariablen für OpenResty ─────────────────
# nginx.conf deklariert env-Variablen (env SOUL_MASTER_KEY;), aber die Werte
# müssen beim Start von OpenResty im Prozess-Environment vorhanden sein.
# Ohne diesen Override sind alle Lua-Variablen leer → soul_auth schlägt fehl.
info "Creating systemd environment override for OpenResty..."
mkdir -p /etc/systemd/system/openresty.service.d
cat > /etc/systemd/system/openresty.service.d/env.conf <<EOF
[Service]
Environment="ANTHROPIC_API_KEY=${ANTHROPIC_KEY}"
Environment="SOUL_MASTER_KEY=${MASTER_KEY}"
Environment="API_SIGNING_KEY=${API_SIGNING_KEY}"
EOF
systemctl daemon-reload

# Prüfen ob der Override korrekt geschrieben wurde und die Keys enthält
OVERRIDE_FILE="/etc/systemd/system/openresty.service.d/env.conf"

_override_error() {
  echo ""
  echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${RED}│  ⚠️  systemd Override konnte nicht verifiziert werden            │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  $1"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  Was tun:                                                        │${NC}"
  echo -e "${RED}│  1. Prüfe ob die Datei existiert:                                │${NC}"
  echo -e "${RED}│     cat $OVERRIDE_FILE   │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  2. Falls leer oder falsch, manuell neu schreiben:               │${NC}"
  echo -e "${RED}│     source /opt/sys/.env                                         │${NC}"
  echo -e "${RED}│     mkdir -p /etc/systemd/system/openresty.service.d             │${NC}"
  echo -e "${RED}│     cat > $OVERRIDE_FILE << 'ENVEOF'  │${NC}"
  echo -e "${RED}│     [Service]                                                    │${NC}"
  echo -e "${RED}│     Environment=\"SOUL_MASTER_KEY=\${SOUL_MASTER_KEY}\"             │${NC}"
  echo -e "${RED}│     Environment=\"ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY}\"         │${NC}"
  echo -e "${RED}│     Environment=\"API_SIGNING_KEY=\${API_SIGNING_KEY}\"             │${NC}"
  echo -e "${RED}│     ENVEOF                                                       │${NC}"
  echo -e "${RED}│     systemctl daemon-reload && systemctl restart openresty       │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  3. Oder frag eine KI um Hilfe — Prompt-Vorschlag:              │${NC}"
  echo -e "${RED}│     \"Mein init.sh für einen SYS-Node unter Ubuntu 24.04          │${NC}"
  echo -e "${RED}│     konnte den systemd override für OpenResty nicht schreiben.   │${NC}"
  echo -e "${RED}│     Die Datei $OVERRIDE_FILE │${NC}"
  echo -e "${RED}│     fehlt oder ist leer. Wie behebe ich das manuell?\"            │${NC}"
  echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  exit 1
}

if [ ! -f "$OVERRIDE_FILE" ]; then
  _override_error "Datei nicht gefunden: $OVERRIDE_FILE"
fi
if ! grep -q "SOUL_MASTER_KEY=sys_" "$OVERRIDE_FILE"; then
  _override_error "SOUL_MASTER_KEY fehlt oder hat kein 'sys_'-Präfix"
fi
if ! grep -q "ANTHROPIC_API_KEY=sk-ant-" "$OVERRIDE_FILE"; then
  _override_error "ANTHROPIC_API_KEY fehlt oder beginnt nicht mit 'sk-ant-'"
fi
info "systemd override verifiziert ✓"

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
