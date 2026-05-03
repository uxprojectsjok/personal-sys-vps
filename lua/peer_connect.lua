-- /etc/openresty/lua/peer_connect.lua
-- POST /api/peer/connect
-- Body: { soul_id, cert, domain, target_soul_id, alias?, permissions? }
--
-- Bidirektionaler Handshake: Remote-Soul A meldet sich bei diesem VPS.
-- Ablauf:
--   1. Validierung + SSRF-Schutz
--   2. Callback an ${domain}/api/peer/verify → bestätigt Identität
--   3. Lokale Ziel-Soul bestimmen (single: node_soul_id, multi: target_soul_id)
--   4. peer_token als api_grant generieren
--   5. incoming_request in soul_connections.json schreiben
--   6. Antwort: { ok, peer_token, soul_id: local_soul_id, domain }

local cjson  = require "cjson.safe"
local http   = require "resty.http"
local rnd    = require "resty.random"
local rstr   = require "resty.string"
local cfg    = require "config_reader"

local SOULS_DIR = "/var/lib/sys/souls/"

ngx.header["Content-Type"]                 = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204
  return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say(cjson.encode({ error = "Method not allowed" }))
  return
end

local function valid_domain(d)
  if type(d) ~= "string" or d == "" then return false end
  if d:sub(1, 8) ~= "https://" then return false end
  local host = d:sub(9):match("^([^/]+)") or ""
  if not host:match("^[a-zA-Z0-9][a-zA-Z0-9%.%-]+(:[0-9]+)?$") then return false end
  local bare = host:match("^([^:]+)")
  if bare:match("^localhost") or bare:match("^127%.") or bare:match("^10%.") or
     bare:match("^192%.168%.") or bare:match("^172%.1[6-9]%.") or
     bare:match("^172%.2[0-9]%.") or bare:match("^172%.3[0-1]%.") then return false end
  return true
end

local function soul_exists(sid)
  for _, path in ipairs({
    SOULS_DIR .. sid .. "/api_context.json",
    SOULS_DIR .. sid .. "/sys.md",
  }) do
    local f = io.open(path, "r")
    if f then f:close(); return true end
  end
  return false
end

local function ea(v)
  local t = type(v) == "table" and v or {}
  return #t > 0 and t or cjson.empty_array
end

-- ── Body lesen ────────────────────────────────────────────────────────────────

ngx.req.read_body()
local body = ngx.req.get_body_data() or "{}"
local ok, payload = pcall(cjson.decode, body)
if not ok or type(payload) ~= "table" then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "Ungültiges JSON" }))
  return
end

local remote_soul_id  = payload.soul_id
local remote_cert     = payload.cert
local remote_domain   = payload.domain
local remote_alias    = payload.alias
local req_target_sid  = payload.target_soul_id
local req_perms       = payload.permissions

-- Basis-Validierung
if type(remote_soul_id) ~= "string" or not remote_soul_id:match("^[a-zA-Z0-9_%-]+$")
   or #remote_soul_id < 8 or #remote_soul_id > 128 then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "soul_id ungültig" }))
  return
end

if type(remote_cert) ~= "string" or #remote_cert < 16 or #remote_cert > 128 then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "cert ungültig" }))
  return
end

if not valid_domain(remote_domain) then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "domain ungültig (https:// erforderlich, kein privates Netz)" }))
  return
end

local own_host = ngx.var.host or ""
if remote_domain:find(own_host, 1, true) then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "Eigene Domain" }))
  return
end

if type(remote_alias) ~= "string" or remote_alias:match("^%s*$") then
  remote_alias = remote_soul_id:sub(1, 16)
end
remote_alias = remote_alias:gsub("[%c]", ""):sub(1, 64)

local allowed_perms = { soul=true, audio=true, images=true, video=true, context_files=true }
local permissions = {}
if type(req_perms) == "table" then
  for _, p in ipairs(req_perms) do
    if allowed_perms[p] then table.insert(permissions, p) end
  end
end
if #permissions == 0 then permissions = { "soul" } end

-- ── Lokale Ziel-Soul bestimmen (single vs multi) ─────────────────────────────

local local_soul_id
local node_soul_id = cfg.get_node_soul_id()

if node_soul_id and node_soul_id ~= "" then
  -- Single-soul Node: immer die eigene Soul
  local_soul_id = node_soul_id
else
  -- Multi-soul Node: target_soul_id muss angegeben und vorhanden sein
  if type(req_target_sid) ~= "string" or not req_target_sid:match("^[a-zA-Z0-9_%-]+$")
     or #req_target_sid < 8 or #req_target_sid > 128 then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "target_soul_id erforderlich für Multi-Soul-Node" }))
    return
  end
  if not soul_exists(req_target_sid) then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "target_soul_id nicht auf diesem Node registriert" }))
    return
  end
  local_soul_id = req_target_sid
end

-- ── Callback: ${domain}/api/peer/verify ──────────────────────────────────────

local verify_url = remote_domain .. "/api/peer/verify"
                   .. "?soul_id=" .. ngx.escape_uri(remote_soul_id)
                   .. "&cert="    .. ngx.escape_uri(remote_cert)

local httpc = http.new()
httpc:set_timeout(6000)
local vres, verr = httpc:request_uri(verify_url, { method = "GET" })

