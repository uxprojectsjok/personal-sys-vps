-- POST /api/agent/run → startet sys-agent-run.sh im Hintergrund

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method not allowed"}')
  return
end

ngx.header["Content-Type"] = "application/json"

local runner = "/usr/local/bin/sys-agent-run.sh"
local log    = "/var/log/sys_agent_" .. soul_id .. ".log"

-- soul_id als Argument → runner bypasses enabled-check ("force mode")
-- sudo required: www-data (OpenResty) can't write to root-owned log files.
-- Outer redirect → /dev/null (www-data can't write root-owned log);
-- the runner itself writes to the log internally (runs as root via sudo).
local cmd = "nohup sudo " .. runner .. " " .. soul_id .. " >/dev/null 2>&1 &"
local ok = os.execute(cmd)

if ok then
  ngx.say('{"ok":true,"message":"Agent started"}')
else
  ngx.status = 500
  ngx.say('{"error":"failed to start runner"}')
end
