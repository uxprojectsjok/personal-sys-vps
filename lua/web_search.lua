-- /etc/openresty/lua/web_search.lua
-- POST /api/web-search
-- Claude Web-Search-Tool -- liest anthropic_key aus soul config.json
-- Body: { "query": "..." }
-- Gibt { answer: "...", sources: [{ title, url }] } zurueck.

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local cfg     = require("config_reader")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local api_key = cfg.get_anthropic_key(soul_id)
if api_key == "" then
  ngx.status = 503
  ngx.say('{"error":"anthropic_key_missing"}')
  return
end

-- ── Request-Body lesen ────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"invalid_json"}')
  return
end

local query = body.query or ""
query = query:match("^%s*(.-)%s*$")
if query == "" then
  ngx.status = 400
  ngx.say('{"error":"query_missing"}')
  return
end

-- ── Claude Web-Search-Tool aufrufen ───────────────────────────────────────────
local payload_ok, payload = pcall(cjson.encode, {
  model      = "claude-haiku-4-5-20251001",
  max_tokens = 1024,
  tools      = {{ type = "web_search_20250305", name = "web_search" }},
  messages   = {{
    role    = "user",
    content = "Beantworte kurz und praezise (fuer eine gesprochene Antwort geeignet): " .. query,
  }},
})
if not payload_ok then
  ngx.status = 500
  ngx.say('{"error":"encode_failed"}')
  return
end

local httpc = http.new()
httpc:set_timeout(15000)

local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method     = "POST",
  ssl_verify = true,
  headers    = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = payload,
})

if not res then
  ngx.status = 502
  local msg = (err or "connection failed"):gsub('"', '\\"')
  ngx.say('{"error":"upstream_error","message":"' .. msg .. '"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  local detail = (res.body or ""):sub(1, 200):gsub('["%\\]', function(c)
    return c == '"' and '\\"' or '\\\\'
  end)
  ngx.say('{"error":"claude_api_error","status":' .. res.status .. ',"detail":"' .. detail .. '"}')
  return
end

local ok2, data = pcall(cjson.decode, res.body)
if not ok2 or type(data) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"parse_error"}')
  return
end

-- ── Antworttext + Quellen aus den Content-Blocks extrahieren ─────────────────
local answer_parts = {}
local sources       = {}
local seen_urls     = {}

if type(data.content) == "table" then
  for _, block in ipairs(data.content) do
    if type(block) == "table" and block.type == "text" then
      if type(block.text) == "string" and block.text ~= "" then
        table.insert(answer_parts, block.text)
      end
      if type(block.citations) == "table" then
        for _, c in ipairs(block.citations) do
          if type(c) == "table" and c.url and not seen_urls[c.url] then
            seen_urls[c.url] = true
            table.insert(sources, { title = c.title or "", url = c.url })
          end
        end
      end
    end
  end
end

ngx.say(cjson.encode({
  answer  = table.concat(answer_parts, "\n"),
  sources = sources,
}))
