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

# ── Shared-Server-Erkennung ───────────────────────────────────────────────────
# Prüft ob neben der SYS-Domain noch andere Sites aktiv sind.
# Wenn ja: OpenResty, Node.js und /etc/openresty bleiben unangetastet.
SHARED_SERVER=false
for _SDIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  [ -d "$_SDIR" ] || continue
  for _F in "$_SDIR"/*; do
    [ -f "$_F" ] || continue
    _BASE=$(basename "$_F")
    [[ "$_BASE" == "00-default"* ]] && continue
    [[ "$_BASE" == "$DOMAIN" ]]     && continue
    SHARED_SERVER=true
    break 2
  done
done

echo ""
if $SHARED_SERVER; then
  warn "Shared Server erkannt — weitere Sites sind aktiv."
  warn "ACHTUNG: Folgende SYS-Daten werden unwiderruflich gelöscht:"
  warn "  · Soul-Daten unter /var/lib/sys/"
  warn "  · SSL-Zertifikat für $DOMAIN (optional)"
  warn "  · /var/www/$DOMAIN/"
  warn "  · SYS Lua-Scripts in /etc/openresty/lua/"
  warn "  · SYS vhost-Config für $DOMAIN"
  warn "  · soul-mcp Service"
  warn ""
  warn "NICHT gelöscht (andere Sites nutzen diese):"
  warn "  · OpenResty (Paket + /etc/openresty/)"
  warn "  · Node.js"
  warn "  · Certbot"
  warn "  · Swap-Datei"
else
  warn "ACHTUNG: Alle SYS-Daten auf diesem VPS werden unwiderruflich gelöscht."
  warn "  · Alle Soul-Daten unter /var/lib/sys/"
  warn "  · SSL-Zertifikat für $DOMAIN"
  warn "  · OpenResty, Node.js, Certbot"
  warn "  · /var/www/$DOMAIN/"
  warn "  · Swap-Datei /swapfile"
  warn "  · /etc/openresty/"
fi
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

# soul-mcp immer stoppen (gehört zu SYS)
if command -v pm2 &>/dev/null; then
  timeout 10 pm2 stop all    2>/dev/null || true
  timeout 10 pm2 delete all  2>/dev/null || true
  timeout 10 pm2 kill        2>/dev/null || true
fi
timeout 10 systemctl stop    soul-mcp  2>/dev/null || true
timeout 10 systemctl disable soul-mcp  2>/dev/null || true

# OpenResty nur stoppen wenn dedizierter Server
if $SHARED_SERVER; then
  info "Shared Server: OpenResty bleibt aktiv (andere Sites laufen noch)."
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
if $SHARED_SERVER; then
  info "Shared Server: Pakete (OpenResty, Node.js, Certbot) bleiben installiert."
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

# ── 4. SYS systemd Drop-In entfernen ─────────────────────────────────────────
info "Removing SYS systemd environment files..."
rm -f /etc/systemd/system/soul-mcp.service 2>/dev/null || true
rm -f /etc/systemd/system/openresty.service.d/sys-node.conf 2>/dev/null || true
# Ältere Installs schrieben env.conf — nur entfernen wenn kein Shared Server
# (auf Shared Servern könnte env.conf fremde Variablen enthalten)
if ! $SHARED_SERVER; then
  rm -f /etc/systemd/system/openresty.service.d/env.conf 2>/dev/null || true
fi
systemctl daemon-reload

# ── 5. SYS nginx-Konfiguration entfernen ─────────────────────────────────────
info "Removing SYS vhost and nginx config..."

# vhost für diese Domain aus sites-available und sites-enabled entfernen
for _SDIR in \
  /etc/openresty/sites-available \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-available \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  rm -f "$_SDIR/$DOMAIN" 2>/dev/null || true
done

if $SHARED_SERVER; then
  # Nur SYS-eigene Lua-Scripts entfernen (via Manifest aus init.sh)
  _LUA_MANIFEST=/var/lib/sys/config/lua-manifest.txt
  if [ -f "$_LUA_MANIFEST" ]; then
    while IFS= read -r _SCRIPT; do
      rm -f "/etc/openresty/lua/$_SCRIPT" 2>/dev/null || true
      rm -f "/usr/local/openresty/nginx/conf/lua/$_SCRIPT" 2>/dev/null || true
    done < "$_LUA_MANIFEST"
    info "SYS Lua-Scripts entfernt ($(wc -l < "$_LUA_MANIFEST") Dateien)."
  else
    warn "Kein Lua-Manifest gefunden — Lua-Scripts NICHT entfernt."
    warn "Manuell bereinigen: /etc/openresty/lua/soul_*.lua, gate_*.lua, vault_*.lua usw."
  fi

  # sys-node-globals.conf entfernen + include aus nginx.conf entfernen
  rm -f /etc/openresty/sys-node-globals.conf 2>/dev/null || true
  for _NC in /etc/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf; do
    [ -f "$_NC" ] || continue
    if grep -q "sys-node-globals.conf" "$_NC"; then
      sed -i '/sys-node-globals.conf/d' "$_NC"
      info "SYS-Include aus $_NC entfernt."
    fi
  done

  # OpenResty neu laden (kein Ausfall für andere Sites)
  info "OpenResty neu laden (andere Sites bleiben aktiv)..."
  openresty -t && systemctl reload openresty 2>/dev/null || \
    warn "OpenResty reload fehlgeschlagen — manuell prüfen."
else
  # Dedizierter Server: komplettes /etc/openresty entfernen
  rm -rf /etc/openresty
fi

# ── 6. Datenverzeichnisse löschen ─────────────────────────────────────────────
info "Removing data directories..."
rm -rf /var/lib/sys
rm -rf /var/www/"$DOMAIN"
if ! $SHARED_SERVER; then
  rm -rf /opt/sys
fi

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
