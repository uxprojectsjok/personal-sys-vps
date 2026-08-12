-- /etc/openresty/lua/gate_check.lua
-- access_by_lua_file für location / (SPA-Root)
-- Prüft den sys_gate Cookie. Kein gültiges Token → Redirect zu /gate.

-- request_uri statt uri: try_files' interner Fallback auf /index.html (kein
-- Datei-Match für die meisten SPA-Routen — sie liegen als {route}/index.html,
-- nicht {route}.html) löst diesen Handler ein zweites Mal aus, dabei ist
-- ngx.var.uri dann "/index.html". ngx.var.request_uri bleibt aber über beide
-- Durchläufe die ursprünglich angefragte URI — deshalb müssen ALLE
-- Pfad-Whitelist-Checks hier gegen request_path prüfen, nicht gegen uri.
-- (Live-Bug gewesen: /connect und /link/* nutzten uri statt request_path,
-- funktionierten dadurch nur im ersten Durchlauf, redirecteten aber trotzdem
-- zu /gate — ngx.ctx.gate_done half nicht, weil auch ngx.ctx zwischen den
-- beiden Durchläufen zurückgesetzt wird, nicht nur uri. /gate und /join
-- kamen damit ungeschoren davon, weil sie zusätzlich einen eigenen
-- nginx-Bypass-Block haben, der gate_check.lua für sie gar nicht erst
-- aufruft — dieser Lua-Whitelist-Pfad wurde für sie also nie wirklich
-- getestet.)
local request_path = (ngx.var.request_uri or ""):match("^([^?]*)")

-- Gate-Seite selbst ist immer zugänglich (inkl. /gate?next=...)
if request_path == "/gate" or request_path:sub(1, 6) == "/gate/" then
  ngx.ctx.gate_done = true
  return
end

-- Landing-Page: öffentlich (informativ, kein Zugriff auf Soul-Daten) — Login
-- läuft weiterhin regulär über den "Sign in"-Link (/gate?login=1) oben rechts.
-- Bisher redirectete dieser Handler "/" ungeachtet dessen bereits vor jeder
-- Client-JS-Ausführung zu /gate, im Widerspruch zum index.vue-Kommentar
-- ("'/' muss immer als Homepage erreichbar bleiben") — Betreiber-Entscheidung
-- 2026-08-12, das jetzt tatsächlich einzulösen.
if request_path == "/" then
  ngx.ctx.gate_done = true
  return
end

-- QR-Connect-Landingpage für Fremde (kein sys_gate Cookie erforderlich)
if request_path == "/connect" then
  ngx.ctx.gate_done = true
  return
end

-- Multi-Hoster Registrierungsseite: öffentlich — join.vue prüft selbst ob Registrierung erlaubt ist
if request_path == "/join" then
  ngx.ctx.gate_done = true
  return
end

-- Share-Link Viewer: öffentlich zugänglich (Token = Auth)
if request_path:sub(1, 6) == "/link/" then
  ngx.ctx.gate_done = true
  return
end

-- Impressum/Datenschutz/Lizenz: haben in vhost.conf.template bereits einen
-- eigenen nginx-Bypass-Block (location = /impressum etc., kein
-- access_by_lua_file) — der greift aber nur, wenn die Datei tatsächlich
-- existiert (operator hat eine eigene impressum.vue etc. angelegt). Fehlt
-- sie (Template-Default: nur agb.vue), fällt try_files auf /index.html
-- zurück — ein interner Redirect, der erneut durch location / (und damit
-- gate_check.lua) läuft, request_path ist dabei weiterhin "/impressum" (s.o.).
-- Ohne diesen Whitelist-Eintrag landete man dann trotz des eigentlich schon
-- vorhandenen nginx-Bypasses im Gate-Redirect — live so auf einem Node ohne
-- eigene Legal-Seiten aufgetreten. Zeigt bei fehlender Seite die generische
-- SPA-404 statt Login-Zwang.
if request_path == "/impressum" or request_path == "/datenschutz" or request_path == "/lizenz" then
  ngx.ctx.gate_done = true
  return
end

-- Biometrie-Verify: QR-Scan-Flow — gültige verify_token im ?vt= Param bypassen Gate
if request_path == "/verify" then
  local args = ngx.req.get_uri_args()
  local vt = (args.vt or ""):lower()
  if #vt == 48 and vt:match("^[a-f0-9]+$") then
    local valid = false
    local vc = ngx.shared.verify_cache
    if vc and vc:get("vt:" .. vt) then valid = true end
    if not valid then
      local f = io.open("/var/lib/sys/verify/vt_" .. vt, "r")
      if f then f:close(); valid = true end
    end
    if valid then
      ngx.ctx.gate_done = true
      return
    end
  end
end

-- Bewusst KEIN "ngx.ctx.gate_done bereits gesetzt → skip"-Kurzschluss hier:
-- ngx.ctx wird über den try_files-internen Redirect zu /index.html NICHT
-- zuverlässig erhalten (anders als request_path oben) — ein Check dagegen
-- würde auf dem zweiten Durchlauf einfach immer "nil" sehen und nichts
-- sparen. Für geschützte Routen validiert das die Cookie-Session dadurch
-- zweimal pro Request statt einmal — unschön, aber unschädlich, kein
-- Sicherheitsproblem. ngx.ctx.gate_done wird trotzdem gesetzt, für den Fall
-- dass ngx.ctx in einer künftigen OpenResty-Version doch erhalten bleibt.
ngx.ctx.gate_done = true

-- sys_gate Cookie lesen (via nginx $cookie_* Variable)
local gate_token = ngx.var.cookie_sys_gate or ""

-- Fallback: manuell aus Cookie-Header parsen
if gate_token == "" then
  local cookie_hdr = ngx.req.get_headers()["cookie"] or ""
  gate_token = cookie_hdr:match("sys_gate=([a-fA-F0-9]+)") or ""
end

-- Nur hex-Zeichen akzeptieren (64 Zeichen = 32 Bytes)
if #gate_token ~= 64 or not gate_token:match("^[a-fA-F0-9]+$") then
  return ngx.redirect("/gate?next=" .. ngx.escape_uri(ngx.var.request_uri), 302)
end

-- Token im shared dict validieren
local sessions = ngx.shared.gate_sessions
if not sessions then
  -- Shared dict nicht verfügbar (Konfigurationsfehler) → durchlassen mit Log
  ngx.log(ngx.ERR, "[gate_check] gate_sessions shared dict nicht gefunden")
  return
end

local stored = sessions:get("g:" .. gate_token)
if not stored then
  return ngx.redirect("/gate?next=" .. ngx.escape_uri(ngx.var.request_uri), 302)
end

-- Ablaufzeit prüfen (extra Sicherheit, shared dict TTL reicht normalerweise)
local expires_at = tonumber(stored)
if expires_at and ngx.now() >= expires_at then
  sessions:delete("g:" .. gate_token)
  return ngx.redirect("/gate?next=" .. ngx.escape_uri(ngx.var.request_uri), 302)
end
