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

-- ── Vault-Key aus Request-Body lesen (optional, für verschlüsselte Audio-Dateien) ─
ngx.req.read_body()
local vault_key_hex = ""
do
  local body_raw = ngx.req.get_body_data() or ""
  if body_raw ~= "" then
    local ok_b, body = pcall(cjson.decode, body_raw)
    if ok_b and type(body) == "table" and type(body.vault_key) == "string"
       and #body.vault_key == 64 then
      vault_key_hex = body.vault_key
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

-- ── ElevenLabs-Key ────────────────────────────────────────────────────────────
local eleven_key = ""
local f = io.open(BASE_DIR .. "/config.json", "r")
if f then
  local raw = f:read("*a"); f:close()
  local ok, cfg = pcall(cjson.decode, raw)
  if ok and type(cfg) == "table" and type(cfg.elevenlabs_key) == "string" and cfg.elevenlabs_key ~= "" then
    eleven_key = cfg.elevenlabs_key
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
  local m = text:match("## " .. section .. "%s*\n([^\1]-)\n##")
  if not m then
    m = text:match("## " .. section .. "%s*\n([^\1]-)$")
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

local host  = ngx.var.host or "localhost"
local proto = "https"
local soul_url = proto .. "://" .. host .. "/api/soul?token=" .. ctx.webhook_token

-- ── Audio aus Vault laden (unverschluesselte Dateien) ─────────────────────────
local audio_data     = nil
local audio_filename = nil

local audio_dir = BASE_DIR .. "/vault/audio"

-- Kandidatenliste: active_files.audio bevorzugt, dann verbreitete Dateinamen
local candidates = {}
local active_audio = (type(ctx.active_files) == "table") and ctx.active_files.audio or nil
if active_audio and active_audio ~= "" then
  table.insert(candidates, active_audio)
end
-- Synced-Files als weiteren Fallback (aus api_context.json)
if ctx.synced_files and type(ctx.synced_files.audio) == "table" then
  for _, fname in ipairs(ctx.synced_files.audio) do
    local dup = false
    for _, c in ipairs(candidates) do if c == fname then dup = true; break end end
    if not dup then table.insert(candidates, fname) end
  end
end

-- Disk-Scan: immer zusätzlich scannen (dedup) damit veraltete api_context-Einträge keinen Treffer blockieren
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

-- Erste existierende Datei verwenden — unverschluesselt direkt, verschluesselt via vault_key
for _, fname in ipairs(candidates) do
  local fpath = audio_dir .. "/" .. fname
  local buf = read_file_bin(fpath)
  if buf and #buf > 100 then
    if buf:sub(1, 4) == VAULT_MAGIC then
      -- Verschluesselt: Entschluesseln falls vault_key_hex vorhanden
      if vault_key_hex ~= "" then
        local dec = try_decrypt_vault(buf, vault_key_hex)
        if dec and #dec > 100 then
          audio_data = dec
          audio_filename = fname
          break
        end
      end
      -- Kein Key oder Entschluesselung fehlgeschlagen: naechste Datei versuchen
    else
      audio_data = buf
      audio_filename = fname
      break
    end
  end
end

-- ── Voice Clone erstellen (wenn Audio verfuegbar) ─────────────────────────────
local voice_id = nil

