-- /etc/openresty/lua/soul_connections.lua
-- GET    /api/vault/connections             → eigene Verbindungen + Peer-Removed-Notifications
-- GET    /api/vault/connections/network     → Soul-Inhalt verbundener Souls lesen
-- GET    /api/vault/connections/test/{id}   → Soul erreichbar prüfen
-- POST   /api/vault/connections             → Verbindung hinzufügen
-- DELETE /api/vault/connections/{soul_id}   → Verbindung trennen (Peer-Notification schreiben)
-- DELETE /api/vault/connections/ack/{soul_id} → Peer-Removed-Notification quittieren
--
-- Auth: soul-cert only (via soul_auth.lua access phase)
-- Speicherort: /var/lib/sys/souls/{soul_id}/soul_connections.json

local cjson     = require("cjson.safe")
local soul_id   = ngx.ctx.soul_id
local method    = ngx.req.get_method()
local uri       = ngx.var.uri
local SOULS_DIR = "/var/lib/sys/souls/"
local conn_path = SOULS_DIR .. soul_id .. "/soul_connections.json"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function load_data()
  local f = io.open(conn_path, "r")
  if not f then return { connections = {}, removed_by_peer = {}, incoming_requests = {} } end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if not ok or type(data) ~= "table" then
    return { connections = {}, removed_by_peer = {}, incoming_requests = {} }
  end
  -- Backward-compat: altes Format war ein reines Array
  if data[1] ~= nil then
    return { connections = data, removed_by_peer = {}, incoming_requests = {} }
  end
  return {
    connections       = type(data.connections)       == "table" and data.connections       or {},
    removed_by_peer   = type(data.removed_by_peer)   == "table" and data.removed_by_peer   or {},
    incoming_requests = type(data.incoming_requests) == "table" and data.incoming_requests or {},
  }
end

local function save_data(d)
  os.execute("mkdir -p " .. SOULS_DIR .. soul_id)
  local f = io.open(conn_path, "w")
  if not f then return false end
  f:write(cjson.encode({
    connections       = #d.connections       > 0 and d.connections       or cjson.empty_array,
    removed_by_peer   = #d.removed_by_peer   > 0 and d.removed_by_peer   or cjson.empty_array,
    incoming_requests = #d.incoming_requests > 0 and d.incoming_requests or cjson.empty_array,
  }))
  f:close()
  return true
end

-- Schreibt Peer-Removed-Notification in die connections-Datei einer ANDEREN Soul.
-- Zeigt den Alias, den die Gegenseite (target_id) für die trennende Soul (soul_id)
-- eingetragen hat – nicht den umgekehrten Alias.
local function write_peer_removed(target_id)
  local target_path = SOULS_DIR .. target_id .. "/soul_connections.json"
  local f = io.open(target_path, "r")
  local tdata = { connections = {}, removed_by_peer = {} }
  if f then
    local raw = f:read("*a"); f:close()
    local ok, parsed = pcall(cjson.decode, raw)
    if ok and type(parsed) == "table" then
      if parsed[1] ~= nil then
        tdata.connections = parsed
      else
        tdata.connections     = type(parsed.connections)     == "table" and parsed.connections     or {}
        tdata.removed_by_peer = type(parsed.removed_by_peer) == "table" and parsed.removed_by_peer or {}
      end
    end
  end
  -- Doppelte Notification vermeiden
  for _, n in ipairs(tdata.removed_by_peer) do
    if n.soul_id == soul_id then return end
  end
  -- Alias: wie nennt die Gegenseite (target_id) die trennende Soul (soul_id)?
  -- Fallback: kurze soul_id wenn keine Verbindung in Gegenrichtung existiert.
  local display_alias = soul_id:sub(1, 8) .. "…"
  for _, conn in ipairs(tdata.connections) do
    if conn.soul_id == soul_id then
      display_alias = conn.alias
      break
    end
  end
  table.insert(tdata.removed_by_peer, {
    soul_id    = soul_id,
    alias      = display_alias,
    removed_at = math.floor(ngx.now())
  })
  local wf = io.open(target_path, "w")
  if wf then wf:write(cjson.encode(tdata)); wf:close() end
end

