-- /etc/openresty/lua/vault_auth.lua
-- access_by_lua_file für /api/soul, /api/vault/*, /api/webhook/*
--
-- Akzeptiert:
--   soul-cert (Bearer {soul_id}.{cert})   → voller Zugriff, kein Vault-Check
--   service-token                          → authorized_services.json + Vault muss offen sein
--
-- Setzt ngx.ctx.soul_id, ngx.ctx.vault_key, ngx.ctx.via_webhook, ngx.ctx.service_permissions bei Erfolg.

local cjson      = require("cjson.safe")
local hmac       = require("hmac_helper")
local master_key = os.getenv("SOUL_MASTER_KEY") or ""

-- Hilfsfunktion: Session-JSON parsen (JSON oder altes plain-number Format)
local function parse_session(val)
  if not val then return nil, "" end
  local ok, sess = pcall(cjson.decode, val)
  if ok and type(sess) == "table" then
    return sess.expires_at or 0, sess.vault_key or ""
  end
  return tonumber(val) or 0, ""
end

-- ── 1. Soul-Cert prüfen ────────────────────────────────────────────────────────

local function check_soul_cert(token)
  local dot = token:find(".", 1, true)
  if not dot then return nil end

  local soul_id = token:sub(1, dot - 1)
  local cert    = token:sub(dot + 1)
  if soul_id == "" or cert == "" then return nil end

  if master_key == "" then
    ngx.ctx.soul_id = soul_id
  else
    local cert_version = hmac.read_cert_version(soul_id)
    local expected     = hmac.cert_for_soul(master_key, soul_id, cert_version)
    if cert ~= expected then
      ngx.log(ngx.WARN, "[vault_auth] Ungültiges Cert soul_id=", soul_id)
      return nil
    end
    ngx.ctx.soul_id = soul_id
  end

  -- Vault-Schlüssel aus aktiver Session lesen (wenn vorhanden)
  local sessions = ngx.shared.vault_sessions
  if sessions then
    local val = sessions:get(soul_id)
    if val then
      local expires_at, vault_key = parse_session(val)
      -- Abgelaufene Session ignorieren
      if not (expires_at and expires_at > 0 and ngx.now() >= expires_at) then
        ngx.ctx.vault_key = vault_key
      end
    end
  end

  -- Fallback: vault_key_hex aus api_context.json (Soul-Cert-Owner hat immer Zugriff)
  if not ngx.ctx.vault_key or ngx.ctx.vault_key == "" then
    local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
    local cf = io.open(ctx_path, "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local ok_j, ctx = pcall(require("cjson.safe").decode, raw)
      if ok_j and type(ctx) == "table" and type(ctx.vault_key_hex) == "string"
         and #ctx.vault_key_hex == 64 then
        ngx.ctx.vault_key = ctx.vault_key_hex
      end
    end
  end

  if not ngx.ctx.vault_key then ngx.ctx.vault_key = "" end

  return soul_id
end

-- ── 2. Service-Token prüfen + Vault-Status ────────────────────────────────────

local function check_service_token(token)
  -- Soul-Cert-Format ausschließen (enthält Punkt)
  if token:find(".", 1, true) then return nil end

  local souls_dir = "/var/lib/sys/souls"
  local handle = io.popen("ls " .. souls_dir .. " 2>/dev/null")
  if not handle then return nil end

  local found_id    = nil
  local found_perms = nil
  local found_key   = ""

  for dir in handle:lines() do
    -- Nur alphanumerisch + Bindestrich: kein Dot (verhindert ../ Traversal)
    if dir:match("^[a-zA-Z0-9%-]+$") and #dir <= 64 then
      local path = souls_dir .. "/" .. dir .. "/authorized_services.json"
      local f = io.open(path, "r")
      if f then
        local raw = f:read("*a"); f:close()
        local ok, data = pcall(cjson.decode, raw)
        if ok and type(data) == "table" and data[token] then
          local svc = data[token]
          -- Ablaufdatum prüfen
          if type(svc.expires_at) ~= "number" or ngx.now() < svc.expires_at then
            found_id    = dir
            found_perms = svc.permissions
            break
          end
        end
      end
    end
  end
  handle:close()

  if not found_id then return nil end

  -- Vault-Session prüfen – muss offen sein
  local sessions = ngx.shared.vault_sessions
  if not sessions then
    -- shared dict nicht konfiguriert → blockieren
    ngx.ctx.soul_id      = found_id
    ngx.ctx.vault_locked = true
    return nil
  end

  -- vault_key_hex aus api_context.json lesen (persistenter Fallback für Service-Token ohne Session)
  local function load_persisted_key(soul_id)
    local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
    local cf = io.open(ctx_path, "r")
    if not cf then return "" end
    local raw = cf:read("*a"); cf:close()
    local ok_j, ctx = pcall(cjson.decode, raw)
    if ok_j and type(ctx) == "table" and type(ctx.vault_key_hex) == "string"
       and #ctx.vault_key_hex == 64 then
      return ctx.vault_key_hex
    end
    return ""
  end

  local val = sessions:get(found_id)
  local vault_key = ""

  if not val then
    -- Keine aktive Session: persistenten vault_key_hex verwenden wenn vorhanden
    vault_key = load_persisted_key(found_id)
    if vault_key == "" then
      ngx.ctx.soul_id      = found_id
      ngx.ctx.vault_locked = true
      return nil
    end
  else
    local expires_at
    expires_at, vault_key = parse_session(val)
    if expires_at and expires_at > 0 and ngx.now() >= expires_at then
      sessions:delete(found_id)
      vault_key = load_persisted_key(found_id)
      if vault_key == "" then
        ngx.ctx.soul_id      = found_id
        ngx.ctx.vault_locked = true
        return nil
      end
    elseif vault_key == "" then
      vault_key = load_persisted_key(found_id)
    end
  end

  ngx.ctx.soul_id             = found_id
  ngx.ctx.vault_key           = vault_key
  ngx.ctx.via_webhook         = true
  ngx.ctx.service_permissions = found_perms
  return found_id
end

-- ── Auth Flow ──────────────────────────────────────────────────────────────────

-- CORS Preflight: OPTIONS-Requests brauchen keine Auth
if ngx.req.get_method() == "OPTIONS" then
  return
end

local auth  = ngx.req.get_headers()["authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")
           or ngx.req.get_headers()["x-webhook-token"]
           or ngx.var.arg_token  -- ?token=... für direkte Datei-Downloads
           or ""

if token == "" then
  return ngx.exit(401)
end

if not check_soul_cert(token) then
  if not check_service_token(token) then
    if ngx.ctx.vault_locked then
      ngx.header["Content-Type"]  = "application/json"
      ngx.header["Cache-Control"] = "no-store"
      ngx.status = 403
      ngx.say('{"error":"vault_locked","message":"Vault gesperrt. Bitte zuerst entsperren."}')
      return ngx.exit(403)
    end
    return ngx.exit(401)
  end
end
