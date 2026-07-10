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
local cfg        = require("config_reader")
local pol_check  = require("pol_token_check")

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

  local master_key = cfg.get_master_key()
  if master_key == "" then
    ngx.log(ngx.ERR, "[sys/auth] SOUL_MASTER_KEY nicht gesetzt — Zugriff verweigert")
    return nil
  else
    local cert_version = hmac.read_cert_version(soul_id)
    local matched      = false

    -- Per-soul Key hat Vorrang (Multi-Hoster), Fallback auf globalen Key
    local per_soul_key = cfg.get_soul_master_key(soul_id)
    local active_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or master_key

    -- Fast path: gespeicherte cert_version
    if hmac.cert_for_soul(active_key, soul_id, cert_version) == cert then
      matched = true
    else
      -- Fallback: alle Versionen 0..20 (nach Rotation, bevor api_context aktualisiert)
      for v = 0, 20 do
        if v ~= cert_version and hmac.cert_for_soul(active_key, soul_id, v) == cert then
          matched = true; break
        end
      end
    end

    if not matched then
      -- Grace-Period: vorherigen Key prüfen nach Rotation
      local prev_key
      if per_soul_key and per_soul_key ~= "" then
        prev_key = cfg.get_soul_master_key_prev(soul_id)
      end
      if not prev_key or prev_key == "" then
        prev_key = cfg.get_master_key_prev()
      end
      if prev_key and prev_key ~= "" then
        if hmac.cert_for_soul(prev_key, soul_id, cert_version) == cert then
          matched = true
          ngx.log(ngx.INFO, "[vault_auth] Grace-Period Cert akzeptiert soul_id=", soul_id)
        end
        if not matched then
          for v = 0, 20 do
            if v ~= cert_version and hmac.cert_for_soul(prev_key, soul_id, v) == cert then
              matched = true; break
            end
          end
        end
      end
    end

    if not matched then
      ngx.log(ngx.WARN, "[vault_auth] Ungültiges Cert soul_id=", soul_id)
      return nil
    end

    -- Single-Soul-Lock: nur der registrierte Node-Inhaber hat Zugriff
    local node_soul_id = cfg.get_node_soul_id()
    if node_soul_id and node_soul_id ~= soul_id then
      ngx.log(ngx.WARN, "[vault_auth] Falsche soul_id – Node gesperrt soul_id=", soul_id)
      return nil
    end

    -- Gate-Soul-Binding: Gate-Token muss zur selben soul_id gehören
    local gate_token = ngx.var.cookie_sys_gate or ""
    if #gate_token == 64 and gate_token:match("^[a-fA-F0-9]+$") then
      local sessions = ngx.shared.gate_sessions
      if sessions then
        local bound = sessions:get("gs:" .. gate_token)
        if bound and bound ~= "" and bound ~= soul_id then
          ngx.log(ngx.WARN, "[vault_auth] Gate soul mismatch: gate=", bound, " cert=", soul_id)
          return nil
        end
      end
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

  ngx.ctx.via_soul_cert = true
  return soul_id
end

-- ── 2. Service-Token prüfen + Vault-Status ────────────────────────────────────

local function check_service_token(token)
  -- Soul-Cert-Format ausschließen (enthält Punkt)
  if token:find(".", 1, true) then return nil end

  local souls_dir = "/var/lib/sys/souls"
  local handle = io.popen("ls " .. souls_dir .. " 2>/dev/null")
  if not handle then return nil end

  local found_id       = nil
  local found_perms    = nil
  local found_key      = ""
  local found_actor    = nil
  -- verified: fehlt das Feld (Tokens von vor diesem Feature) → true (Bestandsschutz).
  -- Explizit false (neue Tokens bis zur ersten verify_identity-Challenge) → gate greift.
  local found_verified = true

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
          -- Ablaufdatum prüfen (0 = permanent, kein Ablauf)
          if type(svc.expires_at) ~= "number" or svc.expires_at == 0 or ngx.now() < svc.expires_at then
            found_id       = dir
            found_perms    = svc.permissions
            found_verified = (svc.verified ~= false)
            found_actor    = svc.name
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
    -- Keine aktive Session: persistenten vault_key_hex verwenden wenn vorhanden.
    -- Kein Fehler bei leerem Key — unverschlüsselte Souls brauchen keinen Key.
    -- api_serve.lua gibt 403 "encrypted" zurück falls die Datei doch verschlüsselt ist.
    vault_key = load_persisted_key(found_id)
  else
    local expires_at
    expires_at, vault_key = parse_session(val)
    if expires_at and expires_at > 0 and ngx.now() >= expires_at then
      sessions:delete(found_id)
      vault_key = load_persisted_key(found_id)
    elseif vault_key == "" then
      vault_key = load_persisted_key(found_id)
    end
  end

  ngx.ctx.soul_id             = found_id
  ngx.ctx.vault_key           = vault_key
  ngx.ctx.via_webhook         = true
  ngx.ctx.service_permissions = found_perms
  ngx.ctx.service_verified    = found_verified
  ngx.ctx.service_token       = token
  ngx.ctx.service_actor       = found_actor
  return found_id
end

-- ── 3. pol_access_token prüfen (bezahlte externe Agenten) ────────────────────

