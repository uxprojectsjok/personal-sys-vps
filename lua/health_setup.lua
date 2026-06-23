-- POST /api/health/setup
-- Richtet die Health-Sync-Infrastruktur ein (Venv, Cron) via sudo.
-- Credentials müssen vorher über /api/health/config gespeichert worden sein.

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

local SCRIPT = "/opt/sys/health-sync/setup_server.sh"
local CONFIG = "/var/lib/sys/config/health_sync_" .. soul_id .. ".json"

-- Config muss existieren (Credentials über /api/health/config gespeichert)
local fh = io.open(CONFIG, "r")
if not fh then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "config_missing", message = "Zugangsdaten zuerst speichern." }))
  return
end
fh:close()

-- Script ausführbar machen und via sudo starten
os.execute("chmod +x " .. SCRIPT)
local pipe = io.popen("sudo " .. SCRIPT .. " 2>&1")
local out  = pipe and pipe:read("*a") or ""
local ok   = pipe and pipe:close()

if ok then
  -- Script gibt JSON aus — direkt weiterreichen
  local result = cjson.decode(out)
  if result then
    ngx.say(out)
  else
    ngx.say(cjson.encode({ ok = true, message = "Setup abgeschlossen." }))
  end
else
  ngx.status = 500
  ngx.say(cjson.encode({ error = "setup_failed", message = out or "Setup fehlgeschlagen." }))
end