-- Legt/aktualisiert einen soul_grant in der vault_public/config.json der ZIEL-Soul.
-- Wird nach POST /api/vault/connections aufgerufen (best effort, kein Fatal bei Fehler).
local function grant_add(target_id, grantor_id, scope)
  local cfg_path = SOULS_DIR .. target_id .. "/vault_public/config.json"
  local cfg = { v=1, enabled=false, public_files={}, api_grants={}, soul_grants={} }
  local f = io.open(cfg_path, "r")
  if f then
    local raw = f:read("*a"); f:close()
    local ok2, parsed = pcall(cjson.decode, raw)
    if ok2 and type(parsed) == "table" then
      cfg = parsed
      if type(cfg.public_files) ~= "table" then cfg.public_files = {} end
      if type(cfg.api_grants)   ~= "table" then cfg.api_grants   = {} end
      if type(cfg.soul_grants)  ~= "table" then cfg.soul_grants  = {} end
    end
  end
  -- vault_public aktivieren wenn erster Grant angelegt wird
  cfg.enabled = true
  -- Upsert: bestehendes Update oder neues einfügen
  local found = false
  for i, g in ipairs(cfg.soul_grants) do
    if g.soul_id == grantor_id then
      cfg.soul_grants[i].scope   = scope
      cfg.soul_grants[i].updated = math.floor(ngx.now())
      found = true; break
    end
  end
  if not found then
    table.insert(cfg.soul_grants, {
      id      = "sc_" .. grantor_id:sub(1, 8),
      label   = grantor_id:sub(1, 8),
      soul_id = grantor_id,
      scope   = scope,
      created = math.floor(ngx.now())
    })
  end
  local function ea(v) local t = type(v)=="table" and v or {}; return #t>0 and t or cjson.empty_array end
  os.execute("mkdir -p " .. SOULS_DIR .. target_id .. "/vault_public")
  local wf = io.open(cfg_path, "w")
  if not wf then return end
  wf:write(cjson.encode({
    v            = cfg.v or 1,
    enabled      = true,
    updated_at   = math.floor(ngx.now()),
    public_files = ea(cfg.public_files),
    api_grants   = ea(cfg.api_grants),
    soul_grants  = ea(cfg.soul_grants),
  }))
  wf:close()
end

-- Entfernt soul_grant aus der vault_public/config.json der ZIEL-Soul.
-- Wird nach DELETE /api/vault/connections aufgerufen (best effort).
local function grant_remove(target_id, grantor_id)
  local cfg_path = SOULS_DIR .. target_id .. "/vault_public/config.json"
  local f = io.open(cfg_path, "r")
  if not f then return end
  local raw = f:read("*a"); f:close()
  local ok2, cfg = pcall(cjson.decode, raw)
  if not ok2 or type(cfg) ~= "table" then return end
  if type(cfg.soul_grants) ~= "table" then return end
  local new_sg = {}
  for _, g in ipairs(cfg.soul_grants) do
    if g.soul_id ~= grantor_id then table.insert(new_sg, g) end
  end
  cfg.soul_grants = new_sg
  local function ea(v) local t = type(v)=="table" and v or {}; return #t>0 and t or cjson.empty_array end
  local wf = io.open(cfg_path, "w")
  if not wf then return end
  wf:write(cjson.encode({
    v            = cfg.v or 1,
    enabled      = type(cfg.enabled)=="boolean" and cfg.enabled or false,
    updated_at   = math.floor(ngx.now()),
    public_files = ea(type(cfg.public_files)=="table" and cfg.public_files or {}),
    api_grants   = ea(type(cfg.api_grants)  =="table" and cfg.api_grants   or {}),
    soul_grants  = ea(cfg.soul_grants),
  }))
  wf:close()
end

-- Soul-ID: alphanumerisch + - und _, 8–128 Zeichen (UUID-Format ok)
local function valid_soul_id(id)
  return type(id) == "string"
    and #id >= 8 and #id <= 128
    and id:match("^[a-zA-Z0-9_%-]+$") ~= nil
end

-- Domain-Format: https://<hostname>(:<port>)?  — kein Trailing-Slash
-- Kein localhost/private IP (SSRF-Schutz)
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

-- Ist die Verbindung lokal (kein domain-Feld oder gleicher Host)?
local function is_local_conn(conn)
  if type(conn.domain) ~= "string" or conn.domain == "" then return true end
  local current_host = ngx.var.host or ""
  return conn.domain:find(current_host, 1, true) ~= nil
end

