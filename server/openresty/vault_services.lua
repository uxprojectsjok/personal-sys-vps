-- /etc/openresty/lua/vault_services.lua
-- GET    /api/vault/services           → Liste aller autorisierten Dienste
-- POST   /api/vault/services           → Neuen Dienst hinzufügen
-- DELETE /api/vault/services/{token}   → Dienst widerrufen
--
-- Auth: soul-cert only (via soul_auth.lua access phase)
-- Speicherort: /var/lib/sys/souls/{soul_id}/authorized_services.json

local cjson    = require("cjson.safe")
local soul_id  = ngx.ctx.soul_id
local method   = ngx.req.get_method()
local uri      = ngx.var.uri
local svc_path = "/var/lib/sys/souls/" .. soul_id .. "/authorized_services.json"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

local function load_services()
  local f = io.open(svc_path, "r")
  if not f then return {} end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if not ok or type(data) ~= "table" then return {} end
  return data
end

local function save_services(svcs)
  local soul_dir = "/var/lib/sys/souls/" .. soul_id
  os.execute("mkdir -p " .. soul_dir)
  local f = io.open(svc_path, "w")
  if not f then return false end
  f:write(cjson.encode(svcs))
  f:close()
  return true
end

-- CSPRNG: resty.random statt math.random (PRNG, vorhersagbar)
local rnd = require("resty.random")
local str = require("resty.string")
local function random_token()
  return str.to_hex(rnd.bytes(32))
end

-- ── GET /api/vault/services ───────────────────────────────────────────────────

if method == "GET" then
  local svcs = load_services()
  local list = {}
  for token, svc in pairs(svcs) do
    table.insert(list, {
      token       = token,
      name        = svc.name,
      permissions = svc.permissions,
      expires_at  = svc.expires_at or cjson.null,
      created_at  = svc.created_at
    })
  end
  -- Sort by created_at descending
  table.sort(list, function(a, b)
    return (a.created_at or 0) > (b.created_at or 0)
  end)
  ngx.say(cjson.encode({ services = list }))
  return
end

-- ── POST /api/vault/services ──────────────────────────────────────────────────

if method == "POST" then
  ngx.req.read_body()
  local body = ngx.req.get_body_data() or "{}"
  local _, payload = pcall(cjson.decode, body)
  if type(payload) ~= "table" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Invalid JSON body" }))
    return
  end

  local name = payload.name
  if type(name) ~= "string" or #name < 1 or #name > 128 then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "name required (1–128 chars)" }))
    return
  end
  -- Name-Zeichen sanitieren: nur druckbare ASCII
  name = name:gsub("[%c]", ""):sub(1, 128)

  -- Permissions validieren – akzeptiert Object {soul:true,...} (OAuth) und Array ["soul",...] (API)
  local allowed = { soul = true, audio = true, video = true, images = true, context_files = true, calendar = true, network = true }
  local permissions = {}
  if type(payload.permissions) == "table" then
    -- Object-Format: {soul: true, context_files: true, ...}
    for k, v in pairs(payload.permissions) do
      if type(k) == "string" and allowed[k] and v then
        permissions[k] = true
      end
    end
    -- Array-Format: ["soul", "context_files", ...]
    for _, p in ipairs(payload.permissions) do
      if type(p) == "string" and allowed[p] then
        permissions[p] = true
      end
    end
  end
  if not next(permissions) then
    permissions = { soul = true, context_files = true }
  end

  -- Ablaufdatum – akzeptiert expires_days (Zahl) und expires (String: "365d", "30d", "1y")
  local expires_at = cjson.null
  local function parse_expires(val)
    if type(val) == "number" and val > 0 and val <= 3650 then
      return math.floor(ngx.now()) + (val * 86400)
    end
    if type(val) == "string" then
      local n, unit = val:match("^(%d+)([dDyYmM]?)$")
      n = tonumber(n)
      if n and n > 0 then
        if unit == "y" or unit == "Y" then n = n * 365 end
        if unit == "m" or unit == "M" then n = n * 30 end
        if n <= 3650 then return math.floor(ngx.now()) + (n * 86400) end
      end
    end
    return nil
  end
  local exp = parse_expires(payload.expires_days) or parse_expires(payload.expires)
  if exp then expires_at = exp end

  local token = random_token()
  local svcs  = load_services()

  svcs[token] = {
    name        = name,
    permissions = permissions,
    expires_at  = (expires_at == cjson.null) and nil or expires_at,
    created_at  = math.floor(ngx.now())
  }

  if not save_services(svcs) then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Failed to save service" }))
    return
  end

  -- api_context.json: nur enabled=true setzen – keine anderen Felder anfassen
  local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local cf = io.open(ctx_path, "r")
  if cf then
    local raw = cf:read("*a"); cf:close()
    local ok_j, ctx = pcall(cjson.decode, raw)
    if ok_j and type(ctx) == "table" and not ctx.enabled then
      ctx.enabled = true
      local wf = io.open(ctx_path, "w")
      if wf then wf:write(cjson.encode(ctx)); wf:close() end
    end
  end

  ngx.say(cjson.encode({
    ok          = true,
    token       = token,
    soul_id     = soul_id,
    name        = name,
    permissions = permissions,
    expires_at  = expires_at
  }))
  return
end

-- ── DELETE /api/vault/services/{token} ────────────────────────────────────────

if method == "DELETE" then
  -- Token-Regex: nur Hex-Zeichen (64-char Token = 32 Bytes Hex)
  local token = uri:match("^/api/vault/services/([a-f0-9]+)$")
  if not token or token == "" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Token required in path: DELETE /api/vault/services/{token}" }))
    return
  end

  local svcs = load_services()
  if not svcs[token] then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Service not found" }))
    return
  end

  svcs[token] = nil
  save_services(svcs)
  ngx.say(cjson.encode({ ok = true }))
  return
end

ngx.status = 405
ngx.say(cjson.encode({ error = "Method not allowed" }))
