-- /etc/openresty/lua/gate_auth.lua
-- POST /api/gate-auth
-- Body: { "password": "...", "cert": "..." }
-- Zweifaktor-Gate: Passwort + Soul-Cert (immer erforderlich sobald Soul existiert).
-- Single-hoster: Cert gegen node_soul_id geprüft.
-- Multi-hoster:  Cert gegen alle registrierten Souls geprüft — Zugang nur mit eigenem Cert.
-- Gate-Token wird an die validierte soul_id gebunden (gs: Key in shared dict).

local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local hmac  = require("hmac_helper")

local MASTER_PATH_GLOBAL = "/var/lib/sys/config/master.json"

-- Gleiches Muster wie is_public_node() in soul_amortization.lua/soul_pay_x402.lua —
-- Default bleibt offen für Altinstallationen ohne die Datei (bisheriges Verhalten:
-- Invite-Token erlaubt Neuregistrierung). Ein Multi-Hoster-Betreiber, der Souls nur
-- selbst extern anlegt und den Node ausschließlich als Access-Point für die eigenen
-- Souls betreibt, kann Neuregistrierung hierüber hart abschalten — Login mit einem
-- bereits bestehenden Soul-Cert bleibt davon unberührt.
local function is_self_registration_open()
  local f = io.open("/var/lib/sys/config/self_registration", "r")
  if not f then return true end
  local v = f:read("*a"); f:close()
  return v ~= "false"
end

local function read_master_fresh()
  local path = (type(cfg.get_master_path) == "function") and cfg.get_master_path()
               or MASTER_PATH_GLOBAL
  local f = io.open(path, "r")
  if not f and path ~= MASTER_PATH_GLOBAL then
    f = io.open(MASTER_PATH_GLOBAL, "r")
  end
  if not f then return nil end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw or "")
  return (ok and type(data) == "table") and data or nil
end

ngx.req.read_body()
local body = ngx.req.get_body_data()

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not body or body == "" then
  ngx.status = 400; ngx.say('{"error":"body_required"}'); return
end

local ok, data = pcall(cjson.decode, body)
if not ok or type(data) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
end

local password = type(data.password) == "string" and data.password or ""
local cert     = type(data.cert)     == "string" and data.cert     or ""

if #password < 1 then
  ngx.status = 400; ngx.say('{"error":"password_required"}'); return
end

local master = read_master_fresh()
if not master then
  ngx.status = 503
  ngx.say('{"error":"node_not_configured","message":"Konfiguration nicht gefunden."}')
  return
end

local stored_hash = type(master.access_password_hash) == "string" and master.access_password_hash or ""
if stored_hash == "" then
  ngx.status = 503
  ngx.say('{"error":"gate_not_configured","message":"Kein Zugangspasswort konfiguriert. init.sh erneut ausführen."}')
  return
end

-- ── Passwort prüfen ────────────────────────────────────────────────────────────
local master_key    = cfg.get_master_key()
local computed_hash = hmac.sign(master_key, "gate_pw:" .. password)

if computed_hash ~= stored_hash then
  ngx.sleep(0.5)
  ngx.status = 401
  ngx.say('{"error":"invalid_credentials","message":"Ungültiges Passwort."}')
  return
end

-- ── Cert-Pflicht: Single-Hoster (node_soul_id) oder Multi-Hoster ──────────────
local node_soul_id  = type(master.node_soul_id) == "string" and master.node_soul_id or ""
local multi_hoster  = cfg.get_multi_hoster()
local bound_soul_id = ""   -- wird nach Cert-Validation gesetzt

local souls_exist = false
do
  local h = io.popen("ls /var/lib/sys/souls/ 2>/dev/null")
  if h then
    for d in h:lines() do
      if d:match("^[a-zA-Z0-9%-]+$") then souls_exist = true; break end
    end
    h:close()
  end
end

