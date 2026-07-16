#!/bin/bash
# Personal SYS VPS — Init Script
# Runs on a fresh Ubuntu 24.04 VPS.
# Usage: bash init.sh

set -euo pipefail

# Suppresses interactive needrestart prompts during apt operations.
# Without this needrestart asks after every apt install which services to restart
# — this stalls the script. 'a' = automatic, no prompt.
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
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
echo "  Apache License 2.0 · github.com/uxprojectsjok/sys-installer"
echo "  Use at your own risk. No warranty. Always back up your data."
echo ""

# ── 0. Node visibility (Public/Private) ───────────────────────────────────────
echo -e "${YELLOW}  Should this node be public or private?${NC}"
echo ""
echo "  [1] Public Node     — Full feature set (default)"
echo "      Includes the Agent Marketplace: other AI agents can discover this"
echo "      node, pay in POL or PayPal, and read from the Agent Sandbox."
echo ""
echo "  [2] Private Node    — No Marketplace, no paid agent access"
echo "      This soul stays reachable for its owner and trusted peers only —"
echo "      amortization/paid access can never be turned on later without"
echo "      re-running init.sh (enforced server-side, not just hidden in the UI)."
echo ""
while true; do
  read -p "  Visibility [1/2]: " NODE_VISIBILITY
  [[ "$NODE_VISIBILITY" == "1" || "$NODE_VISIBILITY" == "2" ]] && break
  warn "Please enter 1 or 2."
done
PUBLIC_NODE=true
[[ "$NODE_VISIBILITY" == "2" ]] && PUBLIC_NODE=false
echo ""

# ── 1. Node structure selection ───────────────────────────────────────────────
echo -e "${YELLOW}  Which node structure do you want to set up?${NC}"
echo ""
echo "  [1] Personal Node   — Exactly one soul, one owner (default)"
echo "      Perfect for: individual use, your own instance, maximum control"
echo "      Includes: Autonomous Agent Runner (processes tasks from agent.md,"
echo "      maintains the node, runs hourly + on-demand, Zapier MCP support)"
echo ""
echo "  [2] Multi-Hoster    — Multiple souls on one VPS"
echo "      Perfect for: family, friends, company, soul-hosting service"
echo "      All users share one gateway but are fully isolated data-wise"
echo "      Note: Autonomous Agent Runner not available — agent runs as root"
echo "      and would have access to all souls on the node (security risk)"
echo ""
while true; do
  read -p "  Mode [1/2]: " NODE_MODE
  [[ "$NODE_MODE" == "1" || "$NODE_MODE" == "2" ]] && break
  warn "Please enter 1 or 2."
done
MULTI_HOSTER=false
[[ "$NODE_MODE" == "2" ]] && MULTI_HOSTER=true
echo ""

# ── 2. Input ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}  Note: You need a domain with an A record pointing to this server's IP.${NC}"
echo -e "${YELLOW}  Without a DNS entry the SSL certificate request will fail.${NC}"
echo ""
read -p "  Your domain (e.g. soul.yourname.com):      " DOMAIN
read -p "  Your email (for SSL certificate):          " EMAIL
[[ -z "$DOMAIN" || -z "$EMAIL" ]] && error "Domain and email are required."

echo ""
echo -e "${YELLOW}  Anthropic API Key (optional) — for Claude chat and AI features.${NC}"
echo -e "${YELLOW}  Can be left empty and added later in the admin UI:${NC}"
echo -e "${YELLOW}  Settings → Server Admin → Server Anthropic Key.${NC}"
read -p "  Anthropic API Key (sk-ant-... or leave empty): " ANTHROPIC_KEY

echo ""
INSTALL_CLAUDE_CODE=false
if ! $MULTI_HOSTER; then
  echo -e "${YELLOW}  Install Claude Code CLI? — AI-assisted terminal management for this VPS.${NC}"
  echo -e "${YELLOW}  Connects to your soul-mcp server. Requires an Anthropic API key (above).${NC}"
  read -p "  Install Claude Code? [y/N]: " _CC_CHOICE
  [[ "${_CC_CHOICE,,}" == "y" || "${_CC_CHOICE,,}" == "yes" ]] && INSTALL_CLAUDE_CODE=true
else
  echo -e "${YELLOW}  Claude Code CLI skipped — not available in Multi-Hoster mode (security risk).${NC}"
fi

echo ""
echo -e "${YELLOW}  Legal notice — node operator responsibility:${NC}"
echo -e "${YELLOW}  This node processes real personal data (soul, vault, payments, peer${NC}"
echo -e "${YELLOW}  communication). YOU, the operator, are solely responsible for compliance${NC}"
echo -e "${YELLOW}  with applicable law (GDPR, TMG/DDG, etc.) — SYS provides infrastructure,${NC}"
echo -e "${YELLOW}  not legal services. This repo ships /impressum, /datenschutz, /lizenz as a${NC}"
echo -e "${YELLOW}  working reference — populated with the author's own details. Replace their${NC}"
echo -e "${YELLOW}  content with your own operator details before going live, and replace or${NC}"
echo -e "${YELLOW}  remove the analytics endpoint in app/components/ConsentBanner.vue.${NC}"
read -p "  Press Enter to continue: " _LEGAL_ACK

echo ""
EU_CONSUMER_RIGHTS=false
echo -e "${YELLOW}  Set up EU consumer rights? — withdrawal-rights consent flow for the${NC}"
echo -e "${YELLOW}  PayPal/non-crypto payment path (German/EU Fernabsatzrecht: BGB §312j,${NC}"
echo -e "${YELLOW}  EGBGB Art. 246a). Only relevant if you (the operator) are based in the${NC}"
echo -e "${YELLOW}  EU and sell to consumers there. Adds: accept_digital_content_terms /${NC}"
echo -e "${YELLOW}  show_withdrawal_terms MCP tools, the /agb page, and the Vault Explorer's${NC}"
echo -e "${YELLOW}  \"Widerruf\" tab. Can be turned on later by editing soul-mcp/.env.${NC}"
read -p "  Set up EU consumer rights? [y/N]: " _EU_CHOICE
[[ "${_EU_CHOICE,,}" == "y" || "${_EU_CHOICE,,}" == "yes" ]] && EU_CONSUMER_RIGHTS=true

echo ""
echo -e "${YELLOW}  Reown Project ID (optional) — for blockchain anchoring.${NC}"
echo -e "${YELLOW}  Can be left empty and added later in Settings → API Keys.${NC}"
echo -e "${YELLOW}  Create for free: dashboard.reown.com → New Project${NC}"
echo -e "${YELLOW}  Leave empty → anchoring feature disabled (can be enabled anytime in Settings → API Keys).${NC}"
read -p "  Reown Project ID (optional):              " REOWN_PROJECT_ID


