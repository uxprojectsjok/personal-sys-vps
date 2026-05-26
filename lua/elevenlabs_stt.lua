-- /etc/openresty/lua/elevenlabs_stt.lua
-- POST /api/elevenlabs-stt
-- Body: raw audio (audio/webm, audio/mp4, …) + Authorization: Bearer <soul_cert>
-- Returns: { text: "…" }

local cjson   = require("cjson.safe")
local http    = require("resty.http")
local soul_id = ngx.ctx.soul_id

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ElevenLabs Key aus config.json
local api_key = ""
if soul_id and soul_id ~= "" then
  local f = io.open("/var/lib/sys/souls/" .. soul_id .. "/config.json", "r")
  if f then
    local raw_cfg = f:read("*a"); f:close()
    local ok, cfg = pcall(cjson.decode, raw_cfg)
    if ok and type(cfg) == "table" and type(cfg.elevenlabs_key) == "string" and cfg.elevenlabs_key ~= "" then
      api_key = cfg.elevenlabs_key
    end
  end
end
if api_key == "" then api_key = os.getenv("ELEVENLABS_API_KEY") or "" end

if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"elevenlabs_key_missing","message":"ElevenLabs API-Key nicht konfiguriert"}')
  return
end

ngx.req.read_body()
local audio_data = ngx.req.get_body_data()
if not audio_data then
  local tmp = ngx.req.get_body_file()
  if tmp then
    local fh = io.open(tmp, "rb")
    if fh then audio_data = fh:read("*a"); fh:close() end
  end
end
if not audio_data or #audio_data == 0 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"empty_body"}')
  return
end

-- Content-Type → Dateiendung für multipart
local ct  = ngx.req.get_headers()["content-type"] or "audio/webm"
local ext = "webm"
if ct:find("mp4")  then ext = "mp4"
elseif ct:find("ogg") then ext = "ogg"
elseif ct:find("wav") then ext = "wav" end

-- Multipart-Body manuell bauen
local boundary = "SYSSTTBoundary" .. tostring(ngx.now()):gsub("%.", "")
local CRLF = "\r\n"

local body = "--" .. boundary .. CRLF
  .. 'Content-Disposition: form-data; name="model_id"' .. CRLF .. CRLF
  .. "scribe_v1" .. CRLF
  .. "--" .. boundary .. CRLF
  .. 'Content-Disposition: form-data; name="file"; filename="audio.' .. ext .. '"' .. CRLF
  .. "Content-Type: " .. ct .. CRLF .. CRLF
  .. audio_data .. CRLF
  .. "--" .. boundary .. "--" .. CRLF

local httpc = http.new()
httpc:set_timeout(30000)

local res, err = httpc:request_uri("https://api.elevenlabs.io/v1/speech-to-text", {
  method  = "POST",
  ssl_verify = true,
  headers = {
    ["xi-api-key"]   = api_key,
    ["Content-Type"] = "multipart/form-data; boundary=" .. boundary,
  },
  body = body,
})

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "upstream_error", message = err or "timeout" }))
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "elevenlabs_error", status = res.status }))
  return
end

local ok, data = pcall(cjson.decode, res.body or "")
if not ok or type(data) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_response"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({ text = data.text or "" }))
