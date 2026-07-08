#!/usr/bin/env bash
# update.sh — Pull latest code and redeploy Lua + frontend on this SYS node.
# Run as root: bash update.sh
set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[update]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*"; exit 1; }

[ "$(id -u)" = "0" ] || err "Run as root: sudo bash update.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
info "Pulling latest code..."
git -C "$SCRIPT_DIR" pull --ff-only || err "git pull failed — check remote or merge conflicts"

# ── 2. Deploy Lua files ───────────────────────────────────────────────────────
info "Deploying Lua files to /etc/openresty/lua/ ..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/
chown www-data:www-data /etc/openresty/lua/*.lua

# ── 3. Reload OpenResty ───────────────────────────────────────────────────────
info "Reloading OpenResty..."
openresty -t && openresty -s reload && info "OpenResty reloaded."

# ── 4. Write claude_path sentinel if claude is installed ──────────────────────
CLAUDE_PATH_FILE="/var/lib/sys/claude_path"
if command -v claude &>/dev/null; then
  CLAUDE_BIN=$(command -v claude)
  echo "$CLAUDE_BIN" > "$CLAUDE_PATH_FILE"
  chmod 644 "$CLAUDE_PATH_FILE"
  info "claude_path written: $CLAUDE_BIN"
elif [ -f "$CLAUDE_PATH_FILE" ]; then
  warn "claude not in PATH — existing sentinel file kept: $(cat "$CLAUDE_PATH_FILE")"
else
  warn "claude not installed — sentinel file not written (Agent panel will show 'not installed')"
fi

# ── 5. Create agent.md for existing souls ────────────────────────────────────
info "Checking agent.md for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _AGENT_FILE="${_SOUL_DIR}vault/context/agent.md"
  _AGENT_SIZE=$(stat -c%s "$_AGENT_FILE" 2>/dev/null || echo 0)
  if [ ! -f "$_AGENT_FILE" ] || [ "$_AGENT_SIZE" -lt 10 ]; then
    mkdir -p "${_SOUL_DIR}vault/context"
    cat > "$_AGENT_FILE" <<'AGENTEOF'
# SYS Agent Queue
<!-- Tasks werden von Claude AI via MCP hier eingetragen. -->
<!-- Format: - [ ] task  →  Agent holt sie beim nächsten Cron-Lauf ab -->

## Pending



## Done
AGENTEOF
    chown www-data:www-data "$_AGENT_FILE"
    info "  agent.md created: $_AGENT_FILE"
  fi
done

# ── 6. Rebuild + deploy frontend ──────────────────────────────────────────────
# Find deploy path from nginx config
DEPLOY_DIR=""
_NGINX_CONF=$(find /etc/openresty /usr/local/openresty /etc/nginx -name "*.conf" 2>/dev/null | xargs grep -l "root /var/www/" 2>/dev/null | head -1 || true)
if [ -n "$_NGINX_CONF" ]; then
  DEPLOY_DIR=$(grep -o 'root /var/www/[^;]*' "$_NGINX_CONF" 2>/dev/null | head -1 | awk '{print $2}')
fi
[ -z "$DEPLOY_DIR" ] && DEPLOY_DIR="/var/www/me.uxprojects-jok.com"

info "Building frontend..."
cd "$SCRIPT_DIR"
if command -v npm &>/dev/null; then
  npm run generate 2>&1 | tail -3
  rsync -a --delete "$SCRIPT_DIR/.output/public/" "$DEPLOY_DIR/"
  info "Frontend deployed to $DEPLOY_DIR"
else
  warn "npm not found — frontend not rebuilt (Lua + OpenResty update still applied)"
fi

# ── 7. soul-mcp: sync + restart ──────────────────────────────────────────────
# Erkennt ob der Service aus dem Repo oder aus /opt/sys/soul-mcp läuft.
# Bei /opt/sys/ (Legacy-Setup): JS-Dateien aus Repo dorthin kopieren — ALLE
# Top-Level-*.mjs plus lib/, tools/, prompts/, nicht nur server.mjs. Die
# eigentliche MCP-Tool-Logik lebt in tools/ (40+ Dateien) — wurde die früher
# vergessen, blieben Tool-Änderungen auf Legacy-Installs unwirksam.
# Bei $SCRIPT_DIR (modernes Init): git pull hat die Dateien schon aktualisiert.
_MCP_WD=$(systemctl show soul-mcp --property=WorkingDirectory --value 2>/dev/null || true)
if [ -d "/opt/sys/soul-mcp" ] && [ "$_MCP_WD" = "/opt/sys/soul-mcp" ]; then
  info "Syncing soul-mcp to /opt/sys/soul-mcp/ ..."
  cp "$SCRIPT_DIR"/soul-mcp/*.mjs        /opt/sys/soul-mcp/
  cp -r "$SCRIPT_DIR/soul-mcp/lib/"      /opt/sys/soul-mcp/lib/
  cp -r "$SCRIPT_DIR/soul-mcp/tools/"    /opt/sys/soul-mcp/tools/
  cp -r "$SCRIPT_DIR/soul-mcp/prompts/"  /opt/sys/soul-mcp/prompts/
  chown -R www-data:www-data /opt/sys/soul-mcp/*.mjs /opt/sys/soul-mcp/lib/ /opt/sys/soul-mcp/tools/ /opt/sys/soul-mcp/prompts/
fi

# ── 8. EU_CONSUMER_RIGHTS backward-compat ─────────────────────────────────────
# Installs von vor diesem Toggle (init.sh schreibt es seit Kurzem immer in
# soul-mcp/.env) hatten den EU-Widerrufsrecht-Code fest aktiv, ohne Flag.
# Fehlt die Variable komplett (nicht: ist auf false gesetzt — das ist eine
# bewusste Wahl aus einem neueren init.sh-Lauf), war's ein Alt-Setup — Flag auf
# "true" setzen, damit sich das bisherige Verhalten nicht still ändert.
_MCP_ENV="$SCRIPT_DIR/soul-mcp/.env"
[ "$_MCP_WD" = "/opt/sys/soul-mcp" ] && _MCP_ENV="/opt/sys/soul-mcp/.env"
if [ -f "$_MCP_ENV" ] && ! grep -q "^EU_CONSUMER_RIGHTS=" "$_MCP_ENV"; then
  warn "EU_CONSUMER_RIGHTS fehlt in $_MCP_ENV (Alt-Setup) — setze auf true, um bisheriges Verhalten zu erhalten."
  echo "EU_CONSUMER_RIGHTS=true" >> "$_MCP_ENV"
  mkdir -p /var/lib/sys/config
  echo -n "true" > /var/lib/sys/config/eu_consumer_rights
  chmod 644 /var/lib/sys/config/eu_consumer_rights
fi

if systemctl is-enabled --quiet soul-mcp 2>/dev/null; then
  systemctl restart soul-mcp && info "soul-mcp restarted ✓"
fi

info "Update complete."
