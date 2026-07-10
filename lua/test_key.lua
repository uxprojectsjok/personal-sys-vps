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

-- ── use_stored: Key aus config.json laden ─────────────────────────────────────
if body.use_stored == true then
  local key_type = body.key_type
  local soul_id  = ngx.ctx and ngx.ctx.soul_id or ""
  if soul_id == "" then
    ngx.status = 401
    ngx.say('{"ok":false,"error":"unauthorized"}')
    return
  end
  local config_path = "/var/lib/sys/souls/" .. soul_id .. "/config.json"
  local f = io.open(config_path, "r")
  if not f then
    ngx.status = 200
    ngx.say('{"ok":false,"error":"no_stored_key"}')
    return
  end
  local raw = f:read("*a"); f:close()
  local ok_j, cfg_data = pcall(cjson.decode, raw or "")
  if not ok_j or type(cfg_data) ~= "table" then
    ngx.status = 200
    ngx.say('{"ok":false,"error":"config_parse_error"}')
    return
  end
  if key_type == "anthropic" then
    body.anthropic_key = cfg_data.anthropic_key
  elseif key_type == "elevenlabs" then
    body.elevenlabs_key = cfg_data.elevenlabs_key
  end
  if not body.anthropic_key and not body.elevenlabs_key then
    ngx.status = 200
    ngx.say('{"ok":false,"error":"no_stored_key"}')
    return
  end
end

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
  -- sk_-Keys (neues Format) nutzen Authorization: Bearer; ältere Hex-Keys xi-api-key
  local el_headers = key:sub(1,3) == "sk_"
    and { ["Authorization"] = "Bearer " .. key }
    or  { ["xi-api-key"]   = key }
  local res, err = httpc:request_uri("https://api.elevenlabs.io/v1/user", {
    method     = "GET",
    headers    = el_headers,
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

ngx.status = 400
ngx.say('{"error":"no_key_provided"}')
