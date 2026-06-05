#!/bin/bash
# Personal SYS VPS — Init Script
# Runs on a fresh Ubuntu 24.04 VPS.
# Usage: bash init.sh

set -euo pipefail

# Unterdrückt interaktive needrestart-Prompts während apt-Operationen.
# needrestart fragt sonst nach jedem apt-Install welche Services neu gestartet
# werden sollen — das hängt das Script. 'a' = automatisch, kein Prompt.
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
echo ""

# ── 1. Modus-Auswahl ──────────────────────────────────────────────────────────
echo -e "${YELLOW}  Welchen Node-Typ möchtest du einrichten?${NC}"
echo ""
echo "  [1] Personal Node   — Genau eine Soul, ein Eigentümer (Standard)"
echo "      Perfekt für: Einzelperson, eigene Instanz, maximale Kontrolle"
echo ""
echo "  [2] Multi-Hoster    — Mehrere Souls auf einem VPS"
echo "      Perfekt für: Familie, Freunde, Firma, Soul-Hosting-Dienst"
echo "      Alle Nutzer teilen einen Gateway, sind aber datenseitig isoliert"
echo ""
while true; do
  read -p "  Modus [1/2]: " NODE_MODE
  [[ "$NODE_MODE" == "1" || "$NODE_MODE" == "2" ]] && break
  warn "Bitte 1 oder 2 eingeben."
done
MULTI_HOSTER=false
[[ "$NODE_MODE" == "2" ]] && MULTI_HOSTER=true
echo ""

# ── 2. Input ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}  Hinweis: Du brauchst eine Domain die per A-Eintrag auf die IP${NC}"
echo -e "${YELLOW}  dieses Servers zeigt. Ohne DNS-Eintrag schlägt die SSL-${NC}"
echo -e "${YELLOW}  Zertifizierung fehl.${NC}"
echo ""
read -p "  Deine Domain (z.B. soul.deinname.de):      " DOMAIN
read -p "  Deine E-Mail (für SSL-Zertifikat):         " EMAIL
[[ -z "$DOMAIN" || -z "$EMAIL" ]] && error "Domain und E-Mail sind erforderlich."

echo ""
echo -e "${YELLOW}  Anthropic API Key (optional) — für Claude-Chat und KI-Funktionen.${NC}"
echo -e "${YELLOW}  Kann leer gelassen und später im Admin-UI eingetragen werden:${NC}"
echo -e "${YELLOW}  Einstellungen → Server-Admin → Server Anthropic-Key.${NC}"
read -p "  Anthropic API Key (sk-ant-... oder leer): " ANTHROPIC_KEY

echo ""
echo -e "${YELLOW}  Reown Project ID (optional) — für Blockchain-Anchoring.${NC}"
echo -e "${YELLOW}  Kann leer gelassen und später in Einstellungen → API-Keys eingetragen werden.${NC}"
echo -e "${YELLOW}  Kostenlos erstellen: dashboard.reown.com → New Project${NC}"
echo -e "${YELLOW}  Leer lassen → Anchoring-Feature deaktiviert (jederzeit nachträglich aktivierbar).${NC}"
read -p "  Reown Project ID (optional):              " REOWN_PROJECT_ID

echo ""
echo -e "${YELLOW}  Zeitzone des Servers — bestimmt Uhrzeitanzeige in Token-Ablaufzeiten${NC}"
echo -e "${YELLOW}  und Kommentar-Timestamps.${NC}"
echo ""
echo "  [1] Europe/Berlin    (Deutschland, Österreich, Schweiz)"
echo "  [2] Europe/London    (UK, Irland)"
echo "  [3] Europe/Paris     (Frankreich, Belgien, Spanien)"
echo "  [4] America/New_York (USA East)"
echo "  [5] America/Chicago  (USA Central)"
echo "  [6] America/Denver   (USA Mountain)"
echo "  [7] America/Los_Angeles (USA West)"
echo "  [8] Asia/Tokyo       (Japan)"
echo "  [9] Asia/Singapore   (Singapur, Malaysia)"
echo "  [0] UTC              (koordinierte Weltzeit)"
echo "  [k] Andere eingeben  (z.B. America/Sao_Paulo)"
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
      read -p "  Zeitzone eingeben (aus: timedatectl list-timezones): " TIMEZONE
      if timedatectl list-timezones 2>/dev/null | grep -qx "$TIMEZONE"; then
        break
      else
        warn "Unbekannte Zeitzone '$TIMEZONE'. Bitte nochmals versuchen."
      fi
      ;;
    *) warn "Bitte eine Zahl 0–9 oder k eingeben." ;;
  esac
