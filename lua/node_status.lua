-- node_status.lua
-- GET /api/node-status
-- Gibt zurück ob dieser Node bereits einer Soul gehört.
-- Kein Auth erforderlich — ist öffentliche Info für das Frontend.

local cjson = require("cjson.safe")

local MASTER_PATH = "/var/lib/sys/config/master.json"

local f = io.open(MASTER_PATH, "r")
if not f then
  ngx.status = 200
  ngx.header["Content-Type"] = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode({ locked = false }))
  return
end

local raw = f:read("*a")
f:close()

local data = cjson.decode(raw) or {}
local soul_id = data.node_soul_id or ""
local locked = soul_id ~= ""

ngx.status = 200
ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ locked = locked }))