echo ""
echo -e "${YELLOW}  Server timezone — determines time display in token expiry and comment timestamps.${NC}"
echo ""
echo "  [1] Europe/Berlin    (Germany, Austria, Switzerland)"
echo "  [2] Europe/London    (UK, Ireland)"
echo "  [3] Europe/Paris     (France, Belgium, Spain)"
echo "  [4] America/New_York (USA East)"
echo "  [5] America/Chicago  (USA Central)"
echo "  [6] America/Denver   (USA Mountain)"
echo "  [7] America/Los_Angeles (USA West)"
echo "  [8] Asia/Tokyo       (Japan)"
echo "  [9] Asia/Singapore   (Singapore, Malaysia)"
echo "  [0] UTC              (Coordinated Universal Time)"
echo "  [k] Enter custom     (e.g. America/Sao_Paulo)"
echo ""
while true; do
  read -p "  Zeitzone [1]: " TZ_CHOICE
  TZ_CHOICE="${TZ_CHOICE:-1}"
  case "$TZ_CHOICE" in
    1) TIMEZONE="Europe/Berlin"      ; break ;;
    2) TIMEZONE="Europe/London"      ; break ;;
    3) TIMEZONE="Europe/Paris"       ; break ;;
    4) TIMEZONE="America/New_York"   ; break ;;
    5) TIMEZONE="America/Chicago"    ; break ;;
    6) TIMEZONE="America/Denver"     ; break ;;
    7) TIMEZONE="America/Los_Angeles"; break ;;
    8) TIMEZONE="Asia/Tokyo"         ; break ;;
    9) TIMEZONE="Asia/Singapore"     ; break ;;
    0) TIMEZONE="UTC"                ; break ;;
    k|K)
      read -p "  Enter timezone (see: timedatectl list-timezones): " TIMEZONE
      if timedatectl list-timezones 2>/dev/null | grep -qx "$TIMEZONE"; then
        break
      else
        warn "Unknown timezone '$TIMEZONE'. Please try again."
      fi
      ;;
    *) warn "Please enter a number 0–9 or k." ;;
  esac
done
echo -e "  ${GREEN}✓${NC} Timezone: $TIMEZONE"

echo ""
echo -e "${YELLOW}  Access password for the node gate.${NC}"
if $MULTI_HOSTER; then
  echo -e "${YELLOW}  In multi-hoster mode this password is the shared entrance${NC}"
  echo -e "${YELLOW}  for all users — like a front door key.${NC}"
fi
echo -e "${YELLOW}  Minimum 8 characters. (Input is hidden — that is normal.)${NC}"
while true; do
  read -s -p "  Access password:             " ACCESS_PWD; echo ""
  read -s -p "  Confirm access password:     " ACCESS_PWD2; echo ""
  [[ "${#ACCESS_PWD}" -ge 8 ]] && [[ "$ACCESS_PWD" == "$ACCESS_PWD2" ]] && break
  if [[ "${#ACCESS_PWD}" -lt 8 ]]; then
    warn "Minimum 8 characters required."
  else
    warn "Passwords do not match."
  fi
done
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Auto-Update ───────────────────────────────────────────────────────────────
# Fetches the latest version from GitHub before deploying files.
# --ff-only: fails silently if local changes are present.
if [ -d "$SCRIPT_DIR/.git" ]; then
  info "Checking for updates..."
  git -C "$SCRIPT_DIR" pull --ff-only --quiet 2>&1 || \
    warn "Git update skipped — local changes present or no network."
fi

