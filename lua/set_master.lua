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

-- ── Admin-Token validieren ─────────────────────────────────────────────────────
local admin_token = ngx.req.get_headers()["x-admin-token"] or ""
if not cfg.validate_admin_token(admin_token) then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"forbidden","message":"Ungültiger Admin-Token"}')
  return
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

local MASTER_PATH = "/var/lib/sys/config/master.json"

-- ── Bestehende master.json lesen ──────────────────────────────────────────────
local existing = {}
local ef = io.open(MASTER_PATH, "r")
if ef then
  local er = ef:read("*a"); ef:close()
  local eok, edata = pcall(cjson.decode, er)
  if eok and type(edata) == "table" then existing = edata end
end

local prev_valid_until = ""

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
  -- Kurz genug um Angreifer mit geleaktem Key auszusperren,
  -- lang genug damit alle offenen Browser-Sessions refreshCert() ausführen können.
  if type(existing.soul_master_key) == "string" and existing.soul_master_key ~= "" then
    existing.soul_master_key_prev = existing.soul_master_key
    local until_ts = os.time() + 900  -- +15 Minuten
    -- ISO 8601 UTC ohne externe Libraries (os.date mit "!" für UTC)
    existing.prev_valid_until    = os.date("!%Y-%m-%dT%H:%M:%SZ", until_ts)
    existing.prev_valid_until_ts = until_ts
    prev_valid_until             = existing.prev_valid_until
  end
  existing.soul_master_key = new_key
end

-- ── new_admin_token (Rotation bei Leak) ─────────────────────────────────────
if type(body.new_admin_token) == "string" and body.new_admin_token ~= "" then
  local new_at = body.new_admin_token
  -- Format: adm_ + genau 64 Hex-Zeichen (lowercase)
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
