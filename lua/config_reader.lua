-- /etc/openresty/lua/config_reader.lua
-- Zentrales Key-Management: liest master.json und soul config.json.
-- Schlüssel-Hierarchie:
--   soul config.json → /var/lib/sys/config/master.json → os.getenv() (Fallback)
--
-- Caching: master.json wird 60s im ngx.shared.verify_cache gehalten
-- (vorhandenes shared dict, kein neuer nginx.conf-Eintrag nötig).

local cjson_safe = require("cjson.safe")
local M = {}

local MASTER_PATH     = "/var/lib/sys/config/master.json"
local MASTER_DIR_BASE = "/var/lib/sys/config/"
local CACHE_TTL       = 60  -- Sekunden

-- ── Datei → Lua-Tabelle ───────────────────────────────────────────────────────
local function read_json_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  if not raw or raw == "" then return nil end
  local ok, data = pcall(cjson_safe.decode, raw)
  if ok and type(data) == "table" then return data end
  return nil
end

-- ── master.json lesen (domain-aware, mit ngx.shared-Cache) ───────────────────
-- Sucht erst /var/lib/sys/config/{host}/master.json, Fallback auf globale Datei.
-- Ermöglicht mehrere Domains auf einer OpenResty-Instanz mit isolierten Keys.
local function read_master()
  local host  = (ngx.var and ngx.var.host) or ""
  local ckey  = "cfg:master:" .. host
  local cache = ngx.shared.verify_cache

  if cache then
    local raw = cache:get(ckey)
    if raw then
      local ok, data = pcall(cjson_safe.decode, raw)
      if ok and type(data) == "table" then return data end
    end
  end

  -- Domain-spezifischer Pfad zuerst (für parallele VPS-Domains)
  local data
  if host ~= "" then
    data = read_json_file(MASTER_DIR_BASE .. host .. "/master.json")
  end
  -- Globaler Fallback
  if not data then
    data = read_json_file(MASTER_PATH)
  end

  if data and cache then
    pcall(function() cache:set(ckey, cjson_safe.encode(data), CACHE_TTL) end)
  end
  return data
end

-- ── Korrekten master.json-Pfad zurückgeben (domain-aware) ────────────────────
-- Lua-Skripte die master.json schreiben, verwenden diesen Pfad statt einem
-- hardcodierten globalen Pfad. Gibt domain-spezifischen Pfad zurück wenn
-- die Datei dort existiert, sonst globalen Fallback.
function M.get_master_path()
  local host = (ngx.var and ngx.var.host) or ""
  if host ~= "" then
    local domain_path = MASTER_DIR_BASE .. host .. "/master.json"
    local f = io.open(domain_path, "r")
    if f then f:close(); return domain_path end
  end
  return MASTER_PATH
end

-- ── Cache nach Schreibzugriff invalidieren ────────────────────────────────────
function M.invalidate_master_cache()
  local host  = (ngx.var and ngx.var.host) or ""
  local cache = ngx.shared.verify_cache
  if cache then
    cache:delete("cfg:master:" .. host)
    cache:delete("cfg:master:")   -- globaler Fallback-Key
    cache:delete("cfg:master")    -- Kompatibilität mit alten Keys
  end
end

-- ── soul config.json lesen ────────────────────────────────────────────────────
local function read_soul_config(soul_id)
  if not soul_id then return nil end
  -- Nur sichere Zeichen (UUID-Format + alphanumerisch), kein Path-Traversal
  if not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then return nil end
  return read_json_file("/var/lib/sys/souls/" .. soul_id .. "/config.json")
end

-- ── SOUL_MASTER_KEY: master.json → env ───────────────────────────────────────
-- Gibt rohen 64-Hex-String zurück (sys_-Prefix wird entfernt).
function M.get_master_key()
  local m = read_master()
  if m then
    local k = m.soul_master_key
    if type(k) == "string" and k:sub(1, 4) == "sys_" and #k == 68 then
      return k:sub(5)  -- strip prefix → roher 64-Hex-Key für HMAC
    end
  end
  return os.getenv("SOUL_MASTER_KEY") or ""
end

-- ── Vorheriger SOUL_MASTER_KEY (Grace-Period) ─────────────────────────────────
-- Gibt prev_key (64hex) zurück wenn Grace-Period noch aktiv, sonst nil.
function M.get_master_key_prev()
  local m = read_master()
  if not m then return nil end
  local k  = m.soul_master_key_prev
  local ts = m.prev_valid_until_ts  -- Unix epoch (number)
  if type(k) ~= "string" or k == "" then return nil end
  if k:sub(1, 4) ~= "sys_" or #k ~= 68 then return nil end
  if type(ts) ~= "number" or ts <= 0 or ngx.now() > ts then return nil end
  return k:sub(5)  -- strip prefix
end

-- ── ANTHROPIC_API_KEY: soul config → master.json → env ───────────────────────
function M.get_anthropic_key(soul_id)
  -- 1. Soul-eigener Key (optional)
  if soul_id and soul_id ~= "" then
    local sc = read_soul_config(soul_id)
    if sc and type(sc.anthropic_key) == "string"
       and sc.anthropic_key:sub(1, 7) == "sk-ant-" then
      return sc.anthropic_key
    end
  end
  -- 2. Master-Key aus Datei
  local m = read_master()
  if m and type(m.anthropic_key) == "string"
     and m.anthropic_key:sub(1, 7) == "sk-ant-" then
    return m.anthropic_key
  end
  -- 3. Env-Fallback (Abwärtskompatibilität)
  return os.getenv("ANTHROPIC_API_KEY") or ""
end

-- ── Bevorzugtes Modell: soul config → master.json → default ──────────────────
local ALLOWED_MODELS = {
  ["claude-opus-4-6"]    = true,
  ["claude-sonnet-4-6"]  = true,
  ["claude-haiku-4-5-20251001"] = true,
  ["claude-sonnet-4-5"]  = true,
}
function M.get_model(soul_id)
  if soul_id and soul_id ~= "" then
    local sc = read_soul_config(soul_id)
    if sc and type(sc.model) == "string" and ALLOWED_MODELS[sc.model] then
      return sc.model
    end
  end
  local m = read_master()
  if m and type(m.model) == "string" and ALLOWED_MODELS[m.model] then
    return m.model
  end
  return nil  -- nil = Browser bestimmt das Modell
end

-- ── ADMIN_TOKEN validieren ─────────────────────────────────────────────────────
function M.validate_admin_token(token)
  if type(token) ~= "string" or token:sub(1, 4) ~= "adm_" or #token ~= 68 then
    return false
  end
  local m = read_master()
  if not m or type(m.admin_token) ~= "string" then return false end
  return m.admin_token == token
end

-- ── Soul hat eigenen Key? (für UI-Status) ────────────────────────────────────
function M.soul_has_own_key(soul_id)
  local sc = read_soul_config(soul_id)
  if not sc then return false end
  return type(sc.anthropic_key) == "string" and sc.anthropic_key:sub(1, 7) == "sk-ant-"
end

-- ── Registrierte Node-Soul-ID lesen ──────────────────────────────────────
function M.get_node_soul_id()
  local m = read_master()
  if not m then return nil end
  local id = m.node_soul_id
  if type(id) == "string" and id ~= "" then return id end
  return nil
end

return M
