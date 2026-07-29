-- /etc/openresty/lua/node_config.lua
-- GET/PUT /api/node-config
-- Node-weite Einstellungen (multi_hoster, eu_consumer_rights, autonomous_agent),
-- nur für den Node-Owner (Single-Hoster: die eine Soul; Multi-Hoster: first_soul_id).
--
-- Auth: Soul-Cert-Bearer (Single-Hoster) ODER X-Soul-Admin-Token + X-Soul-Id
-- (Multi-Hoster) — in beiden Fällen muss die Soul zusätzlich cfg.get_node_owner_id()
-- entsprechen. Anders als set_master.lua (wo jede Soul ihren EIGENEN Key rotieren
-- darf) sind diese Felder node-weit — nur der Owner darf sie ändern.

local cjson = require("cjson.safe")
local cfg   = require("config_reader")

local CONFIG_DIR    = "/var/lib/sys/config/"
local MASTER_PATH_GLOBAL = "/var/lib/sys/config/master.json"

local function get_master_path()
  if type(cfg.get_master_path) == "function" then return cfg.get_master_path() end
  return MASTER_PATH_GLOBAL
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- ── Auth: node_owner_id ermitteln + verifizieren ──────────────────────────────
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local owner_id = cfg.get_node_owner_id()
local authed   = false

if owner_id then
  -- 1. Soul-Cert-Bearer (Node-Owner in JEDEM Modus — nicht auf Single-Hoster
  -- beschränkt: bearer_soul_id == owner_id ist bereits die eigentliche Prüfung.
  -- Aktiven Key wie soul_auth.lua ermitteln (per-Soul-Key bevorzugt, sonst
  -- global) — vorher war hier hart cfg.get_master_key() verdrahtet, was in
  -- Multi-Hoster ohnehin nie gepasst hätte, daher der frühere Mode-Ausschluss.
  local auth_bearer  = ngx.req.get_headers()["authorization"] or ""
  local bearer_token = auth_bearer:match("^[Bb]earer%s+(.+)$")
  if bearer_token then
    local dot = bearer_token:find(".", 1, true)
    if dot then
      local bearer_soul_id = bearer_token:sub(1, dot - 1)
      local bearer_cert    = bearer_token:sub(dot + 1)
      if bearer_soul_id == owner_id and bearer_cert ~= "" then
        local hmac_m        = require("hmac_helper")
        local per_soul_key  = cfg.get_soul_master_key(owner_id)
        local akey          = (per_soul_key and per_soul_key ~= "") and per_soul_key or cfg.get_master_key()
        for v = 0, 20 do
          if hmac_m.cert_for_soul(akey, bearer_soul_id, v) == bearer_cert then
            authed = true; break
          end
        end
      end
    end
  end

  -- 2. X-Soul-Admin-Token + X-Soul-Id (Multi-Hoster: first_soul_id)
  if not authed and cfg.get_multi_hoster() then
    local soul_admin_token = ngx.req.get_headers()["x-soul-admin-token"] or ""
    local soul_id_header   = ngx.req.get_headers()["x-soul-id"]          or ""
    if soul_id_header:match(UUID_PAT) and soul_id_header == owner_id
       and cfg.validate_soul_admin_token(soul_id_header, soul_admin_token) then
      authed = true
    end
  end
end

if ngx.req.get_method() == "GET" then
  ngx.say(cjson.encode({
    multi_hoster       = cfg.get_multi_hoster() == true,
    eu_consumer_rights  = (function()
      local f = io.open(CONFIG_DIR .. "eu_consumer_rights", "r")
      if not f then return false end
      local v = f:read("*a"); f:close()
      return v ~= "false"
    end)(),
    autonomous_agent    = (function()
      local f = io.open(CONFIG_DIR .. "autonomous_agent", "r")
      if not f then return not cfg.get_multi_hoster() end
      local v = f:read("*a"); f:close()
      return v ~= "false"
    end)(),
    is_node_owner       = authed,
    soul_count          = cfg.count_souls(),
  }))
  return
end

if ngx.req.get_method() ~= "PUT" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

if not authed then
  ngx.status = 403
  ngx.say('{"error":"forbidden","message":"Nur der Node-Owner kann diese Einstellungen ändern"}')
  return
end

local new_cert, new_cert_version

ngx.req.read_body()
local raw = ngx.req.get_body_data()
local ok, body = pcall(cjson.decode, raw or "")
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"invalid_json"}')
  return
end

-- ── eu_consumer_rights ────────────────────────────────────────────────────────
-- Beide Flag-Dateien werden von init.sh als root angelegt — falls eine davon
-- (Alt-Install oder manueller Fix) noch root:root ist, kann www-data (dieser
-- Prozess) sie nicht überschreiben; io.open("w") schlägt dann lautlos fehl.
-- chown NACH dem Schreiben ist best-effort (www-data kann eine root-Datei
-- nicht chownen) — der eigentliche Fix ist, dass init.sh sie von Anfang an
-- www-data-owned anlegt (siehe init.sh).
if type(body.eu_consumer_rights) == "boolean" then
  os.execute("mkdir -p " .. CONFIG_DIR)
  local f = io.open(CONFIG_DIR .. "eu_consumer_rights", "w")
  if f then
    f:write(tostring(body.eu_consumer_rights)); f:close()
    os.execute("chmod 644 " .. CONFIG_DIR .. "eu_consumer_rights")
    os.execute("chown www-data:www-data " .. CONFIG_DIR .. "eu_consumer_rights 2>/dev/null || true")
  end
end

