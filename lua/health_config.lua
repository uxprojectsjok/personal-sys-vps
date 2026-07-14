-- GET  /api/health/config  → adapter, garmin_model, garmin_email, has_password, last_sync
-- POST /api/health/config  → schreibt adapter, garmin_model, garmin_email, garmin_password (optional)

local cjson        = require("cjson.safe")
local cfg          = require("config_reader")
local resty_aes    = require("resty.aes")
local resty_random = require("resty.random")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

local CONFIG_PATH = "/var/lib/sys/config/health_sync_" .. soul_id .. ".json"
local HEALTH_MD   = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/health.md"

local MAGIC = "SYS\x01"  -- 4 Magic-Bytes, kompatibel mit api_serve.lua / api_context.lua

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

-- JSON-Felder (im Gegensatz zu sys.md/health.md, die als Rohdatei geschrieben
-- werden) müssen text-sicher sein → Ciphertext wird base64-kodiert gespeichert.
local function encrypt_field(plaintext, vault_key_hex)
  if not plaintext or plaintext == "" then return plaintext end
  if not vault_key_hex or #vault_key_hex ~= 64 then return plaintext end
  local iv = resty_random.bytes(16, true)
  if not iv then return plaintext end
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return plaintext end
  local ciphertext = aes_ctx:encrypt(plaintext)
  if not ciphertext then return plaintext end
  return ngx.encode_base64(MAGIC .. iv .. ciphertext)
end

local function decrypt_field(data, vault_key_hex)
  if not data or data == "" then return data end
  local decoded = ngx.decode_base64(data)
  if not decoded or decoded:sub(1, 4) ~= MAGIC then
    return data  -- unverschlüsseltes Altformat (Klartext) → unverändert zurückgeben
  end
  if not vault_key_hex or #vault_key_hex ~= 64 then return nil end
  local iv = decoded:sub(5, 20)
  local ciphertext = decoded:sub(21)
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

local function read_json(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a"); f:close()
  return cjson.decode(s)
end

local function write_json(path, data)
  local f = io.open(path, "w")
  if not f then return false end
  f:write(cjson.encode(data)); f:close()
  os.execute("chmod 600 " .. path)
  os.execute("chown www-data:www-data " .. path .. " 2>/dev/null || true")
  return true
end

local function read_last_sync()
  local f = io.open(HEALTH_MD, "r")
  if not f then return nil end
  local head = f:read(512); f:close()
  return head:match("last_sync:%s*([%d%-%s:]+[%d])")
end

local function has_garmin_tokens()
  local token_dir = "/var/lib/sys/config/garmin_tokens/" .. soul_id
  local handle = io.popen("ls " .. token_dir .. "/*.json 2>/dev/null | head -1")
  if not handle then return false end
  local out = handle:read("*a"); handle:close()
  return out and out:match("%S") ~= nil
end

ngx.header["Content-Type"] = "application/json"

-- ── GET ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "GET" then
  local c = read_json(CONFIG_PATH) or {}
  local vault_key = ngx.ctx.vault_key
  local email = decrypt_field(c.garmin_email, vault_key) or ""
  ngx.say(cjson.encode({
    configured    = (c.adapter ~= nil),
    adapter       = c.adapter       or "garmin",
    garmin_model  = c.garmin_model  or "garmin_fr235",
    garmin_email  = email,
    has_password  = (c.garmin_password ~= nil and c.garmin_password ~= ""),
    has_tokens    = has_garmin_tokens(),
    last_sync     = read_last_sync(),
  }))
  return
end

-- ── POST ──────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "POST" then
  ngx.req.read_body()
  local body = cjson.decode(ngx.req.get_body_data() or "{}") or {}

  local current   = read_json(CONFIG_PATH) or {}
  local vault_key = ngx.ctx.vault_key
  current.soul_id      = soul_id
  current.adapter      = body.adapter      or current.adapter      or "garmin"
  current.garmin_model = body.garmin_model or current.garmin_model or "garmin_fr235"
  if body.garmin_email and body.garmin_email ~= "" then
    current.garmin_email = encrypt_field(body.garmin_email, vault_key)
  end
  if body.garmin_password and body.garmin_password ~= "" then
    current.garmin_password = encrypt_field(body.garmin_password, vault_key)
  end

  if write_json(CONFIG_PATH, current) then
    ngx.say('{"ok":true}')
  else
    ngx.status = 500
    ngx.say('{"error":"write failed"}')
  end
  return
end

ngx.status = 405
ngx.say('{"error":"method not allowed"}')