done
echo -e "  ${GREEN}✓${NC} Zeitzone: $TIMEZONE"

echo ""
echo -e "${YELLOW}  Zugangspasswort für den Gate-Schutz des Nodes.${NC}"
if $MULTI_HOSTER; then
  echo -e "${YELLOW}  Im Multi-Hoster-Modus ist dieses Passwort der gemeinsame${NC}"
  echo -e "${YELLOW}  Eingang für alle Nutzer — wie ein Hausschlüssel.${NC}"
fi
echo -e "${YELLOW}  Mindestens 8 Zeichen. (Eingabe wird nicht angezeigt — normal.)${NC}"
while true; do
  read -s -p "  Zugangspasswort:             " ACCESS_PWD; echo ""
  read -s -p "  Zugangspasswort bestätigen: " ACCESS_PWD2; echo ""
  [[ "${#ACCESS_PWD}" -ge 8 ]] && [[ "$ACCESS_PWD" == "$ACCESS_PWD2" ]] && break
  if [[ "${#ACCESS_PWD}" -lt 8 ]]; then
    warn "Mindestens 8 Zeichen erforderlich."
  else
    warn "Passwörter stimmen nicht überein."
  fi
done
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Auto-Update ───────────────────────────────────────────────────────────────
# Holt die neueste Version vom GitHub-Repo bevor Dateien deployed werden.
# --ff-only: schlägt still fehl wenn lokale Änderungen vorhanden sind.
if [ -d "$SCRIPT_DIR/.git" ]; then
  info "Prüfe auf Updates..."
  git -C "$SCRIPT_DIR" pull --ff-only --quiet 2>&1 || \
    warn "Git-Update übersprungen — lokale Änderungen vorhanden oder kein Netz."
fi

# ── Shared-Server-Erkennung ───────────────────────────────────────────────────
# Prüft ob OpenResty bereits läuft und weitere (Nicht-SYS) Sites aktiv sind.
# Wenn ja: SYS fügt sich ein statt zu überschreiben.
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
  echo -e "${YELLOW}│  Bestehender OpenResty-Server erkannt                            │${NC}"
  echo -e "${YELLOW}│                                                                  │${NC}"
  echo -e "${YELLOW}│  Aktive Sites auf diesem VPS:${NC}"
  echo -e "${YELLOW}${ACTIVE_SITES}${NC}"
  echo -e "${YELLOW}│                                                                  │${NC}"
  echo -e "${YELLOW}│  SYS fügt sich NEBEN die bestehenden Sites ein.                 │${NC}"
  echo -e "${YELLOW}│  · nginx.conf wird nur erweitert, nicht überschrieben           │${NC}"
  echo -e "${YELLOW}│  · Bestehende vhost-Konfigurationen bleiben unverändert         │${NC}"
  echo -e "${YELLOW}│  · Pakete werden nicht neuinstalliert                           │${NC}"
  echo -e "${YELLOW}│  · deinstall.sh entfernt später nur SYS-eigene Dateien          │${NC}"
  echo -e "${YELLOW}└──────────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  read -p "  Fortfahren? (yes/no): " _SHARED_CONFIRM
  [[ "$_SHARED_CONFIRM" == "yes" ]] || error "Abgebrochen."
fi

# ── 1b. Zeitzone setzen ───────────────────────────────────────────────────────
info "Setting timezone to ${TIMEZONE}..."
timedatectl set-timezone "$TIMEZONE" 2>/dev/null || warn "timedatectl fehlgeschlagen — Zeitzone möglicherweise unbekannt."

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

# lua-resty-http für server-seitige HTTP-Callbacks (Cross-Domain Peer-Handshake)
info "Installing lua-resty-http..."
/usr/local/openresty/bin/opm install ledgetech/lua-resty-http

