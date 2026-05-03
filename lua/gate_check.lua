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
