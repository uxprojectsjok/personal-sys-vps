-- /etc/openresty/lua/soul_webhook_token_info.lua
-- GET /api/soul/webhook-token-info
-- Auth: soul_auth.lua
-- Gibt Token-Preview + created_at zurück (kein vollständiger Token).

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"unauthenticated"}')
  return
end

local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local fh = io.open(ctx_path, "r")
if not fh then
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"preview":"","created_at":null}')
  return
end
local raw = fh:read("*a"); fh:close()
local ok, ctx = pcall(cjson.decode, raw)
if not ok or type(ctx) ~= "table" then
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"preview":"","created_at":null}')
  return
end

local token   = ctx.webhook_token or ""
local preview = token ~= "" and (token:sub(1, 8) .. "…") or ""

-- created_at aus authorized_services.json lesen
local created_at = nil
do
  local svc_path = "/var/lib/sys/souls/" .. soul_id .. "/authorized_services.json"
  local sf = io.open(svc_path, "r")
  if sf then
    local sr = sf:read("*a"); sf:close()
    local sok, svc = pcall(cjson.decode, sr)
    if sok and type(svc) == "table" and token ~= "" and svc[token] then
      created_at = svc[token].created_at
    end
  end
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"
local ok_r, js = pcall(cjson.encode, {
  preview    = preview,
  created_at = created_at or cjson.null,
})
ngx.say(ok_r and js or '{"preview":"","created_at":null}')
