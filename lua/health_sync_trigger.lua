-- POST /api/health-sync
-- Startet health_sync.py im Hintergrund für die authentifizierte Soul.
-- Antwortet sofort — Sync läuft async (~30 Sek.).

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

local VENV   = "/opt/sys/health-sync/.venv/bin/python"
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

-- Hintergrundprozess starten (non-blocking)
local cmd = VENV .. " " .. SCRIPT .. " >> " .. LOG .. " 2>&1 &"
os.execute(cmd)

ngx.status = 200
ngx.header["Content-Type"] = "application/json"
ngx.say('{"ok":true,"message":"Health Sync gestartet — dauert ca. 30 Sekunden. Danach health_check aufrufen.","log":"' .. LOG .. '"}')
