-- POST /api/health-sync
-- Führt health_sync.py synchron aus — wartet auf Ergebnis und gibt Erfolg/Fehler zurück.

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

local VENV   = "/opt/sys/health-sync/.venv/bin/python3"
local SCRIPT = "/opt/sys/health-sync/health_sync.py"
local LOG    = "/var/log/sys_health_sync.log"

-- Prüfen ob Config für diese Soul existiert
local config_path = "/var/lib/sys/config/health_sync_" .. soul_id .. ".json"
local fh = io.open(config_path, "r")
if not fh then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Health Sync nicht eingerichtet. Aktivierung: bash /opt/sys/health-sync/install.sh"}')
  return
end
fh:close()

-- Im Hintergrund starten — blockiert nginx nicht
-- stdout+stderr → LOG, nohup verhindert SIGHUP-Kill beim Request-Ende
os.execute("/bin/sh -c 'nohup " .. VENV .. " " .. SCRIPT .. " >> " .. LOG .. " 2>&1 < /dev/null &'")

ngx.status = 202
ngx.header["Content-Type"] = "application/json"
ngx.say('{"ok":true,"message":"Sync gestartet"}')
