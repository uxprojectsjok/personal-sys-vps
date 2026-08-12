-- POST /api/agent/run → startet sys-agent-run.sh im Hintergrund

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

-- Gleiche Validierung wie mind.lua/soul_cert.lua für jede soul_id, die in
-- einen Shell-Befehl oder Dateipfad eingebettet wird (siehe cmd/err_file unten).
if not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then
  ngx.status = 403
  ngx.say('{"error":"Invalid soul identity"}')
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method not allowed"}')
  return
end

ngx.header["Content-Type"] = "application/json"

local runner   = "/usr/local/bin/sys-agent-run.sh"
local err_file = "/tmp/sys_agent_launch_" .. soul_id .. ".err"

-- os.execute() auf einen mit "&" backgroundeten Befehl meldet praktisch immer
-- Erfolg zurück, egal ob sudo/der Runner dahinter tatsächlich anläuft — der
-- äußere Shell-Aufruf selbst schlägt so gut wie nie fehl, nur das Kommando
-- IM Hintergrund könnte es (z.B. fehlende/fehlkonfigurierte sudoers-Regel,
-- siehe /etc/sudoers.d/sys-agent). Das führte dazu, dass "Agent started"
-- unconditional gemeldet wurde, selbst wenn sudo sofort mit "a password is
-- required"/"not allowed to execute" abbricht. Fix: stderr des Hintergrund-
-- Befehls in eine Datei umleiten, kurz warten (sudo-Rechtefehler sind quasi
-- augenblicklich), und die Datei danach prüfen statt os.execute() blind zu
-- vertrauen.
os.execute("rm -f " .. err_file)
local cmd = "nohup sudo " .. runner .. " " .. soul_id .. " >/dev/null 2>" .. err_file .. " &"
os.execute(cmd)
os.execute("sleep 0.4")

local err_text = ""
local ef = io.open(err_file, "r")
if ef then
  err_text = ef:read("*a") or ""
  ef:close()
  os.execute("rm -f " .. err_file)
end
err_text = err_text:gsub("^%s+", ""):gsub("%s+$", "")

if err_text ~= "" then
  ngx.status = 500
  ngx.say(cjson.encode({ error = "launch_failed", message = err_text }))
else
  ngx.say('{"ok":true,"message":"Agent started"}')
end
