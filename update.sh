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

# ── 0. Swap (2 GB) ─────────────────────────────────────────────────────────────
# Same rationale as init.sh: the frontend build below can exceed 2 GB RAM on
# small VPS instances. init.sh sets this up on fresh installs, but the
# swapfile only survives a reboot if it's also in /etc/fstab — repair both
# here so an update never trips over a node that lost its swap.
if [ ! -f /swapfile ]; then
  info "Setting up swap (2 GB)..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap  /swapfile
fi
swapon /swapfile 2>/dev/null || true
if ! grep -q "^/swapfile" /etc/fstab; then
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# ── 1. Pull latest code ───────────────────────────────────────────────────────
info "Pulling latest code..."
git -C "$SCRIPT_DIR" pull --ff-only || err "git pull failed — check remote or merge conflicts"

# ── 2. Deploy Lua files ───────────────────────────────────────────────────────
info "Deploying Lua files to /etc/openresty/lua/ ..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/
chown www-data:www-data /etc/openresty/lua/*.lua

# ── 2b. Deploy shared config templates ────────────────────────────────────────
info "Deploying shared config templates to /var/lib/sys/config/ ..."
cp "$SCRIPT_DIR/shared/constants/pricing_params.json" /var/lib/sys/config/pricing_params.json
cp "$SCRIPT_DIR/shared/constants/default_mind.md"     /var/lib/sys/config/default_mind.md

# ── 2c. Sync internal-soul-api site config ────────────────────────────────────
# Same init.sh-only-copies-it-once gap as the vhost/agent-runner fixes below —
# static file, no template placeholders, so a plain sync is enough.
if [ -f "$SCRIPT_DIR/server/openresty/internal-soul-api.conf" ] \
   && [ -f /etc/openresty/sites-enabled/internal-soul-api ] \
   && ! diff -q "$SCRIPT_DIR/server/openresty/internal-soul-api.conf" /etc/openresty/sites-enabled/internal-soul-api >/dev/null 2>&1; then
  cp "$SCRIPT_DIR/server/openresty/internal-soul-api.conf" /etc/openresty/sites-enabled/internal-soul-api
  info "internal-soul-api config updated."
fi

# ── 2d. Regenerate OpenResty vhost config from template ───────────────────────
# update.sh only ever copied *.lua files — a location block added to
# vhost.conf.template (new API route, new SPA page needing its own try_files
# fallback, ...) never reached already-installed nodes, since only init.sh
# ever rendered this file. Regenerate it here too, the same way init.sh does,
# but non-destructively: only touch the live file if the rendered result
# actually differs, keep a backup, and roll back on a failed syntax check
# instead of leaving a broken config for step 3's reload to trip over.
#
# Find THIS node's own domain via the marker init.sh leaves behind
# (mkdir -p /var/lib/sys/config/"$DOMAIN"), instead of guessing from
# sites-enabled — on a shared-server node hosting several SYS-adjacent
# sites (this one plus a docs subdomain, another product, ...) more than
# one vhost has a "root /var/www/..." line, and grabbing "whichever the
# filesystem returns first" previously deployed this node's own frontend
# into an unrelated site's docroot (confirmed live 2026-08-08).
_NODE_DOMAIN=""
for d in /var/lib/sys/config/*/; do
  [ -d "$d" ] || continue
  _bn="$(basename "$d")"
  [[ "$_bn" == *.* ]] || continue
  _NODE_DOMAIN="$_bn"
  break
done

_SITE_CONF=""
_DOMAIN=""
if [ -n "$_NODE_DOMAIN" ] && [ -f "/etc/openresty/sites-enabled/$_NODE_DOMAIN" ]; then
  _SITE_CONF="/etc/openresty/sites-enabled/$_NODE_DOMAIN"
  _DOMAIN="$_NODE_DOMAIN"
