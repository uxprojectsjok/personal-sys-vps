-- /etc/openresty/lua/set_master.lua
-- POST /api/set-master
-- Auth: X-Admin-Token: adm_<64hex>  (KEIN soul_cert — bewusst, auch bei Key-Rotation erreichbar)
-- Body: { "soul_master_key": "sys_<64hex>", "anthropic_key": "sk-ant-..." }
-- Rotiert master.json: alten Key → prev + Grace-Period 48h
-- Generierung des neuen Keys IMMER im Browser via crypto.getRandomValues — nie vom Server.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── Admin-Token validieren (global oder per-soul) ─────────────────────────────
local admin_token      = ngx.req.get_headers()["x-admin-token"]      or ""
local soul_admin_token = ngx.req.get_headers()["x-soul-admin-token"] or ""
local soul_id_header   = ngx.req.get_headers()["x-soul-id"]          or ""
local is_soul_admin    = false

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"

-- ── 1. Soul-Cert Bearer Auth (Single-Hoster: soul owner = admin) ──────────────
local soul_cert_auth = false
local auth_bearer    = ngx.req.get_headers()["authorization"] or ""
local bearer_token   = auth_bearer:match("^[Bb]earer%s+(.+)$")
if bearer_token then
  local dot = bearer_token:find(".", 1, true)
  if dot then
    local bearer_soul_id = bearer_token:sub(1, dot - 1)
    local bearer_cert    = bearer_token:sub(dot + 1)
    if bearer_soul_id:match(UUID_PAT) and bearer_cert ~= "" then
      local mf = io.open("/var/lib/sys/config/master.json", "r")
      if mf then
        local mr = mf:read("*a"); mf:close()
        local mok, mdata = pcall(cjson.decode, mr)
        if mok and type(mdata) == "table" and not mdata.multi_hoster
           and type(mdata.node_soul_id) == "string"
           and mdata.node_soul_id == bearer_soul_id then
          local hmac_m   = require("hmac_helper")
          local soul_key = cfg.get_soul_master_key(bearer_soul_id)
          local akey     = (soul_key and soul_key ~= "") and soul_key or cfg.get_master_key()
          for v = 0, 20 do
            if hmac_m.cert_for_soul(akey, bearer_soul_id, v) == bearer_cert then
              soul_cert_auth = true; break
            end
          end
        end
      end
    end
  end
end

-- ── 2. Admin-Token Auth ────────────────────────────────────────────────────────
if not soul_cert_auth then
  if soul_admin_token ~= "" and soul_id_header ~= "" then
    if not soul_id_header:match(UUID_PAT) then
      ngx.status = 400
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"invalid_soul_id"}')
      return
    end
    if cfg.validate_soul_admin_token(soul_id_header, soul_admin_token) then
      -- Multi-Hoster: soul_admin.json des spezifischen Soul passt
      is_soul_admin = true
    elseif cfg.validate_admin_token(soul_admin_token) then
      -- Single-Hoster-Fallback: Browser hat irrtümlich X-Soul-Admin-Token gesetzt
      is_soul_admin = false
    else
      ngx.status = 403
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"forbidden","message":"Ungültiger Soul-Admin-Token"}')
      return
    end
  elseif not cfg.validate_admin_token(admin_token) then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"forbidden","message":"Ungültiger Admin-Token"}')
    return
  end
end

-- ── Body parsen ───────────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

local MASTER_PATH  = "/var/lib/sys/config/master.json"
local SOULS_DIR    = "/var/lib/sys/souls/"
local prev_valid_until = ""

