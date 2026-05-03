-- /etc/openresty/lua/gate_set_password.lua
-- POST /api/gate-password  (protected by soul_auth.lua)
-- Body: { "password": "..." }
-- Ändert das Gate-Zugangspasswort. Invalidiert alle aktiven Gate-Sessions.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local hmac  = require("hmac_helper")

local function read_master()
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
if #password < 8 then
  ngx.status = 400
  ngx.say('{"error":"password_too_short","message":"Mindestens 8 Zeichen erforderlich."}')
  return
end

local master = read_master()
if not master then
  ngx.status = 503
  ngx.say('{"error":"node_not_configured"}')
  return
end

local master_key = cfg.get_master_key()
master.access_password_hash = hmac.sign(master_key, "gate_pw:" .. password)

local wf = io.open(cfg.get_master_path(), "w")
if not wf then
  ngx.status = 500
  ngx.say('{"error":"write_failed"}')
  return
end
wf:write(cjson.encode(master)); wf:close()
os.execute("chmod 600 " .. cfg.get_master_path())
os.execute("chown www-data:www-data " .. cfg.get_master_path() .. " 2>/dev/null || true")
cfg.invalidate_master_cache()

-- Alle aktiven Gate-Sessions invalidieren
local sessions = ngx.shared.gate_sessions
if sessions then sessions:flush_all() end

ngx.status = 200
ngx.say('{"ok":true}')