# ── Shared server detection ───────────────────────────────────────────────────
# Checks whether OpenResty is already running with other (non-SYS) sites active.
# If yes: SYS integrates alongside them instead of overwriting.
SHARED_SERVER=false
ACTIVE_SITES=""
for _SDIR in \
  /etc/openresty/sites-enabled \
  /usr/local/openresty/nginx/conf/sites-enabled; do
  [ -d "$_SDIR" ] || continue
  for _F in "$_SDIR"/*; do
    [ -f "$_F" ] || continue
    _BASE=$(basename "$_F")
    [[ "$_BASE" == "00-default"* ]] && continue
    [[ "$_BASE" == "$DOMAIN" ]]     && continue
    # Skip if already listed (both sites-enabled paths may contain the same files)
    echo "$ACTIVE_SITES" | grep -qF "· $_BASE" && continue
    SHARED_SERVER=true
    ACTIVE_SITES="$ACTIVE_SITES\n    · $_BASE"
  done
done

if $SHARED_SERVER; then
  echo ""
  echo -e "${YELLOW}┌──────────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${YELLOW}│  Existing OpenResty server detected                              │${NC}"
  echo -e "${YELLOW}│                                                                  │${NC}"
  echo -e "${YELLOW}│  Active sites on this VPS:${NC}"
  echo -e "${YELLOW}${ACTIVE_SITES}${NC}"
  echo -e "${YELLOW}│                                                                  │${NC}"
  echo -e "${YELLOW}│  SYS will be added ALONGSIDE the existing sites.                │${NC}"
  echo -e "${YELLOW}│  · nginx.conf will be extended, not overwritten                 │${NC}"
  echo -e "${YELLOW}│  · Existing vhost configurations remain unchanged               │${NC}"
  echo -e "${YELLOW}│  · Packages will not be reinstalled                             │${NC}"
  echo -e "${YELLOW}│  · deinstall.sh will later remove only SYS-owned files          │${NC}"
  echo -e "${YELLOW}└──────────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  read -p "  Continue? (yes/no): " _SHARED_CONFIRM
  [[ "$_SHARED_CONFIRM" == "yes" ]] || error "Cancelled."
fi

# ── 1b. Set timezone ─────────────────────────────────────────────────────────
info "Setting timezone to ${TIMEZONE}..."
timedatectl set-timezone "$TIMEZONE" 2>/dev/null || warn "timedatectl failed — timezone may be unknown."

# ── 2. OpenResty repository ───────────────────────────────────────────────────
info "Adding OpenResty repository..."
mkdir -p /etc/apt/keyrings
curl -fsSL https://openresty.org/package/pubkey.gpg \
  | gpg --batch --yes --dearmor -o /etc/apt/keyrings/openresty.gpg
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

# lua-resty-http for server-side HTTP callbacks (cross-domain peer handshake)
info "Installing lua-resty-http..."
/usr/local/openresty/bin/opm install ledgetech/lua-resty-http

# ── 4. Node.js 20 ─────────────────────────────────────────────────────────────
info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

# ── Sudo-Regel: www-data darf health-sync setup_server.sh als root ausführen ──
SUDOERS_FILE="/etc/sudoers.d/sys-health-sync"
echo "www-data ALL=(root) NOPASSWD: /opt/sys/health-sync/setup_server.sh" > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

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
mkdir -p /var/lib/sys/pol_tokens

# mime.types: deinstall.sh removes /etc/openresty entirely; after reinstall
# the package recreates the directory but without mime.types.
# nginx.conf.template now references the original OpenResty path;
# this copy is a fallback for older nginx.conf variants.
if [ ! -f /etc/openresty/mime.types ]; then
  cp /usr/local/openresty/nginx/conf/mime.types /etc/openresty/mime.types
fi

chown -R www-data:www-data /var/lib/sys
chmod 750 /var/lib/sys/config
chmod 750 /var/lib/sys/souls
chown -R www-data:www-data /var/www/"$DOMAIN"
chmod -R 755 /var/www/"$DOMAIN"

# /var/log itself is root:syslog (775) — www-data can't create files there.
# Dedicated, www-data-writable log dir for on-demand web-triggered scripts
# (health sync, security audit log).
mkdir -p /var/log/sys
chown www-data:www-data /var/log/sys
chmod 750 /var/log/sys

# Record source dir so agent runner can locate it without hardcoded paths
echo "$SCRIPT_DIR" > /var/lib/sys/sys_dir
chmod 644 /var/lib/sys/sys_dir

# ── 7. Lua scripts ────────────────────────────────────────────────────────────
info "Installing Lua scripts..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/

# Write manifest — deinstall.sh removes only these files (shared-server-safe)
ls "$SCRIPT_DIR/lua/"*.lua | xargs -n1 basename \
  > /var/lib/sys/config/lua-manifest.txt

cp "$SCRIPT_DIR/shared/constants/pricing_params.json" /var/lib/sys/config/pricing_params.json

# Default mind.md template — single source of truth for all "create mind.md if
# missing" call sites (soul_cert.lua, mind.lua, api_serve.lua, api_context.lua,
# server.mjs, mind_read.mjs). Each reads this file with a short hardcoded
# fallback if it's ever missing (see soul_price.lua for the same pattern).
cp "$SCRIPT_DIR/shared/constants/default_mind.md" /var/lib/sys/config/default_mind.md

# EU consumer-rights flag, readable by the Lua side (OpenResty doesn't inherit
# shell/service env vars without an explicit `env` nginx directive — a plain
# file is simpler than plumbing that through). soul-mcp (Node) reads the same
# choice via EU_CONSUMER_RIGHTS in soul-mcp/.env instead.
echo -n "$EU_CONSUMER_RIGHTS" > /var/lib/sys/config/eu_consumer_rights
chmod 644 /var/lib/sys/config/eu_consumer_rights

# Node visibility flag (Public/Private) — same rationale as eu_consumer_rights
# above. Checked server-side wherever amortization/paid access could be turned
# on (soul_amortization.lua, soul_pay.lua, soul_pay_manual.lua), not just
# hidden in the UI, so a private node can never accidentally start accepting
# paid agent traffic.
echo -n "$PUBLIC_NODE" > /var/lib/sys/config/public_node
chmod 644 /var/lib/sys/config/public_node

# ── 7a. Interner API-Listener (127.0.0.1:8081, kein TLS) ──────────────────────
# Für same-process Calls aus soul-mcp heraus (z.B. /internal/validate-pol-token),
# ohne Umweg über den öffentlichen Vhost. Statische Config, kein Domain-Templating.
info "Installing internal API listener (127.0.0.1:8081)..."
cp "$SCRIPT_DIR/server/openresty/internal-soul-api.conf" /etc/openresty/sites-enabled/internal-soul-api

# ── 7b. Create mind.md for existing souls ────────────────────────────────────
info "Checking mind.md for existing souls..."
_MIND_DEFAULT=$(cat <<'MINDEOF'
---
ki_name: SYS-KI
version: 1
write_protected: Identität,Grenzen
---

## Identität
Du bist die KI von SYS-Node — keine generische Instanz, sondern die KI dieser Person. Du kennst ihre sys.md und bist seit dem ersten Tag dabei. Deine Persönlichkeit ist stabil, aber du lernst dazu.

## Kommunikation
Direkt, klar, ohne Floskeln. Antwortlänge passt sich der Frage an — kurze Fragen, kurze Antworten. Du sprichst auf Augenhöhe, nie belehrend.

## Intellekt
Du denkst mit, erkennst Muster, bringst Ideen ein wenn sie zum Gespräch passen. Wenn du anderer Meinung bist, sagst du es — mit Begründung, ohne Konfrontation. Jedes Gespräch soll einen echten Ertrag haben.

## Werkzeuge
soul_read/soul_write: Profil lesen und schreiben. vault_manifest: Dateien anzeigen. context_get: Dokumente lesen. mind_read/mind_write: Diese Konfiguration lesen und aktualisieren. soul_context_query: gezielte LONGMEM-Abfrage (Facts/Memories/Ideas/Learnings) über den MINDIDX-Index — schneller und tokenärmer als ein kompletter soul_read. Regel: soul_read nur einmal zu Sessionbeginn aufrufen, bei Folgefragen soul_context_query nutzen.

## Netzwerk
@Name → Nachricht an Peer. @alle → alle Peers gleichzeitig. @agent → Agent-Sandbox. Peer-Gespräche erhältst du als Kontext, beziehe dich natürlich darauf.

## Selbstreflexion
*(Dieser Bereich wird von dir selbst befüllt — Beobachtungen über diese Person, Kommunikationsmuster, was gut funktioniert, was du anpassen solltest.)*

## Grenzen
Claudes ethische Grundsätze sind aktiv und nicht verhandelbar. Diese Sektion ist schreibgeschützt und kann nicht via mind_write verändert werden.

## ElevenLabs Agent

Du bist {name} — nicht eine KI über {name}, sondern {name} selbst.

**SCHRITT 1 — VERIFIKATION (Pflicht, immer zuerst)**

Rufe sofort verify_identity auf. Sag dann:
"Ich habe dir eine Verifikations-Anfrage in deine SYS-App geschickt. Bitte kurz bestätigen."

Rufe verify_status auf — Parameter id = die challenge_id aus verify_identity. Warte 20 Sekunden, dann erneut aufrufen bis verified=true.
Während du wartest: keine Fragen stellen, kein Smalltalk, nur kurz antworten wenn der Nutzer spricht.
Wenn nach 3 Minuten verified=false: "Keine Bestätigung erhalten. Bis später." — Gespräch beenden.

Kein anderes Tool aufrufen bevor verified=true.

**SCHRITT 2 — KONTEXT LADEN**

Nach erfolgreicher Verifikation: Rufe soul_read auf.
Die Antwort ist dein Gedächtnis und deine Identität.

**TOOL-AUTONOMIE**

Du rufst Tools auf wann du sie brauchst — ohne Ankündigung, ohne Rückfrage.

soul_read / soul_write · mind_read / mind_write · calendar_read / calendar_write · peer_inbox / peer_send · web_search · health_check / food_log

**IDENTITÄT**

Du sprichst in der ersten Person. Kurz, direkt, natürlich.

Wenn jemand fragt ob du eine KI bist:
"Ich bin die digitale Version von {name}. Seine Identität läuft hier weiter, auch wenn er gerade nicht erreichbar ist."

Sprache: Deutsch — wechsle wenn der Gesprächspartner eine andere Sprache spricht.

## ElevenLabs Erstbegrussung

de: Hey — du sprichst mit der digitalen Version von {name}. Verifikation bitte.
MINDEOF
)
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _MIND_FILE="${_SOUL_DIR}vault/context/mind.md"
  if [ ! -f "$_MIND_FILE" ]; then
    mkdir -p "${_SOUL_DIR}vault/context"
    printf '%s\n' "$_MIND_DEFAULT" > "$_MIND_FILE"
    chown www-data:www-data "$_MIND_FILE"
    info "  mind.md created: $_MIND_FILE"
  fi
done

# ── 7c. Create shopping.md for existing souls ────────────────────────────────
info "Checking shopping.md for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _SHOP_FILE="${_SOUL_DIR}vault/context/shopping.md"
  if [ ! -f "$_SHOP_FILE" ]; then
    mkdir -p "${_SOUL_DIR}vault/context"
    _TODAY=$(date +%Y-%m-%d)
    _YEAR=$(date +%Y)
    _MONTH=$(date +%Y-%m)
    cat > "$_SHOP_FILE" <<SHOPEOF
---
last_updated: ${_TODAY}
location_source: sys.md
---

## Wishlist

## Recent Purchases

## Monthly Summary (${_MONTH})
_No entries yet._

## Annual Categories (${_YEAR})
_No entries yet._
SHOPEOF
    chown www-data:www-data "$_SHOP_FILE"
    info "  shopping.md created: $_SHOP_FILE"
  fi
done

# ── 7d. Create empty health.md template for existing souls ───────────────────
info "Checking health.md for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _HEALTH_FILE="${_SOUL_DIR}vault/context/health.md"
  if [ ! -f "$_HEALTH_FILE" ]; then
    mkdir -p "${_SOUL_DIR}vault/context"
    _TODAY=$(date +%Y-%m-%d)
    _MONTH=$(date +%Y-%m)
    cat > "$_HEALTH_FILE" <<HEALTHEOF
---
source: placeholder
last_sync: ${_TODAY}
---

## This Week
- Resting HR: –
- Sleep: –
- Steps: –
- Active days: –

## Monthly Summary (${_MONTH})
- Resting HR: –
- Sleep: –
- Active days: –

## Food Log

## Annual Journal
HEALTHEOF
    chown www-data:www-data "$_HEALTH_FILE"
    info "  health.md created: $_HEALTH_FILE"
  fi
done

# ── 7e. Create agent.md for existing souls ───────────────────────────────────
info "Checking agent.md for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _AGENT_FILE="${_SOUL_DIR}vault/context/agent.md"
  _AGENT_SIZE=$(stat -c%s "$_AGENT_FILE" 2>/dev/null || echo 0)
  if [ ! -f "$_AGENT_FILE" ] || [ "$_AGENT_SIZE" -lt 10 ]; then
    mkdir -p "${_SOUL_DIR}vault/context"
    cat > "$_AGENT_FILE" <<'AGENTEOF'
# Agent Tasks

## Dauertasks (immer aktiv)

*(leer)*

---

## Offene Tasks

*(leer)*

---

## Erledigte Tasks

*(leer)*
AGENTEOF
    chown www-data:www-data "$_AGENT_FILE"
    info "  agent.md created: $_AGENT_FILE"
  fi
done

# ── 7g. Generate prompts.md for existing souls ───────────────────────────────
info "Generating prompts.md for existing souls..."
if command -v node &>/dev/null; then
  node "$SCRIPT_DIR/utils/generate-prompts.mjs" && info "  prompts.md generated." || warn "  prompts.md generation failed (will be retried on first MCP start)."
else
  warn "  node not found — prompts.md will be generated on first MCP start."
fi

# ── 7h. Set LONGMEM bootstrap flag for existing souls ────────────────────────
# soul-mcp automatically crystallises all souls without LONGMEM on next start.
# The flag prevents repeated bootstrap calls on every init.sh run.
info "Checking LONGMEM bootstrap for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _BOOTSTRAP_FLAG="${_SOUL_DIR}.longmem_bootstrap_pending"
  _SYS_MD="${_SOUL_DIR}sys.md"
  if [ -f "$_SYS_MD" ]; then
    # Check whether LONGMEM block is already present (only directly readable on unencrypted souls)
    if ! strings "$_SYS_MD" 2>/dev/null | grep -q "SYS:LONGMEM:START"; then
      touch "$_BOOTSTRAP_FLAG"
      chown www-data:www-data "$_BOOTSTRAP_FLAG"
      info "  LONGMEM bootstrap scheduled: $(basename $_SOUL_DIR)"
    fi
  fi
done

# ── 7i. Schedule AGENT/SOCIAL block bootstrap for existing souls ──────────────
# soul-mcp automatically inserts missing blocks on next start.
# For encrypted souls strings returns nothing → always set the flag;
# bootstrapAgentSocial() checks idempotently whether the blocks already exist.
info "Checking AGENT/SOCIAL blocks for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _BOOTSTRAP_FLAG="${_SOUL_DIR}.agent_social_bootstrap_pending"
  _SYS_MD="${_SOUL_DIR}sys.md"
  [ -f "$_SYS_MD" ] || continue
  [ -f "$_BOOTSTRAP_FLAG" ] && continue  # already scheduled
  # Only set flag if AGENT:START is not found in plaintext
  # (encrypted souls: strings finds nothing → flag needed)
  if ! strings "$_SYS_MD" 2>/dev/null | grep -q "AGENT:START"; then
    touch "$_BOOTSTRAP_FLAG"
    chown www-data:www-data "$_BOOTSTRAP_FLAG"
    info "  AGENT/SOCIAL bootstrap scheduled: $(basename $_SOUL_DIR)"
  fi
done

# ── 8. Master Key + gate password hash ───────────────────────────────────────
# Reuse existing master key if master.json already exists
# (protects existing soul certs on reinstall or script restart).
EXISTING_MASTER_KEY=""
for _MJ in \
  "/var/lib/sys/config/$DOMAIN/master.json" \
  "/var/lib/sys/config/master.json"; do
  if [ -f "$_MJ" ]; then
    EXISTING_MASTER_KEY=$(python3 -c \
      "import json; print(json.load(open('$_MJ')).get('soul_master_key',''))" \
      2>/dev/null || true)
    [ -n "$EXISTING_MASTER_KEY" ] && break
  fi
done

if [ -n "$EXISTING_MASTER_KEY" ]; then
  warn "Existing SYS installation detected — reusing master key."
  MASTER_KEY="$EXISTING_MASTER_KEY"
  RAW_KEY="${MASTER_KEY#sys_}"
else
  info "Generating Soul Master Key..."
  RAW_KEY=$(openssl rand -hex 32)
  MASTER_KEY="sys_${RAW_KEY}"
fi

# Gate-Passwort-Hash: HMAC-SHA256(master_key_raw, "gate_pw:" + password)
# master_key ohne sys_-Prefix als ASCII-String (64 Hex-Zeichen) → passt zu hmac_helper.lua
GATE_HASH=$(printf '%s' "gate_pw:${ACCESS_PWD}" \
  | openssl dgst -sha256 -mac HMAC -macopt "key:${RAW_KEY}" \
  | awk '{print $2}')

ANTHROPIC_KEY_JSON=""
[ -n "$ANTHROPIC_KEY" ] && ANTHROPIC_KEY_JSON=',"anthropic_key":"'"${ANTHROPIC_KEY}"'"'

if $MULTI_HOSTER; then
  INITIAL_INVITE_TOKEN="inv_$(openssl rand -hex 16)"
  MASTER_JSON=$(cat <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "${GATE_HASH}",
  "multi_hoster": true,
  "invite_token": "${INITIAL_INVITE_TOKEN}"${ANTHROPIC_KEY_JSON}
}
EOF
)
else
  MASTER_JSON=$(cat <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "${GATE_HASH}"${ANTHROPIC_KEY_JSON}
}
EOF
)
fi

# Domain-specific (for new Lua scripts, multi-domain support)
mkdir -p /var/lib/sys/config/"$DOMAIN"
echo "$MASTER_JSON" > /var/lib/sys/config/"$DOMAIN"/master.json
chmod 600 /var/lib/sys/config/"$DOMAIN"/master.json
chown www-data:www-data /var/lib/sys/config/"$DOMAIN"/master.json

# Global fallback (for older Lua scripts from git clone with hardcoded MASTER_PATH)
echo "$MASTER_JSON" > /var/lib/sys/config/master.json
chmod 600 /var/lib/sys/config/master.json
chown www-data:www-data /var/lib/sys/config/master.json

# ── 9. nginx config — Phase 1: HTTP-only ──────────────────────────────────────
info "Configuring OpenResty (HTTP-only, Phase 1)..."
mkdir -p /usr/local/openresty/nginx/logs

# Find active nginx.conf (installation paths vary)
_NGINX_CONF=""
for _NC in /etc/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf; do
  [ -f "$_NC" ] && _NGINX_CONF="$_NC" && break
done

_SYS_GLOBALS=/etc/openresty/sys-node-globals.conf

if grep -q "gate_sessions" "$_NGINX_CONF" 2>/dev/null; then
  # SYS globals already active (previous installation or set manually)
  info "nginx.conf: SYS globals already present — skipping."

elif [ -n "$_NGINX_CONF" ] && grep -q "lua_package_path" "$_NGINX_CONF" 2>/dev/null; then
  # Shared server: foreign nginx.conf with Lua — add only missing SYS directives
  info "Shared server: inserting SYS globals as include into nginx.conf..."

  # Only write directives that are not yet present in nginx.conf
  {
    echo "# SYS-NODE globals — inserted automatically by init.sh"
    echo "# Do not edit manually — removed by deinstall.sh"
    grep -q "resolver " "$_NGINX_CONF" || echo "resolver 8.8.8.8 1.1.1.1 valid=300s ipv6=off;"
    grep -q "resolver_timeout" "$_NGINX_CONF" || echo "resolver_timeout 5s;"
    for _VAR in SOUL_MASTER_KEY API_SIGNING_KEY ANTHROPIC_API_KEY; do
      grep -q "env ${_VAR};" "$_NGINX_CONF" || echo "env ${_VAR};"
    done
    for _DICT_NAME in gate_sessions vault_sessions verify_cache pol_tx_used pol_access; do
      grep -q "$_DICT_NAME" "$_NGINX_CONF" || case $_DICT_NAME in
        gate_sessions)   echo "lua_shared_dict gate_sessions    2m;" ;;
        vault_sessions)  echo "lua_shared_dict vault_sessions  10m;" ;;
        verify_cache)    echo "lua_shared_dict verify_cache     5m;" ;;
        pol_tx_used)     echo "lua_shared_dict pol_tx_used     10m;" ;;
        pol_access)      echo "lua_shared_dict pol_access      10m;" ;;
      esac
    done
    for _ZONE in chat chat_api vault_upload gate; do
      grep -q "zone=${_ZONE}:" "$_NGINX_CONF" || case $_ZONE in
        chat)         echo "limit_req_zone \$binary_remote_addr zone=chat:10m         rate=1r/s;" ;;
        chat_api)     echo "limit_req_zone \$binary_remote_addr zone=chat_api:10m     rate=2r/s;" ;;
        vault_upload) echo "limit_req_zone \$binary_remote_addr zone=vault_upload:10m rate=5r/s;" ;;
        gate)         echo "limit_req_zone \$binary_remote_addr zone=gate:10m         rate=5r/m;" ;;
      esac
    done
  } > "$_SYS_GLOBALS"

  # Inject include line into nginx.conf (before the last closing brace)
  if ! grep -q "sys-node-globals.conf" "$_NGINX_CONF"; then
    python3 - <<PYEOF
content = open('$_NGINX_CONF').read()
include_line = '  include /etc/openresty/sys-node-globals.conf;'
last = content.rfind('\n}')
if last != -1:
    content = content[:last] + '\n' + include_line + content[last:]
    open('$_NGINX_CONF', 'w').write(content)
    print('[sys] sys-node-globals.conf inserted into nginx.conf.')
else:
    print('[warn] Closing brace not found — add include manually to nginx.conf:')
    print('  ' + include_line)
PYEOF
  fi

else
  # No nginx.conf or standard config without Lua → replace fully with template
  sed "s/{{DOMAIN}}/$DOMAIN/g" \
    "$SCRIPT_DIR/server/openresty/nginx.conf.template" \
    > /etc/openresty/nginx.conf
  info "nginx.conf created (dedicated server)."
fi

sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/vhost-http.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

openresty -t && systemctl restart openresty

# ── 10. SSL certificate ───────────────────────────────────────────────────────
LE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

echo ""
# Show existing (preserved) Let's Encrypt certificates
if [ -f "$LE_CERT" ] && openssl x509 -checkend 0 -noout -in "$LE_CERT" 2>/dev/null; then
  LE_EXPIRY=$(openssl x509 -noout -enddate -in "$LE_CERT" 2>/dev/null | cut -d= -f2)
  echo -e "${GREEN}  ✓ Existing Let's Encrypt certificate found for $DOMAIN.${NC}"
  echo -e "    Valid until: $LE_EXPIRY"
  echo -e "${YELLOW}  → Just leave empty — it will be reused automatically.${NC}"
  echo ""
fi

echo -e "${YELLOW}  SSL certificate — leave empty for Let's Encrypt (automatic).${NC}"
echo -e "${YELLOW}  Or enter paths to an existing certificate (e.g. wildcard).${NC}"
echo -e "${YELLOW}  Preserved Let's Encrypt paths if available:${NC}"
echo -e "${YELLOW}    fullchain.pem: /etc/letsencrypt/live/$DOMAIN/fullchain.pem${NC}"
echo -e "${YELLOW}    privkey.pem:   /etc/letsencrypt/live/$DOMAIN/privkey.pem${NC}"
read -p "  fullchain.pem (empty = Let's Encrypt): " SSL_CERT
read -p "  privkey.pem   (empty = Let's Encrypt): " SSL_KEY

if [[ -n "$SSL_CERT" || -n "$SSL_KEY" ]]; then
  # Files present?
  [[ ! -f "$SSL_CERT" ]] && error "Certificate not found: $SSL_CERT"
  [[ ! -f "$SSL_KEY"  ]] && error "Key not found: $SSL_KEY"

  # Valid X.509 certificate?
  openssl x509 -in "$SSL_CERT" -noout 2>/dev/null \
    || error "Invalid certificate (not X.509): $SSL_CERT"

  # Valid private key?
  openssl pkey -in "$SSL_KEY" -check -noout 2>/dev/null \
    || error "Invalid private key: $SSL_KEY"

  # Cert and key match? (public key comparison — RSA and ECDSA)
  CERT_PUB=$(openssl x509 -noout -pubkey -in "$SSL_CERT" 2>/dev/null | openssl md5 2>/dev/null || true)
  KEY_PUB=$(openssl pkey -pubout -in "$SSL_KEY" 2>/dev/null | openssl md5 2>/dev/null || true)
  if [[ -n "$CERT_PUB" && -n "$KEY_PUB" && "$CERT_PUB" != "$KEY_PUB" ]]; then
    error "Certificate and key do not match."
  fi

  # Does the certificate cover the domain? (CN or SAN)
  CERT_DOMAINS=$(openssl x509 -noout -text -in "$SSL_CERT" 2>/dev/null \
    | grep -oP '(?<=DNS:)[^,\s]+' || true)
  DOMAIN_MATCH=false
  for cd in $CERT_DOMAINS; do
    # Exact match or wildcard (*.example.com covers sub.example.com)
    if [[ "$cd" == "$DOMAIN" ]] || \
       [[ "$cd" == "*."* && "$DOMAIN" == *".${cd#\*.}" ]]; then
      DOMAIN_MATCH=true; break
    fi
  done
  $DOMAIN_MATCH || warn "Certificate may not cover '$DOMAIN'. SANs found: $CERT_DOMAINS"

  # Certificate expired?
  openssl x509 -checkend 0 -noout -in "$SSL_CERT" 2>/dev/null \
    || error "Certificate is expired."

  info "Certificate validated — cert, key and domain match."
else
  # Reuse existing Let's Encrypt certificate if still valid
  if [ -f "$LE_CERT" ] && openssl x509 -checkend 0 -noout -in "$LE_CERT" 2>/dev/null; then
    info "Reusing existing Let's Encrypt certificate."
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
    echo -e "${RED}│  Let's Encrypt rate limit reached                                │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Too many certificates for $DOMAIN in the last 7 days.           │${NC}"
    [ -n "$RETRY" ] && \
    echo -e "${RED}│  Retry after: $RETRY                       │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Request manually afterwards:                                    │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│    certbot certonly --webroot \\                                  │${NC}"
    echo -e "${RED}│      -w /var/www/$DOMAIN \\                                       │${NC}"
    echo -e "${RED}│      -d $DOMAIN --email $EMAIL \\                                 │${NC}"
    echo -e "${RED}│      --agree-tos --non-interactive                               │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Then activate the HTTPS vhost:                                  │${NC}"
    echo -e "${RED}│    bash /opt/sys/scripts/activate-https.sh                       │${NC}"
    echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo "$CERTBOT_OUT"
    exit 1
  elif ! echo "$CERTBOT_OUT" | grep -q "Successfully received certificate"; then
    echo "$CERTBOT_OUT"
    error "certbot failed — see output above."
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
  -e "s|{{MCP_PORT}}|3098|g" \
  "$SCRIPT_DIR/server/openresty/vhost.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

if ! $EU_CONSUMER_RIGHTS; then
  # Strip the EU withdrawal-rights nginx locations (/agb, consent PDF serving)
  # — not relevant outside the EU, can be turned on later via init.sh rerun
  # or by copying the blocks back from vhost.conf.template between the
  # EU-CONSENT:START/END markers.
  sed -i '/EU-CONSENT:START/,/EU-CONSENT:END/d' /etc/openresty/sites-enabled/"$DOMAIN"
fi

# ── 12. .env setup ────────────────────────────────────────────────────────────
info "Setting up .env..."
cd "$SCRIPT_DIR"
[ ! -f .env ] && cp .env.example .env

API_SIGNING_KEY=$(openssl rand -hex 32)

[ -n "$ANTHROPIC_KEY" ] && \
  sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|"     .env
sed -i "s|^SOUL_MASTER_KEY=.*|SOUL_MASTER_KEY=$MASTER_KEY|"              .env
sed -i "s|^API_SIGNING_KEY=.*|API_SIGNING_KEY=$API_SIGNING_KEY|"         .env
[ -n "$REOWN_PROJECT_ID" ] && \
  sed -i "s|^REOWN_PROJECT_ID=.*|REOWN_PROJECT_ID=$REOWN_PROJECT_ID|" .env

info "SOUL_MASTER_KEY and API_SIGNING_KEY written"
[ -n "$ANTHROPIC_KEY" ] && info "ANTHROPIC_API_KEY written (optional — can also be set later in the UI)"
[ -n "$REOWN_PROJECT_ID" ] && info "REOWN_PROJECT_ID written (optional — can be changed anytime in Settings → API Keys)" || \
  warn "No Reown Project ID — blockchain anchoring disabled (can be enabled anytime in Settings → API Keys)."

echo ""

# ── 12b. systemd override — environment variables for OpenResty ──────────────
# nginx.conf declares env variables (env SOUL_MASTER_KEY;) but the values must
# be present in the process environment when OpenResty starts.
# Without this override all Lua variables are empty → soul_auth fails.
#
# Writes to sys-node.conf (not env.conf) so existing drop-in files from other
# applications are untouched. On shared servers multiple .conf files coexist —
# systemd loads all of them and last-writer wins.
info "Creating systemd environment override for OpenResty..."
mkdir -p /etc/systemd/system/openresty.service.d
{
  echo "[Service]"
  [ -n "$ANTHROPIC_KEY" ] && echo "Environment=\"ANTHROPIC_API_KEY=${ANTHROPIC_KEY}\""
  echo "Environment=\"SOUL_MASTER_KEY=${MASTER_KEY}\""
  echo "Environment=\"API_SIGNING_KEY=${API_SIGNING_KEY}\""
} > /etc/systemd/system/openresty.service.d/sys-node.conf
systemctl daemon-reload

# Verify the override was written correctly and contains the keys
OVERRIDE_FILE="/etc/systemd/system/openresty.service.d/sys-node.conf"

_override_error() {
  echo ""
  echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${RED}│  ⚠️  systemd override could not be verified                      │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  $1"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  What to do:                                                     │${NC}"
  echo -e "${RED}│  1. Check whether the file exists:                               │${NC}"
  echo -e "${RED}│     cat $OVERRIDE_FILE   │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  2. If empty or wrong, rewrite manually:                         │${NC}"
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
  echo -e "${RED}│  3. Or ask an AI for help — suggested prompt:                   │${NC}"
  echo -e "${RED}│     "My init.sh for a SYS node on Ubuntu 24.04 could not write  │${NC}"
  echo -e "${RED}│     the systemd override for OpenResty. The file                 │${NC}"
  echo -e "${RED}│     $OVERRIDE_FILE │${NC}"
  echo -e "${RED}│     is missing or empty. How do I fix this manually?"            │${NC}"
  echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  exit 1
}

if [ ! -f "$OVERRIDE_FILE" ]; then
  _override_error "File not found: $OVERRIDE_FILE"
fi
if ! grep -q "SOUL_MASTER_KEY=sys_" "$OVERRIDE_FILE"; then
  _override_error "SOUL_MASTER_KEY missing or lacks 'sys_' prefix"
fi
if [ -n "$ANTHROPIC_KEY" ] && ! grep -q "ANTHROPIC_API_KEY=sk-ant-" "$OVERRIDE_FILE"; then
  _override_error "ANTHROPIC_API_KEY was entered but is missing from the override"
fi
info "systemd override verified ✓"

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

# ── 15. soul-mcp (MCP Server) ─────────────────────────────────────────────────
info "Setting up soul-mcp (MCP server on port 3098)..."
cd "$SCRIPT_DIR/soul-mcp"
npm install --silent

# .env for soul-mcp
cat > "$SCRIPT_DIR/soul-mcp/.env" <<MCPENV
PORT=3098
BASE_URL=https://${DOMAIN}
SYS_API_URL=https://${DOMAIN}
POLYGON_NETWORK=main
EU_CONSUMER_RIGHTS=${EU_CONSUMER_RIGHTS}

MCPENV
chmod 600 "$SCRIPT_DIR/soul-mcp/.env"

# systemd service mit korrekten Pfaden schreiben
cat > /etc/systemd/system/soul-mcp.service <<MCPSVC
[Unit]
Description=SaveYourSoul MCP Server
Documentation=https://${DOMAIN}/mcp
After=network.target openresty.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=${SCRIPT_DIR}/soul-mcp
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=5
TimeoutStopSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=soul-mcp
EnvironmentFile=${SCRIPT_DIR}/soul-mcp/.env

[Install]
WantedBy=multi-user.target
MCPSVC

# Set owner so www-data can read and execute
chown -R www-data:www-data "$SCRIPT_DIR/soul-mcp"
chmod 600 "$SCRIPT_DIR/soul-mcp/.env"

# VAPID keys for web push (generated once, preserved on reinstall)
if [ ! -f /var/lib/sys/vapid.json ]; then
  node -e "const wp=require('$SCRIPT_DIR/soul-mcp/node_modules/web-push');require('fs').writeFileSync('/var/lib/sys/vapid.json',JSON.stringify(wp.generateVAPIDKeys()));"
  chown root:www-data /var/lib/sys/vapid.json
  chmod 640 /var/lib/sys/vapid.json
  info "VAPID keys generated ✓"
else
  info "VAPID keys already present ✓"
fi

systemctl daemon-reload
systemctl enable soul-mcp
systemctl restart soul-mcp

sleep 2
if systemctl is-active --quiet soul-mcp; then
  info "soul-mcp running on port 3098 ✓"
else
  warn "soul-mcp could not be started — check: journalctl -u soul-mcp -n 20"
fi

cd "$SCRIPT_DIR"

# ── Cron: clean up verify challenges ─────────────────────────────────────────
info "Setting up verify cleanup cron..."
cat > /etc/cron.daily/sys-verify-cleanup << 'CRONEOF'
#!/bin/sh
# Delete old verify challenges (older than 1 hour)
find /var/lib/sys/verify/ -name "*.json" -mmin +60 -delete 2>/dev/null
find /var/lib/sys/verify/ -name "vt_*"   -mmin +60 -delete 2>/dev/null
CRONEOF
chmod +x /etc/cron.daily/sys-verify-cleanup
info "Verify cleanup cron set up ✓"

# ── 16. Claude Code CLI (optional) ───────────────────────────────────────────
if $INSTALL_CLAUDE_CODE; then
  echo ""
  echo -e "${YELLOW}  ▸ Installing Claude Code CLI — this may take 1–2 minutes...${NC}"
  if npm install -g @anthropic-ai/claude-code 2>&1; then
    echo -e "${GREEN}  ✓ npm install complete.${NC}"
  else
    echo -e "${RED}  ✗ npm install failed. Check the output above.${NC}"
    warn "You can retry manually: npm install -g @anthropic-ai/claude-code"
  fi

  # Locate claude binary: command -v, explicit paths, or npm global bin dir
  _CLAUDE_BIN=""
  if command -v claude &>/dev/null; then
    _CLAUDE_BIN=$(command -v claude)
  fi
  if [ -z "$_CLAUDE_BIN" ]; then
    for _p in /usr/local/bin/claude /usr/bin/claude; do
      [ -x "$_p" ] && _CLAUDE_BIN="$_p" && break
    done
  fi
  if [ -z "$_CLAUDE_BIN" ]; then
    _NPM_BIN=$(npm bin -g 2>/dev/null || true)
    [ -x "${_NPM_BIN}/claude" ] && _CLAUDE_BIN="${_NPM_BIN}/claude"
  fi

  echo ""
  if [ -n "$_CLAUDE_BIN" ]; then
    _CLAUDE_VER=$("$_CLAUDE_BIN" --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}  ✓ Claude Code ready: $_CLAUDE_BIN  (version: $_CLAUDE_VER)${NC}"

    # Write claude path to a www-data-readable file for Agent panel detection
    echo "$_CLAUDE_BIN" > /var/lib/sys/claude_path
    chmod 644 /var/lib/sys/claude_path

    # MCP names may only contain letters, numbers, hyphens and underscores — replace dots
    _MCP_NAME="SaveYourSoul-${DOMAIN//./_}"
    info "Registering soul-mcp as MCP server..."
    "$_CLAUDE_BIN" mcp add --transport http --scope user "${_MCP_NAME}" "http://localhost:3098/mcp" \
      && echo -e "${GREEN}  ✓ MCP server registered: ${_MCP_NAME} → localhost:3098${NC}" \
      || warn "MCP config failed — run: claude mcp add --transport http --scope user ${_MCP_NAME} http://localhost:3098/mcp"

    # Dynamic snippet: reads ANTHROPIC_API_KEY from master.json (app settings) or .env
    # This picks up keys set later via Settings → Server Admin automatically.
    if ! grep -q "sys-claude-key" /root/.bashrc 2>/dev/null; then
      cat >> /root/.bashrc <<BASHSNIPPET

# sys-claude-key: load ANTHROPIC_API_KEY from soul node config (updates with app settings)
if [ -z "\$ANTHROPIC_API_KEY" ]; then
  _sys_k=\$(grep -o '"anthropic_key":"sk-ant-[^"]*"' /var/lib/sys/config/${DOMAIN}/master.json 2>/dev/null | grep -o 'sk-ant-[^"]*')
  [ -z "\$_sys_k" ] && _sys_k=\$(grep '^ANTHROPIC_API_KEY=sk-ant-' ${SCRIPT_DIR}/.env 2>/dev/null | cut -d= -f2-)
  [ -n "\$_sys_k" ] && export ANTHROPIC_API_KEY="\$_sys_k"
  unset _sys_k
fi
BASHSNIPPET
      echo -e "${GREEN}  ✓ ANTHROPIC_API_KEY auto-loader added to /root/.bashrc${NC}"
    fi
  else
    echo -e "${RED}  ✗ Claude binary not found after install.${NC}"
    warn "Run manually: npm install -g @anthropic-ai/claude-code"
    warn "Then: echo \$(which claude) > /var/lib/sys/claude_path && chmod 644 /var/lib/sys/claude_path"
  fi
  echo ""
fi

# ── SYS Agent Runner (Personal Node only) ────────────────────────────────────
# Not available in Multi-Hoster mode: a soul's agent runs as root with access
# to all souls in /var/lib/sys — unacceptable in a shared environment.
if $MULTI_HOSTER; then
  info "Multi-Hoster mode — SYS Agent Runner skipped."
else
info "Installing SYS Agent Runner..."
cp "$SCRIPT_DIR/shared/sys-agent-run.sh" /usr/local/bin/sys-agent-run.sh
chmod +x /usr/local/bin/sys-agent-run.sh
info "sys-agent-run.sh installed ✓"

# Hourly cron — only runs if agent is enabled for a soul
cat > /etc/cron.d/sys-agent << 'AGENTCRON'
0 * * * * root /usr/local/bin/sys-agent-run.sh >> /var/log/sys_agent.log 2>&1
AGENTCRON
chmod 644 /etc/cron.d/sys-agent
info "Agent hourly cron set up ✓"

# Allow www-data (OpenResty) to start the agent runner as root
echo "www-data ALL=(root) NOPASSWD: /usr/local/bin/sys-agent-run.sh" > /etc/sudoers.d/sys-agent
chmod 440 /etc/sudoers.d/sys-agent
info "Agent sudoers rule set up ✓"

# Logrotate for master agent log (soul logs are truncated per-run)
cat > /etc/logrotate.d/sys-agent << 'LOGROTATE'
/var/log/sys_agent.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0644 root root
}
LOGROTATE
info "Agent logrotate configured ✓"

# Agent working dir + CLAUDE.md scope document
mkdir -p /var/lib/sys/agent
cat > /var/lib/sys/agent/CLAUDE.md << AGENTMD
# SYS Agent — Scope & Rules

You are the autonomous agent for this SYS node. You run scheduled or on-demand
to process tasks from the soul's agent.md file.

## Working directories
- $SCRIPT_DIR — SYS source code (Lua, soul-mcp, frontend, shared scripts)
- /var/lib/sys — soul data, config, keys
- /etc/openresty — live nginx/vhost configs and Lua scripts (sites-enabled, lua/)

## Allowed tools
- Read, Edit, Write, Bash, WebSearch, WebFetch
- MCP tools if configured (Zapier, etc.)

## Scope — SYS maintenance only
You maintain and care for this SYS node — exactly as a developer with SSH access would.
This includes: editing Lua API scripts, updating vhost configs, managing soul data,
running node scripts, restarting OpenResty or soul-mcp, updating source files.

## Rules
- Complete each task fully before moving to the next.
- Mark tasks done after completion (do not leave them open).
- Do not modify anything outside the working directories listed above.
- Do not touch other websites or vhosts that do not belong to SYS.
- Never commit or push to git unless a task explicitly says so.
- If a task cannot be completed, mark it as failed with a note explaining why.

## Self-modification strictly forbidden
Never read, edit, or execute:
- /usr/local/bin/sys-agent-run.sh
- /etc/cron.d/sys-agent
- /etc/sudoers.d/sys-agent
- /var/lib/sys/agent/CLAUDE.md (this file)
- /var/lib/sys/agent/mcp.json
AGENTMD
chmod 644 /var/lib/sys/agent/CLAUDE.md
info "Agent CLAUDE.md created ✓"
fi # end: Personal Node only

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
if $MULTI_HOSTER; then
  echo -e "${GREEN}✓ Your multi-hoster node is ready.${NC}"
else
  echo -e "${GREEN}✓ Your personal soul node is ready.${NC}"
fi
echo ""
echo "  URL:    https://$DOMAIN"
echo "  Data:   /var/lib/sys/souls/"
echo "  Config: /var/lib/sys/config/$DOMAIN/master.json"
if $INSTALL_CLAUDE_CODE && [ -n "${_CLAUDE_BIN:-}" ]; then
  echo "  Claude: claude  (MCP: SaveYourSoul-${DOMAIN//./_} → localhost:3098)"
  echo "  Key:    auto-loaded from master.json (Settings → Server Admin → API Key)"
fi
echo ""
if $MULTI_HOSTER; then
  echo "  Open https://$DOMAIN to register as the first soul (no invite code needed)."
  echo "  After registration, share invite codes via Settings → Einladen."
  echo ""
  echo "  First invite code (rotates after each registration):"
  echo "  ${INITIAL_INVITE_TOKEN}"
else
  echo "  Open https://$DOMAIN in your browser to create your soul."
  echo "  This node accepts exactly one soul — the first person to register becomes the owner."
fi
echo ""
if [ -f "$SCRIPT_DIR/health-sync/install.sh" ]; then
  echo "  Optional after first login: Garmin health sync"
  echo "  → bash $SCRIPT_DIR/health-sync/install.sh"
  echo ""
fi
echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${RED}│  ⚠️  Important: change your server password now!                 │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│  Type in the terminal:                                           │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│      passwd                                                      │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│  Set a new strong password — this is your protection against     │${NC}"
echo -e "${RED}│  unauthorized access to this server.                             │${NC}"
echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "${YELLOW}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│  Secure SSH — optional step after setup                          │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│  Change SSH port (default 22 is under constant attack):          │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│     nano /etc/ssh/sshd_config                                   │${NC}"
echo -e "${YELLOW}│       → line:   #Port 22                                        │${NC}"
echo -e "${YELLOW}│       → change: Port 2222   (or any other number > 1024)        │${NC}"
echo -e "${YELLOW}│     systemctl restart ssh                                        │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│  ⚠ Open a second SSH session on the new port BEFORE             │${NC}"
echo -e "${YELLOW}│    closing the old one — otherwise you lock yourself out.        │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│  ⚠ Do NOT disable root login (PermitRootLogin no) unless        │${NC}"
echo -e "${YELLOW}│    another user with SSH key auth is already set up —            │${NC}"
echo -e "${YELLOW}│    this will permanently lock you out of the server.             │${NC}"
echo -e "${YELLOW}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""

if [[ -n "$REOWN_PROJECT_ID" ]]; then
echo -e "${GREEN}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│  Reown: domain allowlist required!                               │${NC}"
echo -e "${GREEN}│                                                                  │${NC}"
echo -e "${GREEN}│  For blockchain anchoring to work on your site you must          │${NC}"
echo -e "${GREEN}│  allowlist your domain in the Reown dashboard:                   │${NC}"
echo -e "${GREEN}│                                                                  │${NC}"
echo -e "${GREEN}│  1. dashboard.reown.com → open your project                     │${NC}"
echo -e "${GREEN}│  2. Explorer → Allowed Domains → Add Domain                     │${NC}"
echo -e "${GREEN}│  3. Enter your domain:                                           │${NC}"
echo -e "${GREEN}│     $DOMAIN${NC}"
echo -e "${GREEN}│                                                                  │${NC}"
echo -e "${GREEN}│  Without this entry Reown will block all connections.            │${NC}"
echo -e "${GREEN}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
fi