if souls_exist then
  -- Cert ist immer Pflicht sobald Souls existieren
  if cert == "" then
    ngx.status = 401
    ngx.say('{"error":"cert_required","message":"Soul-Cert erforderlich.","soul_registered":true}')
    return
  end

  local prev_key = cfg.get_master_key_prev()

  if not multi_hoster and node_soul_id ~= "" then
    -- ── Single-Hoster: Cert gegen den einen registrierten Soul ────────────────
    local cert_valid = false
    for v = 0, 20 do
      if hmac.cert_for_soul(master_key, node_soul_id, v) == cert then
        cert_valid = true; break
      end
      if prev_key and prev_key ~= "" then
        if hmac.cert_for_soul(prev_key, node_soul_id, v) == cert then
          cert_valid = true; break
        end
      end
    end
    if not cert_valid then
      ngx.sleep(0.5)
      ngx.status = 401
      ngx.say('{"error":"invalid_cert","message":"Ungültiger Soul-Cert."}')
      return
    end
    bound_soul_id = node_soul_id

  else
    -- ── Multi-Hoster: Cert gegen alle registrierten Souls prüfen ─────────────
    local handle = io.popen("ls /var/lib/sys/souls/ 2>/dev/null")
    if handle then
      for dir in handle:lines() do
        if dir:match("^[a-zA-Z0-9%-]+$") and #dir <= 64 then
          -- Per-Soul-Key (Multi-Hoster) hat Vorrang
          local per_soul_key = cfg.get_soul_master_key(dir)
          local active_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or master_key
          local prev_active  = (per_soul_key and per_soul_key ~= "")
                               and cfg.get_soul_master_key_prev(dir) or prev_key
          for v = 0, 20 do
            if hmac.cert_for_soul(active_key, dir, v) == cert then
              bound_soul_id = dir; break
            end
            if prev_active and prev_active ~= "" then
              if hmac.cert_for_soul(prev_active, dir, v) == cert then
                bound_soul_id = dir; break
              end
            end
          end
          if bound_soul_id ~= "" then break end
        end
      end
      handle:close()
    end
    if bound_soul_id == "" then
      -- Kein Soul-Cert match → Invite-Token prüfen (nur wenn Neuregistrierung erlaubt ist)
      local invite_tok = is_self_registration_open()
        and (type(master.invite_token) == "string" and master.invite_token or "")
        or ""
      if invite_tok ~= "" and cert == invite_tok then
        -- Gültiger Einladungscode → Gate-Zugang ohne Soul-Binding (Neuregistrierung)
        ngx.log(ngx.INFO, "[gate_auth] Invite-Token Login akzeptiert")
        -- bound_soul_id bleibt "" → kein gs:-Eintrag, Neuzugang kann Soul registrieren
      else
        ngx.sleep(0.5)
        ngx.status = 401
        ngx.say('{"error":"invalid_cert","message":"Ungültiger Soul-Cert oder Einladungscode."}')
        return
      end
    end
  end
end

-- ── Gate-Token generieren ──────────────────────────────────────────────────────
local rnd = io.open("/dev/urandom", "rb")
if not rnd then
  ngx.status = 500; ngx.say('{"error":"entropy_unavailable"}'); return
end
local bytes = rnd:read(32); rnd:close()
if not bytes or #bytes < 32 then
  ngx.status = 500; ngx.say('{"error":"entropy_read_failed"}'); return
end

local gate_token = ""
for i = 1, 32 do gate_token = gate_token .. string.format("%02x", bytes:byte(i)) end

local TTL     = 28800
local expires = ngx.now() + TTL
local sessions = ngx.shared.gate_sessions
if sessions then
  -- Ablaufzeit speichern
  sessions:set("g:"  .. gate_token, tostring(expires), TTL)
  -- soul_id an Gate-Token binden (Schlüssel "gs:")
  if bound_soul_id ~= "" then
    sessions:set("gs:" .. gate_token, bound_soul_id, TTL)
  end
end

ngx.header["Set-Cookie"] = "sys_gate=" .. gate_token
  .. "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" .. TTL

ngx.status = 200
if bound_soul_id ~= "" then
  ngx.say('{"ok":true,"soul_id":"' .. bound_soul_id .. '"}')
elseif multi_hoster and souls_exist then
  -- Invite-Token Login: kein soul_id, aber invite_login Flag für Frontend
  ngx.say('{"ok":true,"invite_login":true}')
else
  ngx.say('{"ok":true}')
end
