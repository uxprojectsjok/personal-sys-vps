-- GET /api/trader/markets?search=&limit= → { ok, markets }
--
-- Marktdaten selbst sind bei Polymarket öffentlich (Gamma-API, kein Auth) —
-- die Route bleibt trotzdem soul-authentifiziert, konsistent mit jeder
-- anderen /api/*-Route dieses Nodes (Single-Owner-System). Siehe
-- soul-mcp/lib/polymarket_client.mjs. PRIVATE-REPO-ONLY.

local cjson = require("cjson.safe")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

ngx.header["Content-Type"] = "application/json"

local args = ngx.req.get_uri_args()
local qs = "limit=" .. ngx.escape_uri(args.limit or "20")
if args.search then
  qs = qs .. "&search=" .. ngx.escape_uri(args.search)
end

local httpc = http.new()
httpc:set_timeout(15000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/trader/markets?" .. qs, { method = "GET" })

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
