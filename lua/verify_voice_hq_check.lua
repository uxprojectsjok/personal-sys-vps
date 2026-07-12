-- /etc/openresty/lua/verify_voice_hq_check.lua
-- POST /api/verify/voice-hq-check?challenge_id=<id>  (vault_auth — gleiche Auth wie
-- der Rest von /verify, inkl. vt:-Token für den QR-Scan-Flow)
-- Body: raw audio (audio/webm, audio/mp4, …)
-- Anti-Replay-Teil von voice_hq — die eigentliche Identität (FFT-Vergleich)
-- bleibt unverändert client-seitig, siehe verify-identity-hq-plan.md.
--
-- Prüft NUR ob der vom Server generierte Anti-Replay-Code (voice_code, in der
-- Challenge gespeichert) in der Sprachaufnahme tatsächlich vorkommt. Ruft dafür
-- ElevenLabs Scribe auf — bewusst eine eigene, schlanke Kopie des Multipart-
-- Aufbaus aus elevenlabs_stt.lua statt dessen Route wiederzuverwenden, da jene
-- an soul_auth.lua hängt (kennt das vt:-Token-Format hier nicht) und ein
-- bestehender, funktionierender Pfad nicht für diesen neuen Zweck umgebaut
-- werden soll.

local cjson      = require("cjson.safe")
local http       = require("resty.http")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local challenge_id = ngx.var.arg_challenge_id
if type(challenge_id) ~= "string" or #challenge_id ~= 32 then
  ngx.status = 400; ngx.say('{"error":"invalid_challenge_id"}'); return
end

local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
local f = io.open(fpath, "r")
if not f then ngx.status = 404; ngx.say('{"error":"challenge_not_found"}'); return end
local raw_challenge = f:read("*a"); f:close()
local ok_c, challenge = pcall(cjson.decode, raw_challenge)
if not ok_c or type(challenge) ~= "table" or challenge.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"forbidden"}'); return
end
local voice_code = challenge.voice_code
if type(voice_code) ~= "string" or voice_code == "" then
  ngx.status = 400; ngx.say('{"error":"no_voice_code_on_challenge"}'); return
end

-- ElevenLabs Key aus config.json (gleiches Muster wie elevenlabs_stt.lua)
local api_key = ""
local cf = io.open("/var/lib/sys/souls/" .. soul_id .. "/config.json", "r")
if cf then
  local raw_cfg = cf:read("*a"); cf:close()
  local ok_k, cfg = pcall(cjson.decode, raw_cfg)
  if ok_k and type(cfg) == "table" and type(cfg.elevenlabs_key) == "string" and cfg.elevenlabs_key ~= "" then
    api_key = cfg.elevenlabs_key
  end
end
if api_key == "" then
  ngx.status = 503; ngx.say('{"error":"elevenlabs_key_missing"}'); return
end

ngx.req.read_body()
local audio_data = ngx.req.get_body_data()
if not audio_data then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh = io.open(tmp, "rb"); if fh then audio_data = fh:read("*a"); fh:close() end end
end
if not audio_data or #audio_data == 0 then
  ngx.status = 400; ngx.say('{"error":"empty_body"}'); return
end

local ct  = ngx.req.get_headers()["content-type"] or "audio/webm"
local ext = "webm"
if ct:find("mp4") then ext = "mp4"
elseif ct:find("ogg") then ext = "ogg"
elseif ct:find("wav") then ext = "wav" end

local boundary = "SYSVHQBoundary" .. tostring(ngx.now()):gsub("%.", "")
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
httpc:set_timeout(20000)
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
  ngx.status = 502; ngx.say(cjson.encode({ error = "upstream_error", message = err or "timeout" })); return
end
if res.status ~= 200 then
  ngx.status = 502; ngx.say(cjson.encode({ error = "elevenlabs_error", status = res.status })); return
end

local ok_r, data = pcall(cjson.decode, res.body or "")
if not ok_r or type(data) ~= "table" then
  ngx.status = 502; ngx.say('{"error":"invalid_response"}'); return
end

local transcript = data.text or ""

-- Ziffern aus dem Transkript extrahieren — sowohl Zahlwörter ("vier acht zwei")
-- als auch Ziffern-Zeichen ("482"), damit egal ist wie Scribe die gesprochenen
-- Ziffern rendert.
local WORD_DIGIT = {
  null="0", zero="0", ["null"]="0", eins="1", one="1", zwei="2", two="2",
  drei="3", three="3", vier="4", four="4", fuenf="5", fünf="5", five="5",
  sechs="6", six="6", sieben="7", seven="7", acht="8", eight="8",
  neun="9", nine="9",
}
local function extractDigits(text)
  local out = {}
  -- \128-\255 zusätzlich zu %w, sonst reißt Lua UTF-8-Wörter wie "fünf" an
  -- der Umlaut-Byte-Sequenz auseinander (%w ist ASCII-only) und die Ziffer
  -- geht verloren statt nur nicht erkannt zu werden.
  for token in text:lower():gmatch("[%w\128-\255]+") do
    if token:match("^%d+$") then
      out[#out + 1] = token
    elseif WORD_DIGIT[token] then
      out[#out + 1] = WORD_DIGIT[token]
    end
  end
  return table.concat(out)
end

local extracted    = extractDigits(transcript)
local digits_match = extracted == voice_code

-- Ergebnis in die Challenge-Datei schreiben statt nur an den Client zurückzugeben —
-- verify_complete.lua prüft diesen server-seitigen Zustand, vertraut also nicht
-- einem vom Client behaupteten "digits_match: true" im späteren Complete-Call.
if digits_match then
  challenge.voice_hq_digits_verified = true
  local ok_w, updated = pcall(cjson.encode, challenge)
  if ok_w then
    local fw = io.open(fpath, "w")
    if fw then fw:write(updated); fw:close() end
  end
end

ngx.say(cjson.encode({
  digits_match = digits_match,
  transcript   = transcript,
}))
