-- /etc/openresty/lua/verify_face_check.lua
-- POST /api/verify/face-check  (soul_cert auth)
-- Vergleicht Live-Kamerabild mit vault/images/profile.png via Claude Vision.
-- Body: { image_base64: "<base64 ohne data-URI-Prefix>", mime: "image/jpeg", challenge_id }
-- Returns: { match: bool, confidence: "high|medium|low", message: string }
--
-- challenge_id ist optional (Rückwärtskompatibilität), aber PFLICHT für einen
-- gültigen /api/verify/complete-Aufruf mit method=face/face_hq: bei einem Match
-- wird hier ein Serverbeweis in die Challenge-Datei geschrieben, den
-- verify_complete.lua gegenprüft (gleiches Muster wie voice_hq_digits_verified) —
-- sonst könnte ein Client den Face-Check komplett überspringen und einfach
-- "verified: true" an /api/verify/complete posten, ohne dass je ein Bild verglichen wurde.

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local cfg    = require("config_reader")
local resty_aes = require("resty.aes")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local soul_id   = ngx.ctx.soul_id
local vault_key = ngx.ctx.vault_key or ""
local api_key   = cfg.get_anthropic_key(soul_id)

if api_key == "" then
  ngx.status = 503; ngx.say('{"error":"anthropic_key_missing"}'); return
end

-- Body lesen
ngx.req.read_body()
local body_raw = ngx.req.get_body_data()
if not body_raw then
  local tmp = ngx.req.get_body_file()
  if tmp then local fh=io.open(tmp,"r"); if fh then body_raw=fh:read("*a"); fh:close() end end
end
local ok_b, body = pcall(cjson.decode, body_raw or "")
if not ok_b or type(body) ~= "table" or type(body.image_base64) ~= "string" then
  ngx.status = 400; ngx.say('{"error":"invalid_body"}'); return
end

local hq = body.hq == true
local challenge_id = type(body.challenge_id) == "string" and body.challenge_id or nil

-- Serverbeweis in die Challenge-Datei schreiben, den verify_complete.lua bei
-- method=face/face_hq gegenprüft. face_hq_verified nur bei match+hq=true, damit
-- ein einfacher (nicht-HQ) Match nicht als Beweis für den strengeren HQ-Schritt
-- durchgeht (Downgrade-Schutz, analog zur HQ/Non-HQ-Trennung bei voice).
local function persist_face_proof(match)
  if not challenge_id or match ~= true then return end
  local VERIFY_DIR = "/var/lib/sys/verify/"
  local fpath = VERIFY_DIR .. soul_id .. "_" .. challenge_id .. ".json"
  local f = io.open(fpath, "r")
  if not f then return end
  local raw_c = f:read("*a"); f:close()
  local ok_c, d = pcall(cjson.decode, raw_c)
  if not ok_c or type(d) ~= "table" or d.soul_id ~= soul_id then return end
  d.face_check_verified = true
  if hq then d.face_hq_check_verified = true end
  local ok_e, enc = pcall(cjson.encode, d)
  if ok_e then
    local wf = io.open(fpath, "w")
    if wf then wf:write(enc); wf:close() end
  end
end

local live_b64 = body.image_base64
local live_mime = (type(body.mime) == "string" and body.mime ~= "") and body.mime or "image/jpeg"
-- Strip data-URI prefix if present
live_b64 = live_b64:gsub("^data:[^;]+;base64,", "")

-- Profil-Bild lesen (vault/images/profile.png)
local VAULT_MAGIC = "SYS\1"
local profile_path = "/var/lib/sys/souls/" .. soul_id .. "/vault/images/profile.png"
local fh = io.open(profile_path, "rb")
if not fh then
  ngx.status = 404; ngx.say('{"error":"profile_image_not_found"}'); return
end
local raw = fh:read("*a"); fh:close()

-- Entschlüsseln falls nötig
if raw:sub(1,4) == VAULT_MAGIC then
  if vault_key == "" then
    ngx.status = 403; ngx.say('{"error":"vault_locked","message":"Vault muss entsperrt sein für Gesichtsverifikation"}'); return
  end
  local function hex2bin(h) return (h:gsub("..", function(c) return string.char(tonumber(c,16)) end)) end
  local iv = raw:sub(5,20); local ct = raw:sub(21)
  local aes, aerr = resty_aes:new(hex2bin(vault_key), nil, resty_aes.cipher(256,"cbc"), {iv=iv})
  if not aes then
    ngx.status = 500; ngx.say('{"error":"decrypt_failed","message":"' .. tostring(aerr) .. '"}'); return
  end
  raw = aes:decrypt(ct)
  if not raw then
    ngx.status = 500; ngx.say('{"error":"decrypt_failed"}'); return
  end
