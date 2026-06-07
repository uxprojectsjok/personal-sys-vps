-- /etc/openresty/lua/vault_shared_serve.lua
-- GET /api/vault/shared/{soul_id}/{filename}
-- Auth: Bearer {requester_soul_id}.{cert}
--   Owner (requester === soul_id): local HMAC verify
--   Peer: must be in trusted_souls + cert verified (same-server: local / cross-domain: verify-peer-cert)

local cjson = require("cjson.safe")
local http  = require("resty.http")
local cfg   = require("config_reader")
local hmac  = require("hmac_helper")

ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local SOULS_DIR = "/var/lib/sys/souls/"

-- Parse URL
local target_soul_id, raw_file = ngx.var.uri:match("^/api/vault/shared/([^/]+)/(.+)$")
if not target_soul_id or not target_soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_url"}'); return
end

local filename = raw_file:match("^([A-Za-z0-9%.%-%_]+)$")
if not filename or filename:find("%.%.") then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_filename"}'); return
end

-- Auth
local bearer = (ngx.req.get_headers()["Authorization"] or ""):match("^[Bb]earer%s+(.+)$")
if not bearer then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"bearer_required"}'); return
end
local req_soul_id, req_cert = bearer:match("^([^.]+)%.(.+)$")
if not req_soul_id or not req_cert or not req_soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_bearer"}'); return
end

local global_key = cfg.get_master_key()

local function verify_local(sid, cert)
  local per_key    = cfg.get_soul_master_key(sid)
  local active_key = (per_key and per_key ~= "") and per_key or global_key
  if not active_key or active_key == "" then return false end
  local cv = hmac.read_cert_version(sid)
  for _, v in ipairs({ cv, cv - 1, cv + 1 }) do
    if v >= 0 and hmac.cert_for_soul(active_key, sid, v) == cert then return true end
  end
  return false
end

local cert_ok = false

if req_soul_id == target_soul_id then
  -- Owner accessing own file
  cert_ok = verify_local(req_soul_id, req_cert)
else
  -- Peer: check trusted_souls of target
  local cf = io.open(SOULS_DIR .. target_soul_id .. "/api_context.json", "r")
  if not cf then
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 404; ngx.say('{"error":"soul_not_found"}'); return
  end
  local raw = cf:read("*a"); cf:close()
  local ok_c, ctx = pcall(cjson.decode, raw)
  if not ok_c or type(ctx) ~= "table" then
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 500; ngx.say('{"error":"context_error"}'); return
  end

  local trusted = (type(ctx.amortization) == "table"
    and type(ctx.amortization.trusted_souls) == "table")
    and ctx.amortization.trusted_souls or {}

  local found_same     = false
  local found_endpoint = nil
  for _, entry in ipairs(trusted) do
    if type(entry) == "string" and entry == req_soul_id then
      found_same = true; break
    elseif type(entry) == "table" and entry.soul_id == req_soul_id then
      found_endpoint = entry.endpoint; break
    end
  end

  -- Fallback: soul_connections.json (Peers via peers.vue verbunden)
  local own_host = ngx.var.host or ""
  if not found_same and not found_endpoint then
    local conn_path = SOULS_DIR .. target_soul_id .. "/soul_connections.json"
    local cf2 = io.open(conn_path, "r")
    if cf2 then
      local raw_conn = cf2:read("*a"); cf2:close()
      local ok_conn, conn_data = pcall(cjson.decode, raw_conn)
      if ok_conn and type(conn_data) == "table" then
        local conns = type(conn_data.connections) == "table" and conn_data.connections
                      or (conn_data[1] and conn_data or {})
        for _, c in ipairs(conns) do
          if type(c) == "table" and c.soul_id == req_soul_id then
            if type(c.domain) == "string" and c.domain ~= ""
               and not c.domain:find(own_host, 1, true) then
              found_endpoint = c.domain
            else
              found_same = true
            end
            break
          end
        end
      end
    end
  end

  if not found_same and not found_endpoint then
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 403; ngx.say('{"error":"peer_not_trusted"}'); return
  end

  if found_same then
    cert_ok = verify_local(req_soul_id, req_cert)
  else
    -- Cross-domain: verify at peer's home node
    local verify_url = found_endpoint
      .. "/api/soul/verify-peer-cert?soul_id=" .. req_soul_id .. "&cert=" .. req_cert
    local httpc = http.new(); httpc:set_timeout(8000)
    local res, _ = httpc:request_uri(verify_url, {
      method = "GET", ssl_verify = true,
      headers = { Accept = "application/json" },
    })
    if res and res.status == 200 then
      local ok_v, vdata = pcall(cjson.decode, res.body or "")
      if ok_v and type(vdata) == "table" and vdata.ok == true then cert_ok = true end
    end
  end
end

if not cert_ok then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_cert"}'); return
end

-- Serve file
local fpath = SOULS_DIR .. target_soul_id .. "/vault_shared/" .. filename
local f = io.open(fpath, "rb")
if not f then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 404; ngx.say('{"error":"file_not_found"}'); return
end
local content = f:read("*a"); f:close()

local MIME = {
  jpg="image/jpeg", jpeg="image/jpeg", png="image/png",
  webp="image/webp", gif="image/gif", avif="image/avif",
  pdf="application/pdf", txt="text/plain; charset=utf-8",
  md="text/markdown; charset=utf-8",
}
local ext  = (filename:match("%.([^%.]+)$") or ""):lower()
local mime = MIME[ext] or "application/octet-stream"
local dispo = (MIME[ext] and ext ~= "pdf") and "inline" or "attachment"

ngx.header["Content-Type"]        = mime
ngx.header["Content-Disposition"] = dispo .. '; filename="' .. filename .. '"'
ngx.print(content)
