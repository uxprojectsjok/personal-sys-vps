-- /etc/openresty/lua/trust_pending.lua
-- GET /api/trust/pending  (soul_cert auth via soul_auth.lua)
-- Listet offene request_trust-Anfragen für diese Soul.
-- Response: { pending: [{ request_id, requester_soul_id, label, reason, created_at, expires_at }] }

local cjson     = require("cjson.safe")
local soul_id   = ngx.ctx.soul_id
local TRUST_DIR = "/var/lib/sys/trust/"
os.execute("mkdir -p " .. TRUST_DIR)

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local function utc_offset()
  local d = os.date("*t"); local u = os.date("!*t")
  return (d.hour - u.hour) * 3600 + (d.min - u.min) * 60 + (d.sec - u.sec)
end
local _utc_offset = utc_offset()

local function parse_iso(ts)
  if not ts then return 0 end
  local y,mo,d,h,mi,s = ts:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return 0 end
  return os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(d),
                   hour=tonumber(h), min=tonumber(mi), sec=tonumber(s) }) + _utc_offset
end

local pending = {}
local pipe = io.popen("ls " .. TRUST_DIR .. " 2>/dev/null")
if pipe then
  for name in pipe:lines() do
    if name:sub(1, #soul_id + 1) == soul_id .. "_" and name:sub(-5) == ".json" then
      local f = io.open(TRUST_DIR .. name, "r")
      if f then
        local raw = f:read("*a"); f:close()
        local ok, d = pcall(cjson.decode, raw)
        if ok and type(d) == "table"
           and d.status == "pending"
           and parse_iso(d.expires_at) > os.time() then
          table.insert(pending, {
            request_id        = d.request_id,
            requester_soul_id = d.requester_soul_id,
            label             = d.label,
            reason            = d.reason,
            created_at        = d.created_at,
            expires_at        = d.expires_at,
          })
        end
      end
    end
  end
  pipe:close()
end

ngx.say(cjson.encode({ pending = #pending > 0 and pending or cjson.empty_array }))
