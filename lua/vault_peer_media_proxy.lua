-- /etc/openresty/lua/vault_peer_media_proxy.lua
-- GET /api/vault/peer-media?endpoint=...&soul_id=...&file=...
-- Self-contained auth: verifies local soul_cert, then proxies binary to peer's vault_shared_serve.
-- Same pattern as soul_peer_proxy.lua.

local http  = require("resty.http")
local cjson = require("cjson.safe")
local cfg   = require("config_reader")
local hmac  = require("hmac_helper")

ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local UUID_PAT  = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local SOULS_DIR = "/var/lib/sys/souls/"

-- ── Auth: own soul_cert ───────────────────────────────────────────────────────
local bearer = (ngx.req.get_headers()["Authorization"] or ""):match("^[Bb]earer%s+(.+)$")
if not bearer then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"bearer_required"}'); return
end
local own_soul_id, own_cert = bearer:match("^([^.]+)%.(.+)$")
if not own_soul_id or not own_cert or not own_soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_bearer"}'); return
end

local global_key  = cfg.get_master_key()
local per_key     = cfg.get_soul_master_key(own_soul_id)
local active_key  = (per_key and per_key ~= "") and per_key or global_key
if not active_key or active_key == "" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 500; ngx.say('{"error":"no_master_key"}'); return
end

local cv = hmac.read_cert_version(own_soul_id)
local cert_ok = false
for _, v in ipairs({ cv, cv - 1, cv + 1 }) do
  if v >= 0 and hmac.cert_for_soul(active_key, own_soul_id, v) == own_cert then
    cert_ok = true; break
  end
end
if not cert_ok then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_cert"}'); return
end

-- ── Params ────────────────────────────────────────────────────────────────────
local args           = ngx.req.get_uri_args()
local target_soul_id = args.soul_id  or ""
local filename       = args.file     or ""
local endpoint       = args.endpoint or ""

if not target_soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_soul_id"}'); return
end

filename = filename:match("^([A-Za-z0-9%.%-%_]+)$")
if not filename then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_filename"}'); return
end

-- ── Upstream URL ──────────────────────────────────────────────────────────────
local base_url
if endpoint == "" then
  base_url = "http://127.0.0.1"
else
  base_url = endpoint:match("^(https://[%w%.%-]+[^%s]*)$")
  if not base_url then
    ngx.header["Content-Type"] = "application/json"
    ngx.status = 400; ngx.say('{"error":"invalid_endpoint"}'); return
  end
  base_url = base_url:gsub("/+$", "")
end

local upstream_url = base_url .. "/api/vault/shared/"
  .. ngx.escape_uri(target_soul_id) .. "/" .. ngx.escape_uri(filename)

-- ── Proxy ─────────────────────────────────────────────────────────────────────
local httpc = http.new(); httpc:set_timeout(20000)
local res, err = httpc:request_uri(upstream_url, {
  method     = "GET",
  headers    = { ["Authorization"] = "Bearer " .. bearer, Accept = "*/*" },
  ssl_verify = true,
})

if not res then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 502
  ngx.say('{"error":"upstream_unreachable","detail":' .. cjson.encode(tostring(err or "")) .. '}')
  return
end

ngx.status = res.status
ngx.header["Content-Type"] = res.headers["Content-Type"] or "application/octet-stream"
if res.headers["Content-Disposition"] then
  ngx.header["Content-Disposition"] = res.headers["Content-Disposition"]
end
ngx.print(res.body or "")
