-- /etc/openresty/lua/webhook.lua
-- POST /api/webhook          → Universal Soul API für externe Dienste
-- POST /api/webhook/{service} → identische Antwort, service-Name in Response
--
-- Auth: service-token (Bearer oder X-Webhook-Token Header)
--   ODER soul-cert (Bearer {soul_id}.{cert})
--
-- Antwort: JSON mit soul_id, soul-Text, audio/image/context URLs
--   audio_files[].url_with_token: direkt verwendbar ohne Extra-Auth-Header

local cjson     = require("cjson.safe")
local resty_aes = require("resty.aes")
local soul_id   = ngx.ctx.soul_id  -- gesetzt von vault_auth.lua
local base_dir  = "/var/lib/sys/souls/" .. soul_id
local uri       = ngx.var.uri

local MAGIC = "SYS\x01"

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function try_decrypt(data, vault_key_hex)
  if #data < 20 then return nil end
  if data:sub(1, 4) ~= MAGIC then return nil end
  if not vault_key_hex or vault_key_hex == "" then return nil end
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local aes_ctx    = resty_aes:new(hex_to_bin(vault_key_hex), nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

-- CORS für externe Dienste
ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Authorization, X-Webhook-Token, Content-Type"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end

-- ── Kontext laden ──────────────────────────────────────────────────────────

local cf = io.open(base_dir .. "/api_context.json", "r")
if not cf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"No API context for this soul"}')
  return
end
local raw = cf:read("*a"); cf:close()
local ok, ctx = pcall(cjson.decode, raw)
if not ok or not ctx.enabled then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"API not enabled"}')
  return
end

-- ── Request-Body lesen ────────────────────────────────────────────────────

ngx.req.read_body()
local body_raw = ngx.req.get_body_data() or "{}"
local _, payload = pcall(cjson.decode, body_raw)
if type(payload) ~= "table" then payload = {} end

-- ── Service aus URI ableiten ──────────────────────────────────────────────
-- /api/webhook             → "generic"
-- /api/webhook/elevenlabs  → "elevenlabs"
-- /api/webhook/myservice   → "myservice"
-- Alle liefern identische Antwortstruktur – kein service-spezifischer Code

local service = uri:match("^/api/webhook/?(.-)$") or ""
if service == "" then service = "generic" end

local perm     = ctx.permissions  or {}
local synced   = ctx.synced_files or {}
local actives  = ctx.active_files or {}
local base_url = ngx.var.scheme .. "://" .. ngx.var.host

local MIME_MAP = {
  mp3  = "audio/mpeg",  wav  = "audio/wav",  ogg  = "audio/ogg",
  m4a  = "audio/mp4",   flac = "audio/flac", aac  = "audio/aac",
  mp4  = "video/mp4",   webm = "video/webm", mov  = "video/quicktime",
  avi  = "video/x-msvideo", mkv = "video/x-matroska",
  jpg  = "image/jpeg",  jpeg = "image/jpeg", png  = "image/png",
  webp = "image/webp",  gif  = "image/gif",
  md   = "text/plain",  txt  = "text/plain"
}

-- ── Antwort zusammenbauen ─────────────────────────────────────────────────

local response = {
  soul_id   = soul_id,
  service   = service,
  timestamp = ngx.now()
}

-- Token für url_with_token (Direkt-Download ohne Authorization-Header)
local auth_token = (ngx.req.get_headers()["authorization"] or ""):match("^[Bb]earer%s+(.+)$")
               or ngx.req.get_headers()["x-webhook-token"]
               or ngx.var.arg_token
               or ""

-- Soul-Inhalt (falls freigegeben)
if perm.soul then
  local sf = io.open(base_dir .. "/sys.md", "rb")
  if sf then
    local content = sf:read("*a"); sf:close()
    if content:sub(1, 4) == MAGIC then
      local decrypted = try_decrypt(content, ngx.ctx.vault_key or "")
      content = decrypted or ""
    end
    response.soul = content
  end
end

local function safe_arr(t) return type(t) == "table" and t or {} end

local function active_url_with_token(type_name, active_name)
  -- active_name kann String oder Array sein (video: face + body)
  if type(active_name) == "table" then
    active_name = active_name[1]  -- primäre Datei (erste im Array)
  end
  if type(active_name) ~= "string" or active_name == "" then return nil end
  local url = base_url .. "/api/vault/" .. type_name .. "/" .. active_name
  return url .. "?token=" .. auth_token
end

local function is_active(name, active_val)
  if type(active_val) == "table" then
    for _, v in ipairs(active_val) do if v == name then return true end end
    return false
  end
  return name == (active_val or "")
end

-- Audio-Dateien (falls freigegeben)
if perm.audio then
  local files = safe_arr(synced.audio)
  local list  = {}
  for _, name in ipairs(files) do
    local ext  = (name:match("%.([^%.]+)$") or ""):lower()
    local url  = base_url .. "/api/vault/audio/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. auth_token,
      mime           = MIME_MAP[ext] or "audio/mpeg",
      active         = is_active(name, actives.audio)
    })
  end
  response.audio_files  = list
  response.audio_active = active_url_with_token("audio", actives.audio)
end

-- Video-Dateien (falls freigegeben)
if perm.video then
  local files = safe_arr(synced.video)
  local list  = {}
  for _, name in ipairs(files) do
    local ext  = (name:match("%.([^%.]+)$") or ""):lower()
    local url  = base_url .. "/api/vault/video/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. auth_token,
      mime           = MIME_MAP[ext] or "video/mp4",
      active         = is_active(name, actives.video)
    })
  end
  response.video_files  = list
  response.video_active = active_url_with_token("video", actives.video)
end

-- Bild-Dateien (falls freigegeben)
if perm.images then
  local files = safe_arr(synced.images)
  local list  = {}
  for _, name in ipairs(files) do
    local ext  = (name:match("%.([^%.]+)$") or ""):lower()
    local url  = base_url .. "/api/vault/images/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. auth_token,
      mime           = MIME_MAP[ext] or "image/jpeg",
      active         = is_active(name, actives.images)
    })
  end
  response.image_files   = list
  response.images_active = active_url_with_token("images", actives.images)
end

-- Kontext-Dateien (falls freigegeben)
if perm.context_files then
  local files = safe_arr(synced.context)
  local list  = {}
  for _, name in ipairs(files) do
    local ext  = (name:match("%.([^%.]+)$") or ""):lower()
    local url  = base_url .. "/api/vault/context/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. auth_token,
      mime           = MIME_MAP[ext] or "text/plain",
      active         = is_active(name, actives.context)
    })
  end
  response.context_files   = list
  response.context_active  = active_url_with_token("context", actives.context)
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode(response))
