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

local DEFAULT_MIND = require("default_mind").get()

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

-- ── Single-Soul-Lock (wird im Multi-Hoster-Modus übersprungen) ───────────────
-- Sobald eine Soul registriert ist, wird ihr soul_id in master.json gesperrt.
-- Jede andere soul_id wird abgewiesen — Ein Knoten, eine Soul.
-- Im Multi-Hoster-Modus (master.json: multi_hoster=true) entfällt der Lock.
local master_data = read_master() or {}
local node_soul_id = master_data.node_soul_id
local multi_hoster = master_data.multi_hoster == true

if not multi_hoster then
  if node_soul_id and node_soul_id ~= "" and node_soul_id ~= soul_id then
    ngx.status = 403
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"error":"node_locked","message":"Dieser Knoten gehört bereits einer Soul. Ein Knoten, eine Soul."}')
    return
  end
end

-- Prüfen ob Soul bereits auf dem Server existiert
local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")

-- Aktiven Key ermitteln: per-soul (multi-hoster) oder global
local active_key = master_key
if multi_hoster then
  local psk = cfg.get_soul_master_key(soul_id)
  if psk and psk ~= "" then active_key = psk end
end

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
  local prev_key
  if multi_hoster then
    prev_key = cfg.get_soul_master_key_prev(soul_id)
  end
  if not prev_key or prev_key == "" then prev_key = cfg.get_master_key_prev() end

  local valid = false
  for v = 0, 20 do
    if hmac.cert_for_soul(active_key, soul_id, v) == proof then
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

-- Cert ausstellen: für bestehende Souls immer die Server-cert_version verwenden,
-- nicht die vom Client angeforderte. Verhindert Cert/Version-Drift nach Rotation.
if cf then
  cert_version = hmac.read_cert_version(soul_id)
end
local cert = hmac.cert_for_soul(active_key, soul_id, cert_version)