else
  # Older installs without the config-dir marker — fall back to the
  # previous heuristic (first sites-enabled file with a /var/www/ root).
  for f in /etc/openresty/sites-enabled/*; do
    [ -f "$f" ] || continue
    grep -q "root /var/www/" "$f" 2>/dev/null || continue
    _SITE_CONF="$f"
    _DOMAIN="$(basename "$f")"
    break
  done
fi

if [ -n "$_SITE_CONF" ] && [ -f "$SCRIPT_DIR/server/openresty/vhost.conf.template" ]; then
  _SSL_CERT=$(sed -n 's/^[[:space:]]*ssl_certificate[[:space:]]\+\([^;]*\);.*/\1/p' "$_SITE_CONF" | head -1)
  _SSL_KEY=$(sed -n 's/^[[:space:]]*ssl_certificate_key[[:space:]]\+\([^;]*\);.*/\1/p' "$_SITE_CONF" | head -1)
  _RENDERED=$(mktemp)
  sed \
    -e "s|{{DOMAIN}}|$_DOMAIN|g" \
    -e "s|{{SSL_CERT}}|$_SSL_CERT|g" \
    -e "s|{{SSL_KEY}}|$_SSL_KEY|g" \
    -e "s|{{MCP_PORT}}|3098|g" \
    "$SCRIPT_DIR/server/openresty/vhost.conf.template" \
    > "$_RENDERED"

  _EU_ENABLED=true
  for _e in "$SCRIPT_DIR/soul-mcp/.env" "/opt/sys/soul-mcp/.env"; do
    [ -f "$_e" ] && grep -q "^EU_CONSUMER_RIGHTS=false" "$_e" && _EU_ENABLED=false
  done
  [ "$_EU_ENABLED" = false ] && sed -i '/EU-CONSENT:START/,/EU-CONSENT:END/d' "$_RENDERED"

  if ! diff -q "$_RENDERED" "$_SITE_CONF" >/dev/null 2>&1; then
    info "vhost config for $_DOMAIN is out of date — regenerating..."
    mkdir -p /var/lib/sys/config
    _BACKUP="/var/lib/sys/config/vhost-backup-$_DOMAIN-$(date +%s).conf"
    cp "$_SITE_CONF" "$_BACKUP"
    cp "$_RENDERED" "$_SITE_CONF"
    if openresty -t 2>&1; then
      info "vhost config regenerated (previous version backed up to $_BACKUP)."
    else
      warn "Regenerated vhost config failed syntax check — restoring previous version."
      cp "$_BACKUP" "$_SITE_CONF"
    fi
  else
    info "vhost config for $_DOMAIN already up to date."
  fi
  rm -f "$_RENDERED"
else
  warn "Could not find an existing site config with a /var/www/ root (or vhost.conf.template missing) — skipping vhost regeneration."
fi

# ── 2b. Sync new lua_shared_dict declarations into the live nginx.conf ───────
# Same class of gap as the vhost.conf sync above and the sys-agent-run.sh gap
# fixed in v1.3.14: nginx.conf itself (global http{} block, not the per-domain
# vhost) is only ever written once, by init.sh at install time — a
# lua_shared_dict added to nginx.conf.template later (e.g. sys_write_lock,
# v1.4.x) never reached already-running nodes no matter how many times they
# updated, since nothing here ever re-diffed it. Found live on
# fab.uxprojects-jok.com right after pulling the commit that added
# sys_write_lock: write_lock.lua loaded fine (fails open without the dict —
# no crash, just silently no locking), but the intended protection was inert
# until this was caught and patched in by hand.
# Insert-only, one directive per missing name — never touches unrelated
# nginx.conf content, and never runs on a shared-server nginx.conf (line 631
# in init.sh's own shared-server branch uses the same "insert only" model,
# this mirrors it for the update path instead of the install path).
_NGINX_CONF_LIVE=""
for _NC in /etc/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf; do
  [ -f "$_NC" ] && _NGINX_CONF_LIVE="$_NC" && break
done
if [ -n "$_NGINX_CONF_LIVE" ] && [ -f "$SCRIPT_DIR/server/openresty/nginx.conf.template" ] && grep -q "lua_package_path" "$_NGINX_CONF_LIVE"; then
  _DICTS_ADDED=0
  while IFS= read -r _DICT_LINE; do
    _DICT_NAME=$(echo "$_DICT_LINE" | awk '{print $2}')
    [ -n "$_DICT_NAME" ] || continue
    if ! grep -q "lua_shared_dict[[:space:]]\+$_DICT_NAME\b" "$_NGINX_CONF_LIVE"; then
      sed -i "/lua_package_path /a\\  $_DICT_LINE" "$_NGINX_CONF_LIVE"
      info "nginx.conf: added missing lua_shared_dict '$_DICT_NAME'."
      _DICTS_ADDED=1
    fi
  done < <(grep "^\s*lua_shared_dict " "$SCRIPT_DIR/server/openresty/nginx.conf.template" | sed 's/^\s*//')
  if [ "$_DICTS_ADDED" = 1 ]; then
    if openresty -t 2>&1; then
      info "nginx.conf updated with new shared dicts."
    else
      warn "nginx.conf syntax check failed after adding shared dicts — check manually, changes were NOT reverted automatically."
    fi
  fi
fi

# ── 3. Reload OpenResty ───────────────────────────────────────────────────────
info "Reloading OpenResty..."
openresty -t && openresty -s reload && info "OpenResty reloaded."

