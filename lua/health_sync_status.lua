-- GET /api/health/sync-status — liest das letzte Sync-Ergebnis aus dem Log
local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

local LOG = "/var/log/sys_health_sync.log"
ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"

local f = io.open(LOG, "r")
if not f then
  ngx.say(cjson.encode({ ok = false, message = "Sync noch nicht ausgeführt." }))
  return
end

local all = f:read("*a"); f:close()

-- Letzte 80 Zeilen
local lines = {}
for line in all:gmatch("[^\n]+") do lines[#lines+1] = line end
local from = math.max(1, #lines - 80)
local tail = {}
for i = from, #lines do tail[#tail+1] = lines[i] end
local recent = table.concat(tail, "\n")

-- Letzten Zeitstempel finden
local last_run = nil
for ts in recent:gmatch("%[(%d%d%d%d%-%d%d%-%d%d %d%d:%d%d)%]") do
  last_run = ts
end

-- Status erkennen
local ok_flag = false
local message  = "Sync-Status unbekannt."

if recent:match("Done%.%s+%d+/%d+ soul") then
  ok_flag = true
  message  = "Sync erfolgreich."
elseif recent:match("429") or recent:match("rate.limit") then
  message = "Rate Limit — Garmin drosselt zu viele Anmeldungen. Bitte später versuchen."
elseif recent:match("[Ii]nvalid[Cc]redentials") or recent:match("[Ll]ogin.*[Ff]ail") or recent:match("[Uu]nauthorized") then
  message = "Garmin-Anmeldung fehlgeschlagen — E-Mail oder Passwort prüfen."
elseif recent:match("python.*not found") or recent:match("No such file") then
  message = "Health Sync nicht installiert — bash /opt/sys/health-sync/install.sh ausführen."
elseif recent:match("[Ee]rror") or recent:match("[Ff]ailed") then
  message = "Sync-Fehler — Details im Server-Log."
end

ngx.say(cjson.encode({ ok = ok_flag, message = message, last_run = last_run }))
