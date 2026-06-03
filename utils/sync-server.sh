#!/usr/bin/env bash
# sync-server.sh — Deployed Server-Konfiguration mit dem Repo synchronisieren.
#
# Was passiert:
#   1. Alle Lua-Dateien aus lua/ → /etc/openresty/lua/ kopieren
#   2. Vhost aus vhost.conf.template generieren → live sites-enabled + Repo
#   3. OpenResty-Config testen + neu laden
#
# Aufruf:
#   ./utils/sync-server.sh                      (Single-Hoster: me.uxprojects-jok.com)
#   ./utils/sync-server.sh meine-domain.com      (andere Domain)
#
# Immer nach Änderungen an Lua-Dateien oder vhost.conf.template ausführen!
# Dann: fingerprint + git commit + push

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DOMAIN="${1:-me.uxprojects-jok.com}"
LUA_SRC="$PROJECT_ROOT/lua"
LUA_DST="/etc/openresty/lua"
TEMPLATE="$PROJECT_ROOT/server/openresty/vhost.conf.template"
VHOST_LIVE="/usr/local/openresty/nginx/conf/sites-enabled/$DOMAIN"
VHOST_REPO="$PROJECT_ROOT/server/openresty/$DOMAIN"

# SSL-Pfade für me.uxprojects-jok.com (Standard)
SSL_CERT="/etc/openresty/ssl/uxprojects-jok.com/uxprojects-jok-fullchain.pem"
SSL_KEY="/etc/openresty/ssl/uxprojects-jok.com/uxprojects-jok-key.pem"

echo "═══════════════════════════════════════"
echo " SYS Server Sync — $DOMAIN"
echo "═══════════════════════════════════════"

# ── 1. Lua-Dateien ────────────────────────────────────────────────────────────
echo ""
echo "▶ Lua-Dateien → $LUA_DST"
LUA_COUNT=0
for f in "$LUA_SRC"/*.lua; do
  name="$(basename "$f")"
  if ! diff -q "$f" "$LUA_DST/$name" &>/dev/null; then
    cp "$f" "$LUA_DST/$name"
    echo "  ✔ $name"
    ((LUA_COUNT++)) || true
  fi
done
if [[ $LUA_COUNT -eq 0 ]]; then
  echo "  — keine Änderungen"
fi

# ── 2. Vhost generieren ───────────────────────────────────────────────────────
echo ""
echo "▶ Vhost generieren aus vhost.conf.template → $VHOST_LIVE"
sed "s/{{DOMAIN}}/$DOMAIN/g; s|{{SSL_CERT}}|$SSL_CERT|g; s|{{SSL_KEY}}|$SSL_KEY|g" \
  "$TEMPLATE" > "$VHOST_LIVE"

# Repo-Kopie ebenfalls aktualisieren
cp "$VHOST_LIVE" "$VHOST_REPO"
echo "  ✔ live:  $VHOST_LIVE"
echo "  ✔ repo:  $VHOST_REPO"

# ── 3. OpenResty ─────────────────────────────────────────────────────────────
echo ""
echo "▶ OpenResty testen + neu laden"
openresty -t 2>&1
openresty -s reload
echo "  ✔ reload ok"

echo ""
echo "═══════════════════════════════════════"
echo " Fertig. Nächster Schritt:"
echo "   node utils/project-hash.mjs"
echo "   git add -p && git commit && git push"
echo "═══════════════════════════════════════"