local function soul_exists(target_id)
  local check_paths = {
    SOULS_DIR .. target_id .. "/sys.md",
    SOULS_DIR .. target_id .. "/api_context.json",
    SOULS_DIR .. target_id .. "/authorized_services.json",
  }
  for _, path in ipairs(check_paths) do
    local f = io.open(path, "r")
    if f then f:close(); return true end
  end
  return false
end

-- ── GET /api/vault/connections/network ────────────────────────────────────────

if method == "GET" and uri == "/api/vault/connections/network" then
  local data   = load_data()
  local result = {}

  for _, conn in ipairs(data.connections) do
    -- Remote-Soul: Availability wird vom Browser per CORS geprüft
    if not is_local_conn(conn) then
      table.insert(result, {
        soul_id    = conn.soul_id,
        alias      = conn.alias,
        permissions = conn.permissions,
        domain     = conn.domain,
        external   = true,
        available  = cjson.null,  -- Browser prüft selbst
      })
    else
      -- Lokale Soul: Filesystem-Zugriff wie bisher
      local soul_path = SOULS_DIR .. conn.soul_id .. "/sys.md"
      local f = io.open(soul_path, "r")
      if f then
        local content = f:read("*a"); f:close()
        if content:sub(1, 4) == "SYS\x01" then
          local sessions   = ngx.shared.vault_sessions
          local vault_open = sessions and sessions:get(conn.soul_id) ~= nil
          table.insert(result, {
            soul_id      = conn.soul_id,
            alias        = conn.alias,
            permissions  = conn.permissions,
            available    = vault_open,
            encrypted    = true,
            soul_content = "",
          })
        else
          table.insert(result, {
            soul_id      = conn.soul_id,
            alias        = conn.alias,
            permissions  = conn.permissions,
            available    = true,
            soul_content = content:sub(1, 32768),
          })
        end
      else
        table.insert(result, {
          soul_id     = conn.soul_id,
          alias       = conn.alias,
          permissions = conn.permissions,
          available   = false,
          reason      = "not_found",
        })
      end
    end
  end

  ngx.say(cjson.encode({ ok = true, connections = result }))
  return
end

-- ── GET /api/vault/connections/test/{soul_id} ─────────────────────────────────
-- Unterstützt ?domain=https://... für Cross-Domain-Tests (Browser übernimmt)

if method == "GET" and uri:match("^/api/vault/connections/test/") then
  local target_id = uri:match("^/api/vault/connections/test/([a-zA-Z0-9_%-]+)$")
  if not target_id or not valid_soul_id(target_id) then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Ungültige Soul-ID" }))
    return
  end
  if target_id == soul_id then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Eigene Soul-ID" }))
    return
  end

  -- Cross-Domain: Test wird vom Browser übernommen
  local args   = ngx.req.get_uri_args()
  local domain = args and args.domain
  if domain and domain ~= "" then
    if not valid_domain(domain) then
      ngx.status = 400
      ngx.say(cjson.encode({ error = "Ungültige Domain (muss https:// sein)" }))
      return
    end
    ngx.say(cjson.encode({ ok = true, external = true, domain = domain }))
    return
  end

  -- Lokale Soul: Filesystem-Check wie bisher
  if not soul_exists(target_id) then
    ngx.status = 404
    ngx.say(cjson.encode({ ok = false, reason = "not_found" }))
    return
  end
  local target_conn_path = SOULS_DIR .. target_id .. "/soul_connections.json"
  local tf = io.open(target_conn_path, "r")
  local is_mutual = false
  if tf then
    local raw = tf:read("*a"); tf:close()
    local ok2, tdata = pcall(cjson.decode, raw)
    if ok2 and type(tdata) == "table" then
      local tconns = tdata.connections or (tdata[1] and tdata or {})
      for _, tc in ipairs(tconns) do
        if tc.soul_id == soul_id then is_mutual = true; break end
      end
    end
  end
  ngx.say(cjson.encode({ ok = true, found = true, mutual = is_mutual }))
  return
end

-- ── GET /api/vault/connections ────────────────────────────────────────────────

