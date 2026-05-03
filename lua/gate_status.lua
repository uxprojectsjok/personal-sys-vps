-- /etc/openresty/lua/gate_status.lua
-- GET /api/gate-status
-- Gibt zurück ob eine Soul registriert ist (→ gate.vue weiß ob Cert-Feld nötig).
-- Kein Auth erforderlich – keine sensiblen Daten.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local node_soul_id = cfg.get_node_soul_id()

ngx.status = 200
ngx.say(cjson.encode({
  soul_registered = (node_soul_id ~= nil and node_soul_id ~= "")
}))
