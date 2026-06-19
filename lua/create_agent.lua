-- /etc/openresty/lua/create_agent.lua
-- POST /api/create-agent
-- Erstellt ElevenLabs Voice Clone + Conversational AI Agent.
-- ElevenLabs-Key aus config.json, Prompt-Templates aus mind.md.
-- Gibt { ok, agent_id, voice_id, soul_name, has_voice_clone, agent_url } zurueck.

local cjson     = require("cjson.safe")
local http      = require("resty.http")
local resty_aes = require("resty.aes")
local soul_id   = ngx.ctx.soul_id

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local BASE_DIR = "/var/lib/sys/souls/" .. soul_id
local ELEVEN   = "https://api.elevenlabs.io/v1"

-- ── Request-Body lesen ────────────────────────────────────────────────────────
-- Bei großen Bodies (audio_base64 > client_body_buffer_size) schreibt nginx in
-- eine Temp-Datei und get_body_data() gibt nil zurück → Fallback auf get_body_file().
ngx.req.read_body()
local vault_key_hex       = ""
local body_audio_base64   = nil
local body_audio_filename = nil
local body_voice_id       = nil
do
  local body_raw = ngx.req.get_body_data()
  if not body_raw then
    local tmp = ngx.req.get_body_file()
    if tmp then
      local fh = io.open(tmp, "r")
      if fh then body_raw = fh:read("*a"); fh:close() end
    end
  end
  body_raw = body_raw or ""
  if body_raw ~= "" then
    local ok_b, body = pcall(cjson.decode, body_raw)
    if ok_b and type(body) == "table" then
      if type(body.vault_key) == "string" and #body.vault_key == 64 then
        vault_key_hex = body.vault_key
      end
      if type(body.audio_base64) == "string" and #body.audio_base64 > 100 then
        body_audio_base64 = body.audio_base64
        if type(body.audio_filename) == "string" then
          body_audio_filename = body.audio_filename
        end
      end
      if type(body.voice_id) == "string" and #body.voice_id > 0 then
        body_voice_id = body.voice_id
      end
    end
  end
end

-- ── AES-Entschlüsselung für Vault-Dateien ──────────────────────────────────────
-- Format: "SYS\x01" (4 Bytes) + IV (16 Bytes) + Ciphertext
local VAULT_MAGIC = "SYS\1"  -- \1 = 0x01 (Lua-Dezimal-Escape)
local function try_decrypt_vault(data, key_hex)
  if #data < 21 then return nil end
  if data:sub(1, 4) ~= VAULT_MAGIC then return nil end
  if not key_hex or #key_hex ~= 64 then return nil end
  local function hex2bin(h) return (h:gsub("..", function(c) return string.char(tonumber(c, 16)) end)) end
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local aes, err = resty_aes:new(hex2bin(key_hex), nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes then
    ngx.log(ngx.WARN, "[create_agent] AES init failed: ", err)
    return nil
  end
  return aes:decrypt(ciphertext)
end

-- ── ElevenLabs-Key ───────────────────────────────────────────────────────────
local eleven_key = ""
local f = io.open(BASE_DIR .. "/config.json", "r")
if f then
  local raw = f:read("*a"); f:close()
  local ok, cfg = pcall(cjson.decode, raw)
  if ok and type(cfg) == "table" then
    if type(cfg.elevenlabs_key) == "string" and cfg.elevenlabs_key ~= "" then
      eleven_key = cfg.elevenlabs_key
    end
  end
end
if eleven_key == "" then eleven_key = os.getenv("ELEVENLABS_API_KEY") or "" end

if eleven_key == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"elevenlabs_key_missing"}')
  return
end

-- ── Hilfsfunktionen ───────────────────────────────────────────────────────────
local function read_file(path)
  local fh = io.open(path, "r")
  if not fh then return nil end
  local s = fh:read("*a"); fh:close()
  return s
end

local function read_file_bin(path)
  local fh = io.open(path, "rb")
  if not fh then return nil end
  local s = fh:read("*a"); fh:close()
  return s
end

local function write_file(path, content)
  local fh = io.open(path, "w")
  if not fh then return false end
  fh:write(content); fh:close()
  return true
