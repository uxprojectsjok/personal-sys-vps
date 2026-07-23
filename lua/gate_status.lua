-- /etc/openresty/lua/gate_status.lua
-- GET /api/gate-status
-- Gibt zurück ob eine Soul registriert ist (→ gate.vue weiß ob Cert-Feld nötig).
-- Kein Auth erforderlich – keine sensiblen Daten.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local node_soul_id = cfg.get_node_soul_id()

-- Souls-Verzeichnis prüfen (auch Multi-Hoster: node_soul_id nicht gesetzt, aber Souls vorhanden)
local souls_exist = false
do
  local h = io.popen("ls /var/lib/sys/souls/ 2>/dev/null")
  if h then
    for d in h:lines() do
      if d:match("^[a-zA-Z0-9%-]+$") then souls_exist = true; break end
    end
    h:close()
  end
end

local self_registration = true
do
  local f = io.open("/var/lib/sys/config/self_registration", "r")
  if f then
    local v = f:read("*a"); f:close()
    self_registration = v ~= "false"
  end
end

ngx.status = 200
ngx.say(cjson.encode({
  soul_registered   = souls_exist,
  multi_hoster      = cfg.get_multi_hoster() == true,
  self_registration = self_registration,
}))
