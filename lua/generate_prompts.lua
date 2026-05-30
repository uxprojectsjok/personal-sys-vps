-- /etc/openresty/lua/generate_prompts.lua
-- POST /api/soul/generate-prompts
-- Auth: vault_auth.lua (soul_cert)
-- Ruft /internal/generate-prompts im MCP-Server auf → schreibt prompts.md neu.

local http = require("resty.http")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local httpc = http.new()
httpc:set_timeout(15000)
local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/generate-prompts", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body    = "{}",
})

if not res then
  ngx.status = 502
  ngx.say('{"ok":false,"error":"' .. (err or "mcp unreachable") .. '"}')
  return
end

ngx.status = res.status
ngx.say(res.body)
