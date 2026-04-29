-- /etc/openresty/lua/vault_unlock.lua
-- POST /api/vault/unlock  → Vault entsperren, Dauer wählen
-- POST /api/vault/lock    → Vault sofort sperren
-- GET  /api/vault/session → Aktuellen Session-Status abfragen
--
-- Auth: soul-cert only (via soul_auth.lua access phase)
-- Shared Dict: vault_sessions (in nginx.conf: lua_shared_dict vault_sessions 10m)
--
-- Session-Format: JSON { expires_at: number, vault_key: "64-hex-string" }
--   expires_at == 0 → unbegrenzt
--   vault_key == "" → kein Schlüssel (plaintext-Modus)

local cjson    = require("cjson.safe")
local sessions = ngx.shared.vault_sessions
local soul_id  = ngx.ctx.soul_id
local method   = ngx.req.get_method()
local uri      = ngx.var.uri

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local durations = {
  ["1h"]        = 3600,
  ["12h"]       = 43200,
  ["1d"]        = 86400,
  ["30d"]       = 2592000,
  ["182d"]      = 15724800,
  ["365d"]      = 31536000,
  ["unlimited"] = 0
}

-- Hilfsfunktion: Session-Wert parsen (JSON oder altes plain-number Format)
local function parse_session(val)
  if not val then return nil end
  local ok, sess = pcall(cjson.decode, val)
  if ok and type(sess) == "table" then
    return sess.expires_at or 0, sess.vault_key or ""
  end
  -- Rückwärtskompatibilität: alter Wert war plain tostring(expires_at)
  return tonumber(val) or 0, ""
end

-- ── GET /api/vault/session ────────────────────────────────────────────────────

if method == "GET" then
  if not sessions then
    ngx.say(cjson.encode({ unlocked = false, error = "shared dict not configured" }))
    return
  end
  local val = sessions:get(soul_id)
  if not val then
    ngx.say(cjson.encode({ unlocked = false }))
    return
  end
  local expires_at, vault_key = parse_session(val)
  if expires_at and expires_at > 0 and ngx.now() >= expires_at then
    sessions:delete(soul_id)
    ngx.say(cjson.encode({ unlocked = false }))
    return
  end
  ngx.say(cjson.encode({
    unlocked    = true,
    expires_at  = (expires_at == 0) and cjson.null or expires_at,
    unlimited   = (expires_at == 0),
    has_key     = (vault_key ~= "")
  }))
  return
end

-- ── POST /api/vault/lock ──────────────────────────────────────────────────────

if method == "POST" and uri == "/api/vault/lock" then
  if sessions then sessions:delete(soul_id) end

  -- vault_key_hex aus api_context.json löschen → Webhook-Token-Auth kann nicht mehr entschlüsseln
  local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local cf = io.open(ctx_path, "r")
  if cf then
    local raw = cf:read("*a"); cf:close()
    local ok_j, ctx = pcall(cjson.decode, raw)
    if ok_j and type(ctx) == "table" then
      ctx.vault_key_hex = nil
      local wf = io.open(ctx_path, "w")
      if wf then wf:write(cjson.encode(ctx)); wf:close() end
    end
  end

  ngx.say(cjson.encode({ ok = true, unlocked = false }))
  return
end

-- ── POST /api/vault/unlock ────────────────────────────────────────────────────