local function check_pol_access_token(token)
  if #token ~= 48 or not token:match("^[0-9a-fA-F]+$") or token:find(".", 1, true) then
    return nil
  end

  local tdata = pol_check.check(token)
  if not tdata or not tdata.soul_id then return nil end

  local soul_id = tdata.soul_id
  local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
  if not soul_id:match(UUID_PAT) then return nil end

  -- Amortisierung aktiv + vault_key_hex laden
  local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local cf = io.open(ctx_path, "r")
  if not cf then return nil end
  local raw_ctx = cf:read("*a"); cf:close()
  local ok_c, ctx = pcall(cjson.decode, raw_ctx)
  if not ok_c or type(ctx) ~= "table" then return nil end

  local amort = ctx.amortization
  if type(amort) ~= "table" or amort.enabled ~= true then return nil end

  -- Nur GET erlaubt, nur Media/Context-Pfade (kein /api/soul, kein /api/context PUT)
  -- Ausnahme: genehmigte Agent-Tools per POST (z.B. soul_maturity)
  local uri    = ngx.var.uri
  local method = ngx.req.get_method()
  local ALLOWED_PREFIXES = {
    "/api/vault/audio", "/api/vault/images", "/api/vault/video",
    "/api/vault/context", "/api/vault/profile/",
    -- vault_shared: nur lesend — Upload (POST /api/vault/shared) bleibt owner-only,
    -- diese Prüfung greift ohnehin nur für GET-Requests (siehe unten).
    "/api/vault/shared-list", "/api/vault/shared-mcp", "/api/vault/shared-view/",
  }
  local PAID_AGENT_TOOLS = { soul_maturity = true }
  local path_ok = false

  -- Agent-Tool-Aufrufe: Whitelist prüfen
  local agent_tool = uri:match("^/api/agent/tool/([a-z][a-z0-9_]+)$")
  if agent_tool and PAID_AGENT_TOOLS[agent_tool] and (method == "POST" or method == "GET") then
    path_ok = true
  end

  -- Vault-Pfade: nur GET
  if not path_ok and method == "GET" then
    for _, pfx in ipairs(ALLOWED_PREFIXES) do
      if uri:sub(1, #pfx) == pfx then path_ok = true; break end
    end
  end

  if not path_ok then
    ngx.header["Content-Type"]  = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.status = 403
    ngx.say('{"error":"paid_agent_restricted","message":"Zahlende Agenten dürfen nur GET auf Vault-Media/Context-Pfade oder genehmigte Agent-Tools zugreifen."}')
    return ngx.exit(403)
  end

  local vault_key = (type(ctx.vault_key_hex) == "string" and #ctx.vault_key_hex == 64)
                    and ctx.vault_key_hex or ""

  ngx.ctx.soul_id        = soul_id
  ngx.ctx.vault_key      = vault_key
  ngx.ctx.is_paid_agent  = true
  return soul_id
end

-- ── 4. verify_token: "vt:{48hex}" — Kurzzeit-Auth für /verify QR-Flow ─────────

local function check_verify_token(tok)
  local vt = tok:match("^vt:([a-f0-9]+)$")
  if not vt or #vt ~= 48 then return nil end
  -- Cache-Check
  local vc = ngx.shared.verify_cache
  local sid = vc and vc:get("vt:" .. vt)
  -- Datei-Fallback wenn Cache leer (z.B. nach Reload)
  if not sid then
    local f = io.open("/var/lib/sys/verify/vt_" .. vt, "r")
    if f then sid = f:read("*a"); f:close() end
  end
  if not sid or sid == "" then return nil end
  local ctx_path = "/var/lib/sys/souls/" .. sid .. "/api_context.json"
  local cf = io.open(ctx_path, "r")
  local vault_key = ""
  if cf then
    local raw = cf:read("*a"); cf:close()
    local ok_j, ctx = pcall(cjson.decode, raw)
    if ok_j and type(ctx) == "table" and type(ctx.vault_key_hex) == "string"
       and #ctx.vault_key_hex == 64 then
      vault_key = ctx.vault_key_hex
    end
  end
  ngx.ctx.soul_id   = sid
  ngx.ctx.vault_key = vault_key
  return sid
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
  if not check_verify_token(token) then
  if not check_pol_access_token(token) then
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
  end
end

-- ── Unverifizierte Service-Tokens: nur der Verify-Flow ist erlaubt ───────────
-- Neue OAuth-Tokens (ChatGPT, Mistral, Claude...) müssen einmalig eine
-- verify_identity-Challenge durchlaufen, bevor sie auf Soul-Inhalte zugreifen
-- dürfen. Bestandsschutz für ältere Tokens über found_verified-Default=true.
if ngx.ctx.service_verified == false then
  local VERIFY_ALLOWED = {
    ["/api/verify/challenge"] = true,
    ["/api/verify/status"]    = true,
    ["/api/verify/complete"]  = true,
  }
  if not VERIFY_ALLOWED[ngx.var.uri] then
    ngx.header["Content-Type"]  = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.status = 403
    ngx.say('{"error":"verification_required","message":"Dieser Zugang muss erst einmalig bestaetigt werden. Rufe verify_identity auf und warte bis verified=true."}')
    return ngx.exit(403)
  end
end

-- ── Activity-Log: wer hat geschrieben ─────────────────────────────────────────
-- Verbundene Clients (ChatGPT, Mistral, ...) über ihren Service-Token-Namen,
-- der Owner selbst (soul_cert, z.B. via SYS-Web-App) als "Owner". Nicht erfasst:
-- pol_access_token (zahlende externe Agenten, ohnehin stark eingeschränkt) und
-- verify_token (kein Schreibzugriff im relevanten Sinn). Siehe activity_log.lua.
if ngx.req.get_method() ~= "GET" and (ngx.ctx.service_token or ngx.ctx.via_soul_cert) then
  local actor = ngx.ctx.service_token and ngx.ctx.service_actor or "Owner"
  require("activity_log").record(ngx.ctx.soul_id, actor, ngx.req.get_method(), ngx.var.uri)
end