-- ── Per-Soul-Pfad (multi-hoster) ──────────────────────────────────────────────
if is_soul_admin then
  local soul_admin_path = SOULS_DIR .. soul_id_header .. "/soul_admin.json"
  local existing_sa = {}
  local ef_sa = io.open(soul_admin_path, "r")
  if ef_sa then
    local er_sa = ef_sa:read("*a"); ef_sa:close()
    local eok_sa, edata_sa = pcall(cjson.decode, er_sa)
    if eok_sa and type(edata_sa) == "table" then existing_sa = edata_sa end
  end

  -- soul_master_key rotieren (nur in soul_admin.json)
  if type(body.soul_master_key) == "string" and body.soul_master_key ~= "" then
    local new_key = body.soul_master_key
    if not (new_key:sub(1, 4) == "sys_" and #new_key == 68
            and new_key:sub(5):match("^[0-9a-f]+$")) then
      ngx.status = 400
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"invalid_key_format","message":"soul_master_key muss sys_ + 64 Hex-Zeichen (lowercase) sein"}')
      return
    end
    if type(existing_sa.soul_master_key) == "string" and existing_sa.soul_master_key ~= "" then
      existing_sa.soul_master_key_prev = existing_sa.soul_master_key
      local until_ts = os.time() + 900
      existing_sa.prev_valid_until    = os.date("!%Y-%m-%dT%H:%M:%SZ", until_ts)
      existing_sa.prev_valid_until_ts = until_ts
      prev_valid_until                = existing_sa.prev_valid_until
    end
    existing_sa.soul_master_key = new_key
  end

  -- admin_token rotieren
  if type(body.new_admin_token) == "string" and body.new_admin_token ~= "" then
    local new_at = body.new_admin_token
    if not (new_at:sub(1, 4) == "adm_" and #new_at == 68
            and new_at:sub(5):match("^[0-9a-f]+$")) then
      ngx.status = 400
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"invalid_admin_token_format","message":"admin_token muss adm_ + 64 Hex-Zeichen (lowercase) sein"}')
      return
    end
    existing_sa.admin_token = new_at
  end

  os.execute("mkdir -p " .. SOULS_DIR .. soul_id_header)
  local wf_sa, werr_sa = io.open(soul_admin_path, "w")
  if not wf_sa then
    ngx.log(ngx.ERR, "[set_master] soul_admin Schreibfehler: ", werr_sa)
    ngx.status = 500
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"write_failed"}')
    return
  end
  wf_sa:write(cjson.encode(existing_sa)); wf_sa:close()
  os.execute("chmod 600 " .. soul_admin_path)
  os.execute("chown www-data:www-data " .. soul_admin_path .. " 2>/dev/null || true")

  ngx.header["Content-Type"]  = "application/json"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(cjson.encode({ ok = true, prev_valid_until = prev_valid_until }))
  return
end

-- ── Globaler Admin-Pfad (single-hoster / server-admin) ────────────────────────
local existing = {}
local ef = io.open(MASTER_PATH, "r")
if ef then
  local er = ef:read("*a"); ef:close()
  local eok, edata = pcall(cjson.decode, er)
  if eok and type(edata) == "table" then existing = edata end
end

-- ── soul_master_key rotieren ──────────────────────────────────────────────────
if type(body.soul_master_key) == "string" and body.soul_master_key ~= "" then
  local new_key = body.soul_master_key
  -- Format: sys_ + genau 64 Hex-Zeichen
  if not (new_key:sub(1, 4) == "sys_" and #new_key == 68
          and new_key:sub(5):match("^[0-9a-f]+$")) then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"invalid_key_format","message":"soul_master_key muss sys_ + 64 Hex-Zeichen (lowercase) sein"}')
    return
  end

  -- Alten Key als prev sichern (Grace-Period 15 Minuten)
  if type(existing.soul_master_key) == "string" and existing.soul_master_key ~= "" then
    existing.soul_master_key_prev = existing.soul_master_key
    local until_ts = os.time() + 900  -- +15 Minuten
    existing.prev_valid_until    = os.date("!%Y-%m-%dT%H:%M:%SZ", until_ts)
    existing.prev_valid_until_ts = until_ts
    prev_valid_until             = existing.prev_valid_until
  end
  existing.soul_master_key = new_key
end

-- ── new_admin_token (Rotation bei Leak) ─────────────────────────────────────
if type(body.new_admin_token) == "string" and body.new_admin_token ~= "" then
  local new_at = body.new_admin_token
  if not (new_at:sub(1, 4) == "adm_" and #new_at == 68
          and new_at:sub(5):match("^[0-9a-f]+$")) then
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"invalid_admin_token_format","message":"admin_token muss adm_ + 64 Hex-Zeichen (lowercase) sein"}')
    return
  end
  existing.admin_token = new_at
end

-- ── anthropic_key (Master-Fallback für alle Souls ohne eigenen Key) ───────────
if type(body.anthropic_key) == "string" then
  if body.anthropic_key == "" then
    existing.anthropic_key = ""
  elseif body.anthropic_key:sub(1, 7) == "sk-ant-" then
    existing.anthropic_key = body.anthropic_key
  else
    ngx.status = 400
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"invalid_anthropic_key","message":"Key muss mit sk-ant- beginnen oder leer sein"}')
    return
  end
end

-- ── Schreiben ──────────────────────────────────────────────────────────────────
os.execute("mkdir -p /var/lib/sys/config")
local wf, werr = io.open(MASTER_PATH, "w")
if not wf then
  ngx.log(ngx.ERR, "[set_master] Schreibfehler: ", werr)
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"write_failed"}')
  return
end
wf:write(cjson.encode(existing)); wf:close()
os.execute("chmod 600 " .. MASTER_PATH)
os.execute("chown www-data:www-data " .. MASTER_PATH .. " 2>/dev/null || true")

-- Cache invalidieren
cfg.invalidate_master_cache()

-- ── Antwort ───────────────────────────────────────────────────────────────────
ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  ok               = true,
  prev_valid_until = prev_valid_until,  -- leer wenn kein Key rotiert wurde
}))
