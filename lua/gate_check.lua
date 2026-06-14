-- /etc/openresty/lua/gate_check.lua
-- access_by_lua_file für location / (SPA-Root)
-- Prüft den sys_gate Cookie. Kein gültiges Token → Redirect zu /gate.

local uri = ngx.var.uri

-- Gate-Seite selbst ist immer zugänglich (inkl. /gate?next=...)
-- ngx.var.uri enthält nie den Query-String, daher reicht == "/gate"
if uri == "/gate" or uri:sub(1, 6) == "/gate/" then
  ngx.ctx.gate_done = true
  return
end

-- QR-Connect-Landingpage für Fremde (kein sys_gate Cookie erforderlich)
if uri == "/connect" then
  ngx.ctx.gate_done = true
  return
end

-- Share-Link Viewer: öffentlich zugänglich (Token = Auth)
if uri:sub(1, 6) == "/link/" then
  ngx.ctx.gate_done = true
  return
end

-- Biometrie-Verify: QR-Scan-Flow — gültige verify_token im ?vt= Param bypassen Gate
if uri == "/verify" then
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

-- try_files interne Weiterleitung zu /index.html würde diesen Handler ein zweites
-- Mal auslösen (uri wäre dann "/index.html"). ngx.ctx bleibt im selben Request
-- erhalten → einmal geprüft reicht.
if ngx.ctx.gate_done then return end
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
