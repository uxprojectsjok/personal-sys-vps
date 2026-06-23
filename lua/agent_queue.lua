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

local DEFAULT_TEMPLATE = [[# SYS Agent Queue
<!-- Tasks werden von Claude AI via MCP hier eingetragen. -->
<!-- Format: - [ ] task  →  Agent holt sie beim nächsten Cron-Lauf ab -->

## Pending



## Done
]]

-- ── GET ───────────────────────────────────────────────────────────────────────
if ngx.req.get_method() == "GET" then
  local f = io.open(QUEUE_PATH, "r")
  if not f then
    -- Datei nicht vorhanden → mit Template anlegen
    os.execute("mkdir -p /var/lib/sys/souls/" .. soul_id .. "/vault/context")
    local wf = io.open(QUEUE_PATH, "w")
    if wf then wf:write(DEFAULT_TEMPLATE); wf:close()
      os.execute("chmod 640 " .. QUEUE_PATH)
    end
    ngx.say(cjson.encode({ content = DEFAULT_TEMPLATE }))
    return
  end
  local content = f:read("*a"); f:close()
  -- Leerdatei nachträglich mit Template befüllen
  if content:match("^%s*$") then
    local wf = io.open(QUEUE_PATH, "w")
    if wf then wf:write(DEFAULT_TEMPLATE); wf:close() end
    content = DEFAULT_TEMPLATE
  end
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
