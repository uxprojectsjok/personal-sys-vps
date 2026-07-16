-- POST /api/health/login
-- Startet garmin_login.py im Hintergrund. Wartet bis zu 25s auf Ergebnis:
--   ok            → {ok:true}
--   waiting_mfa   → {needs_mfa:true}
--   error:...     → {error:...}
-- Auth: vault_auth.lua (soul_cert)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not soul_id then
  ngx.status = 401; ngx.say('{"error":"unauthorized"}'); return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local config_path = "/var/lib/sys/config/health_sync_" .. soul_id .. ".json"
local cf = io.open(config_path, "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"Health Sync nicht konfiguriert"}')
  return
end
cf:close()

local VENV        = "/opt/sys/health-sync/.venv/bin/python3"
local SCRIPT      = "/opt/sys/health-sync/garmin_login.py"
local status_file = "/tmp/garmin_login_status_" .. soul_id
local mfa_file    = "/tmp/garmin_mfa_code_" .. soul_id
local log_file    = "/var/log/sys/health_sync.log"

-- Alte Status-/MFA-Dateien bereinigen
os.execute("rm -f " .. status_file .. " " .. mfa_file)

-- Login-Prozess im Hintergrund starten
local cmd = string.format(
  "/bin/sh -c '%s %s --soul-id %s --status-file %s --mfa-file %s >> %s 2>&1 &'",
  VENV, SCRIPT, soul_id, status_file, mfa_file, log_file
)
os.execute(cmd)

-- Bis 25s auf status_file warten
local deadline = ngx.now() + 25
while ngx.now() < deadline do
  ngx.sleep(1)
  local sf = io.open(status_file, "r")
  if sf then
    local status = sf:read("*a"):match("^%s*(.-)%s*$"); sf:close()
    if status == "ok" then
      ngx.say('{"ok":true,"message":"Garmin Login erfolgreich. Tokens gespeichert."}')
      return
    elseif status == "waiting_mfa" or status == "mfa_received" then
      ngx.say('{"needs_mfa":true,"message":"MFA-Code per SMS erhalten — bitte Code eingeben."}')
      return
    elseif status:sub(1, 6) == "error:" then
      local detail = status:sub(7)
      ngx.status = 422
      ngx.say(cjson.encode({ error = detail }))
      return
    end
  end
end

-- Timeout — Prozess läuft noch (z.B. MFA-Wartezeit ohne Datei-Update)
ngx.say('{"needs_mfa":true,"message":"Timeout — falls ein MFA-Code gesendet wurde, jetzt eingeben."}')
