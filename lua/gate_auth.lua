-- /etc/openresty/lua/gate_auth.lua
-- POST /api/gate-auth
-- Body: { "password": "...", "cert": "..." }
-- Zweifaktor-Gate: Passwort (init.sh gesetzt) + Soul-Cert (wenn Soul registriert)
-- Gibt bei Erfolg einen sys_gate HttpOnly-Cookie (8h) zurück.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local hmac  = require("hmac_helper")

local function read_master_fresh()
  local f = io.open(cfg.get_master_path(), "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw or "")
  return (ok and type(data) == "table") and data or nil
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not body or body == "" then
  ngx.status = 400
  ngx.say('{"error":"body_required"}')
  return
end

local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"invalid_json"}')
  return
end

local password = type(data.password) == "string" and data.password or ""
local cert     = type(data.cert)     == "string" and data.cert     or ""

if #password < 1 then
  ngx.status = 400
  ngx.say('{"error":"password_required"}')
  return
end

local master = read_master_fresh()
if not master then
  ngx.status = 503
  ngx.say('{"error":"node_not_configured","message":"Konfiguration nicht gefunden."}')
  return
end

local stored_hash = type(master.access_password_hash) == "string" and master.access_password_hash or ""
if stored_hash == "" then
  ngx.status = 503
  ngx.say('{"error":"gate_not_configured","message":"Kein Zugangspasswort konfiguriert. init.sh erneut ausführen."}')
  return
end

-- Passwort-Hash prüfen (HMAC-SHA256(master_key, "gate_pw:" + password))
local master_key    = cfg.get_master_key()
local computed_hash = hmac.sign(master_key, "gate_pw:" .. password)

if computed_hash ~= stored_hash then
  ngx.sleep(0.5)  -- Brute-Force verlangsamen
  ngx.status = 401
  ngx.say('{"error":"invalid_credentials","message":"Ungültiges Passwort."}')
  return
end

-- Wenn Soul registriert: Cert prüfen
local node_soul_id = type(master.node_soul_id) == "string" and master.node_soul_id or ""
if node_soul_id ~= "" then
  if cert == "" then
    ngx.status = 401
    ngx.say('{"error":"cert_required","message":"Soul-Cert erforderlich.","soul_registered":true}')
    return
  end

  local prev_key    = cfg.get_master_key_prev()
  local cert_valid  = false

  for v = 0, 20 do
    if hmac.cert_for_soul(master_key, node_soul_id, v) == cert then
      cert_valid = true; break
    end
    if prev_key and prev_key ~= "" then
      if hmac.cert_for_soul(prev_key, node_soul_id, v) == cert then
        cert_valid = true; break
      end
    end
  end

  if not cert_valid then
    ngx.sleep(0.5)
    ngx.status = 401
    ngx.say('{"error":"invalid_cert","message":"Ungültiger Soul-Cert."}')
    return
  end
end

-- Gate-Token generieren (32 zufällige Bytes als Hex)
local rnd = io.open("/dev/urandom", "rb")
if not rnd then
  ngx.status = 500
  ngx.say('{"error":"entropy_unavailable"}')
  return
end
local bytes = rnd:read(32); rnd:close()
if not bytes or #bytes < 32 then
  ngx.status = 500
  ngx.say('{"error":"entropy_read_failed"}')
  return
end

local gate_token = ""
for i = 1, 32 do gate_token = gate_token .. string.format("%02x", bytes:byte(i)) end

-- Token in shared dict speichern (8h TTL)
local TTL      = 28800
local expires  = ngx.now() + TTL
local sessions = ngx.shared.gate_sessions
if sessions then
  sessions:set("g:" .. gate_token, tostring(expires), TTL)
end

-- HttpOnly Secure Cookie setzen
ngx.header["Set-Cookie"] = "sys_gate=" .. gate_token
  .. "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" .. TTL

ngx.status = 200
ngx.say('{"ok":true}')
