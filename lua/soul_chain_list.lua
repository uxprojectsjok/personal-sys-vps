-- /etc/openresty/lua/soul_chain_list.lua
-- GET /api/soul/chain-list  → volle Kontinuitäts-Kette (alle Glieder) für die
-- eigene Chain-Visualisierung. Owner-only, kein Zugriff auf Rohdaten (Fotos/
-- Audio) — nur die Metadaten, die ohnehin schon in chain.json plaintext liegen.
-- Auth: vault_auth.lua

local cjson   = require("cjson.safe")
local chain   = require("chain_lib")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local links = chain.load(soul_id)
ngx.say(cjson.encode({ ok = true, links = links }))
