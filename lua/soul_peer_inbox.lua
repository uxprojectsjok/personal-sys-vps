-- /etc/openresty/lua/soul_peer_inbox.lua
-- GET /api/soul/peer-inbox?days=1
-- Auth: vault_auth.lua (service-token oder soul_cert)
-- Aggregiert SOCIAL-Block-Nachrichten aller verbundenen Peers.
-- Same-Server-Peers: direkt vom Dateisystem.
-- Cross-Domain-Peers: HTTP zu peer/api/soul/social-read mit eigenem HMAC-Cert.
-- Eigene Nachrichten (outgoing) werden mit outgoing=true markiert.

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local cfg    = require("config_reader")
local hmac   = require("hmac_helper")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

local soul_id   = ngx.ctx.soul_id
local SOULS_DIR = "/var/lib/sys/souls/"
local MAGIC     = "SYS\x01"

if not soul_id then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

local args = ngx.req.get_uri_args()
local days = tonumber(args.days) or 1
if days < 1  then days = 1  end
if days > 30 then days = 30 end

-- ── Eigenes HMAC-Cert für ausgehende Peer-Anfragen ───────────────────────────
local global_key   = cfg.get_master_key()
local per_soul_key = cfg.get_soul_master_key(soul_id)
local active_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or global_key
local cv           = hmac.read_cert_version(soul_id)
local own_cert     = hmac.cert_for_soul(active_key, soul_id, cv)

-- ── Verbindungen laden ───────────────────────────────────────────────────────
local conn_path = SOULS_DIR .. soul_id .. "/soul_connections.json"
local cf = io.open(conn_path, "r")
if not cf then
  ngx.say(cjson.encode({ ok = true, messages = cjson.empty_array, peers = cjson.empty_array }))
  return
end
local raw_conn = cf:read("*a"); cf:close()
local ok_c, conn_data = pcall(cjson.decode, raw_conn)
if not ok_c or type(conn_data) ~= "table" then
  ngx.say(cjson.encode({ ok = true, messages = cjson.empty_array, peers = cjson.empty_array }))
  return
end
local connections = type(conn_data.connections) == "table" and conn_data.connections or {}

-- ── <!-- @msg ts from to content --> Parser ───────────────────────────────────
local cutoff = ngx.time() - days * 86400

local function iso_to_epoch(ts)
  local y, mo, d, h, mi, s = ts:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return nil end
  return os.time({
    year  = tonumber(y), month = tonumber(mo), day  = tonumber(d),
    hour  = tonumber(h), min   = tonumber(mi), sec  = tonumber(s)
  })
end

local function parse_social_block(text, peer_label, peer_soul_id_val, outgoing_flag)
  local msgs = {}
  for ts, from, to, content in text:gmatch("<!%-%-%s*@msg%s+(%S+)%s+(%S+)%s+(%S+)%s+(.-) ?%-%->") do
    local epoch = iso_to_epoch(ts)
    if epoch and epoch >= cutoff then
      table.insert(msgs, {
        ts         = ts,
        epoch      = epoch,
        from_label = from == "me" and peer_label or from:sub(1, 8),
        from_id    = from == "me" and peer_soul_id_val or from,
        to         = to,
        content    = content,
        peer       = peer_label,
        outgoing   = outgoing_flag or false,
      })
    end
  end
  return msgs
end

-- ── Alle gegenseitigen Peers abfragen ─────────────────────────────────────────
local all_msgs  = {}
local peer_list = {}

for _, conn in ipairs(connections) do
  local peer_label      = (type(conn.alias) == "string" and conn.alias ~= "") and conn.alias or conn.soul_id:sub(1, 8)
  local peer_soul_id_v  = conn.soul_id
  local is_mutual       = type(conn.peer_token) == "string" and conn.peer_token ~= ""

  if not is_mutual then goto continue end
  table.insert(peer_list, peer_label)

  local own_host = ngx.var.host or ""
  local is_same_server = not (type(conn.domain) == "string" and conn.domain ~= ""
    and not conn.domain:find(own_host, 1, true))

  if is_same_server then
    -- Same-Server-Peer: Dateisystem direkt lesen
    local sys_path = SOULS_DIR .. peer_soul_id_v .. "/sys.md"
    local sf = io.open(sys_path, "r")
    if sf then
      local content = sf:read("*a"); sf:close()
      if content:sub(1, 4) ~= MAGIC then
        local s = content:find("<!%-%-%s*SOCIAL:START%s*%-%->")
        local e = content:find("<!%-%-%s*SOCIAL:END%s*%-%->")
        if s and e and e > s then
          local msgs = parse_social_block(content:sub(s, e + 20), peer_label, peer_soul_id_v, false)
          for _, m in ipairs(msgs) do table.insert(all_msgs, m) end
        end
      end
    end
  else
    -- Cross-Domain-Peer: HTTP mit eigenem HMAC-Cert
    -- stage=2 → 48h; für days>2 wird cross-domain auf 48h begrenzt (API-Limitation)
    local upstream = conn.domain:gsub("/+$", "")
      .. "/api/soul/social-read?soul_id=" .. ngx.escape_uri(peer_soul_id_v)
      .. "&raw=1&stage=2"

    local httpc = http.new()
    httpc:set_timeout(6000)
    local res = httpc:request_uri(upstream, {
      method  = "GET",
      headers = {
        ["Authorization"] = "Bearer " .. soul_id .. "." .. own_cert,
        ["Accept"]        = "text/plain",
      },
      ssl_verify = true,
    })

    if res and res.status == 200 and res.body then
      local msgs = parse_social_block(res.body, peer_label, peer_soul_id_v, false)
      for _, m in ipairs(msgs) do table.insert(all_msgs, m) end
    end
  end

  ::continue::
end

-- ── Eigene ausgehende Nachrichten (SOCIAL-Block) ──────────────────────────────
local own_sys = SOULS_DIR .. soul_id .. "/sys.md"
local osf = io.open(own_sys, "r")
if osf then
  local own_content = osf:read("*a"); osf:close()
  if own_content:sub(1, 4) ~= MAGIC then
    local s = own_content:find("<!%-%-%s*SOCIAL:START%s*%-%->")
    local e = own_content:find("<!%-%-%s*SOCIAL:END%s*%-%->")
    if s and e and e > s then
      local msgs = parse_social_block(own_content:sub(s, e + 20), "Ich", soul_id, true)
      for _, m in ipairs(msgs) do table.insert(all_msgs, m) end
    end
  end
end

-- ── Chronologisch sortieren ───────────────────────────────────────────────────
table.sort(all_msgs, function(a, b) return a.epoch < b.epoch end)

ngx.say(cjson.encode({
  ok       = true,
  days     = days,
  count    = #all_msgs,
  messages = #all_msgs > 0 and all_msgs or cjson.empty_array,
  peers    = #peer_list > 0 and peer_list or cjson.empty_array,
}))
