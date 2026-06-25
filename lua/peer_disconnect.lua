-- /etc/openresty/lua/peer_disconnect.lua
-- POST /api/peer/disconnect
-- Body: { soul_id, cert, domain, target_soul_id }
--
-- Wird von einem fremden Server aufgerufen wenn die Remote-Soul die Verbindung trennt.
-- Entfernt die Remote-Soul aus den Connections der lokalen Ziel-Soul und
-- schreibt eine removed_by_peer-Notification.
-- Auth: cert-Verifikation per Callback an ${domain}/api/peer/verify (wie peer_connect)

local cjson  = require "cjson.safe"
local http   = require "resty.http"
local cfg    = require "config_reader"

local SOULS_DIR = "/var/lib/sys/souls/"

ngx.header["Content-Type"]                 = "application/json"
ngx.header["Cache-Control"]               = "no-store"
ngx.header["Access-Control-Allow-Origin"] = "*"
ngx.header["Access-Control-Allow-Methods"] = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"] = "Content-Type"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say(cjson.encode({ error = "Method not allowed" })); return
end

local function valid_domain(d)
  if type(d) ~= "string" or d == "" then return false end
  if d:sub(1, 8) ~= "https://" then return false end
  local host = d:sub(9):match("^([^/]+)") or ""
  if not (host:match("^[a-zA-Z0-9][a-zA-Z0-9%.%-]+$") or
          host:match("^[a-zA-Z0-9][a-zA-Z0-9%.%-]+:[0-9]+$")) then return false end
  local bare = host:match("^([^:]+)")
  if bare:match("^localhost") or bare:match("^127%.") or bare:match("^10%.") or
     bare:match("^192%.168%.") or bare:match("^172%.1[6-9]%.") or
     bare:match("^172%.2[0-9]%.") or bare:match("^172%.3[0-1]%.") then return false end
  return true
end

local function soul_exists(sid)
  local f = io.open(SOULS_DIR .. sid .. "/api_context.json", "r")
  if f then f:close(); return true end
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
  ngx.status = 400; ngx.say(cjson.encode({ error = "Ungültiges JSON" })); return
end

local remote_soul_id = payload.soul_id
local remote_cert    = payload.cert
local remote_domain  = payload.domain
local req_target_sid = payload.target_soul_id

-- Basis-Validierung
if type(remote_soul_id) ~= "string" or not remote_soul_id:match("^[a-zA-Z0-9_%-]+$")
   or #remote_soul_id < 8 or #remote_soul_id > 128 then
  ngx.status = 400; ngx.say(cjson.encode({ error = "soul_id ungültig" })); return
end
if type(remote_cert) ~= "string" or #remote_cert < 16 or #remote_cert > 128 then
  ngx.status = 400; ngx.say(cjson.encode({ error = "cert ungültig" })); return
end
if not valid_domain(remote_domain) then
  ngx.status = 400; ngx.say(cjson.encode({ error = "domain ungültig (https:// erforderlich)" })); return
end

-- ── Lokale Ziel-Soul bestimmen ────────────────────────────────────────────────

local local_soul_id
local node_soul_id = cfg.get_node_soul_id()

if node_soul_id and node_soul_id ~= "" then
  local_soul_id = node_soul_id
else
  if type(req_target_sid) ~= "string" or not req_target_sid:match("^[a-zA-Z0-9_%-]+$")
     or #req_target_sid < 8 or #req_target_sid > 128 then
    ngx.status = 400; ngx.say(cjson.encode({ error = "target_soul_id erforderlich" })); return
  end
  if not soul_exists(req_target_sid) then
    ngx.status = 404; ngx.say(cjson.encode({ error = "target_soul_id nicht gefunden" })); return
  end
  local_soul_id = req_target_sid
end

-- ── Cert-Verifikation per Callback ───────────────────────────────────────────

local httpc = http.new()
httpc:set_timeout(6000)
local verify_url = remote_domain .. "/api/peer/verify"
                   .. "?soul_id=" .. ngx.escape_uri(remote_soul_id)
                   .. "&cert="    .. ngx.escape_uri(remote_cert)
local vres, verr = httpc:request_uri(verify_url, { method = "GET" })

if not vres then
  ngx.log(ngx.WARN, "[peer_disconnect] verify callback failed: ", verr or "?")
  ngx.status = 502; ngx.say(cjson.encode({ error = "Peer nicht erreichbar" })); return
end
if vres.status ~= 200 then
  ngx.status = 401; ngx.say(cjson.encode({ error = "Cert nicht verifizierbar" })); return
end
local vok, vdata = pcall(cjson.decode, vres.body or "")
if not vok or type(vdata) ~= "table" or not vdata.ok then
  ngx.status = 401; ngx.say(cjson.encode({ error = "Cert ungültig" })); return
end

-- ── Verbindung entfernen + removed_by_peer-Notification schreiben ────────────

local conn_path = SOULS_DIR .. local_soul_id .. "/soul_connections.json"
local f = io.open(conn_path, "r")
if not f then
  -- Soul hat keine Connections-Datei → kein Eintrag, trotzdem ok
  ngx.say(cjson.encode({ ok = true })); return
end
local raw = f:read("*a"); f:close()
local dok, d = pcall(cjson.decode, raw)
if not dok or type(d) ~= "table" then
  ngx.say(cjson.encode({ ok = true })); return
end

local connections       = type(d.connections)       == "table" and d.connections       or {}
local removed_by_peer   = type(d.removed_by_peer)   == "table" and d.removed_by_peer   or {}
local incoming_requests = type(d.incoming_requests) == "table" and d.incoming_requests or {}

-- Connection herausfiltern + Alias für Notification merken
local display_alias = remote_soul_id:sub(1, 8) .. "…"
local new_conn = {}
local found = false
for _, c in ipairs(connections) do
  if c.soul_id == remote_soul_id then
    found = true
    if c.alias then display_alias = c.alias end
  else
    table.insert(new_conn, c)
  end
end

if not found then
  ngx.say(cjson.encode({ ok = true })); return
end

-- Doppelte Notification vermeiden
local already_notified = false
for _, n in ipairs(removed_by_peer) do
  if n.soul_id == remote_soul_id then already_notified = true; break end
end
if not already_notified then
  table.insert(removed_by_peer, {
    soul_id    = remote_soul_id,
    alias      = display_alias,
    removed_at = math.floor(ngx.now()),
  })
end

-- Auch ggf. eingehende Anfrage von dieser Soul entfernen
local new_inc = {}
for _, r in ipairs(incoming_requests) do
  if r.soul_id ~= remote_soul_id then table.insert(new_inc, r) end
end

local wf = io.open(conn_path, "w")
if wf then
  wf:write(cjson.encode({
    connections       = ea(new_conn),
    removed_by_peer   = ea(removed_by_peer),
    incoming_requests = ea(new_inc),
  }))
  wf:close()
end

ngx.say(cjson.encode({ ok = true }))
