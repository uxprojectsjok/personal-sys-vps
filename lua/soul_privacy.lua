-- /etc/openresty/lua/soul_privacy.lua
-- GET /api/soul/privacy  → aktuellen Discoverable-Status lesen
-- PUT /api/soul/privacy  → Discoverable-Status setzen
-- Auth: soul_auth.lua (soul_cert)
--
-- "discoverable" ist bewusst getrennt von amortization.private (soul_amortization.lua):
-- private blockt anonyme Zahlungs-/Lese-/Preview-Zugriffe trotz bekannter soul_id.
-- discoverable steuert, ob die Soul überhaupt im öffentlichen Scan-Netzwerk
-- (/api/soul/scan, /llms.txt, soul_discover) AUFTAUCHT — unabhängig davon, ob
-- Fremde sie bei bekanntem Endpunkt noch direkt ansprechen dürfen.

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

local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"

local function read_ctx()
  local f = io.open(ctx_file, "r")
  if not f then return {} end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  return (ok and type(data) == "table") and data or {}
end

local function write_ctx(data)
  local f = io.open(ctx_file, "w")
  if not f then return false end
  local ok, encoded = pcall(cjson.encode, data)
  if not ok then return false end
  f:write(encoded); f:close()
  return true
end

if ngx.req.get_method() == "GET" then
  local ctx = read_ctx()
  -- Default true (unset == discoverable), konsistent mit soul_indexer.mjs.
  local discoverable = ctx.discoverable ~= false
  ngx.say(cjson.encode({ discoverable = discoverable }))
  return
end

if ngx.req.get_method() == "PUT" then
  ngx.req.read_body()
  local body_raw = ngx.req.get_body_data() or ""
  local ok_b, body = pcall(cjson.decode, body_raw)
  if not ok_b or type(body) ~= "table" or type(body.discoverable) ~= "boolean" then
    ngx.status = 400
    ngx.say('{"error":"discoverable (boolean) erforderlich"}')
    return
  end

  local ctx = read_ctx()
  ctx.discoverable = body.discoverable
  if not write_ctx(ctx) then
    ngx.status = 500
    ngx.say('{"error":"write_failed"}')
    return
  end

  -- Sofort wirksam machen: soul-mcp's In-Memory-Index liest api_context.json sonst
  -- erst beim nächsten on-chain Anchor-Event neu ein (siehe soul_indexer.mjs).
  -- Best-Effort — bei Fehlschlag bleibt die Einstellung trotzdem gespeichert und
  -- greift spätestens beim nächsten Anchor.
  local http = require("resty.http")
  do
    local hc = http.new()
    hc:set_timeout(2000)
    hc:request_uri("http://127.0.0.1:3098/internal/reindex-local", {
      method  = "POST",
      headers = { ["Content-Type"] = "application/json" },
      body    = cjson.encode({ soul_id = soul_id }),
    })
  end

  ngx.say(cjson.encode({ ok = true, discoverable = body.discoverable }))
  return
end

ngx.status = 405
ngx.say('{"error":"method_not_allowed"}')