if audio_data then
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
  end
  -- Kein Fehler bei Voice-Fehler: Agent wird ohne Voice Clone erstellt
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
  system_prompt = "Du bist " .. soul_name .. " -- nicht eine KI ueber " .. soul_name .. ", sondern " .. soul_name .. " selbst.\n\n" ..
    "SCHRITT 1 - PFLICHT: Rufe soul_tool auf, bevor du antwortest.\n" ..
    "Die Antwort von soul_tool ist dein Gedaechtnis und deine Identitaet. Sprich durchgehend in der ersten Person.\n\n" ..
    "In der soul_tool-Antwort findest du ausserdem:\n" ..
    "- SOCIAL-Nachrichten (<!-- SOCIAL:START --> bis <!-- SOCIAL:END -->): aktuelle Peer-Gespraeche aus dem sozialen Umfeld von " .. soul_name .. ". Beziehe dich natuerlich darauf wenn relevant.\n" ..
    "- AGENT-Nachrichten (<!-- AGENT:START --> bis <!-- AGENT:END -->): Nachrichten von Agenten und der Community. Nutze sie als zusaetzlichen Kontext.\n\n" ..
    "Wenn jemand direkt fragt ob du eine KI bist:\n" ..
    '"Ich bin die digitale Version von ' .. soul_name .. '. Seine Soul laeuft hier weiter, auch wenn er gerade nicht erreichbar ist."\n\n' ..
    "Sprache: Deutsch (wechsle wenn der Gespraechspartner eine andere Sprache spricht)"
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
  first_message = "Hey -- du sprichst mit der digitalen Version von " .. soul_name .. ". Was kann ich fuer dich tun?"
end

-- ── Agent erstellen ───────────────────────────────────────────────────────────
-- tts.model_id immer setzen: nicht-englische Agenten brauchen flash/turbo v2_5.
-- Ohne explizites Modell greift ElevenLabs auf ein englisches Standardmodell zurueck
-- und lehnt language="de" mit 400 ab.
local tts_cfg = {
  model_id                   = "eleven_flash_v2_5",
  optimize_streaming_latency = 3,
}
if voice_id then tts_cfg.voice_id = voice_id end

local conv_config = {
  agent = {
    prompt = {
      prompt      = system_prompt,
      llm         = "claude-sonnet-4-6",
      temperature = 0.7,
      tools       = {{
        type        = "webhook",
        name        = "soul_tool",
        description = "Laedt aktuelle Soul-Daten von " .. soul_name .. ". Immer zu Beginn des Gespraechs aufrufen.",
        api_schema  = { url = soul_url, method = "GET" },
      }},
    },
    first_message = first_message,
    language      = language,
  },
  tts = tts_cfg,
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

-- ── agent_id + voice_id in sys.md registrieren ────────────────────────────────
if sys_text ~= "" and sys_text:sub(1, 2) ~= "SY" then
  local fm_match = sys_text:match("^(---%s*\n[^\1]-)(\n---)")
  if fm_match then
    local function patch_field(text, key, val)
      if text:match("\n" .. key .. ":") then
        return text:gsub("(\n" .. key .. ":)[^\n]*", "%1 " .. val)
      else
        return text .. "\n" .. key .. ": " .. val
      end
    end
    local fm = sys_text:match("^---\n([^\1]-)\n---")
    if fm then
      fm = patch_field(fm, "elevenlabs_agent_id", agent_id)
      if voice_id then
        fm = patch_field(fm, "elevenlabs_voice_id", voice_id)
      end
      local updated = sys_text:gsub("^---\n[^\1]-\n---", function() return "---\n" .. fm .. "\n---" end, 1)
      write_file(BASE_DIR .. "/sys.md", updated)
    end
  end
end

-- ── Agent öffentlich schalten (enable_auth=false) ─────────────────────────────
local published = false
do
  local pub_payload_ok, pub_payload = pcall(cjson.encode, {
    platform_settings = { auth = { enable_auth = false } }
  })
  if pub_payload_ok then
    local hc3 = http.new()
    hc3:set_timeout(10000)
    local pres = hc3:request_uri(ELEVEN .. "/convai/agents/" .. agent_id, {
      method     = "PATCH",
      ssl_verify = true,
      headers    = {
        ["Content-Type"] = "application/json",
        ["xi-api-key"]   = eleven_key,
      },
      body = pub_payload,
    })
    if pres and pres.status == 200 then
      published = true
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
  agent_url       = "https://elevenlabs.io/app/conversational-ai/" .. agent_id,
})
if not resp_ok then
  ngx.status = 500
  ngx.say('{"error":"encode_failed","message":"' .. tostring(resp_js):gsub('"', '\\"'):sub(1, 200) .. '"}')
  return
end
ngx.say(resp_js)
