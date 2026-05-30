-- /etc/openresty/lua/translate.lua
-- POST /api/translate
-- Auth: vault_auth.lua (soul_cert)
-- Body: { text: "...", type: "description" | "tags" }
-- Übersetzt Text mit Claude Haiku ins Englische.

local cjson = require("cjson.safe")
local http  = require("resty.http")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local cfg     = require("config_reader")
local api_key = cfg.get_anthropic_key(ngx.ctx.soul_id)
if api_key == "" then
  ngx.status = 503; ngx.say('{"error":"service_unavailable"}'); return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw or #raw == 0 then
  ngx.status = 400; ngx.say('{"error":"empty_body"}'); return
end

local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
end

local text      = tostring(body.text or ""):sub(1, 500)
local text_type = tostring(body.type or "description")

if text == "" then
  ngx.say(cjson.encode({ translated = "" })); return
end

local prompt
if text_type == "tags" then
  prompt = 'Translate these comma-separated tags to English. Keep proper nouns (city/brand/person names) as-is. If already English, return unchanged. Return ONLY the translated comma-separated tags, nothing else:\n\n' .. text
else
  prompt = 'Translate this soul description to English. Keep proper nouns (city/brand/person names) as-is. If already English, return unchanged. Return ONLY the translated text, nothing else:\n\n' .. text
end

local ok2, req_body = pcall(cjson.encode, {
  model      = "claude-haiku-4-5",
  max_tokens = 150,
  messages   = {{ role = "user", content = prompt }},
})
if not ok2 then
  ngx.say(cjson.encode({ translated = text })); return
end

local httpc = http.new()
httpc:set_timeout(8000)
local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method     = "POST",
  ssl_verify = true,
  headers    = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = req_body,
})

if not res or res.status ~= 200 then
  ngx.say(cjson.encode({ translated = text })); return
end

local ok3, resp = pcall(cjson.decode, res.body)
if not ok3 or type(resp) ~= "table" or type(resp.content) ~= "table" or not resp.content[1] then
  ngx.say(cjson.encode({ translated = text })); return
end

local translated = (resp.content[1].text or text):match("^%s*(.-)%s*$")
ngx.say(cjson.encode({ translated = translated }))
