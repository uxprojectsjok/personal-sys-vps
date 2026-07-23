-- node_status.lua
-- GET /api/node-status
-- Gibt zurück ob dieser Node bereits einer Soul gehört (domain-aware).
-- Kein Auth erforderlich — öffentliche Info für das Frontend und Cross-Domain-Test.

local cjson = require("cjson.safe")

local host = (ngx.var and ngx.var.host) or ""

-- Gleiches Muster wie soul_amortization.lua/soul_pay_x402.lua — Default bleibt
-- public für Altinstallationen ohne die Datei.
local function is_public_node()
  local f = io.open("/var/lib/sys/config/public_node", "r")
  if not f then return true end
  local v = f:read("*a"); f:close()
  return v ~= "false"
end
local public_node = is_public_node()

-- Domain-spezifischer Pfad zuerst, Fallback auf global
local function try_read(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then return data end
  return nil
end

local data
if host ~= "" then
  data = try_read("/var/lib/sys/config/" .. host .. "/master.json")
end
if not data then
  data = try_read("/var/lib/sys/config/master.json")
end

ngx.header["Content-Type"]                = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"

if not data then
  ngx.status = 200
  ngx.say(cjson.encode({ locked = false, public_node = public_node }))
  return
end

-- Multi-Hoster: Registrierung immer offen, kein Soul-Lock
if data.multi_hoster then
  ngx.say(cjson.encode({ locked = false, multi_hoster = true, public_node = public_node }))
  return
end

local soul_id = (type(data.node_soul_id) == "string") and data.node_soul_id or ""
ngx.say(cjson.encode({ locked = soul_id ~= "", public_node = public_node }))
