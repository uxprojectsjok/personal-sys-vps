#!/bin/bash
# Setzt das Node-Zugangspasswort (Gate-Passwort) manuell — für den Fall, dass
# der Admin ausgesperrt ist und der reguläre Weg (eingeloggt über /settings,
# POST /api/gate-password) nicht mehr nutzbar ist.
#
# Reine SSH-Admin-Aktion, bewusst kein neuer HTTP-Endpoint: verwendet exakt
# denselben Hash-Algorithmus wie lua/gate_set_password.lua
# (HMAC-SHA256(soul_master_key ohne "sys_"-Präfix, "gate_pw:" .. passwort)),
# per `resty` (OpenResty-CLI) ausgeführt, damit dieselben lua-resty-Module
# (resty.sha256/resty.string) wie im Live-Server verwendet werden.
#
# Usage: sudo bash /opt/sys/scripts/reset-gate-password.sh NEUES_PASSWORT [MASTER_JSON_PFAD]
# Der Pfad wird normalerweise automatisch erkannt (siehe unten); nur bei
# mehreren domain-spezifischen master.json-Dateien gleichzeitig nötig.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[sys]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

MASTER_DIR_BASE="/var/lib/sys/config"
MASTER_PATH_GLOBAL="$MASTER_DIR_BASE/master.json"
LUA_DIR="/etc/openresty/lua"

[[ $EUID -ne 0 ]] && error "Bitte als root/mit sudo ausführen (schreibt master.json + chown www-data)."
[[ -z "${1:-}" ]] && error "Usage: bash reset-gate-password.sh NEUES_PASSWORT"
[[ ${#1} -lt 8 ]] && error "Passwort zu kurz — mindestens 8 Zeichen (gleiche Regel wie im Settings-Dialog)."
command -v resty >/dev/null 2>&1 || error "'resty' (OpenResty-CLI) nicht gefunden."

# config_reader.get_master_path() bevorzugt eine domain-spezifische Datei
# (MASTER_DIR_BASE/<host>/master.json) über die globale — die Domain kommt
# vom aktiven vhost zur Laufzeit, nicht aus einer festen Variable. Dieselbe
# Priorität hier nachbilden, sonst schreibt man versehentlich eine Datei, die
# der Live-Server nie liest (genau so live aufgetreten beim ersten Testlauf,
# als stattdessen naiv der erste Eintrag aus sites-enabled/ geraten wurde —
# auf einem Server mit mehreren vhosts ist das nicht zuverlässig genug).
# Statt zu raten: direkt nachsehen, für welche Domain(s) tatsächlich eine
# eigene master.json existiert.
mapfile -t DOMAIN_MASTERS < <(find "$MASTER_DIR_BASE" -mindepth 2 -maxdepth 2 -iname "master.json" 2>/dev/null)
if [[ ${#DOMAIN_MASTERS[@]} -eq 1 ]]; then
  MASTER_PATH="${DOMAIN_MASTERS[0]}"
elif [[ ${#DOMAIN_MASTERS[@]} -gt 1 ]]; then
  error "Mehrere domain-spezifische master.json gefunden — bitte den passenden Pfad direkt als zweites Argument angeben: $(printf '%s ' "${DOMAIN_MASTERS[@]}")"
else
  MASTER_PATH="$MASTER_PATH_GLOBAL"
fi
[[ -n "${2:-}" ]] && MASTER_PATH="$2"
info "Verwende $MASTER_PATH"
[[ ! -f "$MASTER_PATH" ]] && error "$MASTER_PATH nicht gefunden — Node nicht konfiguriert?"

NEW_PASSWORD="$1"

info "Berechne neuen Passwort-Hash und schreibe $MASTER_PATH..."
resty -I "$LUA_DIR" -e '
local cjson = require("cjson.safe")
local hmac  = require("hmac_helper")

local path = "'"$MASTER_PATH"'"
local pw   = "'"${NEW_PASSWORD//\'/\\\'}"'"

local f = io.open(path, "r")
if not f then error("konnte " .. path .. " nicht lesen") end
local master = cjson.decode(f:read("*a")); f:close()

local k = master.soul_master_key
if type(k) ~= "string" or k:sub(1, 4) ~= "sys_" or #k ~= 68 then
  error("soul_master_key fehlt oder hat unerwartetes Format in " .. path)
end
local master_key = k:sub(5)  -- "sys_"-Präfix entfernen, exakt wie config_reader.get_master_key()

master.access_password_hash = hmac.sign(master_key, "gate_pw:" .. pw)

local wf = io.open(path, "w")
if not wf then error("konnte " .. path .. " nicht schreiben") end
wf:write(cjson.encode(master)); wf:close()

print("ok")
'

chmod 600 "$MASTER_PATH"
chown www-data:www-data "$MASTER_PATH" 2>/dev/null || true

# WICHTIG: restart, nicht reload. master.json wird 60s in einem
# lua_shared_dict gecacht (config_reader.lua) — das Shared-Memory-Segment
# überlebt ein reload (nginx behält es über einen Worker-Neustart hinweg
# bewusst bei), ein echter Prozess-Neustart räumt es dagegen weg. Mit reload
# allein bliebe der alte Hash bis zu 60s aktiv (live so getestet und
# bestätigt) — gate_set_password.lua umgeht das nur, weil es als Teil des
# laufenden Worker-Prozesses direkt ngx.shared:delete() aufrufen kann, was
# einem externen Skript nicht möglich ist.
info "Starte OpenResty neu (reload allein würde den 60s-Cache nicht leeren)..."
openresty -t && systemctl restart openresty

info "Fertig. Neues Passwort ist ab sofort aktiv, alle bisherigen Logins sind abgemeldet."
