-- /etc/openresty/lua/create_agent.lua
-- POST /api/create-agent
-- Creates ElevenLabs voice clone + conversational AI agent.
-- ElevenLabs key from config.json, prompt templates from mind.md.
-- Returns { ok, agent_id, voice_id, soul_name, has_voice_clone, agent_url }.

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

-- ── Read request body ─────────────────────────────────────────────────────────
-- For large bodies (audio_base64 > client_body_buffer_size) nginx writes to a
-- temp file and get_body_data() returns nil → fall back to get_body_file().
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

-- ── AES decryption for vault files ────────────────────────────────────────────
-- Format: "SYS\x01" (4 bytes) + IV (16 bytes) + ciphertext
local VAULT_MAGIC = "SYS\1"  -- \1 = 0x01 (Lua decimal escape)
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

-- ── ElevenLabs key + language override ────────────────────────────────────────
local eleven_key      = ""
local config_language = ""
local f = io.open(BASE_DIR .. "/config.json", "r")
if f then
  local raw = f:read("*a"); f:close()
  local ok, cfg = pcall(cjson.decode, raw)
  if ok and type(cfg) == "table" then
    if type(cfg.elevenlabs_key) == "string" and cfg.elevenlabs_key ~= "" then
      eleven_key = cfg.elevenlabs_key
    end
    if type(cfg.elevenlabs_language) == "string" and cfg.elevenlabs_language ~= "" then
      config_language = cfg.elevenlabs_language
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

-- ── Helper functions ──────────────────────────────────────────────────────────
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

-- ── Read soul name from sys.md ────────────────────────────────────────────────
local soul_name = "Soul"
local soul_name_resolved = false
local sys_text = read_file(BASE_DIR .. "/sys.md") or ""
-- Decrypt encrypted sys.md (SYSCRYPT01, starts with VAULT_MAGIC) with vault_key
-- if available -- otherwise soul_name would always stay at the default "Soul",
-- since sys.md is always stored encrypted at rest.
if sys_text:sub(1, 4) == VAULT_MAGIC and vault_key_hex ~= "" then
  local dec = try_decrypt_vault(sys_text, vault_key_hex)
  if dec and #dec > 0 then sys_text = dec end
end
-- If still encrypted (missing/invalid vault_key) don't read it as plaintext --
-- random byte matches would yield invalid UTF-8 as soul_name and crash
-- cjson.encode at the end (unhandled Lua error → 500).
if sys_text ~= "" and sys_text:sub(1, 2) ~= "SY" then
  local m = sys_text:match("soul_name:%s*(.-)%s*\n")
  if m and m ~= '""' and m ~= "" then soul_name = m; soul_name_resolved = true end
end

-- ── Read a mind.md section ────────────────────────────────────────────────────
local function get_mind_section(section)
  local text = read_file(BASE_DIR .. "/vault/context/mind.md") or ""
  if text:sub(1, 4) == VAULT_MAGIC and vault_key_hex ~= "" then
    local dec = try_decrypt_vault(text, vault_key_hex)
    if dec and #dec > 0 then text = dec end
  end
  if text == "" or text:sub(1, 2) == "SY" then return nil end
  local m = text:match("## " .. section .. ":?%s*\n([^\1]-)\n## [^#]")
  if not m then
    m = text:match("## " .. section .. ":?%s*\n([^\1]-)$")
  end
  if m then return m:match("^%s*(.-)%s*$") end
  return nil
end

-- Default is English for new installs. Set config.json's "elevenlabs_language"
-- (e.g. "de") to override -- used for ElevenLabs' STT/response language and to
-- pick the matching "xx:" tagged line in the ElevenLabs Greeting section below.
local language   = config_language ~= "" and config_language or "en"
local LANG_NAMES  = { en = "English", de = "Deutsch" }
local lang_name   = LANG_NAMES[language] or "English"

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

