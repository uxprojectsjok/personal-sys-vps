-- GET /api/health/sync-status — liest das letzte Sync-Ergebnis
local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- Strukturierte JSON-Statusdatei hat Vorrang vor Log-Parsing
local STATUS_FILE = "/var/lib/sys/config/health_sync_status_" .. soul_id .. ".json"
local sf = io.open(STATUS_FILE, "r")
if sf then
  local raw = sf:read("*a"); sf:close()
  local status = cjson.decode(raw)
  if status then
    ngx.say(cjson.encode({
      ok        = status.ok == true,
      message   = status.message or "Sync-Status unbekannt.",
      error_type = status.error_type,
      last_run  = status.ts,
    }))
    return
  end
end

-- Fallback: Log-Datei parsen (legacy)
local LOG = "/var/log/sys/health_sync.log"
local f = io.open(LOG, "r")
if not f then
  ngx.say(cjson.encode({ ok = false, error_type = "not_run", message = "Sync has not run yet." }))
  return
end

local all = f:read("*a"); f:close()

local lines = {}
for line in all:gmatch("[^\n]+") do lines[#lines+1] = line end
local from = math.max(1, #lines - 80)
local tail = {}
for i = from, #lines do tail[#tail+1] = lines[i] end
local recent = table.concat(tail, "\n")

local last_run = nil
for ts in recent:gmatch("%[(%d%d%d%d%-%d%d%-%d%d %d%d:%d%d)%]") do
  last_run = ts
end

local ok_flag    = false
local error_type = nil
local message    = "Sync status unknown."

if recent:match("Done%.%s+%d+/%d+ soul") then
  ok_flag  = true
  message  = "Sync successful."
elseif recent:match("429") or recent:match("rate.limit") then
  error_type = "rate_limit"
  message    = "Garmin rate limit (429) — wait 2-4 hours and retry."
elseif recent:match("[Ii]nvalid[Cc]redentials") or recent:match("[Ll]ogin.*[Ff]ail") or recent:match("[Uu]nauthorized") then
  error_type = "auth_error"
  message    = "Garmin login failed — check email/password in Health Settings."
elseif recent:match("python.*not found") or recent:match("No such file") then
  error_type = "install_error"
  message    = "Health Sync not installed — run: bash /opt/sys/health-sync/install.sh"
elseif recent:match("[Ee]rror") or recent:match("[Ff]ailed") then
  error_type = "unknown"
  message    = "Sync error — see server log for details."
end

ngx.say(cjson.encode({ ok = ok_flag, error_type = error_type, message = message, last_run = last_run }))
