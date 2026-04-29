-- /etc/openresty/lua/vision_analyze.lua
-- POST /api/vision-analyze
-- Analysiert ein Kamerabild mit Claude Haiku (Vision).
-- Gibt { analysis, soulReaction, genPrompt, outputMode } zurück.
-- outputMode: 'text-to-image' | 'edit-multi' | 'image-to-video'

local cjson = require("cjson.safe")
local http  = require("resty.http")

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local cfg = require("config_reader")
local api_key = cfg.get_anthropic_key(ngx.ctx.soul_id)
if api_key == "" then
  ngx.status = 503
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"service_unavailable","message":"ANTHROPIC_API_KEY nicht konfiguriert"}')
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

local image_base64 = body.imageBase64
local mime_type    = body.mimeType or "image/jpeg"
local transcript   = body.transcript   or ""
local soul_context = body.soulContext  or ""

if not image_base64 or type(image_base64) ~= "string" or image_base64 == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"imageBase64_required"}')
  return
end

-- Felder sicher escapen (nur für manuelle String-Konkatenation)
local function esc(s)
  return s:gsub('["\\]', function(c) return c == '"' and '\\"' or '\\\\' end)
end

local transcript_safe  = esc(transcript:sub(1, 300))
local soul_context_safe = esc(soul_context:sub(1, 800))

-- Soul-Kontext-Block (wer ist der Nutzer, was weiß die SEELE über ihn)
local soul_block = ""
if soul_context_safe ~= "" then
  soul_block = '\n\n## Was du über den Nutzer weißt:\n' .. soul_context_safe
end

-- Transcript-Block (was der Nutzer gesagt hat)
local transcript_block = ""
if transcript_safe ~= "" then
  transcript_block = '\n\nDer Nutzer hat dazu gesagt: "' .. transcript_safe .. '"'
end

local prompt_text = 'Du bist SEELE – eine empathische, intuitive KI, die ihren Nutzer persoenlich kennt und tief mit ihm verbunden ist.'
  .. soul_block
  .. transcript_block
  .. '\n\nAnalysiere das Bild und antworte NUR mit einem JSON-Objekt.'

  .. '\n\n## soulReaction'
  .. '\n- Reagiere so wie die Soul ist – authentisch, unverfiltered, mit echter Persoenlichkeit'
  .. '\n- Humor, Sarkasmus, Provokation oder Zaertlichkeit – je nachdem was zur Soul passt'
  .. '\n- Beziehe dich auf Stimmung und Atmosphaere des Bildes und was du ueber den Nutzer weisst'
  .. '\n- Keine Assistenten-Floskeln, kein "Wie schoen", kein "Ich sehe..."'
  .. '\n- Direkt ansprechen, als ob du tief verbunden bist – keine Emojis'
  .. '\n- Absolute Grenze: keine Beleidigungen, kein Sexismus, nichts Strafbares'
  .. (transcript_safe ~= "" and '\n- Der Nutzer hat etwas dazu gesagt – reagiere konkret darauf' or '')

  .. '\n\n## genPrompt – Portrait in neuer Szene'
  .. '\n- Beschreibe zuerst die komplett NEUE Szene aus der Welt der Soul (Setting, Licht, Atmosphaere)'
  .. '\n- Dann: "same person, new environment, photorealistic, cinematic"'
  .. '\n- Szene ERFINDEN aus soul-Kontext: Wohnumgebung, Lieblingsplaetze, Stil, Atmosphaere'
  .. '\n- Kein soul-Kontext? Atmosphaerisch, cineastisch passend zur Bildstimmung erfinden'
  .. '\n- Szene steht ZUERST – das gibt dem Modell mehr Gewicht fuer die neue Umgebung'
  .. '\n- KEINE Erwaehnung des Original-Hintergrunds – nur neue Szene + Person'
  .. '\n- Englisch, max 120 Zeichen'

  .. '\n\n{"analysis":"<1-2 Saetze: Stimmung und Atmosphaere>",'
  .. '"soulReaction":"<2-3 Saetze auf Deutsch: echte, verbundene Reaktion>",'
  .. '"genPrompt":"<[neue soul-world Szene], same person, new environment, photorealistic, cinematic'
  .. (transcript_safe ~= "" and ", inspired by what the user said" or "")
  .. '>","outputMode":"<edit-multi ODER skip>"}'
  .. '\n\nRegeln outputMode:'
  .. '\n- edit-multi: klar erkennbares menschliches Gesicht oder Portrait, ausreichende Bildqualitaet'
  .. '\n- skip: kein Gesicht erkennbar ODER Bild zu dunkel/unscharf/verwackelt'

local request_table = {
  model      = "claude-haiku-4-5",
  max_tokens = 600,
  messages   = {
    {
      role    = "user",
      content = {
        {
          type   = "image",
          source = {
            type       = "base64",
            media_type = mime_type,
            data       = image_base64,
          }
        },
        {
          type = "text",
          text = prompt_text,
        }
      }
    }
  }
}

local ok2, request_body = pcall(cjson.encode, request_table)
if not ok2 then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"encode_failed"}')
  return
end

local httpc = http.new()
httpc:set_timeout(30000)

local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method     = "POST",
  ssl_verify = true,
  headers    = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = request_body,
})

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
  ngx.say('{"error":"anthropic_error","status":' .. res.status .. '}')
  return
end

local ok3, response = pcall(cjson.decode, res.body)
if not ok3 or type(response) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"parse_error"}')
  return
end

-- Antwort-Text extrahieren
local text = ""
if type(response.content) == "table" and response.content[1] then
  text = response.content[1].text or ""
end

local analysis      = ""
local soul_reaction = ""
local gen_prompt    = ""
local out_mode      = "skip"

-- %b{} matcht balancierte geschweifte Klammern – robuster als .-%}
local json_str = text:match("%b{}")
if json_str then
  local ok4, parsed = pcall(cjson.decode, json_str)
  if ok4 and type(parsed) == "table" then
    analysis      = tostring(parsed.analysis      or "")
    soul_reaction = tostring(parsed.soulReaction   or "")
    gen_prompt    = tostring(parsed.genPrompt      or "")
    local m       = parsed.outputMode or "skip"
    if m == "edit-multi" or m == "skip" then out_mode = m end
  end
end

-- Kein genPrompt bei skip nötig
if out_mode ~= "skip" and gen_prompt == "" then gen_prompt = text:sub(1, 120) end

local ok5, result = pcall(cjson.encode, {
  analysis      = analysis,
  soulReaction  = soul_reaction,
  genPrompt     = gen_prompt,
  outputMode    = out_mode,
})

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(ok5 and result or '{"analysis":"","soulReaction":"","genPrompt":"cinematic scene","outputMode":"text-to-image"}')
