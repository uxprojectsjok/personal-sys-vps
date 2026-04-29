-- /etc/openresty/lua/webhook_mnemonic.lua
-- POST /api/webhook/mnemonic
--
-- Authentifizierung im ciphered-Mode via 12 BIP39-Wörter:
--   1. vault_key  = PBKDF2(mnemonic, soul_id, 100000 iter, SHA-256, 32 Byte)
--   2. expected   = HMAC-SHA256(vault_key, soul_id) → hex
--   3. Vergleich mit gespeichertem webhook_token (constant-time)
--
-- Request-Body: { "soul_id": "...", "words": ["w1",…,"w12"] }
--           OR: { "soul_id": "...", "mnemonic": "w1 w2 … w12" }
--
-- Anforderung: lua-resty-openssl (>= 0.8) muss installiert sein.
--   luarocks install lua-resty-openssl
--
-- HINWEIS: PBKDF2 mit 100.000 Iterationen kostet ~100 ms CPU.
--   Rate-Limiting im nginx vhost empfohlen (limit_req_zone).

local cjson  = require("cjson.safe")
local bit    = require("bit")  -- LuaJIT built-in

-- ── CORS ──────────────────────────────────────────────────────────────────────

ngx.header["Access-Control-Allow-Origin"]  = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- ── Request-Body ──────────────────────────────────────────────────────────────

ngx.req.read_body()
local raw = ngx.req.get_body_data() or "{}"
local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid JSON body"}')
  return
end

-- soul_id
local soul_id = body.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id required"}')
  return
end

-- Mnemonic: Array oder Space-String → normalisiert auf lowercase trimmed
local mnemonic_str
if type(body.words) == "table" then
  mnemonic_str = table.concat(body.words, " ")
elseif type(body.mnemonic) == "string" then
  mnemonic_str = body.mnemonic
else
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"words[] array or mnemonic string required"}')
  return
end

-- Normalisieren (lowercase, trim, single spaces)
mnemonic_str = mnemonic_str:lower():gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s+", " ")

-- Genau 12 Wörter?
local word_count = 0
for _ in mnemonic_str:gmatch("%S+") do word_count = word_count + 1 end
if word_count ~= 12 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Exactly 12 words required, got ' .. word_count .. '"}')
  return
end

-- ── API-Kontext laden ─────────────────────────────────────────────────────────

local base_dir = "/var/lib/sys/souls/" .. soul_id
local cf = io.open(base_dir .. "/api_context.json", "r")
if not cf then
  ngx.status = 404
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"No API context for this soul"}')
  return
end
local ctx_raw = cf:read("*a"); cf:close()
local ok2, ctx = pcall(cjson.decode, ctx_raw)
if not ok2 or not ctx.enabled then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"API not enabled"}')
  return
end

-- Mnemonic-Auth funktioniert in jedem Mode (open + ciphered)
-- In open mode: vault_key nicht benötigt, aber Session wird trotzdem gesetzt (für File-Downloads)

local stored_token = ctx.webhook_token
if not stored_token or stored_token == "" then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"No webhook token configured"}')
  return
end

-- ── PBKDF2 + HMAC via Python3 (os.execute + Tempfiles, kein Shell-Escaping) ──

local ts      = tostring(ngx.now()):gsub("%.", "_")
local tmp_m   = "/tmp/sys_m_"   .. ts
local tmp_s   = "/tmp/sys_s_"   .. ts
local tmp_out = "/tmp/sys_out_" .. ts

-- Mnemonic + soul_id in Tempfiles schreiben (vermeidet Shell-Escaping)
local fm = io.open(tmp_m, "w")
if not fm then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Temp file error"}')
  return
end
fm:write(mnemonic_str); fm:close()

local fs = io.open(tmp_s, "w")
if not fs then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Temp file error"}')
  return
end
fs:write(soul_id); fs:close()

local py_cmd = string.format(
  "python3 -c \"import hashlib,hmac,binascii;"
  .. "m=open('%s').read();s=open('%s').read();"
  .. "vk=hashlib.pbkdf2_hmac('sha256',m.encode(),s.encode(),100000,32);"
  .. "print(hmac.new(vk,s.encode(),'sha256').hexdigest()+'|'+binascii.hexlify(vk).decode())"
  .. "\" > %s 2>/dev/null",
  tmp_m, tmp_s, tmp_out
)

os.execute(py_cmd)
os.remove(tmp_m)
os.remove(tmp_s)

local rf = io.open(tmp_out, "r")
local py_out = rf and rf:read("*a") or ""
if rf then rf:close() end
os.remove(tmp_out)

py_out = py_out:gsub("%s+$", "")

local sep = py_out:find("|", 1, true)
if not sep or sep < 10 then
  ngx.log(ngx.ERR, "[webhook_mnemonic] python3 Ausgabe unerwartet: '", py_out, "'")
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Key derivation failed"}')
  return
end