if method == "GET" then
  local data = load_data()
  -- Mutual-Status anreichern
  for _, conn in ipairs(data.connections) do
    local target_conn_path = SOULS_DIR .. conn.soul_id .. "/soul_connections.json"
    local tf = io.open(target_conn_path, "r")
    conn.mutual = false
    if tf then
      local raw = tf:read("*a"); tf:close()
      local ok2, tdata = pcall(cjson.decode, raw)
      if ok2 and type(tdata) == "table" then
        local tconns = tdata.connections or (tdata[1] and tdata or {})
        for _, tc in ipairs(tconns) do
          if tc.soul_id == soul_id then conn.mutual = true; break end
        end
      end
    end
  end
  ngx.say(cjson.encode({
    ok                = true,
    connections       = #data.connections       > 0 and data.connections       or cjson.empty_array,
    removed_by_peer   = #data.removed_by_peer   > 0 and data.removed_by_peer   or cjson.empty_array,
    incoming_requests = #data.incoming_requests > 0 and data.incoming_requests or cjson.empty_array,
  }))
  return
end

-- ── POST /api/vault/connections ───────────────────────────────────────────────

if method == "POST" then
  ngx.req.read_body()
  local body = ngx.req.get_body_data() or "{}"
  local ok, payload = pcall(cjson.decode, body)
  if not ok or type(payload) ~= "table" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Ungültiges JSON" }))
    return
  end

  local target_id = payload.soul_id
  if not valid_soul_id(target_id) then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Ungültige Soul-ID – nur a-z A-Z 0-9 _ - erlaubt" }))
    return
  end
  if target_id == soul_id then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Keine Verbindung mit der eigenen Soul möglich" }))
    return
  end

  local alias = payload.alias
  if type(alias) ~= "string" or alias:match("^%s*$") then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Alias erforderlich" }))
    return
  end
  alias = alias:gsub("[%c]", ""):sub(1, 64)

  -- Optionales domain-Feld (für Cross-Domain P2P)
  local conn_domain = ""
  if type(payload.domain) == "string" and payload.domain ~= "" then
    if not valid_domain(payload.domain) then
      ngx.status = 400
      ngx.say(cjson.encode({ error = "Ungültige Domain (muss https:// sein, kein Trailing-Slash)" }))
      return
    end
    conn_domain = payload.domain
  end

  local allowed = { soul = true, audio = true, images = true, video = true, context_files = true }
  local permissions = {}
  if type(payload.permissions) == "table" then
    for _, p in ipairs(payload.permissions) do
      if allowed[p] then table.insert(permissions, p) end
    end
  end
  if #permissions == 0 then permissions = { "soul" } end

  -- Soul-Existenz nur lokal prüfen; Remote-Souls werden nicht lokal gespeichert
  local is_remote = (conn_domain ~= "")
  if not is_remote and not soul_exists(target_id) then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Soul nicht gefunden. Vault-ID prüfen." }))
    return
  end

  local data = load_data()

  if #data.connections >= 100 then
    ngx.status = 429
    ngx.say(cjson.encode({ error = "Maximum 100 Verbindungen erreicht" }))
    return
  end

  for _, c in ipairs(data.connections) do
    if c.soul_id == target_id then
      ngx.status = 409
      ngx.say(cjson.encode({ error = "Verbindung bereits vorhanden" }))
      return
    end
  end

  -- Peer-Removed-Notification löschen falls vorhanden (re-connect)
  local new_removed = {}
  for _, n in ipairs(data.removed_by_peer) do
    if n.soul_id ~= target_id then table.insert(new_removed, n) end
  end
  data.removed_by_peer = new_removed

  local new_conn = {
    soul_id      = target_id,
    alias        = alias,
    permissions  = permissions,
    connected_at = math.floor(ngx.now())
  }
  if conn_domain ~= "" then new_conn.domain = conn_domain end

  table.insert(data.connections, new_conn)

  if not save_data(data) then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Speichern fehlgeschlagen" }))
    return
  end

  -- Soul-Grant: nur für lokale Souls automatisch anlegen
  if not is_remote then
    grant_add(target_id, soul_id, permissions)
  end

  -- Eingehende Anfrage von dieser Soul löschen falls vorhanden (Verbindung akzeptiert)
  local new_incoming = {}
  for _, r in ipairs(data.incoming_requests) do
    if r.soul_id ~= target_id then table.insert(new_incoming, r) end
  end
  data.incoming_requests = new_incoming
  save_data(data)

  -- Remote-Soul: bidirektionalen Handshake starten via /api/peer/connect
  -- soul_id (ngx.ctx) ist die authentifizierte Soul — passt für single- und multi-soul
  local peer_token = nil
  if is_remote then
    local auth  = ngx.req.get_headers()["authorization"] or ""
    local token = auth:match("^[Bb]earer%s+(.+)$") or ""
    local dot   = token:find(".", 1, true)
    local our_cert = dot and token:sub(dot + 1) or ""

    if our_cert ~= "" then
      local scheme     = ngx.var.scheme or "https"
      local our_domain = scheme .. "://" .. (ngx.var.host or "")

      local http  = require "resty.http"
      local httpc = http.new()
      httpc:set_timeout(8000)

      local cb_body = cjson.encode({
        soul_id        = soul_id,      -- authentifizierte Soul (funktioniert für single+multi)
        cert           = our_cert,
        domain         = our_domain,
        alias          = soul_id:sub(1, 16),
        permissions    = permissions,
        target_soul_id = target_id,   -- welche Soul auf dem Remote wir erreichen wollen
      })

      local cres, cerr = httpc:request_uri(conn_domain .. "/api/peer/connect", {
        method  = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body    = cb_body,
      })

      if cres and cres.status == 200 then
        local cok, cdata = pcall(cjson.decode, cres.body or "")
        if cok and type(cdata) == "table" and cdata.ok then
          peer_token = cdata.peer_token
          -- peer_token in Connection-Record speichern
          for i, c in ipairs(data.connections) do
            if c.soul_id == target_id then
              data.connections[i].peer_token = peer_token
              break
            end
          end
          save_data(data)
        end
      else
        ngx.log(ngx.WARN, "[soul_connections] peer_connect fehlgeschlagen für ", conn_domain, ": ", cerr or "?")
      end
    end
  end

  ngx.say(cjson.encode({
    ok          = true,
    soul_id     = target_id,
    domain      = conn_domain ~= "" and conn_domain or cjson.null,
    alias       = alias,
    permissions = permissions,
    peer_token  = peer_token or cjson.null,
  }))
  return
