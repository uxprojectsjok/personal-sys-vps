-- /etc/openresty/lua/test_key.lua
-- POST /api/test-key — testet Anthropic / WaveSpeed / ElevenLabs API-Keys
-- Auth: soul_cert (via soul_auth.lua access phase)

local cjson = require("cjson.safe")
local http  = require("resty.http")

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local httpc = http.new()
httpc:set_timeout(12000)

-- ── Anthropic ──────────────────────────────────────────────────────────────────
if type(body.anthropic_key) == "string" then
  local key = body.anthropic_key
  if key:sub(1,7) ~= "sk-ant-" then
    ngx.status = 400
    ngx.say(cjson.encode({ ok = false, status = 400, error = "key_format_invalid" }))
    return
  end
  local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
    method  = "POST",
    headers = {
      ["x-api-key"]         = key,
      ["anthropic-version"] = "2023-06-01",
      ["content-type"]      = "application/json",
    },
    body       = '{"model":"claude-haiku-4-5-20251001","max_tokens":5,"messages":[{"role":"user","content":"Hi"}]}',
    ssl_verify = false,
  })
  if not res then
    ngx.status = 502
    ngx.say(cjson.encode({ ok = false, status = 0, error = tostring(err) }))
    return
  end
  ngx.status = 200
  ngx.say(cjson.encode({ ok = res.status == 200, status = res.status }))
  return
end

-- ── ElevenLabs ────────────────────────────────────────────────────────────────
if type(body.elevenlabs_key) == "string" then
  local key = body.elevenlabs_key
  if #key < 20 then
    ngx.status = 400
    ngx.say(cjson.encode({ ok = false, status = 400, error = "key_format_invalid" }))
    return
  end
  local res, err = httpc:request_uri("https://api.elevenlabs.io/v1/user", {
    method  = "GET",
    headers = { ["xi-api-key"] = key },
    ssl_verify = false,
  })
  if not res then
    ngx.status = 502
    ngx.say(cjson.encode({ ok = false, status = 0, error = tostring(err) }))
    return
  end
  ngx.status = 200
  ngx.say(cjson.encode({ ok = res.status == 200, status = res.status }))
  return
end

-- ── WaveSpeed ─────────────────────────────────────────────────────────────────
if type(body.wavespeed_key) == "string" then
  local key = body.wavespeed_key
  if #key < 16 then
    ngx.status = 400
    ngx.say(cjson.encode({ ok = false, status = 400, error = "key_format_invalid" }))
    return
  end
  local res, err = httpc:request_uri("https://api.wavespeed.ai/api/v3/me", {
    method  = "GET",
    headers = { ["Authorization"] = "Bearer " .. key },
    ssl_verify = false,
  })
  if not res then
    -- Fallback: nur Format-Check wenn API nicht erreichbar
    ngx.status = 200
    ngx.say(cjson.encode({ ok = true, status = 0, error = "format_ok_api_unreachable" }))
    return
  end
  ngx.status = 200
  ngx.say(cjson.encode({ ok = res.status == 200, status = res.status }))
  return
end

ngx.status = 400
ngx.say('{"error":"no_key_provided"}')
