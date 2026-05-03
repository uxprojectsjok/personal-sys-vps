#!/bin/bash
# Personal SYS VPS — Soul Reset
# Removes the current soul from this node and unlocks it for a new owner.
# Does NOT touch OpenResty, SSL, Node.js or any other infrastructure.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[soul]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SOULS_DIR="/var/lib/sys/souls"

# Domain-spezifischen master.json-Pfad ermitteln
# Prüft beide möglichen sites-enabled-Pfade (je nach OpenResty-Installation)
DOMAIN=""
for SITES_DIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  if [ -d "$SITES_DIR" ]; then
    DOMAIN=$(ls "$SITES_DIR" 2>/dev/null | grep -v '^00-default' | head -1)
    [ -n "$DOMAIN" ] && break
  fi
done

# master.json: domain-spezifisch → global → alle Unterverzeichnisse
MASTER_PATH=""
if [ -n "$DOMAIN" ] && [ -f "/var/lib/sys/config/$DOMAIN/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/$DOMAIN/master.json"
elif [ -f "/var/lib/sys/config/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/master.json"
else
  # Letzter Ausweg: erstes master.json in einem Unterverzeichnis
  MASTER_PATH=$(find /var/lib/sys/config -name "master.json" 2>/dev/null | head -1)
fi

echo ""
echo "  ██████╗ ███████╗███████╗███████╗████████╗"
echo "  ██╔══██╗██╔════╝██╔════╝██╔════╝╚══██╔══╝"
echo "  ██████╔╝█████╗  ███████╗█████╗     ██║   "
echo "  ██╔══██╗██╔══╝  ╚════██║██╔══╝     ██║   "
echo "  ██║  ██║███████╗███████║███████╗   ██║   "
echo "  ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝   "
echo "  Personal SYS VPS — Soul Reset"
echo ""

# ── Aktuelle Soul-ID ermitteln ────────────────────────────────────────────────
if [ ! -f "$MASTER_PATH" ]; then
  error "master.json nicht gefunden — ist der Node bereits zurückgesetzt?"
fi

SOUL_ID=$(python3 -c "import json,sys; d=json.load(open('$MASTER_PATH')); print(d.get('node_soul_id',''))" 2>/dev/null || echo "")

if [ -z "$SOUL_ID" ]; then
  warn "Kein node_soul_id in master.json — Node ist bereits frei."
  exit 0
fi

echo "  Aktuelle Soul: $SOUL_ID"
echo ""
warn "ACHTUNG: Alle Soul-Daten auf diesem VPS werden unwiderruflich gelöscht."
warn "Stelle sicher dass du ein Backup (sys.md oder .soul-Bundle) hast."
echo ""
read -p "Wirklich zurücksetzen? (yes/no): " CONFIRM
[[ "$CONFIRM" != "yes" ]] && error "Abgebrochen."

# ── Soul-Daten löschen ────────────────────────────────────────────────────────
info "Lösche Soul-Daten..."
if [ -d "$SOULS_DIR/$SOUL_ID" ]; then
  rm -rf "$SOULS_DIR/$SOUL_ID"
  info "Soul-Verzeichnis entfernt: $SOULS_DIR/$SOUL_ID"
fi

# ── node_soul_id aus master.json entfernen ────────────────────────────────────
info "Setze Node-Lock zurück..."
python3 - <<PYEOF
import json, os

paths = ["$MASTER_PATH"]
# Global-Fallback ebenfalls aktualisieren wenn vorhanden
global_path = "/var/lib/sys/config/master.json"
if global_path not in paths and os.path.exists(global_path):
    paths.append(global_path)

for path in paths:
    with open(path, "r") as f:
        data = json.load(f)
    data.pop("node_soul_id", None)
    data.pop("admin_token", None)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  master.json aktualisiert: {path}")
PYEOF

# ── OpenResty restart — löscht gate_sessions + verify_cache (shared dicts) ───
info "OpenResty restart (löscht Session-Cache)..."
systemctl restart openresty 2>/dev/null || openresty -s stop && openresty 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Node zurückgesetzt.${NC}"
echo ""
echo "  Der VPS ist jetzt frei und bereit für eine neue Soul."
echo "  Öffne die App im Browser — Soul erstellen oder einloggen."
echo ""
