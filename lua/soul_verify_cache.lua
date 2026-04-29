-- /etc/openresty/lua/soul_verify_cache.lua
-- GET /api/soul/verify?soul_id={uuid}
-- Öffentlich, kein Auth. Cached Polygon-Verifikation 24h im shared dict.
-- Ruft intern den MCP-Node-Prozess auf (127.0.0.1:3098) für die Blockchain-Abfrage.

local cjson   = require("cjson.safe")
local http    = require("resty.http")

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.header["Content-Type"]                = "application/json"
ngx.header["Access-Control-Allow-Origin"] = "*"

local args    = ngx.req.get_uri_args()
local soul_id = args and args.soul_id

if not soul_id or not soul_id:match("^[a-fA-F0-9%-]+$") or #soul_id > 64 then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "soul_id required (UUID format)" }))
  return
end

local TTL     = 86400  -- 24 Stunden
local cache   = ngx.shared.verify_cache
local cache_key = "v1:" .. soul_id

-- ── Cache-Lookup ──────────────────────────────────────────────────────────────
local cached = cache:get(cache_key)
if cached then
  ngx.header["X-Cache"]         = "HIT"
  ngx.header["Cache-Control"]   = "public, max-age=3600"
  ngx.say(cached)
  return
end

-- ── Blockchain-Abfrage via MCP-internem Endpoint ──────────────────────────────
local httpc = http.new()
httpc:set_timeout(10000)  -- 10s Timeout für Blockchain-Call

local res, err = httpc:request_uri(
  "http://127.0.0.1:3098/internal/verify/" .. soul_id,
  { method = "GET", headers = { ["Accept"] = "application/json" } }
)

if not res or err then
  ngx.status = 502
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode({ error = "Blockchain-Abfrage fehlgeschlagen", detail = tostring(err) }))
  return
end

if res.status ~= 200 then
  ngx.status = res.status
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(res.body or '{"error":"upstream error"}')
  return
end

-- Ergebnis parsen und cachen
local ok, data = pcall(cjson.decode, res.body)
if not ok or type(data) ~= "table" then
  ngx.status = 502
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode({ error = "Ungültige Antwort vom Verifikationsdienst" }))
  return
end

-- cached_at hinzufügen
data.cached_at = os.date("!%Y-%m-%dT%H:%M:%SZ")
data.cache_ttl = TTL

local encoded = cjson.encode(data)

-- Nur erfolgreiche Verifikationen lang cachen; Fehler nur 5 Minuten
local actual_ttl = (data.verified == true) and TTL or 300
cache:set(cache_key, encoded, actual_ttl)

ngx.header["X-Cache"]       = "MISS"
ngx.header["Cache-Control"] = "public, max-age=" .. math.floor(actual_ttl / 4)
ngx.say(encoded)