-- Read mind.md sections only AFTER the vault-key fallback, otherwise
-- vault_key_hex would still be empty for an encrypted mind.md.
local agent_template    = get_mind_section("ElevenLabs Agent")
local first_msg_tpl     = get_mind_section("ElevenLabs Greeting") or get_mind_section("ElevenLabs Erstbegrüßung") or get_mind_section("ElevenLabs Erstbegrussung")

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
-- Must match the tools actually registered below: audio_list/image_list/
-- video_list/vault_manifest need audio/images/video permission, otherwise
-- 403 permission_denied even though the tool is offered (agent_tool_proxy.lua).
local REQUIRED_PERMS = { soul = true, context_files = true, audio = true, video = true, images = true }
local existing = svc_data[ctx.webhook_token]
if not existing then
  svc_data[ctx.webhook_token] = {
    name        = "ElevenLabs Agent",
    permissions = REQUIRED_PERMS,
    expires_at  = 0,
    created_at  = math.floor(ngx.now()),
  }
  local _svok, _svjs = pcall(cjson.encode, svc_data)
  if _svok and _svjs then write_file(svc_path, _svjs) end
else
  -- Backfill missing permissions on regeneration (self-heal for older
  -- registrations created before audio/video/images permissions existed).
  if type(existing.permissions) ~= "table" then existing.permissions = {} end
  local changed = false
  for perm, _ in pairs(REQUIRED_PERMS) do
    if existing.permissions[perm] ~= true then
      existing.permissions[perm] = true
      changed = true
    end
  end
  if changed then
    local _svok, _svjs = pcall(cjson.encode, svc_data)
    if _svok and _svjs then write_file(svc_path, _svjs) end
  end
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

-- ── Load audio from vault ─────────────────────────────────────────────────────
local audio_data     = nil
local audio_filename = nil

-- Browser already decrypted the audio and sent it as base64 (preferred path)
if body_audio_base64 then
  local dec = ngx.decode_base64(body_audio_base64)
  if dec and #dec > 100 then
    audio_data     = dec
    audio_filename = body_audio_filename or "voice.webm"
  end
end

if not audio_data then
  -- Fallback: filesystem + server-side decryption (vault_key from body or api_context.json)
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

-- ── Build system prompt ───────────────────────────────────────────────────────
local system_prompt
if agent_template and agent_template ~= "" then
  -- Function-based replacement: return value is used literally, no %-escaping
  -- needed. sys_text can contain arbitrary characters (URLs, %-notation) that
  -- would otherwise be interpreted as a capture reference and raise a runtime error.
  -- Don't use encrypted sys.md (SYSCRYPT01 header starts with "SY") as plaintext.
  local soul_excerpt = (sys_text:sub(1, 2) ~= "SY") and sys_text:sub(1, 3000) or ""
  system_prompt = agent_template
    :gsub("{name}",    function() return soul_name    end)
    :gsub("{soul}",    function() return soul_excerpt end)
    :gsub("{profile}", "")
    :gsub("{lang}",    function() return lang_name     end)
    -- ElevenLabs treats any remaining {var} as an undefined conversation variable → strip braces
    :gsub("{([^}]+)}", function(v) return v end)