if not vres then
  ngx.log(ngx.WARN, "[peer_connect] verify callback failed: ", verr or "?")
  ngx.status = 502
  ngx.say(cjson.encode({ error = "Peer nicht erreichbar – Verify fehlgeschlagen" }))
  return
end

if vres.status ~= 200 then
  ngx.status = 401
  ngx.say(cjson.encode({ error = "Peer-Cert konnte nicht verifiziert werden" }))
  return
end

local vok, vdata = pcall(cjson.decode, vres.body or "")
if not vok or type(vdata) ~= "table" or not vdata.ok then
  ngx.status = 401
  ngx.say(cjson.encode({ error = "Peer-Cert ungültig laut Gegenseite" }))
  return
end

-- ── Peer-Token generieren + als api_grant in local_soul_id speichern ─────────

local peer_token = "peer_" .. rstr.to_hex(rnd.bytes(20))
local grant_id   = "pg_"   .. rstr.to_hex(rnd.bytes(4))
local now        = math.floor(ngx.now())
local peer_label = "peer:" .. remote_soul_id:sub(1, 16)

local pub_cfg_path = SOULS_DIR .. local_soul_id .. "/vault_public/config.json"
local pub_config   = { v=1, enabled=false, public_files={}, api_grants={}, soul_grants={} }
local pf = io.open(pub_cfg_path, "r")
if pf then
  local raw = pf:read("*a"); pf:close()
  local dok, d = pcall(cjson.decode, raw)
  if dok and type(d) == "table" then
    pub_config = d
    if type(pub_config.public_files) ~= "table" then pub_config.public_files = {} end
    if type(pub_config.api_grants)   ~= "table" then pub_config.api_grants   = {} end
    if type(pub_config.soul_grants)  ~= "table" then pub_config.soul_grants  = {} end
  end
end

local found_grant = false
for i, g in ipairs(pub_config.api_grants) do
  if g.label == peer_label then
    pub_config.api_grants[i].token   = peer_token
    pub_config.api_grants[i].scope   = permissions
    pub_config.api_grants[i].updated = now
    grant_id    = g.id
    found_grant = true
    break
  end
end
if not found_grant then
  table.insert(pub_config.api_grants, {
    id      = grant_id,
    label   = peer_label,
    scope   = permissions,
    token   = peer_token,
    created = now,
  })
end

pub_config.enabled    = true
pub_config.updated_at = now

os.execute("mkdir -p " .. SOULS_DIR .. local_soul_id .. "/vault_public")
local wf = io.open(pub_cfg_path, "w")
if not wf then
  ngx.status = 500
  ngx.say(cjson.encode({ error = "Peer-Token konnte nicht gespeichert werden" }))
  return
end
wf:write(cjson.encode({
  v            = pub_config.v or 1,
  enabled      = true,
  updated_at   = now,
  public_files = ea(pub_config.public_files),
  api_grants   = ea(pub_config.api_grants),
  soul_grants  = ea(pub_config.soul_grants),
}))
wf:close()

-- ── incoming_request in soul_connections.json von local_soul_id eintragen ────

local conn_path = SOULS_DIR .. local_soul_id .. "/soul_connections.json"
local conn_data = { connections = {}, removed_by_peer = {}, incoming_requests = {} }
local cf = io.open(conn_path, "r")
if cf then
  local raw = cf:read("*a"); cf:close()
  local dok, d = pcall(cjson.decode, raw)
  if dok and type(d) == "table" then
    if d[1] ~= nil then
      conn_data.connections = d
    else
      conn_data.connections       = type(d.connections)       == "table" and d.connections       or {}
      conn_data.removed_by_peer   = type(d.removed_by_peer)   == "table" and d.removed_by_peer   or {}
      conn_data.incoming_requests = type(d.incoming_requests) == "table" and d.incoming_requests or {}
    end
  end
end

-- Kein incoming_request wenn die Remote-Soul bereits verbunden ist
local already_connected = false
for _, c in ipairs(conn_data.connections) do
  if c.soul_id == remote_soul_id then
    already_connected = true
    break
  end
end

if not already_connected then
  local found_req = false
  for i, r in ipairs(conn_data.incoming_requests) do
    if r.soul_id == remote_soul_id then
      conn_data.incoming_requests[i] = {
        soul_id     = remote_soul_id,
        domain      = remote_domain,
        alias       = remote_alias,
        permissions = permissions,
        grant_id    = grant_id,
        received_at = now,
      }
      found_req = true
      break
    end
  end
  if not found_req then
    table.insert(conn_data.incoming_requests, {
      soul_id     = remote_soul_id,
      domain      = remote_domain,
      alias       = remote_alias,
      permissions = permissions,
      grant_id    = grant_id,
      received_at = now,
    })
  end
end

os.execute("mkdir -p " .. SOULS_DIR .. local_soul_id)
local sf = io.open(conn_path, "w")
if sf then
  sf:write(cjson.encode({
    connections       = ea(conn_data.connections),
    removed_by_peer   = ea(conn_data.removed_by_peer),
    incoming_requests = ea(conn_data.incoming_requests),
  }))
  sf:close()
end

-- ── Antwort ───────────────────────────────────────────────────────────────────

local scheme     = ngx.var.scheme or "https"
local own_domain = scheme .. "://" .. own_host

ngx.say(cjson.encode({
  ok         = true,
  peer_token = peer_token,
  soul_id    = local_soul_id,
  domain     = own_domain,
}))
