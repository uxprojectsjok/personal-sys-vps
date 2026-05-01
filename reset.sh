#!/bin/bash
# Personal SYS VPS — Soul Reset
# Removes the current soul from this node and unlocks it for a new owner.
# Does NOT touch OpenResty, SSL, Node.js or any other infrastructure.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[soul]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

MASTER_PATH="/var/lib/sys/config/master.json"
SOULS_DIR="/var/lib/sys/souls"

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
import json

with open("$MASTER_PATH", "r") as f:
    data = json.load(f)

data.pop("node_soul_id", None)

with open("$MASTER_PATH", "w") as f:
    json.dump(data, f, indent=2)

print("  master.json aktualisiert")
PYEOF

# ── OpenResty reload ──────────────────────────────────────────────────────────
info "OpenResty reload..."
openresty -s reload 2>/dev/null || systemctl reload openresty 2>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Node zurückgesetzt.${NC}"
echo ""
echo "  Der VPS ist jetzt frei und bereit für eine neue Soul."
echo "  Öffne die App im Browser — Soul erstellen oder einloggen."
echo ""
