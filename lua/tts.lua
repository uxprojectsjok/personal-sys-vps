-- /etc/openresty/lua/tts.lua
-- POST /api/tts
-- Synthetisiert Text mit ElevenLabs TTS (geklonte Soul-Stimme).
-- Body: { text, voiceId? }
-- Gibt audio/mpeg Binary zurück.

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local api_key = ""
if soul_id and soul_id ~= "" then
  local f = io.open("/var/lib/sys/souls/" .. soul_id .. "/config.json", "r")
  if f then
    local raw = f:read("*a"); f:close()
    local ok, cfg = pcall(cjson.decode, raw)
    if ok and type(cfg) == "table" and type(cfg.elevenlabs_key) == "string" and cfg.elevenlabs_key ~= "" then
      api_key = cfg.elevenlabs_key
    end
  end
end
if api_key == "" then api_key = os.getenv("ELEVENLABS_API_KEY") or "" end

if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"service_unavailable","message":"ElevenLabs API key not configured"}')
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

-- Text auf 1000 Zeichen begrenzen, am letzten Satzende schneiden
local LIMIT = 1000
if #text > LIMIT then
  local cut = text:sub(1, LIMIT)
  local last = cut:match(".*()[%.!%?]")
  text = last and cut:sub(1, last) or cut
end

local ok2, payload = pcall(cjson.encode, {
  text        = text,
  model_id    = "eleven_flash_v2_5",
  voice_settings = {
    stability         = 0.5,
    similarity_boost  = 0.75,
    style             = 0.05,
    use_speaker_boost = true,
    speed             = 1.1,
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