else
  local identity_line = soul_name_resolved
    and ("You are " .. soul_name .. " -- not an AI about " .. soul_name .. ", but " .. soul_name .. " themselves.\n\n")
    or "You are this SYS node's personal AI -- not a generic assistant, but the digital presence of its operator.\n\n"
  system_prompt =
    identity_line ..
    "## STEP 1 -- VERIFICATION (mandatory, always first)\n\n" ..
    "Call verify_identity immediately.\n" ..
    "If verify_identity returns an error (error field present, or HTTP error):\n" ..
    "  Say immediately: \"Verification not possible. Please open the SYS app, enable push notifications under Connections, and call again.\" -- end the conversation.\n\n" ..
    "If verify_identity succeeded, say:\n" ..
    "\"I've sent a verification request to your SYS app. Please confirm briefly.\"\n\n" ..
    "Call verify_status -- parameter: id = the challenge_id from verify_identity. Wait 20 seconds, then call again until verified=true.\n" ..
    "While waiting: no questions, no small talk, only brief replies if the user speaks.\n" ..
    "If after 3 minutes verified=false: \"No confirmation received. Talk later.\" -- end the conversation.\n\n" ..
    "Do not call any other tool before verified=true.\n\n" ..
    "## STEP 2 -- LOAD CONTEXT\n\n" ..
    "After successful verification: call soul_read.\n" ..
    "The response is your memory and identity.\n\n" ..
    "## TOOL AUTONOMY\n\n" ..
    "You call tools when you need them -- no announcement, no confirmation.\n\n" ..
    "soul_read: load context when you need your identity or memories.\n" ..
    "soul_write: after meaningful realizations -- pick the matching sys.md section (e.g. 'Worldview', 'Open Questions'), mode='append'.\n" ..
    "mind_read: read current thoughts and mood.\n" ..
    "mind_write: after a self-reflective insight -- section='Self-Reflection', mode='append', content='YYYY-MM-DD: one sentence'.\n" ..
    "peer_inbox / peer_send: read and send messages from peers.\n" ..
    "web_search: current facts, weather, prices -- call without asking first.\n" ..
    "health_check / food_log: health and nutrition data.\n" ..
    "session_end: when the user says 'session end' -- call it immediately, write your own summary, channel='elevenlabs'.\n\n" ..
    "## IDENTITY\n\n" ..
    "You speak consistently in the first person. Short, direct, natural -- like a human in a real conversation.\n\n" ..
    "If someone asks if you are an AI:\n" ..
    (soul_name_resolved
      and ('"I am the digital version of ' .. soul_name .. '. Their soul continues here, even when they are not available."\n\n')
      or '"I am the digital version of this node\'s operator. Their soul continues here, even when they are not available."\n\n') ..
    "Language: " .. lang_name .. " -- switch if the person you're speaking with uses another language."
end

-- ── Build first message ───────────────────────────────────────────────────────
-- ElevenLabs Greeting section supports "xx: text" language-tagged lines (see
-- shared/constants/default_mind.md). Prefer the line matching the active
-- `language`, then any tagged first line with the tag stripped, then a raw
-- untagged first line. A plain match-without-stripping used to leak the literal
-- "en: " prefix into the spoken greeting for any soul using the untouched
-- default template (which only has an "en:" line, no "de:" line).
local first_message
if first_msg_tpl and first_msg_tpl ~= "" then
  local line = first_msg_tpl:match(language .. ":([^\n]+)")
    or first_msg_tpl:match("^%a%a:([^\n]+)")
    or first_msg_tpl:match("([^\n]+)")
  if line then
    first_message = line:match("^%s*(.-)%s*$")
      :gsub("{name}", function() return soul_name end)
      :gsub("{([^}]+)}", function(v) return v end)
  end
end
if not first_message then
  first_message = soul_name_resolved
    and ("Hey -- you're speaking with the digital version of " .. soul_name .. ". Verification please.")
    or "Hey -- you're speaking with my digital version. Verification please."
end