-- ── First-Setup: neue Soul → Admin-Token + ggf. per-Soul-Key generieren ──────
local first_setup_token = nil
if not cf then  -- cf ist nil → neue Soul (kein api_context.json gefunden)

  -- mind.md sofort anlegen — unabhängig davon ob PUT /api/context später folgt
  os.execute("mkdir -p " .. SOULS_DIR .. soul_id .. "/vault/context")
  local _mind_path  = SOULS_DIR .. soul_id .. "/vault/context/mind.md"
  local _mind_check = io.open(_mind_path, "r")
  if not _mind_check then
    local _mf = io.open(_mind_path, "w")
    if _mf then _mf:write(DEFAULT_MIND); _mf:close() end
  else
    _mind_check:close()
  end

  -- shopping.md anlegen falls nicht vorhanden
  local _shop_path  = SOULS_DIR .. soul_id .. "/vault/context/shopping.md"
  local _shop_check = io.open(_shop_path, "r")
  if not _shop_check then
    local _sf = io.open(_shop_path, "w")
    if _sf then
      local _today = os.date("%Y-%m-%d")
      local _month = os.date("%Y-%m")
      local _year  = os.date("%Y")
      _sf:write("---\nlast_updated: " .. _today .. "\nlocation_source: sys.md\n---\n\n## Wishlist\n\n## Recent Purchases\n\n## Monthly Summary (" .. _month .. ")\n_Noch keine Einträge._\n\n## Annual Categories (" .. _year .. ")\n_Noch keine Einträge._\n")
      _sf:close()
      os.execute("chown www-data:www-data " .. _shop_path .. " 2>/dev/null || true")
    end
  else
    _shop_check:close()
  end

  -- health.md Leer-Template anlegen falls nicht vorhanden
  local _health_path  = SOULS_DIR .. soul_id .. "/vault/context/health.md"
  local _health_check = io.open(_health_path, "r")
  if not _health_check then
    local _hf = io.open(_health_path, "w")
    if _hf then
      local _today = os.date("%Y-%m-%d")
      local _month = os.date("%Y-%m")
      _hf:write("---\nsource: placeholder\nlast_sync: " .. _today .. "\n---\n\n## This Week\n- Resting HR: \226\128\147\n- Sleep: \226\128\147\n- Steps: \226\128\147\n- Active days: \226\128\147\n\n## Monthly Summary (" .. _month .. ")\n- Resting HR: \226\128\147\n- Sleep: \226\128\147\n- Active days: \226\128\147\n\n## Food Log\n\n## Annual Journal\n")
      _hf:close()
      os.execute("chown www-data:www-data " .. _health_path .. " 2>/dev/null || true")
    end
  else
    _health_check:close()
  end

  -- earnings.md Leer-Template anlegen falls nicht vorhanden
  local _earn_path  = SOULS_DIR .. soul_id .. "/vault/context/earnings.md"
  local _earn_check = io.open(_earn_path, "r")
  if not _earn_check then
    local _ef = io.open(_earn_path, "w")
    if _ef then
      local _today = os.date("%Y-%m-%d")
      local _month = os.date("%Y-%m")
      local _year  = os.date("%Y")
      _ef:write("---\nlast_updated: " .. _today .. "\ncurrency: EUR\n---\n\n## Income (" .. _month .. ")\n_No entries yet._\n\n## Annual Summary (" .. _year .. ")\n_No entries yet._\n\n## Platforms & Sources\n\n## Notes\n")
      _ef:close()
      os.execute("chown www-data:www-data " .. _earn_path .. " 2>/dev/null || true")
    end
  else
    _earn_check:close()
  end

  -- agent.md anlegen falls nicht vorhanden oder leer
  local _agent_path  = SOULS_DIR .. soul_id .. "/vault/context/agent.md"
  local _agent_check = io.open(_agent_path, "r")
  local _agent_needs_write = true
  if _agent_check then
    local _existing = _agent_check:read("*a"); _agent_check:close()
    if _existing and #_existing > 10 then _agent_needs_write = false end
  end
  if _agent_needs_write then
    local _af = io.open(_agent_path, "w")
    if _af then
      _af:write("# SYS Agent Queue\n<!-- Tasks werden von Claude AI via MCP hier eingetragen. -->\n<!-- Format: - [ ] task  →  Agent holt sie beim nächsten Cron-Lauf ab -->\n\n## Pending\n\n\n\n## Done\n")
      _af:close()
      os.execute("chown www-data:www-data " .. _agent_path .. " 2>/dev/null || true")
    end
  end

  -- prompts.md via MCP generieren (fire-and-forget nach dem Response)
  ngx.timer.at(0, function()
    local ok, http = pcall(require, "resty.http")
    if not ok then return end
    local httpc = http.new()
    httpc:set_timeout(10000)
    httpc:request_uri("http://127.0.0.1:3098/internal/generate-prompts", {
      method  = "POST",
      headers = { ["Content-Type"] = "application/json" },
      body    = "{}",
    })
  end)

  if multi_hoster then
    -- Multi-Hoster: jede neue Soul bekommt eigenen Master-Key + Admin-Token
    -- Beides wird in souls/{soul_id}/soul_admin.json gespeichert (nie in master.json).
    -- Nur generieren wenn soul_admin.json noch NICHT existiert (verhindert Key-Wechsel bei
    -- wiederholtem refreshCert vor dem ersten pushToServer).
    local soul_admin_path = SOULS_DIR .. soul_id .. "/soul_admin.json"
    local existing_sa = io.open(soul_admin_path, "r")
    if existing_sa then
      existing_sa:close()
      -- soul_admin.json existiert bereits → per-soul Key wurde schon generiert.
      -- active_key wurde oben bereits via cfg.get_soul_master_key gesetzt.
      -- first_setup_token bleibt nil (kein erneutes Setup nötig).
    else
      local rnd = io.open("/dev/urandom", "rb")
      if rnd then
        local bytes_key = rnd:read(32)
        local bytes_adm = rnd:read(32)
        rnd:close()
        if bytes_key and bytes_adm and #bytes_key == 32 and #bytes_adm == 32 then
          local key_hex = ""
          local adm_hex = ""
          for i = 1, 32 do key_hex = key_hex .. string.format("%02x", bytes_key:byte(i)) end
          for i = 1, 32 do adm_hex = adm_hex .. string.format("%02x", bytes_adm:byte(i)) end

          local soul_master_key_full = "sys_" .. key_hex
          first_setup_token = "adm_" .. adm_hex

          os.execute("mkdir -p " .. SOULS_DIR .. soul_id)
          os.execute("mkdir -p " .. SOULS_DIR .. soul_id .. "/vault_shared && chmod 750 " .. SOULS_DIR .. soul_id .. "/vault_shared && chown www-data:www-data " .. SOULS_DIR .. soul_id .. "/vault_shared")
          local saf = io.open(soul_admin_path, "w")
          if saf then
            saf:write(cjson.encode({
              admin_token      = first_setup_token,
              soul_master_key  = soul_master_key_full,
            }))
            saf:close()
            os.execute("chmod 600 " .. soul_admin_path)
            os.execute("chown www-data:www-data " .. soul_admin_path .. " 2>/dev/null || true")
            -- Cert neu ableiten mit per-soul Key (nur wenn Datei erfolgreich geschrieben)
            active_key = soul_master_key_full:sub(5)
            cert = hmac.cert_for_soul(active_key, soul_id, cert_version)

            -- Invite-Token nach erfolgreicher Registrierung rotieren
            local rnd_inv = io.open("/dev/urandom", "rb")
            if rnd_inv then
              local inv_bytes = rnd_inv:read(16); rnd_inv:close()
              if inv_bytes and #inv_bytes == 16 then
                local inv_hex = "inv_"
                for ii = 1, 16 do inv_hex = inv_hex .. string.format("%02x", inv_bytes:byte(ii)) end
                local mpath_inv = get_master_path()
                local inv_rf = io.open(mpath_inv, "r")
                local inv_data = {}
                if inv_rf then
                  local inv_raw = inv_rf:read("*a"); inv_rf:close()
                  local ok_inv, d_inv = pcall(cjson.decode, inv_raw)
                  if ok_inv and type(d_inv) == "table" then inv_data = d_inv end
                end
                inv_data.invite_token = inv_hex
                local inv_wf = io.open(mpath_inv, "w")
                if inv_wf then
                  inv_wf:write(cjson.encode(inv_data)); inv_wf:close()
                  os.execute("chmod 600 " .. mpath_inv)
                  os.execute("chown www-data:www-data " .. mpath_inv .. " 2>/dev/null || true")
                  cfg.invalidate_master_cache()
                end
                if mpath_inv ~= MASTER_PATH_GLOBAL then
                  local g_inv_rf = io.open(MASTER_PATH_GLOBAL, "r")
                  local g_inv_data = {}
                  if g_inv_rf then
                    local g_inv_raw = g_inv_rf:read("*a"); g_inv_rf:close()
                    local g_ok_inv, g_d_inv = pcall(cjson.decode, g_inv_raw)
                    if g_ok_inv and type(g_d_inv) == "table" then g_inv_data = g_d_inv end
                  end
                  g_inv_data.invite_token = inv_hex
                  local g_inv_wf = io.open(MASTER_PATH_GLOBAL, "w")
                  if g_inv_wf then
                    g_inv_wf:write(cjson.encode(g_inv_data)); g_inv_wf:close()
                    os.execute("chmod 600 " .. MASTER_PATH_GLOBAL)
                    os.execute("chown www-data:www-data " .. MASTER_PATH_GLOBAL .. " 2>/dev/null || true")
                  end
                end
              end
            end
          end
        end
      end
    end

  else
    -- Single-Hoster: Node-Owner sperren
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
      -- Einmaliger admin_token für den Single-Hoster-Owner
      local rnd = io.open("/dev/urandom", "rb")
      if rnd then
        local bytes = rnd:read(32); rnd:close()
        if bytes and #bytes == 32 then
          local hex = ""
          for i = 1, 32 do hex = hex .. string.format("%02x", bytes:byte(i)) end
          first_setup_token = "adm_" .. hex

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
end

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
if first_setup_token then
  ngx.say(cjson.encode({ cert = cert, cert_version = cert_version, first_setup = true, admin_token = first_setup_token, is_soul_admin = multi_hoster }))
else
  ngx.say(cjson.encode({ cert = cert, cert_version = cert_version }))
end
