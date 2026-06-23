-- GET /api/agent/log  → { log: "...", running: bool }
-- Returns only the LAST run (from last "=== Agent run:" to end of file).

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

-- Find line number of the last "=== Agent run:" marker
local h1 = io.popen("grep -n '=== Agent run:' " .. log_file .. " 2>/dev/null | tail -1 | cut -d: -f1")
local start_line = h1 and h1:read("*l") or ""
if h1 then h1:close() end

local log_text = ""
if start_line and start_line ~= "" then
  local h2 = io.popen("tail -n +" .. start_line .. " " .. log_file .. " 2>/dev/null")
  if h2 then
    log_text = h2:read("*a") or ""
    h2:close()
  end
else
  -- No run yet — return last 20 lines as fallback
  local h3 = io.popen("tail -n 20 " .. log_file .. " 2>/dev/null")
  if h3 then
    log_text = h3:read("*a") or ""
    h3:close()
  end
end

local running = not log_text:match("=== Run complete ===")

ngx.say(cjson.encode({ log = log_text, running = running, file = log_file }))
