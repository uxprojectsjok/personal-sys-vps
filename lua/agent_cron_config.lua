-- GET  /api/agent/cron  → status: installed, enabled, interval, last_run
-- POST /api/agent/cron  → { enabled: bool, interval: "hourly"|"daily" }

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

local CONFIG_PATH = "/var/lib/sys/config/agent_cron_" .. soul_id .. ".json"
local RUNNER      = "/usr/local/bin/sys-agent-run.sh"
local LOG_PATH    = "/var/log/sys_agent_" .. soul_id .. ".log"

ngx.header["Content-Type"] = "application/json"

local function read_json(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a"); f:close()
  return cjson.decode(s)
end

local function write_json(path, data)
  local f = io.open(path, "w")
  if not f then return false end
  f:write(cjson.encode(data)); f:close()
  os.execute("chmod 600 " .. path)
  return true
end

local function claude_installed()
  -- 1. System npm installs (nodesource: /usr/local/bin or /usr/bin)
  for _, p in ipairs({"/usr/local/bin/claude", "/usr/bin/claude"}) do
    local f = io.open(p, "r")
    if f then f:close(); return true end
  end
  -- 2. nvm installs (/root/.nvm/versions/node/<version>/bin/claude)
  local h = io.popen("find /root/.nvm/versions/node -maxdepth 3 -name 'claude' 2>/dev/null | head -1")
  if h then
    local out = h:read("*a"); h:close()
    if out and out:match("%S") then return true end
  end
  return false
end

local function last_run_from_log()
  local f = io.open(LOG_PATH, "r")
  if not f then return nil end
  local last = nil
  for line in f:lines() do
    if line:match("%[%d%d%d%d%-%d%d%-%d%d") then last = line:match("(%[%d%d%d%d%-%d%d%-%d%d[^%]]+%])") end
  end
  f:close()
  return last
end

-- ── GET ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "GET" then
  local cfg = read_json(CONFIG_PATH) or {}
  ngx.say(cjson.encode({
    installed = claude_installed(),
    enabled   = cfg.enabled  == true,
    interval  = cfg.interval or "hourly",
    last_run  = last_run_from_log() or cfg.last_run,
  }))
  return
end

-- ── POST ──────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "POST" then
  ngx.req.read_body()
  local body = cjson.decode(ngx.req.get_body_data() or "{}") or {}
  local cfg  = read_json(CONFIG_PATH) or {}

  if body.enabled ~= nil then cfg.enabled = (body.enabled == true) end
  if body.interval and (body.interval == "hourly" or body.interval == "daily") then
    cfg.interval = body.interval
  end

  if write_json(CONFIG_PATH, cfg) then
    ngx.say(cjson.encode({ ok = true, enabled = cfg.enabled, interval = cfg.interval }))
  else
    ngx.status = 500
    ngx.say('{"error":"write failed"}')
  end
  return
end

ngx.status = 405
ngx.say('{"error":"method not allowed"}')
