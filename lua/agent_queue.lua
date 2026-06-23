-- GET  /api/agent/queue  → { content: "..." }
-- PUT  /api/agent/queue  → { content: "..." }  →  { ok: true }

local cjson = require("cjson.safe")

local soul_id = ngx.ctx.soul_id
if not soul_id or soul_id == "" then
  ngx.status = 401
  ngx.say('{"error":"unauthorized"}')
  return
end

local QUEUE_PATH = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/agent.md"

ngx.header["Content-Type"] = "application/json"

-- ── GET ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "GET" then
  local f = io.open(QUEUE_PATH, "r")
  if not f then
    ngx.say(cjson.encode({ content = "" }))
    return
  end
  local content = f:read("*a"); f:close()
  ngx.say(cjson.encode({ content = content }))
  return
end

-- ── PUT ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "PUT" then
  ngx.req.read_body()
  local body = cjson.decode(ngx.req.get_body_data() or "{}") or {}
  local content = body.content or ""

  os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id .. "/vault/context")

  local f = io.open(QUEUE_PATH, "w")
  if not f then
    ngx.status = 500
    ngx.say('{"error":"write failed"}')
    return
  end
  f:write(content); f:close()
  os.execute("chmod 640 " .. QUEUE_PATH)
  ngx.say('{"ok":true}')
  return
end

ngx.status = 405
ngx.say('{"error":"method not allowed"}')
