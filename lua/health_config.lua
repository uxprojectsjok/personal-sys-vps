-- GET  /api/health/config  → adapter, garmin_model, garmin_email, has_password, last_sync
-- POST /api/health/config  → schreibt adapter, garmin_model, garmin_email, garmin_password (optional)

local cjson   = require("cjson.safe")
local cfg     = require("config_reader")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

local CONFIG_PATH = "/var/lib/sys/config/health_sync_" .. soul_id .. ".json"
local HEALTH_MD   = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/health.md"

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
  os.execute("chown www-data:www-data " .. path .. " 2>/dev/null || true")
  return true
end

local function read_last_sync()
  local f = io.open(HEALTH_MD, "r")
  if not f then return nil end
  local head = f:read(512); f:close()
  return head:match("last_sync:%s*([%d%-%s:]+[%d])")
end

ngx.header["Content-Type"] = "application/json"

-- ── GET ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "GET" then
  local c = read_json(CONFIG_PATH) or {}
  ngx.say(cjson.encode({
    configured    = (c.adapter ~= nil),
    adapter       = c.adapter       or "garmin",
    garmin_model  = c.garmin_model  or "garmin_fr235",
    garmin_email  = c.garmin_email  or "",
    has_password  = (c.garmin_password ~= nil and c.garmin_password ~= ""),
    last_sync     = read_last_sync(),
  }))
  return
end

-- ── POST ──────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "POST" then
  ngx.req.read_body()
  local body = cjson.decode(ngx.req.get_body_data() or "{}") or {}

  local current = read_json(CONFIG_PATH) or {}
  current.soul_id      = soul_id
  current.adapter      = body.adapter      or current.adapter      or "garmin"
  current.garmin_model = body.garmin_model or current.garmin_model or "garmin_fr235"
  if body.garmin_email and body.garmin_email ~= "" then
    current.garmin_email = body.garmin_email
  end
  if body.garmin_password and body.garmin_password ~= "" then
    current.garmin_password = body.garmin_password
  end

  if write_json(CONFIG_PATH, current) then
    ngx.say('{"ok":true}')
  else
    ngx.status = 500
    ngx.say('{"error":"write failed"}')
  end
  return
end

ngx.status = 405
ngx.say('{"error":"method not allowed"}')