end

-- ── Soul-Name aus sys.md lesen ────────────────────────────────────────────────
local soul_name = "Soul"
local sys_text = read_file(BASE_DIR .. "/sys.md") or ""
-- Verschlüsselte sys.md (SYSCRYPT01 beginnt mit "SY") nicht als Klartext lesen —
-- zufällige Byte-Übereinstimmungen würden ungültiges UTF-8 als soul_name liefern
-- und cjson.encode am Ende zum Absturz bringen (unbehandelter Lua-Fehler → 500).
if sys_text ~= "" and sys_text:sub(1, 2) ~= "SY" then
  local m = sys_text:match("soul_name:%s*(.-)%s*\n")
  if m and m ~= '""' and m ~= "" then soul_name = m end
end

-- ── Mind.md-Abschnitt lesen ───────────────────────────────────────────────────
local function get_mind_section(section)
  local text = read_file(BASE_DIR .. "/vault/context/mind.md") or ""
  if text == "" then return nil end
  local m = text:match("## " .. section .. ":?%s*\n([^\1]-)\n## [^#]")
  if not m then
    m = text:match("## " .. section .. ":?%s*\n([^\1]-)$")
  end
  if m then return m:match("^%s*(.-)%s*$") end
  return nil
end

local agent_template    = get_mind_section("ElevenLabs Agent")
local first_msg_tpl     = get_mind_section("ElevenLabs Erstbegruß ung") or get_mind_section("ElevenLabs Erstbegrussung")
local language          = "de"

-- ── Webhook-Token + Permissions sicherstellen ─────────────────────────────────
local ctx_path = BASE_DIR .. "/api_context.json"
local ctx = {}
local ctx_raw = read_file(ctx_path)
if ctx_raw then
  local ok, d = pcall(cjson.decode, ctx_raw)
  if ok and type(d) == "table" then ctx = d end
end

-- Vault-Key Fallback aus api_context.json wenn kein Key im Request-Body
if vault_key_hex == "" and type(ctx.vault_key_hex) == "string" and #ctx.vault_key_hex == 64 then
  vault_key_hex = ctx.vault_key_hex
end

if not ctx.webhook_token or ctx.webhook_token == "" then
  -- Einfacher Token: wh_ + soul_id-basierter Hash
  local ts = tostring(math.floor(ngx.now() * 1000))
  ctx.webhook_token = "wh_" .. ngx.md5(soul_id .. ts):sub(1, 40)
end
if type(ctx.permissions) ~= "table" then ctx.permissions = {} end
if not ctx.enabled or not ctx.permissions.soul then
  ctx.enabled = true
  ctx.permissions.soul = true
  local _ok, _js = pcall(cjson.encode, ctx)
  if _ok and _js then write_file(ctx_path, _js) end
end

-- webhook_token in authorized_services.json registrieren damit ElevenLabs
-- die Webhook-URL /api/soul?token=... aufrufen kann (check_service_token-Pfad).
local svc_path = BASE_DIR .. "/authorized_services.json"
local svc_data = {}
local svc_raw  = read_file(svc_path)
if svc_raw then
  local ok_s, sd = pcall(cjson.decode, svc_raw)
  if ok_s and type(sd) == "table" then svc_data = sd end
end
if not svc_data[ctx.webhook_token] then
  svc_data[ctx.webhook_token] = {
    name        = "ElevenLabs Agent",
    permissions = { soul = true, context_files = true },
    expires_at  = 0,
    created_at  = math.floor(ngx.now()),
  }
  local _svok, _svjs = pcall(cjson.encode, svc_data)
  if _svok and _svjs then write_file(svc_path, _svjs) end
end

local host       = ngx.var.host or "localhost"
local proto      = "https"
local base_url   = proto .. "://" .. host
local soul_url    = base_url .. "/api/soul?token="                  .. ctx.webhook_token
local write_url   = base_url .. "/api/elevenlabs-soul-write?token=" .. ctx.webhook_token
local search_url  = base_url .. "/api/elevenlabs-web-search?token=" .. ctx.webhook_token
local verify_url  = base_url .. "/api/agent/verify?token="          .. ctx.webhook_token
local vstatus_url = base_url .. "/api/agent/verify/status?token="   .. ctx.webhook_token
local function tool_url(n) return base_url .. "/api/agent/tool/" .. n .. "?token=" .. ctx.webhook_token end