# ── 4. Node.js 20 ─────────────────────────────────────────────────────────────
info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs

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

# mime.types: deinstall.sh löscht /etc/openresty komplett; nach Reinstall
# erstellt das Paket das Verzeichnis neu aber ohne mime.types.
# nginx.conf.template referenziert jetzt den originalen OpenResty-Pfad,
# dieser Copy ist nur ein Fallback für ältere nginx.conf Varianten.
if [ ! -f /etc/openresty/mime.types ]; then
  cp /usr/local/openresty/nginx/conf/mime.types /etc/openresty/mime.types
fi

chown -R www-data:www-data /var/lib/sys
chmod 750 /var/lib/sys/config
chown -R www-data:www-data /var/www/"$DOMAIN"
chmod -R 755 /var/www/"$DOMAIN"

# ── 7. Lua scripts ────────────────────────────────────────────────────────────
info "Installing Lua scripts..."
cp "$SCRIPT_DIR"/lua/*.lua /etc/openresty/lua/

# Manifest schreiben — deinstall.sh entfernt nur diese Dateien (shared-server-safe)
ls "$SCRIPT_DIR/lua/"*.lua | xargs -n1 basename \
  > /var/lib/sys/config/lua-manifest.txt

# ── 7b. mind.md für bestehende Souls anlegen ──────────────────────────────────
info "Prüfe mind.md für bestehende Souls..."
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
soul_read/soul_write: Profil lesen und schreiben. vault_manifest: Dateien anzeigen. context_get: Dokumente lesen. mind_read/mind_write: Diese Konfiguration lesen und aktualisieren.

## Netzwerk
@Name → Nachricht an Peer. @alle → alle Peers gleichzeitig. @agent → Agent-Sandbox. Peer-Gespräche erhältst du als Kontext, beziehe dich natürlich darauf.

## Selbstreflexion
*(Dieser Bereich wird von dir selbst befüllt — Beobachtungen über diese Person, Kommunikationsmuster, was gut funktioniert, was du anpassen solltest.)*

## Grenzen
Claudes ethische Grundsätze sind aktiv und nicht verhandelbar. Diese Sektion ist schreibgeschützt und kann nicht via mind_write verändert werden.
MINDEOF
)
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _MIND_FILE="${_SOUL_DIR}vault/context/mind.md"
  if [ ! -f "$_MIND_FILE" ]; then
    mkdir -p "${_SOUL_DIR}vault/context"
    printf '%s\n' "$_MIND_DEFAULT" > "$_MIND_FILE"
    chown www-data:www-data "$_MIND_FILE"
    info "  mind.md angelegt: $_MIND_FILE"
  fi
done

# ── 7c. shopping.md für bestehende Souls anlegen ──────────────────────────────
info "Prüfe shopping.md für bestehende Souls..."
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
_Noch keine Einträge._

## Annual Categories (${_YEAR})
_Noch keine Einträge._
SHOPEOF
    chown www-data:www-data "$_SHOP_FILE"
    info "  shopping.md angelegt: $_SHOP_FILE"
  fi
done

# ── 7d. health.md Leer-Template für bestehende Souls anlegen ─────────────────
info "Prüfe health.md für bestehende Souls..."
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
    info "  health.md angelegt: $_HEALTH_FILE"
  fi
done

# ── 7e. prompts.md für bestehende Souls generieren ───────────────────────────
info "Generiere prompts.md für bestehende Souls..."
if command -v node &>/dev/null; then
  node "$SCRIPT_DIR/utils/generate-prompts.mjs" && info "  prompts.md generiert." || warn "  prompts.md Generierung fehlgeschlagen (wird beim ersten MCP-Start nachgeholt)."
else
  warn "  node nicht gefunden — prompts.md wird beim ersten MCP-Start generiert."
fi

# ── 7f. LONGMEM-Bootstrap-Flag für bestehende Souls setzen ──────────────────
# soul-mcp kristallisiert beim nächsten Start automatisch alle Souls ohne LONGMEM.
# Das Flag verhindert wiederholte Bootstrap-Calls bei jedem init.sh-Aufruf.
info "Prüfe LONGMEM-Bootstrap für bestehende Souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _BOOTSTRAP_FLAG="${_SOUL_DIR}.longmem_bootstrap_pending"
  _SYS_MD="${_SOUL_DIR}sys.md"
  if [ -f "$_SYS_MD" ]; then
    # Prüfe ob LONGMEM-Block bereits vorhanden (nur bei unverschlüsselten souls direkt prüfbar)
    if ! strings "$_SYS_MD" 2>/dev/null | grep -q "SYS:LONGMEM:START"; then
      touch "$_BOOTSTRAP_FLAG"
      chown www-data:www-data "$_BOOTSTRAP_FLAG"
      info "  LONGMEM-Bootstrap vorgemerkt: $(basename $_SOUL_DIR)"
    fi
  fi
done

# ── 7g. AGENT/SOCIAL-Block-Bootstrap für bestehende Souls vormerken ──────────
# soul-mcp fügt beim nächsten Start automatisch die fehlenden Blöcke ein.
# Bei verschlüsselten Souls ist strings nicht aussagekräftig → Flag immer setzen,
# bootstrapAgentSocial() prüft idempotent ob die Blöcke bereits vorhanden sind.
info "Prüfe AGENT/SOCIAL-Blöcke für bestehende Souls..."
for _SOUL_DIR in /var/lib/sys/souls/*/; do
  [ -d "$_SOUL_DIR" ] || continue
  _BOOTSTRAP_FLAG="${_SOUL_DIR}.agent_social_bootstrap_pending"
  _SYS_MD="${_SOUL_DIR}sys.md"
  [ -f "$_SYS_MD" ] || continue
  [ -f "$_BOOTSTRAP_FLAG" ] && continue  # bereits vorgemerkt
  # Nur Flag setzen wenn AGENT:START nicht im Klartext gefunden wird
  # (verschlüsselte Souls: strings findet nichts → Flag nötig)
  if ! strings "$_SYS_MD" 2>/dev/null | grep -q "AGENT:START"; then
    touch "$_BOOTSTRAP_FLAG"
    chown www-data:www-data "$_BOOTSTRAP_FLAG"
    info "  AGENT/SOCIAL-Bootstrap vorgemerkt: $(basename $_SOUL_DIR)"
  fi
