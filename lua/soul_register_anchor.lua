-- /etc/openresty/lua/soul_register_anchor.lua
-- POST /api/soul/register-anchor  { tx_hash, date, sessions, tags, name }
-- Schreibt /var/lib/sys/souls/{soul_id}/chain_anchor.json — plaintext, für soul_discover lesbar.
-- Auth: soul_auth.lua (soul_cert via ngx.ctx.soul_id)

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id then
  ngx.status = 401
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Unauthorized"}')
  return
end

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local raw     = ngx.req.get_body_data() or ""
local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" or type(body.tx_hash) ~= "string" then
  ngx.status = 400
  ngx.say('{"error":"tx_hash (string) erforderlich"}')
  return
end

if not body.tx_hash:match("^0x[0-9a-fA-F]{64}$") then
  ngx.status = 400
  ngx.say('{"error":"Ungültiger TX-Hash"}')
  return
end

local anchor = {
  tx       = body.tx_hash,
  date     = type(body.date)     == "string"  and body.date     or os.date("!%Y-%m-%d"),
  sessions = type(body.sessions) == "number"  and body.sessions or 0,
  tags     = type(body.tags)     == "table"   and body.tags     or {},
  name     = type(body.name)     == "string"  and body.name     or cjson.null,
}

local soul_dir = "/var/lib/sys/souls/" .. soul_id
local path     = soul_dir .. "/chain_anchor.json"

local f, err = io.open(path, "w")
if not f then
  ngx.status = 500
  ngx.say(cjson.encode({ error = "Schreibfehler: " .. (err or "unbekannt") }))
  return
end
f:write(cjson.encode(anchor))
f:close()

-- Soul sofort im Indexer sichtbar machen (fire-and-forget)
local http = require("resty.http")
local hc   = http.new()
hc:set_timeout(3000)
hc:request_uri("http://127.0.0.1:3098/internal/seed-soul", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body    = cjson.encode({ soul_id = soul_id }),
})

ngx.say(cjson.encode({ ok = true, soul_id = soul_id, tx = body.tx_hash }))