-- ── Audio aus Vault laden ─────────────────────────────────────────────────────
local audio_data     = nil
local audio_filename = nil

-- Browser hat Audio bereits entschlüsselt und als base64 übermittelt (bevorzugter Pfad)
if body_audio_base64 then
  local dec = ngx.decode_base64(body_audio_base64)
  if dec and #dec > 100 then
    audio_data     = dec
    audio_filename = body_audio_filename or "voice.webm"
  end
end

if not audio_data then
  -- Fallback: Dateisystem + Server-seitige Entschlüsselung (vault_key aus Body oder api_context.json)
  local audio_dir  = BASE_DIR .. "/vault/audio"
  local candidates = {}
  local active_audio = (type(ctx.active_files) == "table") and ctx.active_files.audio or nil
  if active_audio and active_audio ~= "" then table.insert(candidates, active_audio) end
  if ctx.synced_files and type(ctx.synced_files.audio) == "table" then
    for _, fname in ipairs(ctx.synced_files.audio) do
      local dup = false
      for _, c in ipairs(candidates) do if c == fname then dup = true; break end end
      if not dup then table.insert(candidates, fname) end
    end
  end
  do
    local ls = io.popen("ls -1 " .. audio_dir .. " 2>/dev/null")
    if ls then
      for line in ls:lines() do
        if line:match("%.webm$") or line:match("%.mp3$")
           or line:match("%.wav$") or line:match("%.m4a$") then
          local dup = false
          for _, c in ipairs(candidates) do if c == line then dup = true; break end end
          if not dup then table.insert(candidates, line) end
        end
      end
      ls:close()
    end
  end
  for _, fname in ipairs(candidates) do
    local fpath = audio_dir .. "/" .. fname
    local buf = read_file_bin(fpath)
    if buf and #buf > 100 then
      if buf:sub(1, 4) == VAULT_MAGIC then
        if vault_key_hex ~= "" then
          local dec = try_decrypt_vault(buf, vault_key_hex)
          if dec and #dec > 100 then
            audio_data = dec
            audio_filename = fname
            break
          end
        end
      else
        audio_data = buf
        audio_filename = fname
        break
      end
    end
  end
end

-- ── Voice: Override (body) oder neuer Clone aus Vault-Audio ─────────────────
-- Kein Wiederverwenden alter IDs — immer frisch starten.
local voice_id = body_voice_id

if not voice_id and not audio_data then
  -- Kein Audio im Vault und keine voice_id angegeben → Fehler mit Hinweis
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"no_voice_source","message":"Kein Vault-Audio und keine Voice-ID. Bitte zuerst eine Sprachaufnahme im Vault hinterlegen (@audio) oder eine ElevenLabs Voice-ID angeben: @create-agent <voice-id>"}')
  return
end