local expected_token = py_out:sub(1, sep - 1)
local vault_key_hex  = py_out:sub(sep + 1)

-- vault_key_bin für AES-CBC Entschlüsselung
local vault_key_bin = vault_key_hex:gsub("..", function(h2)
  return string.char(tonumber(h2, 16))
end)

-- ── Constant-Time Vergleich ───────────────────────────────────────────────────
-- LuaJIT / Lua 5.1: kein ~ (XOR-Operator) → bit.bxor() verwenden

local function constant_eq(a, b)
  if #a ~= #b then return false end
  local diff = 0
  for i = 1, #a do
    diff = bit.bor(diff, bit.bxor(a:byte(i), b:byte(i)))
  end
  return diff == 0
end

if not constant_eq(expected_token, stored_token) then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid mnemonic"}')
  return
end

-- ── Auth erfolgreich ─────────────────────────────────────────────────────────

-- Vault-Session in shared.dict schreiben (24h)
local sessions = ngx.shared.vault_sessions
if sessions then
  local expires_at = ngx.now() + 86400  -- 24 Stunden
  local sess_json  = cjson.encode({ vault_key = vault_key_hex, expires_at = expires_at })
  sessions:set(soul_id, sess_json, 86400)
end

-- ── Antwort zusammenbauen ────────────────────────────────────────────────────
-- Format identisch zu webhook.lua (audio_active, url_with_token, etc.)

local perm     = ctx.permissions  or {}
local synced   = ctx.synced_files or {}
local actives  = ctx.active_files or {}
local base_url = ngx.var.scheme .. "://" .. ngx.var.host
local token    = stored_token

local response = {
  soul_id   = soul_id,
  service   = "mnemonic",
  timestamp = ngx.now(),
}

local MIME_MAP = {
  mp3 = "audio/mpeg", wav = "audio/wav", ogg = "audio/ogg",
  m4a = "audio/mp4",  webm = "audio/webm", flac = "audio/flac",
  mp4 = "video/mp4",  mov = "video/quicktime",
  jpg = "image/jpeg", jpeg = "image/jpeg", png = "image/png",
  md  = "text/plain", txt = "text/plain"
}

local function safe_arr(t) return type(t) == "table" and t or {} end

local function active_url_token(type_name, active_name)
  if type(active_name) == "table" then
    active_name = active_name[1]
  end
  if not active_name or active_name == "" then return nil end
  return base_url .. "/api/vault/" .. type_name .. "/" .. active_name .. "?token=" .. token
end

local function is_active(name, active_val)
  if type(active_val) == "table" then
    for _, v in ipairs(active_val) do if v == name then return true end end
    return false
  end
  return name == (active_val or "")
end

-- Soul-Inhalt (ggf. entschlüsseln)
if perm.soul then
  local sf = io.open(base_dir .. "/sys.md", "rb")
  if sf then
    local content = sf:read("*a"); sf:close()
    local MAGIC = "SYS\x01"
    if content:sub(1, 4) == MAGIC and vault_key_hex ~= "" then
      local function hex_to_bin(hex)
        return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
      end
      local resty_aes = require("resty.aes")
      local iv        = content:sub(5, 20)
      local cipher    = content:sub(21)
      local aes_ctx   = resty_aes:new(hex_to_bin(vault_key_hex), nil, resty_aes.cipher(256, "cbc"), { iv = iv })
      if aes_ctx then content = aes_ctx:decrypt(cipher) or content end
    end
    response.soul = content
  end
end

-- Audio
if perm.audio then
  local list = {}
  for _, name in ipairs(safe_arr(synced.audio)) do
    local ext = (name:match("%.([^%.]+)$") or ""):lower()
    local url = base_url .. "/api/vault/audio/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. token,
      mime           = MIME_MAP[ext] or "audio/mpeg",
      active         = is_active(name, actives.audio)
    })
  end
  response.audio_files  = list
  response.audio_active = active_url_token("audio", actives.audio)
end

-- Video
if perm.video then
  local list = {}
  for _, name in ipairs(safe_arr(synced.video)) do
    local ext = (name:match("%.([^%.]+)$") or ""):lower()
    local url = base_url .. "/api/vault/video/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. token,
      mime           = MIME_MAP[ext] or "video/mp4",
      active         = is_active(name, actives.video)
    })
  end
  response.video_files  = list
  response.video_active = active_url_token("video", actives.video)
end

-- Bilder
if perm.images then
  local list = {}
  for _, name in ipairs(safe_arr(synced.images)) do
    local url = base_url .. "/api/vault/images/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. token,
    })
  end
  response.image_files = list
end

-- Kontext-Dateien
if perm.context_files then
  local list = {}
  for _, name in ipairs(safe_arr(synced.context)) do
    local url = base_url .. "/api/vault/context/" .. name
    table.insert(list, {
      name           = name,
      url            = url,
      url_with_token = url .. "?token=" .. token,
    })
  end
  response.context_files = list
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode(response))
