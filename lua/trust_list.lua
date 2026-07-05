-- /etc/openresty/lua/trust_list.lua
-- GET /api/trust/list  (soul_cert auth via soul_auth.lua)
-- Listet aktuell getrustete Souls aus amortization.trusted_souls, angereichert
-- mit Label aus dem neuesten zugehörigen "approved" Request-File (falls
-- vorhanden — Einträge können auch ohne request_trust entstanden sein).
-- Response: { trusted: [{ soul_id, endpoint, label, trusted_since }] }

local cjson     = require("cjson.safe")
local soul_id   = ngx.ctx.soul_id
local TRUST_DIR = "/var/lib/sys/trust/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
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

local trusted = (ctx.amortization and ctx.amortization.trusted_souls) or {}
if type(trusted) ~= "table" then trusted = {} end

-- Label-Lookup: neuestes "approved" Request-File pro requester_soul_id
local labels = {}
local pipe = io.popen("ls " .. TRUST_DIR .. " 2>/dev/null")
if pipe then
  for name in pipe:lines() do
    if name:sub(1, #soul_id + 1) == soul_id .. "_" and name:sub(-5) == ".json" then
      local f = io.open(TRUST_DIR .. name, "r")
      if f then
        local raw = f:read("*a"); f:close()
        local ok, d = pcall(cjson.decode, raw)
        if ok and type(d) == "table" and d.status == "approved" and d.requester_soul_id then
          local existing = labels[d.requester_soul_id]
          if not existing or (d.decided_at or "") > (existing.decided_at or "") then
            labels[d.requester_soul_id] = { label = d.label, decided_at = d.decided_at }
          end
        end
      end
    end
  end
  pipe:close()
end

local list = {}
for _, t in ipairs(trusted) do
  local sid = (type(t) == "string" and t) or (type(t) == "table" and t.soul_id) or nil
  if sid then
    local ep   = (type(t) == "table") and t.endpoint or nil
    local meta = labels[sid] or {}
    table.insert(list, {
      soul_id       = sid,
      endpoint      = ep,
      label         = meta.label,
      trusted_since = meta.decided_at,
    })
  end
end

ngx.say(cjson.encode({ trusted = #list > 0 and list or cjson.empty_array }))
