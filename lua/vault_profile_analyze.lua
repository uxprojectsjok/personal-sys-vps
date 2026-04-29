-- vault_profile_analyze.lua
-- POST /api/vault/profile/analyze
-- Analysiert eine Vault-Datei und speichert ein strukturiertes Profil.
-- Unterstützt: face (Bild → Claude Vision → face.json)
-- Audio/Video: gibt Anleitung zurück (kein automatisches STT/Video-Analyse)
--
-- Body: { type: "face"|"voice"|"motion", filename: "...", file_type: "images"|"audio"|"video" }
-- Auth: Soul-Cert oder Service-Token (vault_auth.lua)

local cjson = require "cjson.safe"
local http  = require "resty.http"

local soul_id = ngx.ctx.soul_id
if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Unauthorized" }))
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Method not allowed" }))
  return
end

local cfg = require("config_reader")
local api_key = cfg.get_anthropic_key(ngx.ctx.soul_id)
if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "ANTHROPIC_API_KEY nicht konfiguriert" }))
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "Ungültiges JSON" }))
  return
end

local ptype     = body.type      -- "face" | "voice" | "motion"
local filename  = body.filename  -- z.B. "profil.jpg"
local file_type = body.file_type -- "images" | "audio" | "video"

local allowed = { face = true, voice = true, motion = true }
if not ptype or not allowed[ptype] then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({ error = "type muss face, voice oder motion sein" }))
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- ── Audio / Motion: manuelle Anleitung (kein automatischer Abruf) ─────────────
if ptype == "voice" or ptype == "motion" then
  local label = ptype == "voice" and "Stimme" or "Bewegung"
  local tool  = ptype == "voice" and "audio_list/audio_get" or "video_list/video_get"
  ngx.say(cjson.encode({
    manual    = true,
    type      = ptype,
    message   = label .. "-Profil kann nicht automatisch analysiert werden.",
    hint      = "Nutze den SaveYourSoul MCP-Connector in Claude: " .. tool .. " aufrufen, Datei analysieren und profile_save({type:'" .. ptype .. "', data:{...}}) aufrufen.",
  }))
  return
end

-- ── Face: Bild aus Vault laden + Claude Vision ────────────────────────────────
if not filename or filename == "" then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "filename erforderlich für face-Analyse" }))
  return
end

local vault_path = "/var/lib/sys/souls/" .. soul_id .. "/vault/images/" .. filename
local f = io.open(vault_path, "rb")
if not f then
  ngx.status = 404
  ngx.say(cjson.encode({ error = "Datei nicht gefunden: " .. filename }))
  return
end
local image_bytes = f:read("*all")
f:close()

-- Base64 kodieren
local function b64(data)
  local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  return (data:gsub('.', function(x)
    local r, b64str = '', x:byte()
    for i = 8, 1, -1 do r = r .. (b64str % 2 ^ i - b64str % 2 ^ (i-1) > 0 and '1' or '0') end
    return r
  end) .. '000'):gsub('%d%d%d?%d?%d?%d?', function(x)
    if #x < 6 then return '' end
    local c = 0
    for i = 1, 6 do c = c + (x:sub(i,i) == '1' and 2^(6-i) or 0) end
    return b:sub(c+1,c+1)
  end) .. ({ '', '==', '=' })[#data % 3 + 1]
end

local img_b64 = b64(image_bytes)

-- MIME-Typ aus Dateiendung
local ext = filename:match("%.([^%.]+)$") or "jpeg"
local mime_map = { jpg="image/jpeg", jpeg="image/jpeg", png="image/png", gif="image/gif", webp="image/webp" }
local mime_type = mime_map[ext:lower()] or "image/jpeg"

-- Claude Vision Prompt für strukturiertes Gesichtsprofil
local prompt = [[Analysiere dieses Bild und erstelle ein strukturiertes Profil für KI-Kontext.
Antworte AUSSCHLIESSLICH mit validem JSON, kein anderer Text:
{
  "description": "Kurze visuelle Beschreibung der Person (2-3 Sätze)",
  "expression": "Typischer Gesichtsausdruck und emotionale Ausstrahlung",
  "presence": "Allgemeine Präsenz und Ausstrahlung",
  "style": "Kleidungsstil und Selbstpräsentation",
  "estimated_age_group": "Altersgruppe (20er, 30er, 40er, etc.)",
  "distinctive_features": "Markante oder prägende Merkmale",
  "notes": "Weitere relevante Beobachtungen für KI-Kontext"
}]]

local req_body = cjson.encode({
  model = "claude-haiku-4-5-20251001",
  max_tokens = 512,
  messages = {{
    role = "user",
    content = {{
      type = "image",
      source = { type = "base64", media_type = mime_type, data = img_b64 }
    }, {
      type = "text",
      text  = prompt
    }}
  }}
})

local httpc = http.new()
httpc:set_timeout(30000)

local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method  = "POST",
  headers = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = req_body,
  ssl_verify = true,
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "Claude API nicht erreichbar: " .. (err or "?") }))
  return
end

local api_ok, api_resp = pcall(cjson.decode, res.body)
if not api_ok or not api_resp.content or not api_resp.content[1] then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "Ungültige API-Antwort" }))
  return
end

local text = api_resp.content[1].text or ""
-- JSON aus Antwort extrahieren
local json_str = text:match("{[%s%S]+}")
if not json_str then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "Kein JSON in Antwort", raw = text:sub(1, 200) }))
  return
end

local profile_ok, profile = pcall(cjson.decode, json_str)
if not profile_ok then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "JSON-Parse fehlgeschlagen", raw = json_str:sub(1, 200) }))
  return
end

-- Metadaten
profile.soul_id    = soul_id
profile.type       = "face"
profile.source     = filename
profile.updated_at = os.date("!%Y-%m-%dT%H:%M:%SZ")

-- Profil speichern
local profile_dir  = "/var/lib/sys/souls/" .. soul_id .. "/vault/profile/"
local profile_path = profile_dir .. "face.json"
os.execute("mkdir -p " .. profile_dir)

local pf = io.open(profile_path, "w")
if pf then
  pf:write(cjson.encode(profile))
  pf:close()
end

ngx.say(cjson.encode({ ok = true, type = "face", profile = profile }))