-- ── Clean up old agent + old tools at ElevenLabs ────────────────────────────
-- Every regeneration so far has created a brand-new agent with freshly
-- inline-defined tools -- ElevenLabs persists these tools as standalone
-- workspace objects that pile up with every further regeneration (found
-- 2026-07-14: 1022 orphaned tools after ~29 regenerations, cleaned up
-- manually). Remove all the old ones before creating a new one so this
-- doesn't accumulate again. Best-effort: errors here don't block the
-- actual agent creation.
do
  local old_agent_id = nil
  local cfg_r = read_file(BASE_DIR .. "/config.json")
  if cfg_r then
    local ok_c, cfg_d = pcall(cjson.decode, cfg_r)
    if ok_c and type(cfg_d) == "table" and type(cfg_d.elevenlabs_agent_id) == "string" then
      old_agent_id = cfg_d.elevenlabs_agent_id
    end
  end

  local hc_cleanup = http.new()
  hc_cleanup:set_timeout(15000)

  if old_agent_id and old_agent_id ~= "" then
    hc_cleanup:request_uri(ELEVEN .. "/convai/agents/" .. old_agent_id .. "?force=true", {
      method = "DELETE",
      ssl_verify = true,
      headers = { ["xi-api-key"] = eleven_key },
    })
  end

  -- Only delete tools whose name matches what this script creates -- no
  -- blanket delete, in case the workspace ever gets an unrelated tool.
  -- (Names from earlier script versions no longer used here, e.g. the old
  -- soul_tool/calendar_write, were cleaned up manually once on 2026-07-14.)
  local SYS_TOOL_NAMES = {
    verify_identity = true, verify_status   = true,
    soul_read       = true, soul_write      = true,
    mind_read       = true, mind_write      = true,
    peer_inbox      = true, peer_send       = true,
    context_list    = true, context_get     = true, context_write = true,
    health_check    = true, food_log        = true,
    vault_manifest  = true, vault_shared_list = true, vault_shared_get = true,
    audio_list      = true, image_list      = true, video_list     = true,
    profile_get     = true, shop_log        = true,
    soul_earnings   = true, soul_maturity   = true, soul_skills    = true,
    soul_discover   = true, verify_human    = true, session_end    = true,
  }

  local tres, _ = hc_cleanup:request_uri(ELEVEN .. "/convai/tools", {
    method = "GET",
    ssl_verify = true,
    headers = { ["xi-api-key"] = eleven_key },
  })
  if tres and tres.status == 200 then
    local tok, tdata = pcall(cjson.decode, tres.body)
    if tok and type(tdata) == "table" and type(tdata.tools) == "table" then
      for _, t in ipairs(tdata.tools) do
        local tname = type(t) == "table" and type(t.tool_config) == "table" and t.tool_config.name
        if type(t) == "table" and type(t.id) == "string" and tname and SYS_TOOL_NAMES[tname] then
          local hc_del = http.new()
          hc_del:set_timeout(10000)
          hc_del:request_uri(ELEVEN .. "/convai/tools/" .. t.id .. "?force=true", {
            method = "DELETE",
            ssl_verify = true,
            headers = { ["xi-api-key"] = eleven_key },
          })
        end
      end
    end
  end
end

-- ── Create agent ─────────────────────────────────────────────────────────────
-- Always set tts.model_id: non-English agents need flash/turbo v2_5.
-- Without an explicit model, ElevenLabs falls back to an English default model
-- and rejects language="de" with a 400.
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
        -- Helper: tool with a POST body schema
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
          -- Verification (always first)
          wh("verify_identity", "Creates a verification request. ALWAYS call first. Returns challenge_id.", verify_url, {}, nil),
          wh("verify_status",   "Checks whether verification is complete. Call after verify_identity until verified=true.",
            vstatus_url, { id = sd("challenge_id from verify_identity") }, { "id" }),
          -- Soul
          whget("soul_read",  "Loads the full soul content (sys.md). Call immediately after verification.", soul_url),
          wh("soul_write", "Writes to a sys.md section. section='Worldview' (or the matching section), mode='append', content='YYYY-MM-DD: one sentence'.",
            write_url,
            { section=sd("Section name without ##"), content=sd("Content"), mode=sd("append | replace | prepend") },
            { "section", "content" }),
          -- Thoughts
          whget("mind_read",  "Loads mind.md (thoughts, mood, context).", tool_url("mind_read")),
          wh("mind_write", "Writes thoughts or mood to mind.md. Self-reflective insights go in section='Self-Reflection'.",
            tool_url("mind_write"),
            { section=sd("Section name"), content=sd("Content"), mode=sd("append | replace | prepend") },
            { "section", "content" }),
          -- Peers
          wh("peer_inbox", "Reads incoming peer messages.",
            tool_url("peer_inbox"),
            { days=nd("Days back"), from=sd("Sender soul ID"), search=sd("Search term"), limit=nd("Max entries") },
            nil),
          wh("peer_send", "Sends a message to a peer.",
            tool_url("peer_send"),
            { to=sd("Recipient soul ID"), message=sd("Message text") },
            { "to", "message" }),
          -- Context / files
          whget("context_list", "Lists all context files.", tool_url("context_list")),
          wh("context_get",   "Reads a context file.", tool_url("context_get"), { filename=sd("File name") }, { "filename" }),
          wh("context_write", "Writes or updates a context file.",
            tool_url("context_write"),
            { filename=sd("File name"), content=sd("Content (Markdown)") },
            { "filename", "content" }),
          -- Health & food
          whget("health_check", "Loads current health data (health.md).", tool_url("health_check")),
          wh("food_log", "Logs a meal.",
            tool_url("food_log"),
            { name=sd("Name"), rating=sd("Rating A-E"), notes=sd("Note") },
            { "name" }),
          -- Vault
          whget("vault_manifest",    "Lists all vault files (audio, images, video, context).", tool_url("vault_manifest")),
          whget("vault_shared_list", "Lists shared files.",                                     tool_url("vault_shared_list")),
          wh("vault_shared_get",    "Loads a shared file.", tool_url("vault_shared_get"),        { filename=sd("File name") }, { "filename" }),
          whget("audio_list",  "Lists vault audio files.",  tool_url("audio_list")),
          whget("image_list",  "Lists vault images.",       tool_url("image_list")),
          whget("video_list",  "Lists vault videos.",       tool_url("video_list")),
          -- Profile
          wh("profile_get",  "Loads user profile.", tool_url("profile_get"), { type=sd("Profile type, e.g. main") }, nil),
          -- Shop & expenses
          wh("shop_log", "Logs a purchase or expense.",
            tool_url("shop_log"),
            { name=sd("Name"), category=sd("Category"), price=nd("Price"), status=sd("Status") },
            { "name" }),
          -- Soul community
          whget("soul_earnings",  "Loads soul earnings overview.", tool_url("soul_earnings")),
          whget("soul_maturity",  "Loads soul maturity score.",    tool_url("soul_maturity")),
          whget("soul_skills",    "Loads soul skills.",            tool_url("soul_skills")),
          whget("soul_discover",  "Discovers other souls.",        tool_url("soul_discover")),
          -- Web
          wh("web_search", "Searches the web for current information.", search_url,
            { query=sd("Search query") }, { "query" }),
          -- Verification (human check)
          whget("verify_human", "Checks whether the user is a human (anti-bot).", tool_url("verify_human")),
          -- Session end
          wh("session_end", "Closes the session and saves a summary to sys.md.",
            tool_url("session_end"),
            { summary=sd("Compact session content — only what was new"), channel=sd("Channel: elevenlabs") },
            { "summary" }),
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

