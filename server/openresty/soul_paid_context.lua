-- /etc/openresty/lua/soul_paid_context.lua
-- GET /api/soul/paid-context
-- Bearer = pol_access_token. Gibt Kontext-Dateiliste für zahlende externe Agenten zurück.
-- Gibt Namen zurück (keine direkten Download-URLs, da diese vault_auth benötigen).

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- ── Token → soul_id ────────────────────────────────────────────────────────

local auth  = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^[Bb]earer%s+(.+)$")

if not token or not token:match("^[0-9a-fA-F]+$") or #token < 32 then
  ngx.status = 401
  ngx.header["WWW-Authenticate"] = 'Bearer realm="soul-paid"'
  ngx.say('{"error":"Bearer pol_access_token erforderlich"}')
  return
end

local access_cache = ngx.shared.pol_access
local raw = access_cache:get("tok:" .. token:lower())
if not raw then
  ngx.status = 401
  ngx.say('{"error":"token_expired_or_invalid","message":"pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich."}')
  return
end

local ok_t, tdata = pcall(cjson.decode, raw)
if not ok_t or type(tdata) ~= "table" or not tdata.soul_id then
  ngx.status = 500
  ngx.say('{"error":"token_data_corrupt"}')
  return
end

local soul_id = tdata.soul_id

-- soul_id auf UUID-Format prüfen (Path Traversal verhindern)
local UUID_PAT = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
if not soul_id:match(UUID_PAT) then
  ngx.status = 400
  ngx.say('{"error":"invalid_soul_id"}')
  return
end

-- ── api_context.json lesen ─────────────────────────────────────────────────

local SOULS_DIR = "/var/lib/sys/souls/"
local cf = io.open(SOULS_DIR .. soul_id .. "/api_context.json", "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"Soul nicht gefunden"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if not ok_c or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"api_context corrupt"}')
  return
end

-- ── Amortisierung prüfen ───────────────────────────────────────────────────

local amort = ctx.amortization
if type(amort) ~= "table" or amort.enabled ~= true then
  ngx.status = 402
  ngx.say('{"error":"payment_not_required","message":"Diese Soul ist im Frei-Modus."}')
  return
end

-- ── Kontext-Dateiliste aus synced_files ───────────────────────────────────

local synced   = (type(ctx.synced_files) == "table") and ctx.synced_files or {}
local raw_files = synced.context
local files    = type(raw_files) == "table" and raw_files or {}

local list = {}
for _, name in ipairs(files) do
  table.insert(list, {
    name = name,
    type = name:match("%.([^%.]+)$") or "txt",
  })
end

ngx.say(cjson.encode({
  type  = "context",
  files = list,
  count = #list,
  note  = "Datei-Inhalte per context_get(name, access_token) abrufbar.",
}))