if method == "POST" and uri == "/api/vault/unlock" then
  if not sessions then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "vault_sessions shared dict not configured in nginx.conf" }))
    return
  end

  ngx.req.read_body()
  local body = ngx.req.get_body_data() or "{}"
  local _, payload = pcall(cjson.decode, body)
  if type(payload) ~= "table" then payload = {} end

  local duration = payload.duration or "1h"
  local ttl = durations[duration]
  if ttl == nil then
    ngx.status = 400
    ngx.say(cjson.encode({
      error = "Invalid duration. Allowed: 1h, 12h, 1d, 30d, 182d, 365d, unlimited"
    }))
    return
  end

  -- vault_key: optionaler 64-Zeichen Hex-String (32 Byte AES-256-Schlüssel)
  local vault_key = ""
  if type(payload.vault_key) == "string" and payload.vault_key:match("^[0-9a-f]+$") and #payload.vault_key == 64 then
    vault_key = payload.vault_key
  end

  local expires_at = (ttl == 0) and 0 or (math.floor(ngx.now()) + ttl)

  local session_data = cjson.encode({ expires_at = expires_at, vault_key = vault_key })
  -- ttl=0 in ngx.shared.dict → never expires
  local ok, err = sessions:set(soul_id, session_data, ttl)
  if not ok then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Session store failed: " .. (err or "unknown") }))
    return
  end

  -- ── webhook_token automatisch setzen ─────────────────────────────────────
  -- HMAC-SHA256(vault_key_bin, soul_id) → in api_context.json speichern
  -- Damit ist /api/webhook/mnemonic nach jedem Unlock sofort nutzbar,
  -- auch nach Vault-Löschung (api_context wird neu angelegt + token gesetzt).
  if vault_key ~= "" then
    local vault_key_bin = vault_key:gsub("..", function(h)
      return string.char(tonumber(h, 16))
    end)

    local token_hex

    -- Versuch 1: resty.openssl.hmac (falls installiert)
    local ok_lib, openssl_hmac = pcall(require, "resty.openssl.hmac")
    if ok_lib then
      local hmac_obj = openssl_hmac.new(vault_key_bin, "sha256")
      if hmac_obj then
        local sig = hmac_obj:final(soul_id)
        if sig then
          token_hex = sig:gsub(".", function(c)
            return string.format("%02x", string.byte(c))
          end)
        end
      end
    end

    -- Versuch 2: Python3 via Tempfiles (immer verfügbar)
    if not token_hex or #token_hex ~= 64 then
      local ts   = tostring(ngx.now()):gsub("%.", "_")
      local t_k  = "/tmp/sys_k_" .. ts
      local t_s  = "/tmp/sys_s_" .. ts
      local t_o  = "/tmp/sys_o_" .. ts
      local fk = io.open(t_k, "w"); if fk then fk:write(vault_key); fk:close() end
      local fs = io.open(t_s, "w"); if fs then fs:write(soul_id);   fs:close() end
      os.execute(string.format(
        "python3 -c \"import hmac,binascii;"
        .. "vk=binascii.unhexlify(open('%s').read().strip());"
        .. "s=open('%s').read().strip();"
        .. "print(hmac.new(vk,s.encode(),'sha256').hexdigest())"
        .. "\" > %s 2>/dev/null", t_k, t_s, t_o))
      os.remove(t_k); os.remove(t_s)
      local rf = io.open(t_o, "r")
      if rf then token_hex = (rf:read("*a") or ""):gsub("%s+$", ""); rf:close() end
      os.remove(t_o)
    end

    -- In api_context.json persistieren
    -- vault_key_hex immer schreiben (ermöglicht MCP/Service-Token-Zugriff ohne aktive Session)
    -- Datei anlegen falls sie noch nicht existiert (Vault-Unlock vor erstem Sync)
    local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
    os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id)
    local ctx = {
      enabled      = false,
      cipher_mode  = "ciphered",
      permissions  = { soul = false, calendar = false, audio = false, video = false, images = false, context_files = false },
      synced_files = {},
      active_files = {}
    }
    local cf = io.open(ctx_path, "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local ok_j, existing = pcall(cjson.decode, raw)
      if ok_j and type(existing) == "table" then ctx = existing end
    end
    ctx.vault_key_hex = vault_key   -- für vault_auth: Token-Auth ohne Session
    ctx.cipher_mode   = "ciphered"
    if token_hex and #token_hex == 64 then
      ctx.webhook_token = token_hex
    end
    local wf = io.open(ctx_path, "w")
    if wf then wf:write(cjson.encode(ctx)); wf:close() end
  end

  ngx.say(cjson.encode({
    ok         = true,
    unlocked   = true,
    duration   = duration,
    expires_at = (expires_at == 0) and cjson.null or expires_at,
    unlimited  = (expires_at == 0),
    has_key    = (vault_key ~= "")
  }))
  return
end

ngx.status = 405
ngx.say(cjson.encode({ error = "Method not allowed" }))
