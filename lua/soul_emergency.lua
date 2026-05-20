-- /etc/openresty/lua/soul_emergency.lua
-- GET  /api/emergency/status  → aktuellen Lock-Status lesen
-- POST /api/emergency/isolate → Lock setzen  (soul_cert required)
-- POST /api/emergency/restore → Lock aufheben (soul_cert required)
--
-- Lock-Datei: /var/lib/sys/souls/{soul_id}/emergency.lock
-- Level 1 → Chat, Soul-Update, BeME blockiert
-- Level 2 → + WaveSpeed blockiert
-- Level 3 → + soul-mcp.service gestoppt

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local lock_file = "/var/lib/sys/souls/" .. soul_id .. "/emergency.lock"
local method    = ngx.req.get_method()

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function read_lock()
  local f = io.open(lock_file, "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  return (ok and type(data) == "table") and data or nil
end

local function write_lock(data)
  local f = io.open(lock_file, "w")
  if not f then return false end
  f:write(cjson.encode(data)); f:close()
  return true
end

local function delete_lock()
  os.remove(lock_file)
end

-- ── GET /api/emergency/status ─────────────────────────────────────────────────

if method == "GET" then
  local lock = read_lock()
  if lock then
    ngx.say(cjson.encode({ ok = true, active = true, level = lock.level, activated_at = lock.activated_at }))
  else
    ngx.say(cjson.encode({ ok = true, active = false, level = 0 }))
  end
  return
end

if method ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local body_str = ngx.req.get_body_data() or ""
local ok_b, body = pcall(cjson.decode, body_str)
if not ok_b then body = {} end

local action = ngx.var.request_uri:match("/api/emergency/(%w+)")

-- ── POST /api/emergency/isolate ───────────────────────────────────────────────

if action == "isolate" then
  local level = tonumber(body.level)
  if not level or level < 1 or level > 3 then
    ngx.status = 400
    ngx.say('{"error":"level muss 1, 2 oder 3 sein"}')
    return
  end

  local lock = {
    level        = level,
    activated_at = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    soul_id      = soul_id,
  }

  if not write_lock(lock) then
    ngx.status = 500
    ngx.say('{"error":"Lock-Datei konnte nicht geschrieben werden"}')
    return
  end

  -- Level 3: soul-mcp stoppen
  if level >= 3 then
    os.execute("systemctl stop soul-mcp 2>/dev/null")
  end

  ngx.say(cjson.encode({ ok = true, active = true, level = level, activated_at = lock.activated_at }))
  return
end

-- ── POST /api/emergency/restore ───────────────────────────────────────────────

if action == "restore" then
  local lock = read_lock()
  local was_level = lock and lock.level or 0

  delete_lock()

  -- Level 3 war aktiv: soul-mcp wieder starten
  if was_level >= 3 then
    os.execute("systemctl start soul-mcp 2>/dev/null")
  end

  ngx.say(cjson.encode({ ok = true, active = false, level = 0, was_level = was_level }))
  return
end

ngx.status = 404
ngx.say('{"error":"Unbekannte Aktion"}')
