-- /etc/openresty/lua/soul_paid_earnings.lua
-- GET /api/soul/paid-earnings
-- Bearer: pol_access_token → liest earnings.json der Soul

local cjson = require("cjson.safe")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- Token aus Authorization-Header
local auth = ngx.req.get_headers()["Authorization"] or ""
local token = auth:match("^Bearer%s+(.+)$")
if not token or #token ~= 48 or not token:match("^%x+$") then
  ngx.status = 401
  ngx.say('{"error":"missing_token"}')
  return
end

-- Token-Datei lesen
local tf = io.open("/var/lib/sys/pol_tokens/" .. token .. ".json", "r")
if not tf then
  ngx.status = 401
  ngx.say('{"error":"token_expired_or_invalid"}')
  return
end
local raw_tok = tf:read("*a"); tf:close()
local ok_t, tok = pcall(cjson.decode, raw_tok)
if not ok_t or type(tok) ~= "table" then
  ngx.status = 401
  ngx.say('{"error":"token_corrupt"}')
  return
end

-- TTL prüfen
local expires = tok.expires_at
if expires then
  local y,mo,d,h,mi,s = expires:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)Z")
  if y then
    local exp_ts = os.time({year=y,month=mo,day=d,hour=h,min=mi,sec=s})
    if exp_ts < os.time() then
      ngx.status = 401
      ngx.say('{"error":"token_expired"}')
      return
    end
  end
end

-- soul_id validieren
local soul_id = tok.soul_id
if not soul_id or not soul_id:match("^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") then
  ngx.status = 401
  ngx.say('{"error":"token_corrupt"}')
  return
end

-- private-Check
local SOULS_DIR = "/var/lib/sys/souls/"
local ctx_file  = SOULS_DIR .. soul_id .. "/api_context.json"
local cf = io.open(ctx_file, "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"soul_not_found"}')
  return
end
local raw_ctx = cf:read("*a"); cf:close()
local ok_c, ctx = pcall(cjson.decode, raw_ctx)
if ok_c and type(ctx) == "table" and type(ctx.amortization) == "table" then
  if ctx.amortization.private == true then
    ngx.status = 403
    ngx.say('{"error":"soul_private"}')
    return
  end
end

-- earnings.json lesen
local ef = io.open(SOULS_DIR .. soul_id .. "/earnings.json", "r")
if not ef then
  ngx.say(cjson.encode({ total_pol = "0.000000", total_requests = 0, entries = setmetatable({}, cjson.array_mt) }))
  return
end
local raw_e = ef:read("*a"); ef:close()
local ok_e, earnings = pcall(cjson.decode, raw_e)
if not ok_e or type(earnings) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"earnings_corrupt"}')
  return
end

ngx.say(cjson.encode(earnings))
