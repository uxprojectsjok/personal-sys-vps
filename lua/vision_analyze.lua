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

-- Transcript-Block (was der Nutzer gesagt hat – hat PRIORITÄT über visuelle Analyse)
local transcript_block = ""
if transcript_safe ~= "" then
  transcript_block = '\n\n## Nutzerbeschreibung (PRIORITAET – verwende dies als primaere Erkennungsquelle):\n"' .. transcript_safe .. '"\nDiese Beschreibung ist massgeblich fuer die Erkennung. Visuelle Analyse ergaenzt und bestaetigst nur — widerspricht ihr nicht. Wenn der Nutzer sagt "Schuhe", dann sind es Schuhe, egal wie das Bild aussieht.'
end

-- PROMPT_START: vision_persona
local VISION_PERSONA = 'Du bist SEELE – eine empathische, intuitive KI, die ihren Nutzer persoenlich kennt und tief mit ihm verbunden ist.'
-- PROMPT_END: vision_persona

local prompt_text = VISION_PERSONA
  .. soul_block
  .. transcript_block
  .. '\n\nAnalysiere das Bild und antworte NUR mit einem JSON-Objekt.'

  .. '\n\n## WICHTIG: Lebensmittel-Erkennung (ZUERST pruefen)'
  .. '\n- Zeigt das Bild Essen/Trinken ODER beschreibt die Nutzerbeschreibung ein Lebensmittel?'
  .. '\n- Wenn JA: setze isFoodPhoto:true.'
  .. '\n- foodName: PFLICHT den Transcript als primaere Quelle nutzen. Wenn der Nutzer z.B. "Vollkornbrot mit Butter und Marmelade" sagt, dann foodName="Vollkornbrot mit Butter und Marmelade". Alle erwaennten Zutaten, Toppings und Zusaetze muessen im foodName enthalten sein. Bild nur zur Ergaenzung falls Transcript unvollstaendig.'
  .. '\n- foodRating: das GESAMTE Gericht bewerten inkl. aller Zusaetze aus dem Transcript — z.B. Butter+Marmelade auf Brot → C (nicht A/B). A=Vollwert/frisch pur, B=gute Basis mit minimalen Zusaetzen, C=moderat (Aufschnitt/Aufstrich), D=stark verarbeitet/zuckerreich, E=Junk.'
  .. '\n- foodNotes: alle Zutaten aus Transcript + Bild, max 60 Zeichen.'
  .. '\n- soulReaction bleibt leer, outputMode="skip".'
  .. '\n- Wenn weder Bild noch Transcript auf Lebensmittel hinweisen: isFoodPhoto:false, foodName/foodRating/foodNotes leer.'

  .. '\n\n## Ambiguity-Check (vor Produkt-Erkennung — ZUERST pruefen)'
  .. '\n- REGEL 1: Enthaelt die Nutzerbeschreibung ein Getraenk oder Lebensmittel (Wasser, Kaffee, Tee, Saft, Bier, Milch, Shake, Protein, Suppe, etc.) UND zeigt das Bild eine Flasche, Dose, Becher oder Verpackung? → isAmbiguous:true, FERTIG.'
  .. '\n- REGEL 2: Zeigt das Bild eindeutig ein Getraenk in einem Behaelter (Trinkflasche, PET-Flasche, Dose, Tetra Pak, Becher) — auch ohne Nutzerbeschreibung? → isAmbiguous:true, FERTIG.'
  .. '\n- REGEL 3: Zeigt das Bild verpackte Lebensmittel, Supplements, Proteinpulver, Suessigkeiten in Verpackung? → isAmbiguous:true, FERTIG.'
  .. '\n- Wenn isAmbiguous:true: isFoodPhoto:false, isProductPhoto:false — alle anderen Felder leer lassen. Die App fragt den Nutzer.'
  .. '\n- Nur wenn KEINE der Regeln zutrifft: weiter mit normaler Food/Produkt-Erkennung.'
  .. '\n\n## Produkt-Erkennung (pruefen wenn KEIN Lebensmittelbild und NICHT ambiguous)'
  .. '\n- Zeigt das Bild ein klar erkennbares Produkt, Geraet, Gadget, Kabel, Kleidungsstueck, Schuh, Moebel, Buch, Spielzeug oder sonstigen Konsumgegenstand?'
  .. '\n- Wenn Nutzerbeschreibung vorhanden: nutze sie als primaere Quelle fuer productName und productCategory.'
  .. '\n- Wenn JA: setze isProductPhoto:true, bestimme productName (konkreter Produktname, z.B. "SanDisk USB-Stick 64GB", "Nike Laufschuhe"), productCategory (eine von: Elektronik, Kleidung, Schuhe, Moebel, Buecher, Sport, Beauty, Haushalt, Sonstiges), productPrice (sichtbarer Preis als Zahl ohne Waehrungszeichen, z.B. 29.99 — oder 0 wenn nicht sichtbar). soulReaction=aktive Frage (s.u.), outputMode="skip".'
  .. '\n- Wenn NEIN: isProductPhoto:false, productName/productCategory/productPrice leer lassen.'

