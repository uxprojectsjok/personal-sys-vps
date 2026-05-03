#!/bin/bash
# Personal SYS VPS — Complete Uninstall
# Removes everything init.sh installed and leaves a clean Ubuntu server.
# Does NOT affect the OS, firewall rules, or any non-SYS packages.
#
# Difference to reset.sh:
#   reset.sh   — removes one Soul, server stays installed and running
#   deinstall.sh — removes the entire SYS installation, naked Ubuntu remains

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[soul]${NC} $1"; }
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

# ── 1. Services stoppen ───────────────────────────────────────────────────────
info "Stopping services..."
systemctl stop    openresty 2>/dev/null || true
systemctl disable openresty 2>/dev/null || true
systemctl stop    nginx     2>/dev/null || true
systemctl disable nginx     2>/dev/null || true

# ── 2. SSL-Zertifikat entfernen ───────────────────────────────────────────────
info "Removing SSL certificate for $DOMAIN..."
if command -v certbot &>/dev/null; then
  certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || \
    warn "  certbot delete fehlgeschlagen — Zertifikat eventuell bereits entfernt."
fi
rm -rf /etc/letsencrypt/live/"$DOMAIN"    2>/dev/null || true
rm -rf /etc/letsencrypt/archive/"$DOMAIN" 2>/dev/null || true
rm -f  /etc/letsencrypt/renewal/"$DOMAIN".conf 2>/dev/null || true

# ── 3. Pakete deinstallieren ──────────────────────────────────────────────────
info "Removing OpenResty..."
apt-get remove --purge -y openresty 2>/dev/null || true

info "Removing Certbot..."
apt-get remove --purge -y certbot 2>/dev/null || true

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
