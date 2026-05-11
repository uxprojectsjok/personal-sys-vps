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
echo ""

read -p "Domain that was configured (e.g. soul.yourdomain.com): " DOMAIN
[[ -z "$DOMAIN" ]] && error "Domain required."

echo ""
warn "ACHTUNG: Alle SYS-Daten auf diesem VPS werden unwiderruflich gelöscht."
warn "  · Alle Soul-Daten unter /var/lib/sys/"
warn "  · SSL-Zertifikat für $DOMAIN"
warn "  · OpenResty, Node.js, Certbot"
warn "  · /var/www/$DOMAIN/"
warn "  · Swap-Datei /swapfile"
warn "  · /etc/openresty/"
echo ""
warn "Stelle sicher dass du ein Backup deiner Soul hast (.soul-Bundle oder sys.md)."
echo ""
read -p "Wirklich deinstallieren? (yes/no): " CONFIRM
[[ "$CONFIRM" != "yes" ]] && error "Abgebrochen."

# ── 0. Netzwerk-Abmeldung (vor Services stop) ────────────────────────────────
info "Deregistering soul from network..."
SOUL_DATA_DIR="/var/lib/sys/souls"
DEREGISTER_SOUL_ID=""
if [ -d "$SOUL_DATA_DIR" ]; then
  for d in "$SOUL_DATA_DIR"/*/; do
    [ -d "$d" ] || continue
    CANDIDATE=$(basename "$d")
    if [[ "$CANDIDATE" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      DEREGISTER_SOUL_ID="$CANDIDATE"
      break
    fi
  done
fi

if [ -n "$DEREGISTER_SOUL_ID" ]; then
  # Lokalen Indexer informieren — Soul sofort aus Index entfernen
  curl -s -m 5 -X POST http://127.0.0.1:3098/internal/deregister-soul \
    -H 'Content-Type: application/json' \
    -d "{\"soul_id\":\"$DEREGISTER_SOUL_ID\"}" 2>/dev/null && \
    info "Soul aus lokalem Index entfernt ($DEREGISTER_SOUL_ID)." || true

  # Pinata JWT suchen — für IPFS-weite Abmeldung (andere Nodes erkennen active:false)
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
      info "Soul im IPFS-Netzwerk abgemeldet (CID: $NEW_CID)."
      info "Andere Nodes erkennen active:false beim nächsten IPFS-Abruf."
    else
      warn "IPFS-Abmeldung fehlgeschlagen (Pinata nicht erreichbar oder JWT ungültig)."
    fi
  else
    warn "Kein Pinata-JWT gefunden — Soul nur lokal abgemeldet."
    warn "Andere Nodes entfernen diesen Soul automatisch wenn der MCP-Endpunkt nicht mehr erreichbar ist."
  fi
else
  info "Keine Soul gefunden — kein Deregistrierungsschritt nötig."
fi

# ── 1. Services stoppen ───────────────────────────────────────────────────────
info "Stopping services..."
# soul-mcp (pm2) zuerst stoppen
if command -v pm2 &>/dev/null; then
  timeout 10 pm2 stop all    2>/dev/null || true
  timeout 10 pm2 delete all  2>/dev/null || true
  timeout 10 pm2 kill        2>/dev/null || true
fi
timeout 10 systemctl stop    openresty 2>/dev/null || true
timeout 10 systemctl disable openresty 2>/dev/null || true
# nginx ist OpenResty — nur stoppen wenn eigene Unit vorhanden
if systemctl list-units --type=service 2>/dev/null | grep -q 'nginx.service'; then
  timeout 10 systemctl stop    nginx 2>/dev/null || true
  timeout 10 systemctl disable nginx 2>/dev/null || true
fi

# ── 2. SSL-Zertifikat ────────────────────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
DELETE_CERT=true

if [ -f "$CERT_PATH" ]; then
  # Prüfen ob Zertifikat noch gültig ist (nicht abgelaufen)
  if openssl x509 -checkend 0 -noout -in "$CERT_PATH" 2>/dev/null; then
    CERT_EXPIRY=$(openssl x509 -noout -enddate -in "$CERT_PATH" 2>/dev/null \
      | cut -d= -f2)
    echo ""
    echo -e "${GREEN}  ✓ Gültiges Let's Encrypt Zertifikat gefunden.${NC}"
    echo -e "    Läuft ab: $CERT_EXPIRY"
    echo ""
    echo -e "${YELLOW}  Empfehlung: Zertifikat behalten.${NC}"
    echo -e "${YELLOW}  Let's Encrypt erlaubt nur 5 Zertifikate pro Domain in 7 Tagen.${NC}"
    echo -e "${YELLOW}  Wenn du denselben Node neu installierst, kannst du das vorhandene${NC}"
    echo -e "${YELLOW}  Zertifikat beim init.sh wiederverwenden (Pfad eintragen).${NC}"
    echo ""
    read -p "  Zertifikat trotzdem löschen? (yes/no) [no]: " DEL_CONFIRM
    [[ "$DEL_CONFIRM" == "yes" ]] && DELETE_CERT=true || DELETE_CERT=false
  else
    echo ""
    warn "Zertifikat abgelaufen — wird gelöscht."
  fi
fi

if $DELETE_CERT; then
  info "Removing SSL certificate for $DOMAIN..."
  if command -v certbot &>/dev/null; then
    certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || \
      warn "  certbot delete fehlgeschlagen — Zertifikat eventuell bereits entfernt."
  fi
  rm -rf /etc/letsencrypt/live/"$DOMAIN"    2>/dev/null || true
  rm -rf /etc/letsencrypt/archive/"$DOMAIN" 2>/dev/null || true
  rm -f  /etc/letsencrypt/renewal/"$DOMAIN".conf 2>/dev/null || true
else
  info "SSL-Zertifikat behalten: $CERT_PATH"
  echo -e "  → Beim nächsten init.sh diesen Pfad eintragen:"
  echo -e "    fullchain.pem: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  echo -e "    privkey.pem:   /etc/letsencrypt/live/$DOMAIN/privkey.pem"
  echo ""
fi

# ── 3. Pakete deinstallieren ──────────────────────────────────────────────────
info "Removing OpenResty..."
apt-get remove --purge -y openresty 2>/dev/null || true

info "Removing Certbot..."
if $DELETE_CERT; then
  apt-get remove --purge -y certbot 2>/dev/null || true
else
  # Cert behalten → ohne --purge, sonst fragt certbot interaktiv nach /etc/letsencrypt
  apt-get remove -y certbot 2>/dev/null || true
fi

info "Removing Node.js..."
apt-get remove --purge -y nodejs 2>/dev/null || true

apt-get autoremove -y 2>/dev/null || true

# ── 4. Package repositories entfernen ────────────────────────────────────────
info "Removing package repositories..."
rm -f /etc/apt/sources.list.d/openresty.list
rm -f /etc/apt/sources.list.d/nodesource.list
apt-get update -qq 2>/dev/null || true

# ── 5. Swap entfernen ─────────────────────────────────────────────────────────
info "Removing swap..."
if swapon --show | grep -q /swapfile 2>/dev/null; then
  swapoff /swapfile
fi
rm -f /swapfile
# Eintrag aus /etc/fstab entfernen falls vorhanden
sed -i '/\/swapfile/d' /etc/fstab 2>/dev/null || true

# ── 6. Datenverzeichnisse löschen ─────────────────────────────────────────────
info "Removing data directories..."
rm -rf /var/lib/sys
rm -rf /var/www/"$DOMAIN"
rm -rf /etc/openresty
rm -rf /opt/sys

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ SYS vollständig deinstalliert.${NC}"
echo ""
echo "  Ubuntu-OS und alle anderen Pakete sind unberührt."
echo ""
warn "DNS: A-Eintrag für $DOMAIN muss manuell bei deinem DNS-Provider gelöscht werden."
echo ""
echo "  Neu installieren:"
echo "    cd /root"
echo "    git clone https://github.com/uxprojectsjok/personal-sys-vps.git /opt/sys"
echo "    cd /opt/sys && bash init.sh"
echo ""