# ── 4. Ensure Claude Code CLI is installed, write claude_path sentinel ────────
# Every node gets Autonomous Agent capability (see init.sh) — if the binary
# went missing since install (uninstalled, npm prefix wiped, ...), self-heal
# here instead of just warning, so a node never silently loses this without
# an operator noticing the warning in an update log they may not read.
CLAUDE_PATH_FILE="/var/lib/sys/claude_path"
if ! command -v claude &>/dev/null; then
  if command -v npm &>/dev/null; then
    info "claude not found — reinstalling Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code || warn "npm install -g @anthropic-ai/claude-code failed — see output above."
  else
    warn "claude not found and npm unavailable — cannot reinstall."
  fi
fi
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

# ── 4b. Sync SYS Agent Runner ──────────────────────────────────────────────────
# init.sh copies shared/sys-agent-run.sh to /usr/local/bin/ once, at install
# time — nothing previously re-synced it on update, so fixes landing in the
# repo (like the vault-decryption fix that motivated this step) never reached
# the actual cron script already deployed on a node.
if [ -f "$SCRIPT_DIR/shared/sys-agent-run.sh" ]; then
  if ! diff -q "$SCRIPT_DIR/shared/sys-agent-run.sh" /usr/local/bin/sys-agent-run.sh >/dev/null 2>&1; then
    cp "$SCRIPT_DIR/shared/sys-agent-run.sh" /usr/local/bin/sys-agent-run.sh
    chmod +x /usr/local/bin/sys-agent-run.sh
    info "sys-agent-run.sh updated."
  fi
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

# ── 5b. Install bundled read-only MCP Apps for existing souls ────────────────
# show-social-chat/show-agent-chat (Social Sphere / Agent Sandbox) and
# kunstwerk-live (soul_draw stroke-by-stroke replay, polls soul_draw_replay —
# see docs/spec/mcp-apps.md), see soul_apps.mjs — installed once per soul,
# never overwritten afterward, so a soul that customizes its own copy keeps
# it across updates.
info "Checking show-social-chat/show-agent-chat/kunstwerk-live apps for existing souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  for _APP in show-social-chat show-agent-chat kunstwerk-live; do
    _APP_DIR="${_SOUL_DIR}vault_shared/apps/${_APP}"
    if [ ! -f "${_APP_DIR}/index.html" ]; then
      mkdir -p "$_APP_DIR"
      # mkdir -p above may have just created vault_shared/apps/ itself (root-
      # owned, this script runs as root) if it didn't already exist — the
      # chown -R below only fixes $_APP_DIR and its own contents, never the
      # apps/ parent. Left root-owned, www-data (the OpenResty worker that
      # handles app uploads via /api/vault/apps, see api_serve.lua) can list
      # existing apps but can never mkdir a NEW one in it — every future
      # upload fails with write_failed on the app's first file. Found live
      # (2026-08-14): a soul's apps/ was root:root while its two subfolders
      # were correctly www-data-owned, exactly this sequence.
      chown www-data:www-data "${_SOUL_DIR}vault_shared/apps"
      cp "$SCRIPT_DIR/shared/apps/${_APP}/"* "$_APP_DIR/"
      chown -R www-data:www-data "$_APP_DIR"
      info "  ${_APP} installed for $(basename "$_SOUL_DIR")"
    fi
  done
done

# ── 6. Rebuild + deploy frontend ──────────────────────────────────────────────
# Find deploy path for THIS node's own frontend. Reuse _SITE_CONF from step
# 2d (resolved via the /var/lib/sys/config/<domain>/ marker) rather than
# re-deriving it — on a shared-server node, a generic "any vhost with a
# /var/www/ root, whichever the filesystem returns first" search can land on
# a completely unrelated site's docroot instead of this node's own (see the
# comment in step 2d for the incident that exposed this).
DEPLOY_DIR=""
if [ -n "$_SITE_CONF" ]; then
  DEPLOY_DIR=$(grep -o 'root /var/www/[^;]*' "$_SITE_CONF" 2>/dev/null | head -1 | awk '{print $2}')
fi
if [ -z "$DEPLOY_DIR" ]; then
  _NGINX_CONF=$(grep -rl "root /var/www/" /etc/openresty /usr/local/openresty/nginx/conf /etc/nginx 2>/dev/null | head -1 || true)
  if [ -n "$_NGINX_CONF" ]; then
    DEPLOY_DIR=$(grep -o 'root /var/www/[^;]*' "$_NGINX_CONF" 2>/dev/null | head -1 | awk '{print $2}')
  fi
