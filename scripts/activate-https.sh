#!/bin/bash
# Aktiviert den HTTPS-vhost nachdem ein Let's Encrypt Zertifikat vorliegt.
# Wird nach einem Rate-Limit-Abbruch bei init.sh manuell ausgeführt.
# Usage: bash /opt/sys/scripts/activate-https.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[soul]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Domain aus sites-enabled ermitteln
DOMAIN=$(ls /etc/openresty/sites-enabled/ 2>/dev/null | head -1)
[[ -z "$DOMAIN" ]] && error "Keine Domain in /etc/openresty/sites-enabled/ gefunden."

SSL_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

[[ ! -f "$SSL_CERT" ]] && error "Zertifikat nicht gefunden: $SSL_CERT — certbot zuerst ausführen."
[[ ! -f "$SSL_KEY"  ]] && error "Schlüssel nicht gefunden: $SSL_KEY"

info "Aktiviere HTTPS-vhost für $DOMAIN..."
sed \
  -e "s|{{DOMAIN}}|$DOMAIN|g" \
  -e "s|{{SSL_CERT}}|$SSL_CERT|g" \
  -e "s|{{SSL_KEY}}|$SSL_KEY|g" \
  "$SCRIPT_DIR/../server/openresty/vhost.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

openresty -t && systemctl restart openresty
info "HTTPS aktiv: https://$DOMAIN"