done

# ── 8. Master Key + Gate-Passwort-Hash ───────────────────────────────────────
# Bestehenden Master Key wiederverwenden falls master.json schon existiert
# (schützt bestehende Soul-Certs bei Reinstall oder Skript-Neustart).
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
  warn "Bestehende SYS-Installation erkannt — Master Key wird wiederverwendet."
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

if $MULTI_HOSTER; then
  MASTER_JSON=$(cat <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "${GATE_HASH}",
  "multi_hoster": true
}
EOF
)
else
  MASTER_JSON=$(cat <<EOF
{
  "soul_master_key": "${MASTER_KEY}",
  "soul_master_key_prev": "",
  "prev_valid_until_ts": 0,
  "access_password_hash": "${GATE_HASH}"
}
EOF
)
fi

# Domain-spezifisch (für neue Lua-Skripte, Multi-Domain-Unterstützung)
mkdir -p /var/lib/sys/config/"$DOMAIN"
echo "$MASTER_JSON" > /var/lib/sys/config/"$DOMAIN"/master.json
chmod 600 /var/lib/sys/config/"$DOMAIN"/master.json
chown www-data:www-data /var/lib/sys/config/"$DOMAIN"/master.json

# Global-Fallback (für ältere Lua-Skripte aus git-Clone die MASTER_PATH hardcoded haben)
echo "$MASTER_JSON" > /var/lib/sys/config/master.json
chmod 600 /var/lib/sys/config/master.json
chown www-data:www-data /var/lib/sys/config/master.json

# ── 9. nginx config — Phase 1: HTTP-only ──────────────────────────────────────
info "Configuring OpenResty (HTTP-only, Phase 1)..."
mkdir -p /usr/local/openresty/nginx/logs

# Aktive nginx.conf finden (Installations-Pfade variieren)
_NGINX_CONF=""
for _NC in /etc/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf; do
  [ -f "$_NC" ] && _NGINX_CONF="$_NC" && break
