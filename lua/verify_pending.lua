-- /etc/openresty/lua/verify_pending.lua
-- GET /api/verify/pending  (soul_cert auth)
-- Gibt offene Verifikations-Challenges für diese Soul zurück.

local cjson      = require("cjson.safe")
local soul_id    = ngx.ctx.soul_id
local VERIFY_DIR = "/var/lib/sys/verify/"

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local function parse_iso(ts)
  if not ts then return 0 end
  local y,mo,d,h,mi,s = ts:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return 0 end
  return os.time({ year=tonumber(y), month=tonumber(mo), day=tonumber(d),
                   hour=tonumber(h), min=tonumber(mi), sec=tonumber(s) })
end

local pending = {}
local prefix  = VERIFY_DIR .. soul_id .. "_"
local pipe    = io.popen("ls " .. VERIFY_DIR .. " 2>/dev/null")
if pipe then
  for name in pipe:lines() do
    if name:sub(1, #soul_id + 1) == soul_id .. "_" and name:sub(-5) == ".json" then
      local f = io.open(VERIFY_DIR .. name, "r")
      if f then
        local raw = f:read("*a"); f:close()
        local ok, d = pcall(cjson.decode, raw)
        if ok and type(d) == "table"
           and d.status == "pending"
           and parse_iso(d.expires_at) > os.time() then
          table.insert(pending, {
            challenge_id = d.challenge_id,
            method       = d.method,
            created_at   = d.created_at,
            expires_at   = d.expires_at,
          })
        end
      end
    end
  end
  pipe:close()
end

ngx.say(cjson.encode({ pending = #pending > 0 and pending or cjson.empty_array }))
