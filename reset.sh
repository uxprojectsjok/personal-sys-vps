#!/bin/bash
# Personal SYS VPS — Soul Reset
# Removes the current soul from this node and unlocks it for a new owner.
# Does NOT touch OpenResty, SSL, Node.js or any other infrastructure.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SOULS_DIR="/var/lib/sys/souls"

# Determine domain-specific master.json path
# Checks both possible sites-enabled paths (depends on OpenResty installation)
DOMAIN=""
for SITES_DIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  if [ -d "$SITES_DIR" ]; then
    DOMAIN=$(ls "$SITES_DIR" 2>/dev/null | grep -v '^00-default' | head -1)
    [ -n "$DOMAIN" ] && break
  fi
done

# master.json: domain-specific → global → any subdirectory
MASTER_PATH=""
if [ -n "$DOMAIN" ] && [ -f "/var/lib/sys/config/$DOMAIN/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/$DOMAIN/master.json"
elif [ -f "/var/lib/sys/config/master.json" ]; then
  MASTER_PATH="/var/lib/sys/config/master.json"
else
  # Last resort: first master.json found in any subdirectory
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
echo "  Apache License 2.0 · github.com/uxprojectsjok/sys-installer"
echo "  Use at your own risk. No warranty. Always back up your data."
echo ""

# ── Detect multi-hoster mode ──────────────────────────────────────────────────
MULTI_HOSTER=false
if [ -f "$MASTER_PATH" ]; then
  MULTI_HOSTER=$(python3 -c "import json; d=json.load(open('$MASTER_PATH')); print('true' if d.get('multi_hoster') else 'false')" 2>/dev/null || echo "false")
fi

# ══════════════════════════════════════════════════════════════════════════════
# MULTI-HOSTER: select soul from list or delete all
# ══════════════════════════════════════════════════════════════════════════════
if [ "$MULTI_HOSTER" = "true" ]; then
  echo "  Mode: Multi-Hoster"
  echo ""

  # Read all soul directories
  SOUL_IDS=()
  if [ -d "$SOULS_DIR" ]; then
    while IFS= read -r -d '' dir; do
      id=$(basename "$dir")
      [[ "$id" =~ ^[a-zA-Z0-9-]+$ ]] && SOUL_IDS+=("$id")
    done < <(find "$SOULS_DIR" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
  fi

  if [ ${#SOUL_IDS[@]} -eq 0 ]; then
    warn "No souls found on this node."
    exit 0
  fi

  echo "  Registered souls:"
  for i in "${!SOUL_IDS[@]}"; do
    SOUL_NAME=""
    SYS_MD="$SOULS_DIR/${SOUL_IDS[$i]}/sys.md"
    if [ -f "$SYS_MD" ]; then
      SOUL_NAME=$(grep -m1 "^soul_name:" "$SYS_MD" 2>/dev/null | sed 's/soul_name:[[:space:]]*//' | tr -d '\r' || echo "")
    fi
    if [ -n "$SOUL_NAME" ]; then
      echo "    [$((i+1))] ${SOUL_IDS[$i]}  ($SOUL_NAME)"
    else
      echo "    [$((i+1))] ${SOUL_IDS[$i]}"
    fi
  done
  echo "    [a] Delete all souls"
  echo ""
  warn "WARNING: Deleted soul data cannot be recovered."
  warn "Make sure you have a backup (sys.md) first."
  echo ""
  read -p "Selection (number or 'a' or 'no' to cancel): " CHOICE
  [[ "$CHOICE" == "no" || -z "$CHOICE" ]] && error "Cancelled."

  SOULS_TO_DELETE=()
  if [ "$CHOICE" = "a" ]; then
    SOULS_TO_DELETE=("${SOUL_IDS[@]}")
  elif [[ "$CHOICE" =~ ^[0-9]+$ ]] && [ "$CHOICE" -ge 1 ] && [ "$CHOICE" -le "${#SOUL_IDS[@]}" ]; then
    SOULS_TO_DELETE=("${SOUL_IDS[$((CHOICE-1))]}")
  else
    error "Invalid selection."
  fi

  echo ""
  read -p "Really delete? (yes/no): " CONFIRM
  [[ "$CONFIRM" != "yes" ]] && error "Cancelled."

  info "Deleting soul data..."
  for SID in "${SOULS_TO_DELETE[@]}"; do
    rm -rf "$SOULS_DIR/$SID"
    info "Soul directory removed: $SOULS_DIR/$SID"
  done

# ══════════════════════════════════════════════════════════════════════════════
# SINGLE-HOSTER: standard behaviour
# ══════════════════════════════════════════════════════════════════════════════
else
  if [ ! -f "$MASTER_PATH" ]; then
    error "master.json not found — is the node already reset?"
  fi

  SOUL_ID=$(python3 -c "import json,sys; d=json.load(open('$MASTER_PATH')); print(d.get('node_soul_id',''))" 2>/dev/null || echo "")

  if [ -z "$SOUL_ID" ]; then
    warn "No node_soul_id in master.json — node is already free."
    exit 0
  fi

  echo "  Current soul: $SOUL_ID"
  echo ""
  warn "WARNING: All soul data on this VPS will be permanently deleted."
  warn "Make sure you have a backup (sys.md or .soul-bundle) first."
  echo ""
  read -p "Really reset? (yes/no): " CONFIRM
  [[ "$CONFIRM" != "yes" ]] && error "Cancelled."

  info "Deleting soul data..."
  if [ -d "$SOULS_DIR/$SOUL_ID" ]; then
    rm -rf "$SOULS_DIR/$SOUL_ID"
    info "Soul directory removed: $SOULS_DIR/$SOUL_ID"
  fi

  # Remove node_soul_id + admin_token from master.json
  info "Clearing node lock..."
  python3 - <<PYEOF
import json, os

paths = ["$MASTER_PATH"]
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
    print(f"  master.json updated: {path}")
PYEOF
fi

# ── OpenResty restart — clears gate_sessions + verify_cache (shared dicts) ───
# On shared servers a restart would briefly interrupt ALL sites.
# → If more than one non-default site is active: reload only.
#   (Shared dicts expire naturally — gate_sessions TTL: 2 minutes)
_NON_DEFAULT_SITES=0
for _SDIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  [ -d "$_SDIR" ] || continue
  for _F in "$_SDIR"/*; do
    [ -f "$_F" ] || continue
    [[ "$(basename "$_F")" == "00-default"* ]] && continue
    _NON_DEFAULT_SITES=$((_NON_DEFAULT_SITES + 1))
  done
done

if [ "$_NON_DEFAULT_SITES" -gt 1 ]; then
  info "Shared server: reloading OpenResty instead of restarting."
  info "(gate_sessions expire naturally within 2 minutes)"
  openresty -t && systemctl reload openresty 2>/dev/null || true
else
  info "Restarting OpenResty (clearing session cache)..."
  systemctl restart openresty 2>/dev/null || \
    (openresty -s stop && openresty) 2>/dev/null || true
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Node reset.${NC}"
echo ""
echo "  The VPS is now free and ready for a new soul."
echo "  Open the app in your browser — create or import a soul."
echo ""
