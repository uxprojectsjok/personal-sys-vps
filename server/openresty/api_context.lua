-- /etc/openresty/lua/api_context.lua
-- GET  /api/context  → aktuellen Kontext lesen (webhook_token nie zurückgeben)
-- PUT  /api/context  → Kontext + Berechtigungen + Soul-Inhalt speichern
-- Auth: vault_auth.lua (soul_id in ngx.ctx)

local cjson        = require("cjson.safe")
local resty_aes    = require("resty.aes")
local resty_random = require("resty.random")
local soul_id      = ngx.ctx.soul_id

local MAGIC = "SYS\x01"  -- 4 Magic-Bytes, kompatibel mit api_serve.lua

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function encrypt_content(plaintext, vault_key_hex)
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local iv = resty_random.bytes(16, true)
  if not iv then return nil end
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  local ciphertext = aes_ctx:encrypt(plaintext)
  if not ciphertext then return nil end
  return MAGIC .. iv .. ciphertext
end

-- Whitelist: soul_id nur alphanumerisch + Bindestrich (verhindert Shell-Injection in mkdir)
if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid soul identity"}')
  return
end

local base_dir = "/var/lib/sys/souls/" .. soul_id
local ctx_file = base_dir .. "/api_context.json"

local function ensure_dirs()
  os.execute("mkdir -p " .. base_dir .. "/vault/audio")
  os.execute("mkdir -p " .. base_dir .. "/vault/video")
  os.execute("mkdir -p " .. base_dir .. "/vault/images")
  os.execute("mkdir -p " .. base_dir .. "/vault/context")
  os.execute("mkdir -p " .. base_dir .. "/vault/profile")
end

local function read_context()
  local f = io.open(ctx_file, "r")
  if not f then
    return {
      enabled       = false,
      cipher_mode   = "ciphered",
      webhook_token = "",
      permissions   = { soul = false, calendar = false, audio = false, video = false, images = false, context_files = false },
      synced_files  = { audio = cjson.empty_array, video = cjson.empty_array, images = cjson.empty_array, context = cjson.empty_array },
      active_files  = { audio = "", video = "", images = "", context = "" }
    }
  end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" then return data end
  -- Parse-Fehler: nil zurückgeben damit PUT abbrechen kann
  return nil
end

-- ── Synced-Files gegen echten Vault-Inhalt validieren ──────────────────────
-- Verhindert Cross-Soul-Kontamination: nur Dateien zurückgeben die physisch
-- im Vault dieser Soul existieren. Korrumpierte api_context.json heilt sich so
-- beim nächsten GET automatisch selbst.

local VAULT_TYPE_DIR = { audio = "audio", video = "video", images = "images", context = "context" }

local function filter_existing_synced_files(synced)
  if type(synced) ~= "table" then
    return { audio = cjson.empty_array, video = cjson.empty_array, images = cjson.empty_array, context = cjson.empty_array, profiles = cjson.empty_array }
  end
  local out = {}
  for typ, dir in pairs(VAULT_TYPE_DIR) do
    local files = synced[typ]
    if type(files) ~= "table" or #files == 0 then
      out[typ] = cjson.empty_array
    else
      local existing = {}
      for _, fname in ipairs(files) do
        -- Sicherheitscheck: kein Pfad-Traversal im Dateinamen
        if type(fname) == "string" and not fname:find("%.%.") and not fname:find("/") then
          local path = base_dir .. "/vault/" .. dir .. "/" .. fname
          local fh = io.open(path, "r")
          if fh then fh:close(); existing[#existing + 1] = fname end
        end
      end
      out[typ] = #existing > 0 and existing or cjson.empty_array
    end
  end
  -- Profile: separates Verzeichnis vault/profile/{type}.json
  local raw_profiles = synced.profiles
  if type(raw_profiles) == "table" and #raw_profiles > 0 then
    local existing = {}
    for _, ptype in ipairs(raw_profiles) do
      if type(ptype) == "string" and ptype:match("^[a-z]+$") then
        local path = base_dir .. "/vault/profile/" .. ptype .. ".json"
        local fh = io.open(path, "r")
        if fh then fh:close(); existing[#existing + 1] = ptype end
      end
    end
    out.profiles = #existing > 0 and existing or cjson.empty_array
  else
    out.profiles = cjson.empty_array
  end
  return out
end

-- ── GET ────────────────────────────────────────────────────────────────────

if ngx.req.get_method() == "GET" then
  local ctx = read_context()
  local safe = {
    enabled      = ctx.enabled      or false,
    cipher_mode  = ctx.cipher_mode  or "ciphered",
    has_token    = (ctx.webhook_token or "") ~= "",
    permissions  = ctx.permissions  or {},
    synced_files = filter_existing_synced_files(ctx.synced_files),
    active_files = ctx.active_files or {}
  }
  ngx.header["Content-Type"]  = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode(safe))
  return
end

-- ── PUT ────────────────────────────────────────────────────────────────────

if ngx.req.get_method() ~= "PUT" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or body == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Empty body"}')
  return
end

local ok, incoming = pcall(cjson.decode, body)
if not ok or type(incoming) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid JSON"}')
  return
end

-- Service-Token: darf nur soul_content/soul_content_encrypted schreiben
-- (kein Zugriff auf enabled, cipher_mode, permissions, webhook_token, active_files)
if ngx.ctx.via_webhook then
  local perms = ngx.ctx.service_permissions or {}
  if not perms.soul then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"soul permission required for service token"}')
    return
  end
  incoming.enabled       = nil
  incoming.cipher_mode   = nil
  incoming.permissions   = nil
  incoming.webhook_token = nil
  incoming.active_files  = nil
