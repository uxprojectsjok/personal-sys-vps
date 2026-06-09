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

-- Synchron ausführen und Output erfassen
local pipe = io.popen(VENV .. " " .. SCRIPT .. " 2>&1")
local output = pipe and pipe:read("*a") or ""
if pipe then pipe:close() end

-- Output ins Log schreiben
local lf = io.open(LOG, "a")
if lf then lf:write(output); lf:close() end

-- Ergebnis auswerten
local success = output:find("Done%.") ~= nil or output:find("synced") ~= nil
local written = output:match("Written: ([^\n]+)")

ngx.header["Content-Type"] = "application/json"
if success then
  ngx.status = 200
  ngx.say(cjson.encode({
    ok      = true,
    message = "Health Sync erfolgreich" .. (written and (" — " .. written:match("[^/]+$")) or ""),
  }))
else
  local err = output:match("[Ee]rror[^\n]*") or output:match("Traceback[^\n]*") or "Sync fehlgeschlagen"
  ngx.status = 500
  ngx.say(cjson.encode({ ok = false, error = err }))
end
