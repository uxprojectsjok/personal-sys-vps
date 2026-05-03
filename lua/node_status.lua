-- node_status.lua
-- GET /api/node-status
-- Gibt zurück ob dieser Node bereits einer Soul gehört (domain-aware).
-- Kein Auth erforderlich — öffentliche Info für das Frontend und Cross-Domain-Test.

local cjson = require("cjson.safe")

local host = (ngx.var and ngx.var.host) or ""

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
  ngx.say(cjson.encode({ locked = false }))
  return
end

local soul_id = (type(data.node_soul_id) == "string") and data.node_soul_id or ""
ngx.say(cjson.encode({ locked = soul_id ~= "" }))
