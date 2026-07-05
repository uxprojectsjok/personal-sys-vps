-- /etc/openresty/lua/vault_consent_list.lua
-- GET /api/vault/consent-list
-- Listet alle EU-Widerrufsbestätigungs-PDFs des authentifizierten Souls auf.
-- Auth: soul_auth.lua → ngx.ctx.soul_id (owner-only, wie vault_shared_list.lua)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") then
  ngx.status = 403; ngx.say('{"error":"invalid_soul"}'); return
end

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local dir = "/var/lib/sys/souls/" .. soul_id .. "/consent_docs/"

local handle = io.popen('ls -1 "' .. dir .. '" 2>/dev/null')
if not handle then
  ngx.say(cjson.encode({ ok = true, soul_id = soul_id, files = {} })); return
end

local files = {}
for line in handle:lines() do
  local name = line:gsub("^%s+", ""):gsub("%s+$", "")
  if name ~= "" and name:match("%.pdf$") then
    local fpath = dir .. name
    local f = io.open(fpath, "rb")
    local size = 0
    if f then
      size = f:seek("end") or 0
      f:close()
    end
    local safe_fpath = fpath:gsub('"', '\\"')
    local sh = io.popen('stat -c "%Y" "' .. safe_fpath .. '" 2>/dev/null')
    local mtime = 0
    if sh then
      local s = sh:read("*l"); sh:close()
      mtime = tonumber(s) or 0
    end
    -- Referenz-ID = Dateiname ohne .pdf-Endung
    files[#files + 1] = { name = name, reference_id = name:gsub("%.pdf$", ""), size = size, mtime = mtime }
  end
end
handle:close()

table.sort(files, function(a, b) return a.mtime > b.mtime end)

ngx.say(cjson.encode({ ok = true, soul_id = soul_id, files = files }))
