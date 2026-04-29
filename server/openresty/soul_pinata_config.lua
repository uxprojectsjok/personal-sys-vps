-- /etc/openresty/lua/soul_pinata_config.lua
-- GET /api/soul/pinata-config  → { configured, preview }
-- PUT /api/soul/pinata-config  { jwt }  → { ok }
-- DELETE /api/soul/pinata-config → { ok }
-- Auth: vault_auth (soul_cert via ngx.ctx.soul_id)

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

local CONFIG_PATH = "/var/lib/sys/pinata_jwt"
local method      = ngx.req.get_method()

-- ── GET ───────────────────────────────────────────────────────────────────────
if method == "GET" then
  local f = io.open(CONFIG_PATH, "r")
  if not f then
    ngx.say(cjson.encode({ configured = false, preview = "" }))
    return
  end
  local jwt = f:read("*a"); f:close()
  jwt = jwt:match("^%s*(.-)%s*$")  -- trim whitespace
  if jwt == "" then
    ngx.say(cjson.encode({ configured = false, preview = "" }))
    return
  end
  -- Mask: first 8 chars + "…" + last 4 chars
  local preview = (#jwt > 12)
    and (jwt:sub(1, 8) .. "…" .. jwt:sub(-4))
    or  string.rep("*", #jwt)
  ngx.say(cjson.encode({ configured = true, preview = preview }))
  return
end

-- ── PUT ───────────────────────────────────────────────────────────────────────
if method == "PUT" then
  ngx.req.read_body()
  local raw    = ngx.req.get_body_data() or ""
  local ok, body = pcall(cjson.decode, raw)
  if not ok or type(body) ~= "table" or type(body.jwt) ~= "string" then
    ngx.status = 400
    ngx.say('{"error":"jwt (string) erforderlich"}')
    return
  end
  local jwt = body.jwt:match("^%s*(.-)%s*$")
  if #jwt < 20 then
    ngx.status = 400
    ngx.say('{"error":"JWT zu kurz (min. 20 Zeichen)"}')
    return
  end
  local f, err = io.open(CONFIG_PATH, "w")
  if not f then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Schreibfehler: " .. (err or "unbekannt") }))
    return
  end
  f:write(jwt); f:close()
  ngx.say(cjson.encode({ ok = true }))
  return
end

-- ── DELETE ────────────────────────────────────────────────────────────────────
if method == "DELETE" then
  os.remove(CONFIG_PATH)
  ngx.say(cjson.encode({ ok = true }))
  return
end

ngx.status = 405
ngx.say('{"error":"Method not allowed"}')
