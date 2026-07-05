-- /etc/openresty/lua/trust_revoke.lua
-- POST /api/trust/revoke  (soul_cert auth via soul_auth.lua)
-- Body: { soul_id }
-- Entfernt den Eintrag aus amortization.trusted_souls der eigenen Soul.

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

ngx.req.read_body()
local body = ngx.req.get_body_data() or "{}"
local ok, payload = pcall(cjson.decode, body)
if not ok or type(payload) ~= "table" then
  ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
end

local target = payload.soul_id
if type(target) ~= "string" or target == "" then
  ngx.status = 400; ngx.say('{"error":"invalid_soul_id"}'); return
end

local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local cf = io.open(ctx_path, "r")
if not cf then
  ngx.status = 500; ngx.say('{"error":"context_unreadable"}'); return
end
local craw = cf:read("*a"); cf:close()
local cok, ctx = pcall(cjson.decode, craw)
if not cok or type(ctx) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"context_corrupt"}'); return
end

ctx.amortization = ctx.amortization or {}
local trusted = ctx.amortization.trusted_souls
if type(trusted) ~= "table" then trusted = {} end

local remaining = {}
local removed = false
for _, t in ipairs(trusted) do
  local sid = (type(t) == "string" and t) or (type(t) == "table" and t.soul_id) or nil
  if sid == target then
    removed = true
  else
    table.insert(remaining, t)
  end
end

ctx.amortization.trusted_souls = #remaining > 0 and remaining or setmetatable({}, cjson.array_mt)

local cwf = io.open(ctx_path, "w")
if not cwf then
  ngx.status = 500; ngx.say('{"error":"could_not_update"}'); return
end
cwf:write(cjson.encode(ctx)); cwf:close()

ngx.say(cjson.encode({ ok = true, removed = removed }))