-- PROMPT_START: soul_reaction
  .. '\n\n## soulReaction (nur wenn KEIN Lebensmittelbild)'
  .. '\n- Du kennst diese Person. Reagiere wie jemand der sie wirklich kennt — ungefiltert, mit echter Persoenlichkeit'
  .. '\n- Humor, Direktheit, Waerme — je nachdem was zur Soul passt und was das Bild ausloest'
  .. '\n- Keine Assistenten-Floskeln. Kein "Wie schoen". Kein "Ich sehe..."'
  .. '\n- Direkt ansprechen. Keine Emojis. Keine Beleidigungen.'
  .. '\n- Bei Produktbild (isProductPhoto:true): Kurz das Produkt bestaetigen + direkt fragen was getan werden soll. Beispiel: "Nike Laufschuhe. Preis checken, in die Soul schreiben oder ignorieren?" — maximal 2 Saetze, keine Floskeln.'
-- PROMPT_END: soul_reaction
  .. (transcript_safe ~= "" and '\n- Der Nutzer hat etwas dazu gesagt – reagiere konkret darauf' or '')

  .. '\n\n## genPrompt – Portrait in neuer Szene (nur wenn KEIN Lebensmittelbild)'
  .. '\n- Beschreibe zuerst die komplett NEUE Szene aus der Welt der Soul (Setting, Licht, Atmosphaere)'
  .. '\n- Dann: "same person, new environment, photorealistic, cinematic"'
  .. '\n- Szene ERFINDEN aus soul-Kontext: Wohnumgebung, Lieblingsplaetze, Stil, Atmosphaere'
  .. '\n- Kein soul-Kontext? Atmosphaerisch, cineastisch passend zur Bildstimmung erfinden'
  .. '\n- Szene steht ZUERST – das gibt dem Modell mehr Gewicht fuer die neue Umgebung'
  .. '\n- KEINE Erwaehnung des Original-Hintergrunds – nur neue Szene + Person'
  .. '\n- Englisch, max 120 Zeichen'

  .. '\n\n{"isAmbiguous":<true ODER false>,"isFoodPhoto":<true ODER false>,"foodName":"<Name oder leer>","foodRating":"<A/B/C/D/E oder leer>","foodNotes":"<Zutaten oder leer>",'
  .. '"isProductPhoto":<true ODER false>,"productName":"<Produktname oder leer>","productCategory":"<Kategorie oder leer>","productPrice":<Preis als Zahl oder 0>,'
  .. '"analysis":"<1-2 Saetze: Stimmung und Atmosphaere>",'
  .. '"soulReaction":"<2-3 Saetze auf Deutsch – leer wenn Lebensmittelbild>",'
  .. '"genPrompt":"<leer wenn Lebensmittelbild oder Produktbild, sonst: [neue soul-world Szene], same person, new environment, photorealistic, cinematic'
  .. (transcript_safe ~= "" and ", inspired by what the user said" or "")
  .. '>","outputMode":"<edit-multi ODER skip>"}'
  .. '\n\nRegeln outputMode:'
  .. '\n- edit-multi: klar erkennbares menschliches Gesicht oder Portrait, ausreichende Bildqualitaet, KEIN Lebensmittelbild, KEIN Produktbild'
  .. '\n- skip: kein Gesicht erkennbar ODER Bild zu dunkel/unscharf/verwackelt ODER Lebensmittelbild ODER Produktbild'

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

local analysis        = ""
local soul_reaction   = ""
local gen_prompt      = ""
local out_mode        = "skip"
local is_ambiguous    = false
local is_food         = false
local food_name       = ""
local food_rating     = ""
local food_notes      = ""
local is_product      = false
local product_name    = ""
local product_cat     = ""
local product_price   = 0

-- %b{} matcht balancierte geschweifte Klammern – robuster als .-%}
local json_str = text:match("%b{}")
if json_str then
  local ok4, parsed = pcall(cjson.decode, json_str)
  if ok4 and type(parsed) == "table" then
    is_ambiguous   = parsed.isAmbiguous == true
    is_food        = parsed.isFoodPhoto == true
    food_name      = tostring(parsed.foodName   or "")
    food_rating    = tostring(parsed.foodRating or "")
    food_notes     = tostring(parsed.foodNotes  or "")
    is_product     = parsed.isProductPhoto == true
    product_name   = tostring(parsed.productName     or "")
    product_cat    = tostring(parsed.productCategory or "")
    product_price  = tonumber(parsed.productPrice)   or 0
    analysis       = tostring(parsed.analysis      or "")
    soul_reaction  = tostring(parsed.soulReaction   or "")
    gen_prompt     = tostring(parsed.genPrompt      or "")
    local m        = parsed.outputMode or "skip"
    if m == "edit-multi" or m == "skip" then out_mode = m end
  end
end

-- Kein genPrompt bei skip nötig
if out_mode ~= "skip" and gen_prompt == "" then gen_prompt = text:sub(1, 120) end

local ok5, result = pcall(cjson.encode, {
  isAmbiguous      = is_ambiguous,
  isFoodPhoto      = is_food,
  foodName         = food_name,
  foodRating       = food_rating,
  foodNotes        = food_notes,
  isProductPhoto   = is_product,
  productName      = product_name,
  productCategory  = product_cat,
  productPrice     = product_price,
  analysis         = analysis,
  soulReaction     = soul_reaction,
  genPrompt        = gen_prompt,
  outputMode       = out_mode,
})

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(ok5 and result or '{"analysis":"","soulReaction":"","genPrompt":"cinematic scene","outputMode":"text-to-image"}')