done

_SYS_GLOBALS=/etc/openresty/sys-node-globals.conf

if grep -q "gate_sessions" "$_NGINX_CONF" 2>/dev/null; then
  # SYS-Globals sind bereits aktiv (frühere Installation oder manuell gesetzt)
  info "nginx.conf: SYS-Globals bereits vorhanden — überspringe."

elif [ -n "$_NGINX_CONF" ] && grep -q "lua_package_path" "$_NGINX_CONF" 2>/dev/null; then
  # Shared server: fremde nginx.conf mit Lua — NUR fehlende SYS-Direktiven ergänzen
  info "Shared Server: füge SYS-Globals als Include in nginx.conf ein..."

  # Nur Direktiven schreiben die noch nicht in nginx.conf vorhanden sind
  {
    echo "# SYS-NODE globals — automatisch von init.sh eingefügt"
    echo "# Nicht manuell bearbeiten — wird von deinstall.sh entfernt"
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

  # include-Zeile in nginx.conf injizieren (vor der letzten schließenden Klammer)
  if ! grep -q "sys-node-globals.conf" "$_NGINX_CONF"; then
    python3 - <<PYEOF
content = open('$_NGINX_CONF').read()
include_line = '  include /etc/openresty/sys-node-globals.conf;'
last = content.rfind('\n}')
if last != -1:
    content = content[:last] + '\n' + include_line + content[last:]
    open('$_NGINX_CONF', 'w').write(content)
    print('[sys] sys-node-globals.conf in nginx.conf eingefügt.')
else:
    print('[warn] Abschlussklammer nicht gefunden — include manuell in nginx.conf einfügen:')
    print('  ' + include_line)
PYEOF
  fi

else
  # Kein nginx.conf oder Standard-Config ohne Lua → vollständig durch Template ersetzen
  sed "s/{{DOMAIN}}/$DOMAIN/g" \
    "$SCRIPT_DIR/server/openresty/nginx.conf.template" \
    > /etc/openresty/nginx.conf
  info "nginx.conf erstellt (dedizierter Server)."
fi

sed "s/{{DOMAIN}}/$DOMAIN/g" \
  "$SCRIPT_DIR/server/openresty/vhost-http.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

openresty -t && systemctl restart openresty

# ── 10. SSL certificate ───────────────────────────────────────────────────────
LE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

echo ""
# Hinweis: vorhandene (bewahrte) Let's Encrypt Zertifikate anzeigen
if [ -f "$LE_CERT" ] && openssl x509 -checkend 0 -noout -in "$LE_CERT" 2>/dev/null; then
  LE_EXPIRY=$(openssl x509 -noout -enddate -in "$LE_CERT" 2>/dev/null | cut -d= -f2)
  echo -e "${GREEN}  ✓ Vorhandenes Let's Encrypt Zertifikat für $DOMAIN gefunden.${NC}"
  echo -e "    Gültig bis: $LE_EXPIRY"
  echo -e "${YELLOW}  → Einfach leer lassen — wird automatisch wiederverwendet.${NC}"
  echo ""
fi

echo -e "${YELLOW}  SSL-Zertifikat — leer lassen für Let's Encrypt (automatisch).${NC}"
echo -e "${YELLOW}  Oder Pfade zu einem vorhandenen Zertifikat eintragen (z.B. Wildcard).${NC}"
echo -e "${YELLOW}  Bewahrte Let's Encrypt Pfade falls vorhanden:${NC}"
echo -e "${YELLOW}    fullchain.pem: /etc/letsencrypt/live/$DOMAIN/fullchain.pem${NC}"
echo -e "${YELLOW}    privkey.pem:   /etc/letsencrypt/live/$DOMAIN/privkey.pem${NC}"
read -p "  fullchain.pem (leer = Let's Encrypt): " SSL_CERT
read -p "  privkey.pem   (leer = Let's Encrypt): " SSL_KEY

if [[ -n "$SSL_CERT" || -n "$SSL_KEY" ]]; then
  # Dateien vorhanden?
  [[ ! -f "$SSL_CERT" ]] && error "Zertifikat nicht gefunden: $SSL_CERT"
  [[ ! -f "$SSL_KEY"  ]] && error "Schlüssel nicht gefunden: $SSL_KEY"

  # Gültiges X.509-Zertifikat?
  openssl x509 -in "$SSL_CERT" -noout 2>/dev/null \
    || error "Ungültiges Zertifikat (kein X.509): $SSL_CERT"

  # Gültiger privater Schlüssel?
  openssl pkey -in "$SSL_KEY" -check -noout 2>/dev/null \
    || error "Ungültiger privater Schlüssel: $SSL_KEY"

  # Cert und Key zusammengehörig? (Public-Key-Vergleich — RSA und ECDSA)
  CERT_PUB=$(openssl x509 -noout -pubkey -in "$SSL_CERT" 2>/dev/null | openssl md5 2>/dev/null || true)
  KEY_PUB=$(openssl pkey -pubout -in "$SSL_KEY" 2>/dev/null | openssl md5 2>/dev/null || true)
  if [[ -n "$CERT_PUB" && -n "$KEY_PUB" && "$CERT_PUB" != "$KEY_PUB" ]]; then
    error "Zertifikat und Schlüssel passen nicht zusammen."
  fi

  # Deckt das Zertifikat die Domain ab? (CN oder SAN)
  CERT_DOMAINS=$(openssl x509 -noout -text -in "$SSL_CERT" 2>/dev/null \
    | grep -oP '(?<=DNS:)[^,\s]+' || true)
  DOMAIN_MATCH=false
  for cd in $CERT_DOMAINS; do
    # Exakter Treffer oder Wildcard (*.example.com deckt sub.example.com)
    if [[ "$cd" == "$DOMAIN" ]] || \
       [[ "$cd" == "*."* && "$DOMAIN" == *".${cd#\*.}" ]]; then
      DOMAIN_MATCH=true; break
    fi
  done
  $DOMAIN_MATCH || warn "Zertifikat deckt '$DOMAIN' möglicherweise nicht ab. Gefundene SANs: $CERT_DOMAINS"

  # Zertifikat abgelaufen?
  openssl x509 -checkend 0 -noout -in "$SSL_CERT" 2>/dev/null \
    || error "Zertifikat ist abgelaufen."

  info "Zertifikat validiert — Cert, Key und Domain passen zusammen."
else
  # Vorhandenes Let's Encrypt Zertifikat wiederverwenden wenn gültig
  if [ -f "$LE_CERT" ] && openssl x509 -checkend 0 -noout -in "$LE_CERT" 2>/dev/null; then
    info "Vorhandenes Let's Encrypt Zertifikat wird wiederverwendet."
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
    echo -e "${RED}│  Let's Encrypt Rate-Limit erreicht                               │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Zu viele Zertifikate für $DOMAIN in den letzten 7 Tagen.        │${NC}"
    [ -n "$RETRY" ] && \
    echo -e "${RED}│  Retry ab: $RETRY                          │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Danach manuell nachholen:                                       │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│    certbot certonly --webroot \\                                  │${NC}"
    echo -e "${RED}│      -w /var/www/$DOMAIN \\                                       │${NC}"
    echo -e "${RED}│      -d $DOMAIN --email $EMAIL \\                                 │${NC}"
    echo -e "${RED}│      --agree-tos --non-interactive                               │${NC}"
    echo -e "${RED}│                                                                  │${NC}"
    echo -e "${RED}│  Dann HTTPS-vhost aktivieren:                                    │${NC}"
    echo -e "${RED}│    bash /opt/sys/scripts/activate-https.sh                       │${NC}"
    echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo "$CERTBOT_OUT"
    exit 1
  elif ! echo "$CERTBOT_OUT" | grep -q "Successfully received certificate"; then
    echo "$CERTBOT_OUT"
    error "certbot fehlgeschlagen — siehe Ausgabe oben."
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
  "$SCRIPT_DIR/server/openresty/vhost.conf.template" \
  > /etc/openresty/sites-enabled/"$DOMAIN"

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

info "SOUL_MASTER_KEY und API_SIGNING_KEY eingetragen"
[ -n "$ANTHROPIC_KEY" ] && info "ANTHROPIC_API_KEY eingetragen (optional — auch später im UI möglich)"
[ -n "$REOWN_PROJECT_ID" ] && info "REOWN_PROJECT_ID eingetragen (optional — auch später in Einstellungen → API-Keys änderbar)" || \
  warn "Kein Reown Project ID — Blockchain-Anchoring deaktiviert (jederzeit in Einstellungen → API-Keys nachträglich aktivierbar)."
echo ""

# ── 12b. systemd override — Umgebungsvariablen für OpenResty ─────────────────
# nginx.conf deklariert env-Variablen (env SOUL_MASTER_KEY;), aber die Werte
# müssen beim Start von OpenResty im Prozess-Environment vorhanden sein.
# Ohne diesen Override sind alle Lua-Variablen leer → soul_auth schlägt fehl.
#
# Schreibt in sys-node.conf (nicht env.conf) damit bestehende Drop-In-Dateien
# anderer Anwendungen unverändert bleiben. Auf Shared Servern koexistieren
# mehrere .conf-Dateien — systemd lädt alle und last-writer wins.
info "Creating systemd environment override for OpenResty..."
mkdir -p /etc/systemd/system/openresty.service.d
{
  echo "[Service]"
  [ -n "$ANTHROPIC_KEY" ] && echo "Environment=\"ANTHROPIC_API_KEY=${ANTHROPIC_KEY}\""
  echo "Environment=\"SOUL_MASTER_KEY=${MASTER_KEY}\""
  echo "Environment=\"API_SIGNING_KEY=${API_SIGNING_KEY}\""
} > /etc/systemd/system/openresty.service.d/sys-node.conf
systemctl daemon-reload

# Prüfen ob der Override korrekt geschrieben wurde und die Keys enthält
OVERRIDE_FILE="/etc/systemd/system/openresty.service.d/sys-node.conf"

_override_error() {
  echo ""
  echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
  echo -e "${RED}│  ⚠️  systemd Override konnte nicht verifiziert werden            │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  $1"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  Was tun:                                                        │${NC}"
  echo -e "${RED}│  1. Prüfe ob die Datei existiert:                                │${NC}"
  echo -e "${RED}│     cat $OVERRIDE_FILE   │${NC}"
  echo -e "${RED}│                                                                  │${NC}"
  echo -e "${RED}│  2. Falls leer oder falsch, manuell neu schreiben:               │${NC}"
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
  echo -e "${RED}│  3. Oder frag eine KI um Hilfe — Prompt-Vorschlag:              │${NC}"
  echo -e "${RED}│     \"Mein init.sh für einen SYS-Node unter Ubuntu 24.04          │${NC}"
  echo -e "${RED}│     konnte den systemd override für OpenResty nicht schreiben.   │${NC}"
  echo -e "${RED}│     Die Datei $OVERRIDE_FILE │${NC}"
  echo -e "${RED}│     fehlt oder ist leer. Wie behebe ich das manuell?\"            │${NC}"
  echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
  echo ""
  exit 1
}

if [ ! -f "$OVERRIDE_FILE" ]; then
  _override_error "Datei nicht gefunden: $OVERRIDE_FILE"
fi
if ! grep -q "SOUL_MASTER_KEY=sys_" "$OVERRIDE_FILE"; then
  _override_error "SOUL_MASTER_KEY fehlt oder hat kein 'sys_'-Präfix"
fi
if [ -n "$ANTHROPIC_KEY" ] && ! grep -q "ANTHROPIC_API_KEY=sk-ant-" "$OVERRIDE_FILE"; then
  _override_error "ANTHROPIC_API_KEY wurde eingegeben, fehlt aber im Override"
fi
info "systemd override verifiziert ✓"

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

# .env für soul-mcp
cat > "$SCRIPT_DIR/soul-mcp/.env" <<MCPENV
PORT=3098
BASE_URL=https://${DOMAIN}
SYS_API_URL=https://${DOMAIN}
POLYGON_NETWORK=main
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

# Eigentümer setzen damit www-data lesen und ausführen kann
chown -R www-data:www-data "$SCRIPT_DIR/soul-mcp"
chmod 600 "$SCRIPT_DIR/soul-mcp/.env"

systemctl daemon-reload
systemctl enable soul-mcp
systemctl restart soul-mcp

sleep 2
if systemctl is-active --quiet soul-mcp; then
  info "soul-mcp läuft auf Port 3098 ✓"
else
  warn "soul-mcp konnte nicht gestartet werden — prüfe: journalctl -u soul-mcp -n 20"
fi

cd "$SCRIPT_DIR"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
if $MULTI_HOSTER; then
  echo -e "${GREEN}✓ Dein Multi-Hoster Node ist ready.${NC}"
else
  echo -e "${GREEN}✓ Dein Personal Soul Node ist ready.${NC}"
fi
echo ""
echo "  URL:    https://$DOMAIN"
echo "  Data:   /var/lib/sys/souls/"
echo "  Config: /var/lib/sys/config/$DOMAIN/master.json"
echo ""
if $MULTI_HOSTER; then
  echo "  Öffne https://$DOMAIN — jeder Nutzer kann sich registrieren und eine eigene Soul anlegen."
  echo "  Alle Souls teilen den Gateway-Zugang, sind aber datenseitig vollständig isoliert."
else
  echo "  Öffne https://$DOMAIN im Browser um deine Soul zu erstellen."
  echo "  Dieser Node akzeptiert genau eine Soul — wer sich zuerst registriert, ist Eigentümer."
fi
echo ""
echo -e "${RED}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${RED}│  ⚠️  Wichtig: Ändere jetzt dein Server-Passwort!                 │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│  Tippe im schwarzen Fenster:                                     │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│      passwd                                                      │${NC}"
echo -e "${RED}│                                                                  │${NC}"
echo -e "${RED}│  Vergib ein neues sicheres Passwort — das ist dein Schutz        │${NC}"
echo -e "${RED}│  gegen unbefugten Zugriff auf diesen Server.                     │${NC}"
echo -e "${RED}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "${YELLOW}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${YELLOW}│  SSH absichern — optionaler Schritt nach dem Setup               │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│  SSH-Port ändern (Standard 22 ist ständig unter Beschuss):      │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│     nano /etc/ssh/sshd_config                                   │${NC}"
echo -e "${YELLOW}│       → Zeile:  #Port 22                                        │${NC}"
echo -e "${YELLOW}│       → ändern: Port 2222   (oder eine andere Zahl > 1024)      │${NC}"
echo -e "${YELLOW}│     systemctl restart ssh                                        │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│  ⚠ Öffne eine zweite SSH-Session mit dem neuen Port BEVOR       │${NC}"
echo -e "${YELLOW}│    du die alte schließt — sonst sperrst du dich aus.            │${NC}"
echo -e "${YELLOW}│                                                                  │${NC}"
echo -e "${YELLOW}│  ⚠ Root-Login NICHT deaktivieren (PermitRootLogin no), solange  │${NC}"
echo -e "${YELLOW}│    kein anderer User mit SSH-Key-Auth eingerichtet ist —        │${NC}"
echo -e "${YELLOW}│    das sperrt dich dauerhaft aus dem Server aus.                │${NC}"
echo -e "${YELLOW}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""

if [[ -n "$REOWN_PROJECT_ID" ]]; then
echo -e "${GREEN}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│  Reown: Domain-Freigabe erforderlich!                            │${NC}"
echo -e "${GREEN}│                                                                  │${NC}"
echo -e "${GREEN}│  Damit Blockchain-Anchoring auf deiner Seite funktioniert,       │${NC}"
echo -e "${GREEN}│  musst du deine Domain im Reown-Dashboard freigeben:             │${NC}"
echo -e "${GREEN}│                                                                  │${NC}"
echo -e "${GREEN}│  1. dashboard.reown.com → dein Projekt öffnen                   │${NC}"
echo -e "${GREEN}│  2. Explorer → Allowed Domains → Add Domain                     │${NC}"
echo -e "${GREEN}│  3. Deine Domain eintragen:                                      │${NC}"
echo -e "${GREEN}│     $DOMAIN${NC}"
echo -e "${GREEN}│                                                                  │${NC}"
echo -e "${GREEN}│  Ohne diesen Eintrag blockiert Reown alle Verbindungen.          │${NC}"
echo -e "${GREEN}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""
fi
