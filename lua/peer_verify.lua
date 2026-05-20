-- /etc/openresty/lua/peer_verify.lua
-- GET /api/peer/verify?soul_id=<id>&cert=<cert>
--
-- Public, CORS — prüft ob soul_id + cert zu diesem Node gehören.
-- Wird von anderen VPS-Instanzen im Handshake als Callback aufgerufen.
--
-- Single-soul Node (node_soul_id gesetzt): soul_id muss exakt passen.
-- Multi-soul Node (node_soul_id fehlt):    soul_id muss auf dem Node existieren.

local cjson      = require "cjson.safe"
local hmac       = require "hmac_helper"
local cfg        = require "config_reader"
local master_key = cfg.get_master_key()

local SOULS_DIR = "/var/lib/sys/souls/"

ngx.header["Content-Type"]                 = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.header["Access-Control-Allow-Methods"] = "GET, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204
  return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say(cjson.encode({ error = "Method not allowed" }))
  return
end

local args    = ngx.req.get_uri_args()
local soul_id = args and args.soul_id
local cert    = args and args.cert

if type(soul_id) ~= "string" or not soul_id:match("^[a-zA-Z0-9_%-]+$") or #soul_id > 128 then
  ngx.status = 400
  ngx.say(cjson.encode({ ok = false, error = "soul_id ungültig" }))
  return
end

if type(cert) ~= "string" or #cert < 16 or #cert > 128 then
  ngx.status = 400
  ngx.say(cjson.encode({ ok = false, error = "cert ungültig" }))
  return
end

if master_key == "" then
  ngx.status = 503
  ngx.say(cjson.encode({ ok = false, error = "Node nicht konfiguriert" }))
  return
end

-- ── Soul-Existenz prüfen (single- vs multi-soul) ──────────────────────────────

local node_soul_id = cfg.get_node_soul_id()
if node_soul_id and node_soul_id ~= "" then
  -- Single-soul Node: soul_id muss exakt passen
  if node_soul_id ~= soul_id then
    ngx.status = 403
    ngx.say(cjson.encode({ ok = false, error = "soul_id nicht auf diesem Node registriert" }))
    return
  end
else
  -- Multi-soul Node: soul_id muss existieren
  local exists = false
  for _, path in ipairs({
    SOULS_DIR .. soul_id .. "/api_context.json",
    SOULS_DIR .. soul_id .. "/sys.md",
  }) do
    local f = io.open(path, "r")
    if f then f:close(); exists = true; break end
  end
  if not exists then
    ngx.status = 403
    ngx.say(cjson.encode({ ok = false, error = "soul_id nicht auf diesem Node registriert" }))
    return
  end
end

-- ── HMAC gegen alle cert_versions prüfen (0..20) ────────────────────────────

-- Per-soul Key für Multi-Hoster; fällt auf globalen Key zurück (Single-Hoster)
local active_key   = master_key
local per_soul_key = cfg.get_soul_master_key(soul_id)
if per_soul_key and per_soul_key ~= "" then active_key = per_soul_key end

local valid = false
for v = 0, 20 do
  if hmac.cert_for_soul(active_key, soul_id, v) == cert then
    valid = true; break
  end
end

-- Grace-Period: vorherigen Key prüfen (nach Master-Key-Rotation)
if not valid then
  local prev_key
  if per_soul_key and per_soul_key ~= "" then
    prev_key = cfg.get_soul_master_key_prev(soul_id)
  end
  if not prev_key or prev_key == "" then prev_key = cfg.get_master_key_prev() end
  if prev_key and prev_key ~= "" then
    for v = 0, 20 do
      if hmac.cert_for_soul(prev_key, soul_id, v) == cert then
        valid = true; break
      end
    end
  end
end

if not valid then
  ngx.status = 401
  ngx.say(cjson.encode({ ok = false, error = "Ungültiger Cert" }))
  return
end

local scheme = ngx.var.scheme or "https"
local host   = ngx.var.host   or ""
ngx.say(cjson.encode({
  ok      = true,
  soul_id = soul_id,
  domain  = scheme .. "://" .. host,
}))