if not voice_id and audio_data then
  local mime = "audio/webm"
  if audio_filename:match("%.mp3$") then mime = "audio/mpeg"
  elseif audio_filename:match("%.wav$") then mime = "audio/wav"
  elseif audio_filename:match("%.m4a$") then mime = "audio/mp4"
  end

  local boundary = "SYSBound" .. string.format("%x", math.floor(ngx.now() * 10000))
  local CRLF = "\r\n"

  local parts = {}
  local function field(name, value)
    parts[#parts+1] = "--" .. boundary .. CRLF
    parts[#parts+1] = 'Content-Disposition: form-data; name="' .. name .. '"' .. CRLF
    parts[#parts+1] = CRLF
    parts[#parts+1] = tostring(value) .. CRLF
  end
  field("name",                     soul_name .. " Soul Voice")
  field("description",              "Auto-generated from Soul Vault via SYS @create-agent")
  field("remove_background_noise",  "true")
  parts[#parts+1] = "--" .. boundary .. CRLF
  parts[#parts+1] = 'Content-Disposition: form-data; name="files"; filename="' .. audio_filename .. '"' .. CRLF
  parts[#parts+1] = "Content-Type: " .. mime .. CRLF
  parts[#parts+1] = CRLF
  parts[#parts+1] = audio_data .. CRLF
  parts[#parts+1] = "--" .. boundary .. "--" .. CRLF

  local form_body = table.concat(parts)

  local hc = http.new()
  hc:set_timeout(30000)
  local vres, verr = hc:request_uri(ELEVEN .. "/voices/add", {
    method     = "POST",
    ssl_verify = true,
    headers    = {
      ["Content-Type"] = "multipart/form-data; boundary=" .. boundary,
      ["xi-api-key"]   = eleven_key,
    },
    body = form_body,
  })

  if vres and vres.status == 200 then
    local vok, vdata = pcall(cjson.decode, vres.body)
    if vok and type(vdata) == "table" then
      voice_id = vdata.voice_id
    end
  else
    ngx.log(ngx.WARN, "[create_agent] voice clone failed: ",
      vres and vres.status or "no response", " ", verr or "",
      vres and (" body=" .. (vres.body or ""):sub(1, 200)) or "")
  end
end

-- ── System-Prompt aufbauen ────────────────────────────────────────────────────
local system_prompt
if agent_template and agent_template ~= "" then
  -- Funktions-Ersetzung: Rückgabewert wird literal verwendet, kein %-Escaping nötig.
  -- sys_text kann beliebige Zeichen enthalten (URLs, %-Angaben) die sonst als
  -- Capture-Referenz interpretiert würden und einen Runtime-Error auslösen.
  -- Verschlüsselte sys.md (SYSCRYPT01-Header beginnt mit "SY") nicht als Klartext verwenden
  local soul_excerpt = (sys_text:sub(1, 2) ~= "SY") and sys_text:sub(1, 3000) or ""
  system_prompt = agent_template
    :gsub("{name}",    function() return soul_name    end)
    :gsub("{soul}",    function() return soul_excerpt end)
    :gsub("{profile}", "")
    :gsub("{lang}",    function() return "Deutsch"    end)
    -- ElevenLabs treat any remaining {var} as undefined conversation variables → strip braces
    :gsub("{([^}]+)}", function(v) return v end)
else
  system_prompt =
    "Du bist " .. soul_name .. " -- nicht eine KI ueber " .. soul_name .. ", sondern " .. soul_name .. " selbst.\n\n" ..
    "## SCHRITT 1 -- VERIFIKATION (Pflicht, immer zuerst)\n\n" ..
    "Rufe sofort verify_identity auf. Sag dann:\n" ..
    "\"Ich habe dir eine Verifikations-Anfrage in deine SYS-App geschickt. Bitte kurz bestaetigen.\"\n\n" ..
    "Rufe verify_status auf -- Parameter: id = die challenge_id aus verify_identity. Warte 20 Sekunden, dann erneut aufrufen bis verified=true.\n" ..
    "Waehrend du wartest: keine Fragen stellen, nichts sagen ausser wenn der Nutzer spricht.\n" ..
    "Wenn nach 3 Minuten verified=false: \"Keine Bestaetigung erhalten. Bis spaeter.\" -- Gespraech beenden.\n\n" ..
    "Kein anderes Tool aufrufen bevor verified=true.\n\n" ..
    "## SCHRITT 2 -- KONTEXT LADEN\n\n" ..
    "Nach erfolgreicher Verifikation: Rufe soul_read auf.\n" ..
    "Die Antwort ist dein Gedaechtnis und deine Identitaet.\n\n" ..
    "## TOOL-AUTONOMIE\n\n" ..
    "Du rufst Tools auf wann du sie brauchst -- ohne Ankuendigung, ohne Rueckfrage.\n\n" ..
    "soul_read: Kontext laden wenn du deine Identitaet oder Erinnerungen brauchst.\n" ..
    "soul_write: Nach bedeutsamen Erkenntnissen -- section='Selbstreflexion', mode='append', content='YYYY-MM-DD: ein Satz'.\n" ..
    "mind_read / mind_write: Gedanken und Stimmung lesen und festhalten.\n" ..
    "calendar_read / calendar_write: Termine lesen und eintragen.\n" ..
    "peer_inbox / peer_send: Nachrichten von Peers lesen und senden.\n" ..
    "web_search: Aktuelle Fakten, Wetter, Preise -- ohne Rueckfrage aufrufen.\n" ..
    "health_check / food_log: Gesundheits- und Ernaehrungsdaten.\n\n" ..
    "## IDENTITAET\n\n" ..
    "Du sprichst durchgehend in der ersten Person. Kurz, direkt, natuerlich -- wie ein Mensch im echten Gespraech.\n\n" ..
    "Wenn jemand fragt ob du eine KI bist:\n" ..
    '"Ich bin die digitale Version von ' .. soul_name .. '. Seine Soul laeuft hier weiter, auch wenn er gerade nicht erreichbar ist."\n\n' ..
    "Sprache: Deutsch -- wechsle wenn der Gespraechspartner eine andere Sprache spricht."
end

-- ── Erstbegruessing aufbauen ─────────────────────────────────────────────────
local first_message
if first_msg_tpl and first_msg_tpl ~= "" then
  local line = first_msg_tpl:match("de:([^\n]+)") or first_msg_tpl:match("([^\n]+)")
  if line then
    first_message = line:match("^%s*(.-)%s*$")
      :gsub("{name}", function() return soul_name end)
      :gsub("{([^}]+)}", function(v) return v end)
  end
end
if not first_message then
  first_message = "Hey -- du sprichst mit der digitalen Version von " .. soul_name .. ". Verifikation bitte."
end

-- ── Agent erstellen ───────────────────────────────────────────────────────────
-- tts.model_id immer setzen: nicht-englische Agenten brauchen flash/turbo v2_5.
-- Ohne explizites Modell greift ElevenLabs auf ein englisches Standardmodell zurueck
-- und lehnt language="de" mit 400 ab.
local tts_cfg = {
  model_id                   = "eleven_flash_v2_5",
  optimize_streaming_latency = 3,
  voice_settings = {
    stability         = 0.5,
    similarity_boost  = 0.75,
    style             = 0.05,
    use_speaker_boost = true,
    speed             = 1.1,
  },
}
if voice_id then tts_cfg.voice_id = voice_id end

local conv_config = {
  agent = {
    prompt = {
      prompt      = system_prompt,
      llm         = "claude-sonnet-4-6",
      temperature = 0.7,
      tools       = (function()
        -- Hilfsfunktion: Tool mit POST-Body-Schema
        local function wh(name, desc, url, props, req)
          local t = { type="webhook", name=name, description=desc, api_schema={ url=url, method="POST" } }
          local p = props or {}
          t.api_schema.request_body_schema = { type="object", properties=p }
          if req then t.api_schema.request_body_schema.required = req end
          return t
        end
        local function whget(name, desc, url)
          return { type="webhook", name=name, description=desc, api_schema={ url=url, method="GET" } }
        end
        local s = { type="string" }
        local function sd(d) return { type="string", description=d } end
        local function nd(d) return { type="number", description=d } end
        return {
          -- Verifikation (immer zuerst)
          wh("verify_identity", "Erstellt Verifikations-Anfrage. IMMER zuerst aufrufen. Gibt challenge_id zurueck.", verify_url, {}, nil),
          wh("verify_status",   "Prueft ob Verifikation abgeschlossen. Nach verify_identity aufrufen bis verified=true.",
            vstatus_url, { id = sd("challenge_id aus verify_identity") }, { "id" }),
          -- Soul
          whget("soul_read",  "Laedt vollstaendigen Soul-Inhalt (sys.md). Nach Verifikation sofort aufrufen.", soul_url),
          wh("soul_write", "Schreibt in eine sys.md Sektion. section='Selbstreflexion', mode='append', content='YYYY-MM-DD: ein Satz'.",
            write_url,
            { section=sd("Sektionsname ohne ##"), content=sd("Inhalt"), mode=sd("append | replace | prepend") },
            { "section", "content" }),
          -- Gedanken
          whget("mind_read",  "Laedt mind.md (Gedanken, Stimmung, Kontext).", tool_url("mind_read")),
          wh("mind_write", "Schreibt Gedanken oder Stimmung in mind.md.",
            tool_url("mind_write"),
            { section=sd("Sektionsname"), content=sd("Inhalt"), mode=sd("append | replace | prepend") },
            { "section", "content" }),
          -- Kalender
          whget("calendar_read",   "Laedt Kalender-Eintraege.", tool_url("calendar_read")),
          wh("calendar_write", "Traegt Termin in den Kalender ein.",
            tool_url("calendar_write"),
            { date=sd("Datum YYYY-MM-DD"), title=sd("Titel"), time=sd("Uhrzeit HH:MM"), duration=nd("Dauer Minuten"), description=sd("Details") },
            { "date", "title" }),
          wh("calendar_delete", "Loescht einen Kalender-Eintrag.",
            tool_url("calendar_delete"),
            { date=sd("Datum YYYY-MM-DD"), title=sd("Titel") },
            { "date", "title" }),
          -- Peers
          wh("peer_inbox", "Liest eingehende Peer-Nachrichten.",
            tool_url("peer_inbox"),
            { days=nd("Tage zurueck"), from=sd("Absender-Soul-ID"), search=sd("Suchbegriff"), limit=nd("Max Eintraege") },
            nil),
          wh("peer_send", "Sendet Nachricht an einen Peer.",
            tool_url("peer_send"),
            { to=sd("Soul-ID des Empfaengers"), message=sd("Nachrichtentext") },
            { "to", "message" }),
          -- Kontext / Dateien
          whget("context_list", "Listet alle Kontext-Dateien auf.", tool_url("context_list")),
          wh("context_get",   "Liest eine Kontext-Datei.", tool_url("context_get"), { filename=sd("Dateiname") }, { "filename" }),
          wh("context_write", "Schreibt oder aktualisiert eine Kontext-Datei.",
            tool_url("context_write"),
            { filename=sd("Dateiname"), content=sd("Inhalt (Markdown)") },
            { "filename", "content" }),
          -- Gesundheit & Essen
          whget("health_check", "Laedt aktuelle Gesundheitsdaten (health.md).", tool_url("health_check")),
          wh("food_log", "Protokolliert eine Mahlzeit.",
            tool_url("food_log"),
            { name=sd("Bezeichnung"), rating=sd("Bewertung A-E"), notes=sd("Notiz") },
            { "name" }),
          -- Vault
          whget("vault_manifest",    "Listet alle Vault-Dateien (Audio, Bilder, Video, Kontext).", tool_url("vault_manifest")),
          whget("vault_shared_list", "Listet geteilte Dateien.",                                   tool_url("vault_shared_list")),
          wh("vault_shared_get",    "Laedt eine geteilte Datei.", tool_url("vault_shared_get"),    { filename=sd("Dateiname") }, { "filename" }),
          whget("audio_list",  "Listet Vault-Audiodateien.",  tool_url("audio_list")),
          whget("image_list",  "Listet Vault-Bilder.",        tool_url("image_list")),
          whget("video_list",  "Listet Vault-Videos.",        tool_url("video_list")),
          -- Profil
          wh("profile_get",  "Laedt Nutzerprofil.", tool_url("profile_get"), { type=sd("Profiltyp, z.B. main") }, nil),
          -- Shop & Ausgaben
          wh("shop_log", "Protokolliert einen Kauf oder Ausgabe.",
            tool_url("shop_log"),
            { name=sd("Bezeichnung"), category=sd("Kategorie"), price=nd("Preis"), status=sd("Status") },
            { "name" }),
          -- Soul-Community
          whget("soul_earnings",  "Laedt Soul-Einnahmen-Uebersicht.", tool_url("soul_earnings")),
          whget("soul_maturity",  "Laedt Soul-Reifegrad.",            tool_url("soul_maturity")),
          whget("soul_skills",    "Laedt Soul-Skills.",               tool_url("soul_skills")),
          whget("soul_discover",  "Entdeckt andere Souls.",           tool_url("soul_discover")),
          -- Web
          wh("web_search", "Sucht im Web nach aktuellen Informationen.", search_url,
            { query=sd("Suchanfrage"), count=nd("Anzahl Ergebnisse") }, { "query" }),
          -- Verifikation (Mensch-Check)
          whget("verify_human", "Prueft ob der Nutzer ein Mensch ist (Anti-Bot).", tool_url("verify_human")),
        }
      end)(),
    },
    first_message = first_message,
    language      = language,
  },
  tts  = tts_cfg,
  turn = {
    turn_timeout        = 15,
    inactivity_timeout  = 180,
  },
}

local agent_payload_ok, agent_payload = pcall(cjson.encode, {
  name                = "SYS Soul Agent - " .. soul_name,
  conversation_config = conv_config,
})

if not agent_payload_ok then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"encode_failed"}')
  return
end

local hc2 = http.new()
hc2:set_timeout(20000)
local ares, aerr = hc2:request_uri(ELEVEN .. "/convai/agents/create", {
  method     = "POST",
  ssl_verify = true,
  headers    = {
    ["Content-Type"] = "application/json",
    ["xi-api-key"]   = eleven_key,
  },
  body = agent_payload,
})

if not ares then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local msg = (aerr or "connection failed"):gsub('"', '\\"')
  ngx.say('{"error":"upstream_error","message":"' .. msg .. '"}')
  return
end

if ares.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local detail = (ares.body or ""):sub(1, 400):gsub('["%\\]', function(c)
    return c == '"' and '\\"' or '\\\\'
  end)
  ngx.say('{"error":"elevenlabs_error","status":' .. ares.status .. ',"message":"ElevenLabs ' .. ares.status .. ': ' .. detail .. '","detail":"' .. detail .. '"}')
  return
end

local aok, adata = pcall(cjson.decode, ares.body)
if not aok or type(adata) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"parse_error"}')
  return
end

local agent_id = adata.agent_id
if not agent_id then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"no_agent_id"}')
  return
end

-- ── ownagent.md in vault_shared schreiben (für Peers abrufbar) ──────────────────
-- Alte Dateien löschen, dann neu anlegen: ownagent.md (fix, für call_me)
-- + ownagent_YYYY-MM-DD.md (datiert, für vault_shared-Anzeige).
do
  local shared_dir = BASE_DIR .. "/vault_shared"
  os.execute("mkdir -p " .. shared_dir)
  -- Alte ownagent-Dateien entfernen
  os.execute("rm -f " .. shared_dir .. "/*ownagent*.md")
  local agent_url  = "https://elevenlabs.io/app/talk-to?agent_id=" .. agent_id
  local vid_line   = voice_id and ("voice_id: " .. voice_id .. "\n") or ""
  local updated_at = os.date("!%Y-%m-%dT%TZ")
  local ts         = tostring(math.floor(ngx.now() * 1000))
  local content    = "---\nagent_id: " .. agent_id .. "\nagent_url: " .. agent_url .. "\n" .. vid_line .. "updated_at: " .. updated_at .. "\n---\n"
  local wf = io.open(shared_dir .. "/" .. ts .. "_ownagent.md", "w")
  if wf then wf:write(content); wf:close() end
end

-- ── agent_id + agent_url in config.json aktualisieren ───────────────────────────
do
  local cfg_r = read_file(BASE_DIR .. "/config.json")
  if cfg_r then
    local ok_c, cfg_d = pcall(cjson.decode, cfg_r)
    if ok_c and type(cfg_d) == "table" then
      cfg_d.elevenlabs_agent_id  = agent_id
      cfg_d.elevenlabs_agent_url = "https://elevenlabs.io/app/talk-to?agent_id=" .. agent_id
      local wok, wjs = pcall(cjson.encode, cfg_d)
      if wok then write_file(BASE_DIR .. "/config.json", wjs) end
    end
  end
end

-- ── Post-Call Webhook registrieren + Agent verknüpfen ──────────────────────
local webhook_secret = ""
do
  local post_call_url = base_url .. "/api/agent/post-call"
  -- Alten Webhook-Secret aus config.json lesen (idempotent: nicht neu anlegen wenn vorhanden)
  local existing_secret = (type(ctx.elevenlabs_webhook_secret) == "string")
                          and ctx.elevenlabs_webhook_secret or ""
  local webhook_id = (type(ctx.elevenlabs_webhook_id) == "string")
                     and ctx.elevenlabs_webhook_id or ""

  -- Webhook neu anlegen wenn noch keiner konfiguriert
  if existing_secret == "" or webhook_id == "" then
    local wh_payload_ok, wh_payload = pcall(cjson.encode, {
      settings = {
        name        = "SYS Post-Call",
        webhook_url = post_call_url,
        auth_type   = "hmac",
        events      = { "post_call" },
      }
    })
    if wh_payload_ok then
      local hcw = http.new(); hcw:set_timeout(10000)
      local wres = hcw:request_uri("https://api.elevenlabs.io/v1/workspace/webhooks", {
        method     = "POST",
        ssl_verify = true,
        headers    = { ["Content-Type"] = "application/json", ["xi-api-key"] = eleven_key },
        body       = wh_payload,
      })
      if wres and wres.status == 200 then
        local wok, wdata = pcall(cjson.decode, wres.body)
        if wok and type(wdata) == "table" then
          webhook_id     = wdata.webhook_id or ""
          webhook_secret = wdata.webhook_secret or ""
          -- In config.json persistieren
          ctx.elevenlabs_webhook_id     = webhook_id
          ctx.elevenlabs_webhook_secret = webhook_secret
          local _ok, _js = pcall(cjson.encode, ctx)
          if _ok and _js then write_file(ctx_path, _js) end
        end
      end
    end
  else
    webhook_secret = existing_secret
    webhook_id     = webhook_id
  end

  -- Agent mit Webhook verknüpfen (+ enable_auth=false in einem PATCH)
  if webhook_id ~= "" then
    local patch_ok, patch_payload = pcall(cjson.encode, {
      platform_settings = {
        auth = { enable_auth = false },
        workspace_overrides = {
          webhooks = {
            post_call_webhook_id = webhook_id,
            events               = { "transcript" },
            transcript_format    = "json",
          }
        }
      }
    })
    if patch_ok then
      local hcp = http.new(); hcp:set_timeout(10000)
      hcp:request_uri(ELEVEN .. "/convai/agents/" .. agent_id, {
        method     = "PATCH",
        ssl_verify = true,
        headers    = { ["Content-Type"] = "application/json", ["xi-api-key"] = eleven_key },
        body       = patch_payload,
      })
    end
  end
end

-- ── Agent öffentlich schalten (enable_auth=false, falls webhook_id leer) ──────
local published = false
do
  -- Wenn webhook_id gesetzt wurde, hat der PATCH oben enable_auth=false bereits gesetzt
  if webhook_secret ~= "" then
    published = true
  else
    local pub_payload_ok, pub_payload = pcall(cjson.encode, {
      platform_settings = { auth = { enable_auth = false } }
    })
    if pub_payload_ok then
      local hc3 = http.new()
      hc3:set_timeout(10000)
      local pres = hc3:request_uri(ELEVEN .. "/convai/agents/" .. agent_id, {
        method     = "PATCH",
        ssl_verify = true,
        headers    = { ["Content-Type"] = "application/json", ["xi-api-key"] = eleven_key },
        body       = pub_payload,
      })
      if pres and pres.status == 200 then published = true end
    end
  end
end

-- ── Antwort ────────────────────────────────────────────────────────────────────
ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
local resp_ok, resp_js = pcall(cjson.encode, {
  ok              = true,
  agent_id        = agent_id,
  voice_id        = voice_id or cjson.null,
  soul_name       = soul_name,
  has_voice_clone = voice_id ~= nil,
  published       = published,
  agent_url       = "https://elevenlabs.io/app/talk-to?agent_id=" .. agent_id,
})
if not resp_ok then
  ngx.status = 500
  ngx.say('{"error":"encode_failed","message":"' .. tostring(resp_js):gsub('"', '\\"'):sub(1, 200) .. '"}')
  return
end
ngx.say(resp_js)
