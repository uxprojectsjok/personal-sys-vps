-- /etc/openresty/lua/soul_verify_peer_cert.lua
-- GET /api/soul/verify-peer-cert?soul_id=&cert=
-- Öffentlicher Endpunkt — verifiziert ob ein soul_cert für eine soul_id auf DIESEM Server gültig ist.
-- Wird von fremden SYS-Nodes genutzt um Peer-Identität kryptografisch zu prüfen (Cross-Domain).

local cfg = require("config_reader")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"ok":false,"error":"Method not allowed"}')
  return
end

local args    = ngx.req.get_uri_args()
local soul_id = args.soul_id or ""
local cert    = args.cert    or ""

local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_soul_id"}')
  return
end

if not cert:match("^[0-9a-fA-F]+$") or #cert < 16 or #cert > 64 then
  ngx.status = 400
  ngx.say('{"ok":false,"error":"invalid_cert_format"}')
  return
end

-- Soul muss auf diesem Server existieren — verhindert HMAC-Arbeit für fremde UUIDs
local soul_dir = "/var/lib/sys/souls/" .. soul_id .. "/sys.md"
local sf = io.open(soul_dir, "r")
if not sf then
  -- Gleiche Antwort wie bei falschem Cert — kein Enumerationsvektor
  ngx.status = 401
  ngx.say('{"ok":false,"error":"invalid_cert"}')
  return
end
sf:close()

local global_key = cfg.get_master_key()
if not global_key or global_key == "" then
  ngx.status = 503
  ngx.say('{"ok":false,"error":"no_master_key"}')
  return
end

-- Per-soul key hat Vorrang (multi-hoster), Fallback auf globalen Key
local per_soul_key = type(cfg.get_soul_master_key) == "function" and cfg.get_soul_master_key(soul_id) or nil
local master_key   = (per_soul_key and per_soul_key ~= "") and per_soul_key or global_key

local hmac = require("hmac_helper")

-- Liest die cert_version aus api_context.json — dann nur 1 HMAC nötig statt bis zu 21
local function get_cert_version()
  local cf = io.open("/var/lib/sys/souls/" .. soul_id .. "/api_context.json", "r")
  if not cf then return 0 end
  local raw = cf:read("*a"); cf:close()
  local cjson = require("cjson.safe")
  local ok, ctx = pcall(cjson.decode, raw)
  if ok and type(ctx) == "table" and type(ctx.cert_version) == "number" then
    return ctx.cert_version
  end
  return 0
end

local function try_versions(key)
  -- Zuerst die gespeicherte cert_version prüfen (fast path)
  local cv = get_cert_version()
  if hmac.cert_for_soul(key, soul_id, cv) == cert then return true end
  -- Fallback: alle Versionen 0..20 (nach Rotation, bevor api_context aktualisiert)
  for v = 0, 20 do
    if v ~= cv and hmac.cert_for_soul(key, soul_id, v) == cert then
      return true
    end
  end
  return false
end

local matched = try_versions(master_key)

if not matched then
  local prev_key
  if per_soul_key then
    prev_key = type(cfg.get_soul_master_key_prev) == "function" and cfg.get_soul_master_key_prev(soul_id) or nil
  end
  if not prev_key or prev_key == "" then
    prev_key = type(cfg.get_master_key_prev) == "function" and cfg.get_master_key_prev() or nil
  end
  if prev_key and prev_key ~= "" then
    matched = try_versions(prev_key)
  end
end

if matched then
  ngx.say('{"ok":true}')
else
  ngx.status = 401
  ngx.say('{"ok":false,"error":"invalid_cert"}')
end