-- ── autonomous_agent ───────────────────────────────────────────────────────────
if type(body.autonomous_agent) == "boolean" then
  os.execute("mkdir -p " .. CONFIG_DIR)
  local f = io.open(CONFIG_DIR .. "autonomous_agent", "w")
  if f then
    f:write(tostring(body.autonomous_agent)); f:close()
    os.execute("chmod 644 " .. CONFIG_DIR .. "autonomous_agent")
    os.execute("chown www-data:www-data " .. CONFIG_DIR .. "autonomous_agent 2>/dev/null || true")
  end
end

-- ── multi_hoster ───────────────────────────────────────────────────────────────
if type(body.multi_hoster) == "boolean" then
  local currently_multi = cfg.get_multi_hoster()
  if body.multi_hoster == false and currently_multi == true then
    local soul_count = cfg.count_souls()
    if soul_count > 1 then
      ngx.status = 409
      ngx.say(cjson.encode({
        error   = "soul_count_too_high",
        message = "Wechsel zu Single-Hoster nur möglich wenn genau eine Soul übrig ist (aktuell " .. soul_count .. ").",
        soul_count = soul_count,
      }))
      return
    end
  end

  local mpath = get_master_path()
  local existing = {}
  local ef = io.open(mpath, "r")
  if ef then
    local er = ef:read("*a"); ef:close()
    local eok, edata = pcall(cjson.decode, er)
    if eok and type(edata) == "table" then existing = edata end
  end

  existing.multi_hoster = body.multi_hoster
  -- Beim Umschalten auf Multi-Hoster: bestehende node_soul_id als first_soul_id
  -- weiterleben lassen, damit die bereits vorhandene Soul Owner bleibt.
  if body.multi_hoster == true and (not existing.first_soul_id or existing.first_soul_id == "")
     and type(existing.node_soul_id) == "string" and existing.node_soul_id ~= "" then
    existing.first_soul_id = existing.node_soul_id
  end
  -- Umgekehrte Richtung: beim Umschalten auf Single-Hoster muss node_soul_id
  -- gesetzt sein, sonst findet get_node_owner_id() (Single-Hoster-Zweig liest
  -- node_soul_id, nicht first_soul_id) niemanden mehr — isNodeOwner würde für
  -- die tatsächliche Owner-Soul plötzlich false werden. Der PUT-Guard oben
  -- garantiert an dieser Stelle bereits soul_count == 1, also ist first_soul_id
  -- eindeutig die verbleibende Soul.
  if body.multi_hoster == false and (not existing.node_soul_id or existing.node_soul_id == "")
     and type(existing.first_soul_id) == "string" and existing.first_soul_id ~= "" then
    existing.node_soul_id = existing.first_soul_id
  end

  os.execute("mkdir -p /var/lib/sys/config")
  local wf, werr = io.open(mpath, "w")
  if not wf then
    ngx.log(ngx.ERR, "[node_config] Schreibfehler: ", werr)
    ngx.status = 500
    ngx.say('{"error":"write_failed"}')
    return
  end
  wf:write(cjson.encode(existing)); wf:close()
  os.execute("chmod 600 " .. mpath)
  os.execute("chown www-data:www-data " .. mpath .. " 2>/dev/null || true")

  if mpath ~= MASTER_PATH_GLOBAL then
    local gf = io.open(MASTER_PATH_GLOBAL, "w")
    if gf then
      gf:write(cjson.encode(existing)); gf:close()
      os.execute("chmod 600 " .. MASTER_PATH_GLOBAL)
      os.execute("chown www-data:www-data " .. MASTER_PATH_GLOBAL .. " 2>/dev/null || true")
    end
  end

  cfg.invalidate_master_cache()

  -- Owner-Cert sofort auf den neuen Modus umstellen: Single-Hoster signiert mit
  -- dem globalen master_key, Multi-Hoster (falls vorhanden) mit dem per-Soul-Key
  -- (soul_admin.json) — derselbe Fallback wie gate_auth.lua/soul_cert.lua, damit
  -- der neue Cert überall konsistent validiert. Ohne das bleibt der im Browser
  -- gecachte alte Cert nach dem Wechsel ungültig (anderer Signierschlüssel) und
  -- sperrt den Owner aus eigener Session aus, bis er manuell neu importiert.
  do
    local hmac_m = require("hmac_helper")
    local new_active_key = cfg.get_master_key()
    if body.multi_hoster then
      local psk = cfg.get_soul_master_key(owner_id)
      if psk and psk ~= "" then new_active_key = psk end
    end

    local ctx_path = "/var/lib/sys/souls/" .. owner_id .. "/api_context.json"
    local ctx = {}
    local cf = io.open(ctx_path, "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local cok, cparsed = pcall(cjson.decode, raw)
      if cok and type(cparsed) == "table" then ctx = cparsed end
    end
    local old_version = hmac_m.read_cert_version(owner_id)
    new_cert_version = old_version + 1
    new_cert = hmac_m.cert_for_soul(new_active_key, owner_id, new_cert_version)
    ctx.cert_version = new_cert_version
    -- soul_cert_version ist das Feld, das hmac_helper.read_cert_version()
    -- zuerst prüft (siehe soul_rotate_cert.lua) — synchron halten, sonst
    -- liefert read_cert_version() bis zum nächsten pushToServer() die
    -- falsche Version zurück.
    ctx.soul_cert_version = new_cert_version

    os.execute("mkdir -p /var/lib/sys/souls/" .. owner_id)
    local wc = io.open(ctx_path, "w")
    if wc then
      wc:write(cjson.encode(ctx)); wc:close()
      os.execute("chown www-data:www-data " .. ctx_path .. " 2>/dev/null || true")
    end
  end
end

if new_cert then
  ngx.say(cjson.encode({ ok = true, new_cert = new_cert, new_cert_version = new_cert_version, owner_soul_id = owner_id }))
else
  ngx.say(cjson.encode({ ok = true }))
end