end

local profile_b64 = ngx.encode_base64(raw)

-- HQ-Modus: schärferer Prompt statt binärem MATCH/NO_MATCH — fragt explizit
-- Konfidenz-Stufe UND Liveness-Signale ab (Screen-Reflexion, Papierkante/
-- -wölbung, flaches Licht, Moiré-Muster). Kein neuer Anbieter, kein neuer
-- Call — nur ein anderer Prompt im selben Claude-Vision-Request.
local prompt = hq and
  "You are comparing a reference photo (first image) against a live capture " ..
  "(second image) for identity verification. Reply with EXACTLY this format, " ..
  "nothing else:\n\n" ..
  "CONFIDENCE: <high|medium|low|none>\n" ..
  "LIVENESS: <pass|fail>\n" ..
  "LIVENESS_NOTES: <brief reason>\n\n" ..
  "CONFIDENCE reflects how likely the two photos show the same person " ..
  "(high = clearly same person, none = clearly different or unclear).\n" ..
  "LIVENESS reflects whether the live capture shows red flags of being a " ..
  "photo-of-a-photo or screen replay: reflections/glare consistent with a " ..
  "screen, visible paper edges or curling, unnaturally flat/uniform " ..
  "lighting, moire/interference patterns. LIVENESS fails if ANY such " ..
  "signal is present, regardless of confidence."
  or "Do these two photos show the same person? Reply with exactly one word: MATCH or NO_MATCH."

local payload_ok, payload = pcall(cjson.encode, {
  model      = "claude-haiku-4-5-20251001",
  max_tokens = hq and 80 or 30,
  messages   = {{
    role    = "user",
    content = {
      { type="image", source={ type="base64", media_type="image/png",  data=profile_b64 } },
      { type="image", source={ type="base64", media_type=live_mime,    data=live_b64    } },
      { type="text",  text=prompt },
    }
  }}
})
if not payload_ok then
  ngx.status = 500; ngx.say('{"error":"encode_failed"}'); return
end

local hc = http.new(); hc:set_timeout(15000)
local res, err = hc:request_uri("https://api.anthropic.com/v1/messages", {
  method  = "POST",
  ssl_verify = true,
  headers = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = payload,
})

if not res or res.status ~= 200 then
  ngx.status = 502
  ngx.say('{"error":"claude_error","status":' .. (res and res.status or 0) .. '}')
  return
end

local ok_r, resp = pcall(cjson.decode, res.body)
if not ok_r or type(resp) ~= "table" then
  ngx.status = 502; ngx.say('{"error":"parse_error"}'); return
end

local raw_text = ""
if type(resp.content) == "table" and type(resp.content[1]) == "table" then
  raw_text = resp.content[1].text or ""
end

if hq then
  local upper_text  = raw_text:upper()
  local confidence  = upper_text:match("CONFIDENCE:%s*(%u+)") or "NONE"
  local liveness    = upper_text:match("LIVENESS:%s*(%u+)") or "FAIL"
  -- Case-insensitiv nach dem Label suchen (wie oben), aber Notes-Inhalt aus
  -- dem Original-Text schneiden statt aus der Upper-Case-Kopie — sonst wäre
  -- z.B. eine kleingeschriebene Antwort leer statt nur schlecht lesbar.
  local notes = ""
  local notes_start = upper_text:find("LIVENESS_NOTES:")
  if notes_start then
    local content_start = notes_start + #"LIVENESS_NOTES:"
    notes = raw_text:sub(content_start):match("^%s*(.-)%s*$")
  end
  confidence = confidence:lower(); liveness = liveness:lower()

  -- Streng: nur high-Konfidenz UND bestandene Liveness zählen als Match —
  -- HQ soll strenger sein als der Standard-Check, nicht nur "besser raten".
  local match = confidence == "high" and liveness == "pass"
  persist_face_proof(match)
  ngx.say(cjson.encode({
    match      = match,
    confidence = confidence,
    liveness   = liveness,
    message    = match and "Gesicht erkannt (HQ)."
                 or (liveness ~= "pass" and ("Liveness-Prüfung fehlgeschlagen: " .. notes)
                     or "Gesicht nicht mit ausreichender Konfidenz erkannt."),
  }))
  return
end

local answer = raw_text:upper():match("MATCH") or ""
local match = answer == "MATCH"
persist_face_proof(match)
ngx.say(cjson.encode({
  match      = match,
  confidence = match and "high" or "low",
  message    = match and "Gesicht erkannt." or "Gesicht nicht erkannt.",
}))