end

ensure_dirs()
local ctx = read_context()

-- Schutz: wenn vorhandene api_context.json nicht lesbar ist, abbrechen statt zu überschreiben
if ctx == nil then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"api_context corrupt – bitte Support kontaktieren"}')
  return
end

if incoming.enabled     ~= nil then ctx.enabled     = incoming.enabled end
if incoming.cipher_mode ~= nil then ctx.cipher_mode = incoming.cipher_mode end
if incoming.permissions ~= nil then ctx.permissions = incoming.permissions end

-- webhook_token: max. 256 Zeichen
if type(incoming.webhook_token) == "string" and incoming.webhook_token ~= ""
   and #incoming.webhook_token <= 256 then
  ctx.webhook_token = incoming.webhook_token
end
if incoming.webhook_token ~= nil and incoming.webhook_token ~= "" then
  ctx.webhook_token = incoming.webhook_token
end
-- active_files: nur bekannte Keys akzeptieren
local ACTIVE_KEYS = { audio=true, video=true, images=true, context=true }
if type(incoming.active_files) == "table" then
  if not ctx.active_files then ctx.active_files = {} end
  for k, v in pairs(incoming.active_files) do
    if ACTIVE_KEYS[k] then ctx.active_files[k] = v end
  end
end
ctx.updated_at = ngx.now()

-- Soul-Inhalt in separate Datei auslagern (nicht in context.json)
-- soul_content_encrypted: base64-kodierter AES-CBC Ciphertext (Magic-Bytes + IV + Daten)
-- soul_content:           Plaintext → wird serverseitig re-verschlüsselt wenn cipher_mode="ciphered"
if type(incoming.soul_content_encrypted) == "string" and #incoming.soul_content_encrypted > 0 then
  local decoded = ngx.decode_base64(incoming.soul_content_encrypted)
  if decoded then
    local sf = io.open(base_dir .. "/sys.md", "wb")
    if sf then sf:write(decoded); sf:close() end
  end
elseif type(incoming.soul_content) == "string" and #incoming.soul_content > 0 then
  -- Größenlimit: max. 2 MB Plaintext sys.md
  if #incoming.soul_content > 2 * 1024 * 1024 then
    ngx.status = 413
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"soul_content exceeds 2 MB limit"}')
    return
  end
  local final_content = incoming.soul_content
  -- Re-Verschlüsselung: wenn cipher_mode="ciphered" und vault_key_hex vorhanden → nie Klartext speichern
  local effective_mode = ctx.cipher_mode or "ciphered"
  -- Schlüssel: erst aus api_context.json, dann aus aktiver Session (ngx.ctx.vault_key)
  local vkh = type(ctx.vault_key_hex) == "string" and #ctx.vault_key_hex == 64 and ctx.vault_key_hex or nil
  if not vkh then
    local session_key = ngx.ctx.vault_key or ""
    if #session_key == 64 then
      vkh = session_key
      ctx.vault_key_hex = vkh  -- für künftige MCP/Service-Token-Zugriffe persistieren
    end
  end
  if effective_mode == "ciphered" and vkh then
    local encrypted = encrypt_content(incoming.soul_content, vkh)
    if encrypted then
      final_content = encrypted
      local sf = io.open(base_dir .. "/sys.md", "wb")
      if sf then sf:write(final_content); sf:close() end
    else
      ngx.status = 500
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"encryption_failed","message":"Soul konnte nicht verschlüsselt werden. Vault erneut entsperren."}')
      return
    end
  else
    -- Open mode: Klartext nur wenn explizit cipher_mode="open" gesetzt
    local sf = io.open(base_dir .. "/sys.md", "w")
    if sf then sf:write(final_content); sf:close() end
  end
end

local f = io.open(ctx_file, "w")
if not f then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Storage error"}')
  return
end
f:write(cjson.encode(ctx)); f:close()

ngx.header["Content-Type"] = "application/json"
ngx.say('{"ok":true}')
