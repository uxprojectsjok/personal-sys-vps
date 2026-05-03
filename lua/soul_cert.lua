-- /etc/openresty/lua/soul_cert.lua
-- POST /api/soul-cert  {"soul_id":"...", "cert_version": 0, "proof": "<current_cert>"}
-- cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id [+ ":" + cert_version]).hex().slice(0, 32)
--
-- Single-Soul-Node: Dieser Knoten akzeptiert genau eine Soul.
-- Die erste Soul die sich registriert wird als Node-Owner in master.json gespeichert.
-- Alle anderen soul_ids werden dauerhaft abgewiesen.

local cjson      = require("cjson.safe")
local cfg        = require("config_reader")
local master_key = cfg.get_master_key()

local MASTER_PATH_GLOBAL = "/var/lib/sys/config/master.json"

local function get_master_path()
  if type(cfg.get_master_path) == "function" then return cfg.get_master_path() end
  return MASTER_PATH_GLOBAL
end

local function read_master()
  local path = get_master_path()
  local f = io.open(path, "r")
  if not f and path ~= MASTER_PATH_GLOBAL then
    f = io.open(MASTER_PATH_GLOBAL, "r")
  end
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw or "")
  return (ok and type(data) == "table") and data or nil
end

if not master_key or master_key == "" then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"SOUL_MASTER_KEY nicht konfiguriert"}')
  return
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body or body == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id erforderlich"}')
  return
end

local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" or type(data.soul_id) ~= "string" or #data.soul_id < 1 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"soul_id erforderlich"}')
  return
end

local soul_id      = data.soul_id
local cert_version = tonumber(data.cert_version) or 0
local proof        = (type(data.proof) == "string" and #data.proof >= 20) and data.proof or nil

-- UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

local hmac = require("hmac_helper")

-- ── Single-Soul-Lock ──────────────────────────────────────────────────────────
-- Sobald eine Soul registriert ist, wird ihr soul_id in master.json gesperrt.
-- Jede andere soul_id wird abgewiesen — Ein Knoten, eine Soul.
local master_data = read_master() or {}
local node_soul_id = master_data.node_soul_id

if node_soul_id and node_soul_id ~= "" and node_soul_id ~= soul_id then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"node_locked","message":"Dieser Knoten gehört bereits einer Soul. Ein Knoten, eine Soul."}')
  return
end

-- Prüfen ob Soul bereits auf dem Server existiert
local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")

if cf then
  cf:close()
  -- Bestehende Soul → proof erforderlich
  if not proof then
    ngx.status = 401
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"proof_required","message":"Für bestehende Souls ist proof (soul_cert) erforderlich."}')
    return
  end

  -- Alle cert_versions 0..20 prüfen — aktueller Key + vorheriger Key (Grace-Period)
  local prev_key = cfg.get_master_key_prev()
  local valid = false
  for v = 0, 20 do
    if hmac.cert_for_soul(master_key, soul_id, v) == proof then
      valid = true; break
    end
    if prev_key and prev_key ~= "" then
      if hmac.cert_for_soul(prev_key, soul_id, v) == proof then
        valid = true; break
      end
    end
  end

  if not valid then
    ngx.status = 401
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"invalid_proof","message":"soul_cert Nachweis ungültig. Nur der Inhaber dieser Soul kann einen Cert abrufen."}')
    return
  end
end

-- Cert ausstellen (immer mit aktuellem Key)
local cert = hmac.cert_for_soul(master_key, soul_id, cert_version)

-- ── First-Setup: neue Soul + noch kein admin_token → einmalig generieren ──────
-- Tritt nur auf einer frischen Instanz auf (master.json hat noch kein admin_token).
-- Der Token wird genau einmal im Response mitgeschickt und danach nie wieder.
local first_setup_token = nil
if not cf then  -- cf ist nil → neue Soul (kein api_context.json gefunden)
  -- Node-Owner sperren: soul_id dauerhaft in master.json verankern
  if not node_soul_id or node_soul_id == "" then
    master_data.node_soul_id = soul_id
    local mpath = get_master_path()
    os.execute("mkdir -p /var/lib/sys/config")
    local lf = io.open(mpath, "w")
    if lf then
      lf:write(cjson.encode(master_data)); lf:close()
      os.execute("chmod 600 " .. mpath)
      os.execute("chown www-data:www-data " .. mpath .. " 2>/dev/null || true")
      cfg.invalidate_master_cache()
    end
    -- Global-Fallback sync (Abwärtskompatibilität mit älteren Lua-Skripten)
    if mpath ~= MASTER_PATH_GLOBAL then
      local gf = io.open(MASTER_PATH_GLOBAL, "w")
      if gf then
        gf:write(cjson.encode(master_data)); gf:close()
        os.execute("chmod 600 " .. MASTER_PATH_GLOBAL)
        os.execute("chown www-data:www-data " .. MASTER_PATH_GLOBAL .. " 2>/dev/null || true")
      end
    end
  end

  local master = read_master()
  if not master or type(master.admin_token) ~= "string" or master.admin_token == "" then
    -- Zufälligen admin_token aus /dev/urandom generieren
    local rnd = io.open("/dev/urandom", "rb")
    if rnd then
      local bytes = rnd:read(32); rnd:close()
      if bytes and #bytes == 32 then
        local hex = ""
        for i = 1, 32 do hex = hex .. string.format("%02x", bytes:byte(i)) end
        first_setup_token = "adm_" .. hex

        -- In master.json persistieren (domain-spezifisch + global)
        local existing = master or {}
        existing.admin_token = first_setup_token
        local mpath = get_master_path()
        os.execute("mkdir -p /var/lib/sys/config")
        local wf = io.open(mpath, "w")
        if wf then
          wf:write(cjson.encode(existing)); wf:close()
          os.execute("chmod 600 " .. mpath)
          os.execute("chown www-data:www-data " .. mpath .. " 2>/dev/null || true")
          cfg.invalidate_master_cache()
        end
        -- Global-Fallback sync
        if mpath ~= MASTER_PATH_GLOBAL then
          local gf = io.open(MASTER_PATH_GLOBAL, "w")
          if gf then
            gf:write(cjson.encode(existing)); gf:close()
            os.execute("chmod 600 " .. MASTER_PATH_GLOBAL)
            os.execute("chown www-data:www-data " .. MASTER_PATH_GLOBAL .. " 2>/dev/null || true")
          end
        end
      end
    end
  end
end

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
if first_setup_token then
  ngx.say(cjson.encode({ cert = cert, first_setup = true, admin_token = first_setup_token }))
else
  ngx.say('{"cert":"' .. cert .. '"}')
end
