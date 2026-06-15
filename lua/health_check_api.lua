-- GET /api/health/check — liest health.md, gibt Tips für alle Metriken zurück

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

local HEALTH_MD = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/health.md"
local SCRIPT    = "/opt/sys/health-check-api.mjs"
local NODE      = "/usr/bin/node"

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

local fh = io.open(HEALTH_MD, "r")
if not fh then
  ngx.say(cjson.encode({ tips = {} }))
  return
end
fh:close()

local pipe = io.popen(NODE .. " " .. SCRIPT .. " " .. HEALTH_MD)
local out  = pipe and pipe:read("*a") or ""
if pipe then pipe:close() end

local data = cjson.decode(out)
if not data then
  ngx.say(cjson.encode({ tips = {} }))
  return
end

ngx.say(cjson.encode(data))
