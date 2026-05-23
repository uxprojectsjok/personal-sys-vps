-- /etc/openresty/lua/web_search.lua
-- POST /api/web-search
-- Brave Search API -- liest brave_key aus soul config.json
-- Body: { "query": "..." }
-- Gibt { results: [{ title, url, description }] } zurueck.

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── Brave API Key aus soul config.json ────────────────────────────────────────
local brave_key = ""
if soul_id and soul_id ~= "" then
  local f = io.open("/var/lib/sys/souls/" .. soul_id .. "/config.json", "r")
  if f then
    local raw = f:read("*a"); f:close()
    local ok, cfg = pcall(cjson.decode, raw)
    if ok and type(cfg) == "table" and type(cfg.brave_key) == "string" and cfg.brave_key ~= "" then
      brave_key = cfg.brave_key
    end
  end
end
if brave_key == "" then brave_key = os.getenv("BRAVE_SEARCH_KEY") or "" end

if brave_key == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"brave_key_missing"}')
  return
end

-- ── Request-Body lesen ────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

local query = body.query or ""
query = query:match("^%s*(.-)%s*$")
if query == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"query_missing"}')
  return
end

-- ── URL-Encoding ──────────────────────────────────────────────────────────────
local function urlencode(s)
  return s:gsub("([^%w%-%.%_%~ ])", function(c)
    return string.format("%%%02X", string.byte(c))
  end):gsub(" ", "+")
end

local url = "https://api.search.brave.com/res/v1/web/search?q=" .. urlencode(query) .. "&count=8&safesearch=moderate"

-- ── Brave Search API aufrufen ─────────────────────────────────────────────────
local httpc = http.new()
httpc:set_timeout(10000)

local res, err = httpc:request_uri(url, {
  method     = "GET",
  ssl_verify = true,
  headers    = {
    ["Accept"]               = "application/json",
    ["X-Subscription-Token"] = brave_key,
  },
})

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local msg = (err or "connection failed"):gsub('"', '\\"')
  ngx.say('{"error":"upstream_error","message":"' .. msg .. '"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local detail = (res.body or ""):sub(1, 200):gsub('["%\\]', function(c)
    return c == '"' and '\\"' or '\\\\'
  end)
  ngx.say('{"error":"brave_api_error","status":' .. res.status .. ',"detail":"' .. detail .. '"}')
  return
end

local ok2, data = pcall(cjson.decode, res.body)
if not ok2 or type(data) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"parse_error"}')
  return
end

-- ── Ergebnisse extrahieren ────────────────────────────────────────────────────
local raw_results = (data.web and data.web.results) or {}
local results = {}

for i = 1, math.min(#raw_results, 8) do
  local r = raw_results[i]
  local desc = r.description or ""
  if desc == "" and type(r.extra_snippets) == "table" and r.extra_snippets[1] then
    desc = r.extra_snippets[1]
  end
  table.insert(results, {
    title       = r.title       or "",
    url         = r.url         or "",
    description = desc,
  })
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ results = results }))
