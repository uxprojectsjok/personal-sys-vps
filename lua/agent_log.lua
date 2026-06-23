-- GET /api/agent/log?lines=N  → { log: "..." }
-- Returns last N lines of the soul's agent log file.

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method not allowed"}'); return
end

ngx.header["Content-Type"] = "application/json"

local args = ngx.req.get_uri_args()
local lines = tonumber(args.lines) or 60
if lines > 200 then lines = 200 end

local log_file = "/var/log/sys_agent_" .. soul_id .. ".log"

local handle = io.popen("tail -n " .. lines .. " " .. log_file .. " 2>/dev/null")
local log_text = ""
if handle then
  log_text = handle:read("*a") or ""
  handle:close()
end

ngx.say(cjson.encode({ log = log_text, file = log_file }))
