-- /etc/openresty/lua/tts.lua
-- POST /api/tts
-- Synthetisiert Text mit ElevenLabs TTS (geklonte Soul-Stimme).
-- Body: { text, voiceId? }
-- Gibt audio/mpeg Binary zurück.

local cjson = require("cjson.safe")
local http  = require("resty.http")

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local api_key = os.getenv("ELEVENLABS_API_KEY") or ""
if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"service_unavailable","message":"ELEVENLABS_API_KEY nicht konfiguriert"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw or #raw == 0 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"empty_body"}')
  return
end

local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

local text     = body.text or ""
local voice_id = body.voiceId or "so8sjJVLKF8XBdJgZNe9"

if text == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"text_required"}')
  return
end

-- Text auf 500 Zeichen begrenzen (TTS-Kosten)
if #text > 500 then text = text:sub(1, 500) end

local ok2, payload = pcall(cjson.encode, {
  text        = text,
  model_id    = "eleven_flash_v2_5",
  voice_settings = {
    stability         = 0.5,
    similarity_boost  = 0.8,
    style             = 0.0,
    use_speaker_boost = true,
  },
})
if not ok2 then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"encode_failed"}')
  return
end

local httpc = http.new()
httpc:set_timeout(15000)

local res, err = httpc:request_uri(
  "https://api.elevenlabs.io/v1/text-to-speech/" .. voice_id,
  {
    method     = "POST",
    ssl_verify = true,
    headers    = {
      ["Content-Type"] = "application/json",
      ["xi-api-key"]   = api_key,
      ["Accept"]       = "audio/mpeg",
    },
    body = payload,
  }
)

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
  ngx.say('{"error":"elevenlabs_error","status":' .. res.status .. '}')
  return
end

ngx.header["Content-Type"]  = "audio/mpeg"
ngx.header["Cache-Control"] = "no-store"
ngx.print(res.body)