fi
if [ -z "$DEPLOY_DIR" ]; then
  # Fall back to the sole directory under /var/www/, if there's exactly one —
  # safer than guessing a domain name.
  _WWW_DIRS=(/var/www/*/)
  [ "${#_WWW_DIRS[@]}" -eq 1 ] && [ -d "${_WWW_DIRS[0]}" ] && DEPLOY_DIR="${_WWW_DIRS[0]%/}"
fi

info "Building frontend..."
cd "$SCRIPT_DIR"
if ! command -v npm &>/dev/null; then
  warn "npm not found — frontend not rebuilt (Lua + OpenResty update still applied)"
elif [ -z "$DEPLOY_DIR" ]; then
  warn "Could not determine deploy directory (no nginx root, no single /var/www/* dir) — frontend built but NOT deployed. Deploy .output/public/ manually."
  NODE_OPTIONS="--max-old-space-size=2048" npm run generate 2>&1 | tail -3
else
  NODE_OPTIONS="--max-old-space-size=2048" npm run generate 2>&1 | tail -3
  rsync -a --delete "$SCRIPT_DIR/.output/public/" "$DEPLOY_DIR/"
  info "Frontend deployed to $DEPLOY_DIR"
fi

# ── 7. soul-mcp: sync + restart ──────────────────────────────────────────────
# Erkennt ob der Service aus dem Repo oder aus /opt/sys/soul-mcp läuft.
# Bei /opt/sys/ (Legacy-Setup): JS-Dateien aus Repo dorthin kopieren — ALLE
# Top-Level-*.mjs plus lib/, tools/, prompts/, nicht nur server.mjs. Die
# eigentliche MCP-Tool-Logik lebt in tools/ (40+ Dateien) — wurde die früher
# vergessen, blieben Tool-Änderungen auf Legacy-Installs unwirksam.
# Bei $SCRIPT_DIR (modernes Init): git pull hat die Dateien schon aktualisiert.
_MCP_WD=$(systemctl show soul-mcp --property=WorkingDirectory --value 2>/dev/null || true)
if [ -d "/opt/sys/soul-mcp" ] && [ "$_MCP_WD" = "/opt/sys/soul-mcp" ] && [ "$_MCP_WD" != "$SCRIPT_DIR/soul-mcp" ]; then
  info "Syncing soul-mcp to /opt/sys/soul-mcp/ ..."
  cp "$SCRIPT_DIR"/soul-mcp/*.mjs        /opt/sys/soul-mcp/
  cp "$SCRIPT_DIR/soul-mcp/package.json" /opt/sys/soul-mcp/package.json
  cp "$SCRIPT_DIR/soul-mcp/package-lock.json" /opt/sys/soul-mcp/package-lock.json
  cp -r "$SCRIPT_DIR/soul-mcp/lib/"      /opt/sys/soul-mcp/lib/
  cp -r "$SCRIPT_DIR/soul-mcp/tools/"    /opt/sys/soul-mcp/tools/
  cp -r "$SCRIPT_DIR/soul-mcp/prompts/"  /opt/sys/soul-mcp/prompts/
  chown -R www-data:www-data /opt/sys/soul-mcp/*.mjs /opt/sys/soul-mcp/package.json /opt/sys/soul-mcp/package-lock.json /opt/sys/soul-mcp/lib/ /opt/sys/soul-mcp/tools/ /opt/sys/soul-mcp/prompts/
elif [ -d "$SCRIPT_DIR/soul-mcp" ]; then
  # Modern init: git pull (running as root) just wrote these files as
  # root:root — restore www-data ownership so the service user keeps access.
  chown -R www-data:www-data "$SCRIPT_DIR"/soul-mcp/*.mjs "$SCRIPT_DIR/soul-mcp/lib/" "$SCRIPT_DIR/soul-mcp/tools/" "$SCRIPT_DIR/soul-mcp/prompts/" 2>/dev/null || true
fi

# npm install for soul-mcp was, until now, only ever run once by init.sh at
# install time (same class of bug as the vhost-config/sys-agent-run.sh gaps
# fixed in v1.2.27/v1.3.14) — a dependency added to soul-mcp/package.json
# after a node's install day (e.g. @modelcontextprotocol/ext-apps for MCP
# Apps, v1.4.0) silently never reached already-running nodes, no matter how
# many times they updated: git pull refreshes package.json/package-lock.json,
# but nothing ever re-ran npm install against them. Found live on
# fab.uxprojects-jok.com — soul-mcp crash-looped on ERR_MODULE_NOT_FOUND for
# ext-apps right after this exact update pulled the MCP Apps feature in.
_MCP_DIR="$SCRIPT_DIR/soul-mcp"
[ "$_MCP_WD" = "/opt/sys/soul-mcp" ] && _MCP_DIR="/opt/sys/soul-mcp"
if [ -f "$_MCP_DIR/package.json" ]; then
  if ! command -v npm &>/dev/null; then
    warn "npm not found — soul-mcp dependencies not installed/updated."
  else
    info "Installing soul-mcp dependencies..."
    if ( cd "$_MCP_DIR" && npm install --omit=dev --silent ); then
      chown -R www-data:www-data "$_MCP_DIR/node_modules" 2>/dev/null || true
    else
      warn "npm install for soul-mcp failed — see output above. soul-mcp may fail to start."
    fi
  fi
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