end

-- ── DELETE /api/vault/connections/incoming/{soul_id} ─────────────────────────
-- Lehnt eine eingehende Verbindungsanfrage ab (löscht incoming_request)

if method == "DELETE" and uri:match("^/api/vault/connections/incoming/") then
  local req_id = uri:match("^/api/vault/connections/incoming/([a-zA-Z0-9_%-]+)$")
  if not req_id then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Soul-ID fehlt" }))
    return
  end
  local data = load_data()
  local new_inc = {}
  for _, r in ipairs(data.incoming_requests) do
    if r.soul_id ~= req_id then table.insert(new_inc, r) end
  end
  data.incoming_requests = new_inc
  save_data(data)
  ngx.say(cjson.encode({ ok = true }))
  return
end

-- ── DELETE /api/vault/connections/ack/{soul_id} ───────────────────────────────
-- Quittiert eine Peer-Removed-Notification (dismiss)

if method == "DELETE" and uri:match("^/api/vault/connections/ack/") then
  local ack_id = uri:match("^/api/vault/connections/ack/([a-zA-Z0-9_%-]+)$")
  if not ack_id then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Soul-ID fehlt" }))
    return
  end
  local data = load_data()
  local new_removed = {}
  for _, n in ipairs(data.removed_by_peer) do
    if n.soul_id ~= ack_id then table.insert(new_removed, n) end
  end
  data.removed_by_peer = new_removed
  save_data(data)
  ngx.say(cjson.encode({ ok = true }))
  return
end

-- ── DELETE /api/vault/connections/{soul_id} ───────────────────────────────────

if method == "DELETE" then
  local target_id = uri:match("^/api/vault/connections/([a-zA-Z0-9_%-]+)$")
  if not target_id then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Soul-ID in URL erforderlich" }))
    return
  end

  local data     = load_data()
  local new_conn = {}
  local found    = false

  for _, c in ipairs(data.connections) do
    if c.soul_id ~= target_id then
      table.insert(new_conn, c)
    else
      found = true
    end
  end

  if not found then
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Verbindung nicht gefunden" }))
    return
  end

  -- Gespeicherte Connection: war sie remote?
  local was_remote = false
  for _, c in ipairs(data.connections) do
    if c.soul_id == target_id then
      was_remote = type(c.domain) == "string" and c.domain ~= ""
      break
    end
  end

  data.connections = new_conn
  save_data(data)

  -- Soul-Grant + Peer-Notification nur für lokale Souls
  if not was_remote and soul_exists(target_id) then
    grant_remove(target_id, soul_id)
    write_peer_removed(target_id)
  end

  ngx.say(cjson.encode({ ok = true }))
  return
end

ngx.status = 405
ngx.say(cjson.encode({ error = "Method not allowed" }))
