-- DELETE /api/trader/history/<id> → { ok }
--
-- Siehe soul-mcp/lib/trader_history.mjs (deleteAction). PRIVATE-REPO-ONLY.
-- Gleiches Muster wie trader_history.lua (GET) -- ngx.ctx.soul_id kommt aus
-- vault_auth.lua, nie vom Client, damit nie fremde Historien löschbar sind.

local cjson = require("cjson.safe")
local http  = require("resty.http")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

-- id kommt aus dem Pfad-Segment nach /api/trader/history/ -- die Location
-- ist ein Regex-Match (^/api/trader/history/[^/]+$), das komplette Segment
-- ist die id.
local id = ngx.var.uri:match("^/api/trader/history/([^/]+)$")
if not id or id == "" then
  ngx.status = 400
  ngx.say('{"error":"id_required"}')
  return
end

ngx.header["Content-Type"] = "application/json"

local httpc = http.new()
httpc:set_timeout(10000)
local res, err = httpc:request_uri(
  "http://127.0.0.1:3098/internal/trader/history/" .. ngx.escape_uri(id) .. "?soul_id=" .. ngx.escape_uri(soul_id),
  { method = "DELETE" }
)

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "internal_unreachable", detail = tostring(err) }))
  return
end

ngx.status = res.status
ngx.say(res.body)
