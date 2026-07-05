-- /etc/openresty/lua/trust_approve.lua
-- POST /api/trust/approve  (soul_cert auth via soul_auth.lua)
-- Body: { request_id, approved: true|false }
-- Setzt Request-Status auf "approved"/"rejected". Bei approved=true wird
-- requester_soul_id in trusted_souls der Ziel-Soul aufgenommen (dedup).

local cjson     = require("cjson.safe")
local soul_id   = ngx.ctx.soul_id
local TRUST_DIR = "/var/lib/sys/trust/"

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

local request_id = payload.request_id
local approved    = payload.approved == true

if type(request_id) ~= "string" or #request_id ~= 32 or not request_id:match("^[a-f0-9]+$") then
  ngx.status = 400; ngx.say('{"error":"invalid_request_id"}'); return
end

local path = TRUST_DIR .. soul_id .. "_" .. request_id .. ".json"
local f = io.open(path, "r")
if not f then
  ngx.status = 404; ngx.say('{"error":"request_not_found"}'); return
end
local raw = f:read("*a"); f:close()
local dok, d = pcall(cjson.decode, raw)
if not dok or type(d) ~= "table" then
  ngx.status = 500; ngx.say('{"error":"request_data_corrupt"}'); return
end

if d.soul_id ~= soul_id then
  ngx.status = 403; ngx.say('{"error":"not_authorized"}'); return
end
if d.status ~= "pending" then
  ngx.status = 409; ngx.say('{"error":"request_not_pending"}'); return
end

d.status     = approved and "approved" or "rejected"
d.decided_at = os.date("%Y-%m-%dT%H:%M:%S")

local wf = io.open(path, "w")
if not wf then
  ngx.status = 500; ngx.say('{"error":"could_not_update_request"}'); return
end
wf:write(cjson.encode(d)); wf:close()

-- Bei Freigabe: requester_soul_id in trusted_souls eintragen (dedup)
if approved then
  local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
  local cf = io.open(ctx_path, "r")
  if cf then
    local craw = cf:read("*a"); cf:close()
    local cok, ctx = pcall(cjson.decode, craw)
    if cok and type(ctx) == "table" then
      ctx.amortization = ctx.amortization or {}
      local trusted = ctx.amortization.trusted_souls
      if type(trusted) ~= "table" then trusted = {} end
      local already = false
      for _, t in ipairs(trusted) do
        if t == d.requester_soul_id or (type(t) == "table" and t.soul_id == d.requester_soul_id) then
          already = true
          break
        end
      end
      if not already then
        table.insert(trusted, d.requester_soul_id)
      end
      ctx.amortization.trusted_souls = trusted
      local cwf = io.open(ctx_path, "w")
      if cwf then
        cwf:write(cjson.encode(ctx)); cwf:close()
      end
    end
  end
end

ngx.say(cjson.encode({ ok = true, status = d.status }))