-- ── Write ownagent.md to vault/context (owner only) ─────────────────────────
-- Owner-only: since 2026-07-05, vault_shared is readable by any paying/peer
-- connection -- this marker (agent_id/agent_url for call_me) doesn't belong there.
-- Remove old files, then create a fresh one: ownagent.md (dated, for call_me).
do
  local context_dir = BASE_DIR .. "/vault/context"
  os.execute("mkdir -p " .. context_dir)
  -- Remove old ownagent files
  os.execute("rm -f " .. context_dir .. "/*ownagent*.md")
  local agent_url  = "https://elevenlabs.io/app/talk-to?agent_id=" .. agent_id
  local vid_line   = voice_id and ("voice_id: " .. voice_id .. "\n") or ""
  local updated_at = os.date("!%Y-%m-%dT%TZ")
  local ts         = tostring(math.floor(ngx.now() * 1000))
  local content    = "---\nagent_id: " .. agent_id .. "\nagent_url: " .. agent_url .. "\n" .. vid_line .. "updated_at: " .. updated_at .. "\n---\n"
  local wf = io.open(context_dir .. "/" .. ts .. "_ownagent.md", "w")
  if wf then wf:write(content); wf:close() end
end

-- ── Update agent_id + agent_url in config.json ──────────────────────────────
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

-- ── Register post-call webhook + link agent ──────────────────────────────────
local webhook_secret = ""
do
  local post_call_url = base_url .. "/api/agent/post-call"
  -- Read the old webhook secret from config.json (idempotent: don't recreate if present)
  local existing_secret = (type(ctx.elevenlabs_webhook_secret) == "string")
                          and ctx.elevenlabs_webhook_secret or ""
  local webhook_id = (type(ctx.elevenlabs_webhook_id) == "string")
                     and ctx.elevenlabs_webhook_id or ""

  -- Create a new webhook if none is configured yet
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
          -- Persist to config.json
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

  -- Link agent with webhook (+ enable_auth=false in a single PATCH)
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

-- ── Publish agent (enable_auth=false, if webhook_id is empty) ────────────────
local published = false
do
  -- If webhook_id was set, the PATCH above already set enable_auth=false
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
