-- GET /api/agent/log  → { log: "...", running: bool }
-- Soul log contains only the last run (truncated at run start).

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method not allowed"}'); return
end

ngx.header["Content-Type"] = "application/json"

local log_file = "/var/log/sys_agent_" .. soul_id .. ".log"

local handle = io.open(log_file, "r")
local log_text = ""
if handle then
  log_text = handle:read("*a") or ""
  handle:close()
end

local running = log_text ~= "" and not log_text:match("=== Run complete ===")

ngx.say(cjson.encode({ log = log_text, running = running }))
