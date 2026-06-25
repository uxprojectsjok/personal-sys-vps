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

local tx_clean = body.tx_hash:match("^%s*(.-)%s*$") -- trim whitespace
if not tx_clean:match("^0x[0-9a-fA-F]{64}$") then
  ngx.status = 400
  ngx.log(ngx.ERR, "[register-anchor] ungültiger tx_hash: len=", #body.tx_hash, " val=", body.tx_hash:sub(1,80))
  ngx.say('{"error":"Ungültiger TX-Hash","received_len":' .. #body.tx_hash .. '}')
  return
end
body.tx_hash = tx_clean

local block_number = type(body.block_number) == "number" and math.floor(body.block_number) or nil
local soul_size    = type(body.soul_size)    == "number" and math.floor(body.soul_size)    or 0

local anchor = {
  tx       = body.tx_hash,
  date     = type(body.date)     == "string"  and body.date     or os.date("!%Y-%m-%d"),
  sessions = type(body.sessions) == "number"  and body.sessions or 0,
  tags     = type(body.tags)     == "table"   and body.tags     or {},
  name     = type(body.name)     == "string"  and body.name     or cjson.null,
}

-- CID aus api_context.json mitlesen — damit soul_discover IPFS-Metadaten laden kann
-- auch wenn die CID nicht im TX-Calldata steht (kein Pinata-JWT konfiguriert etc.)
local ctx_path = "/var/lib/sys/souls/" .. soul_id .. "/api_context.json"
local cf = io.open(ctx_path, "r")
if cf then
  local raw_ctx = cf:read("*a"); cf:close()
  local ok_ctx, ctx = pcall(cjson.decode, raw_ctx)
  if ok_ctx and type(ctx) == "table" and type(ctx.agent_registry_cid) == "string" then
    anchor.cid = ctx.agent_registry_cid
  end
end

local soul_dir = "/var/lib/sys/souls/" .. soul_id

-- anchor_history.json: wachsende Liste aller Blockchain-Anchors mit Block + Größe
local hist_path = soul_dir .. "/anchor_history.json"
local history   = {}
local hf = io.open(hist_path, "r")
if hf then
  local raw_h = hf:read("*a"); hf:close()
  local ok_h, existing = pcall(cjson.decode, raw_h)
  if ok_h and type(existing) == "table" then history = existing end
end

local now_ts = os.date("!%Y-%m-%dT%TZ", math.floor(ngx.now()))
local entry = {
  tx   = body.tx_hash,
  ts   = now_ts,
  size = soul_size,
}
if block_number then entry.block = block_number end
if #history == 0 then entry.genesis = true end
table.insert(history, entry)

local hfw = io.open(hist_path, "w")
if hfw then hfw:write(cjson.encode(history)); hfw:close() end

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
