-- node_status.lua
-- GET /api/node-status
-- Gibt zurück ob dieser Node bereits einer Soul gehört (domain-aware).
-- Kein Auth erforderlich — öffentliche Info für das Frontend und Cross-Domain-Test.

local cjson = require("cjson.safe")

local host = (ngx.var and ngx.var.host) or ""

-- Gleiches Muster wie soul_amortization.lua/soul_pay_x402.lua — Default bleibt
-- monetarisierungsfähig für Altinstallationen ohne die Datei. Umbenannt von
-- "public_node"/is_public_node() — das Flag steuert ausschließlich Marketplace/
-- Monetarisierung, nicht die allgemeine Erreichbarkeit der Node (die läuft über
-- discoverable + Gatekeeper-Wiring, unabhängig davon).
local function is_monetization_enabled()
  local f = io.open("/var/lib/sys/config/monetization_enabled", "r")
  if not f then return true end
  local v = f:read("*a"); f:close()
  return v ~= "false"
end
local monetization_enabled = is_monetization_enabled()

-- Domain-spezifischer Pfad zuerst, Fallback auf global
local function try_read(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then return data end
  return nil
end

local data
if host ~= "" then
  data = try_read("/var/lib/sys/config/" .. host .. "/master.json")
end
if not data then
  data = try_read("/var/lib/sys/config/master.json")
end

ngx.header["Content-Type"]                = "application/json"
ngx.header["Cache-Control"]               = "no-store"
-- Access-Control-Allow-Origin bewusst NICHT hier gesetzt — der Vhost-
-- Location-Block (add_header ... always;) deckt das bereits ab; ein
-- zusätzliches Setzen hier führte zu einem doppelten Header ("*, *"), den
-- Browser als ungültig ablehnen (siehe soul_chain_metrics.lua).

if not data then
  ngx.status = 200
  ngx.say(cjson.encode({ locked = false, monetization_enabled = monetization_enabled }))
  return
end

-- Multi-Hoster: Registrierung immer offen, kein Soul-Lock
if data.multi_hoster then
  ngx.say(cjson.encode({ locked = false, multi_hoster = true, monetization_enabled = monetization_enabled }))
  return
end

local soul_id = (type(data.node_soul_id) == "string") and data.node_soul_id or ""
ngx.say(cjson.encode({ locked = soul_id ~= "", monetization_enabled = monetization_enabled }))
