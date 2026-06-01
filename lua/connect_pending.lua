-- /etc/openresty/lua/connect_pending.lua
-- GET /api/connect/pending  (soul_cert auth via soul_auth.lua)
-- Listet alle offenen Probe-Anfragen für diese Soul.
-- Response: { pending: [{ token, created_at, probed_at }] }

local cjson       = require("cjson.safe")
local soul_id     = ngx.ctx.soul_id
local CONNECT_DIR = "/var/lib/sys/connect/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"Method not allowed"}'); return
end

local function is_expired(d)
  if not d.expires_at then return false end
  local y,mo,dy,h,mi,s = d.expires_at:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return false end
  local t = os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(dy),
                       hour=tonumber(h), min=tonumber(mi), sec=tonumber(s) })
  return os.time() >= t
end

local pending = {}

local pipe = io.popen("ls " .. CONNECT_DIR .. "*.json 2>/dev/null")
if pipe then
  for path in pipe:lines() do
    local f = io.open(path, "r")
    if f then
      local raw = f:read("*a"); f:close()
      local ok, d = pcall(cjson.decode, raw)
      if ok and type(d) == "table"
         and d.soul_id == soul_id
         and d.status  == "probed"
         and not is_expired(d) then
        local token = path:match("/([a-f0-9]+)%.json$") or ""
        table.insert(pending, {
          token      = token,
          created_at = d.created_at or "",
          probed_at  = d.probed_at  or "",
        })
      end
    end
  end
  pipe:close()
end

ngx.say(cjson.encode({ pending = #pending > 0 and pending or cjson.empty_array }))
