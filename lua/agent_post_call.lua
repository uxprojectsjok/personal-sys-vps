-- /etc/openresty/lua/agent_post_call.lua
-- POST /api/agent/post-call  (ElevenLabs HMAC-Signatur-Auth)
-- ElevenLabs Post-Call Webhook: empfängt Transkript, speichert als agent_call_*.md.
-- Signatur: ElevenLabs-Signature: t=<unix_ts>,v0=<hmac_sha256(secret, ts.body)>

local cjson  = require("cjson.safe")
local http   = require("resty.http")
local hmac   = require("hmac_helper")

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() == "OPTIONS" then ngx.status = 204; return end
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

-- ── Body lesen ────────────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw then
  local tmp = ngx.req.get_body_file()
  if tmp then local f = io.open(tmp,"r"); if f then raw=f:read("*a"); f:close() end end
end
raw = raw or ""

-- ── HMAC-Signatur verifizieren ────────────────────────────────────────────────
-- ElevenLabs sendet: ElevenLabs-Signature: t=<unix_ts>,v0=<hex_hmac>
-- Signiert wird "<ts>.<body>" mit dem webhook_secret
local function verify_signature(body_str)
  local sig_header = ngx.req.get_headers()["elevenlabs-signature"] or ""
  if sig_header == "" then return false, "missing_signature" end

  local ts = sig_header:match("t=([^,]+)")
  local v0 = sig_header:match("v0=([a-f0-9]+)")
  if not ts or not v0 then return false, "invalid_signature_format" end

  -- Replay-Schutz: max 5 Minuten alt
  if math.abs(ngx.now() - tonumber(ts)) > 300 then return false, "signature_expired" end

  -- Webhook-Secret aus api_context.json des Souls laden und HMAC prüfen
  -- (create_agent.lua persistiert elevenlabs_webhook_secret dort, nicht in config.json)
  local souls_dir = "/var/lib/sys/souls"
  local handle = io.popen("ls " .. souls_dir .. " 2>/dev/null")
  if not handle then return false, "no_souls" end
  local soul_id = nil
  for dir in handle:lines() do
    if dir:match("^[a-zA-Z0-9%-]+$") and #dir <= 64 then
      local cf = io.open(souls_dir .. "/" .. dir .. "/api_context.json", "r")
      if cf then
        local raw_cfg = cf:read("*a"); cf:close()
        local ok_c, cfg = pcall(cjson.decode, raw_cfg)
        if ok_c and type(cfg) == "table" and type(cfg.elevenlabs_webhook_secret) == "string" then
          local expected = hmac.sign(cfg.elevenlabs_webhook_secret, ts .. "." .. body_str)
          if expected == v0 then soul_id = dir; break end
        end
      end
    end
  end
  handle:close()

  if not soul_id then return false, "invalid_hmac" end
  return true, soul_id
end

local sig_ok, sig_result = verify_signature(raw)
if not sig_ok then
  ngx.log(ngx.WARN, "[agent_post_call] Auth fehlgeschlagen: ", sig_result)
  ngx.status = 401
  ngx.say('{"error":"unauthorized","reason":"' .. sig_result .. '"}')
  return
end

local soul_id = sig_result

-- ── Transkript extrahieren ────────────────────────────────────────────────────
local ok_j, body = pcall(cjson.decode, raw)
local transcript = ""
if ok_j and type(body) == "table" then
  local msgs = body.transcript or (body.data and body.data.transcript) or {}
  if type(msgs) == "table" then
    for _, m in ipairs(msgs) do
      local role = m.role or "unknown"
      local text = m.message or m.content or ""
      if text ~= "" then
        transcript = transcript .. role .. ": " .. text .. "\n"
      end
    end
  end
end
if transcript == "" then transcript = raw end

-- ── Als context_write speichern ───────────────────────────────────────────────
local now_ts   = math.floor(ngx.now())
local date_str = os.date("!%Y-%m-%d", now_ts)
local time_str = os.date("!%H:%M", now_ts)
local filename = "agent_call_" .. tostring(now_ts) .. ".md"
local content  = "# Agent Call " .. date_str .. " " .. time_str .. " UTC\n\n" .. transcript

local httpc = http.new()
httpc:set_timeout(15000)
local mcp_headers = { ["Content-Type"] = "application/json", ["x-soul-id"] = soul_id }

local pl_ok, payload = pcall(cjson.encode, {
  tool  = "context_write",
  input = { filename = filename, content = content }
})
if not pl_ok then ngx.status=500; ngx.say('{"error":"encode_failed"}'); return end

local res, err = httpc:request_uri("http://127.0.0.1:3098/internal/run-tool", {
  method  = "POST",
  headers = mcp_headers,
  body    = payload,
})

if not res then
  ngx.status = 502
  ngx.say('{"error":"mcp_unreachable","message":"' .. (err or "timeout"):gsub('"','\\"') .. '"}')
  return
end

-- ── Session-Log Eintrag in sys.md (gleicher Workflow wie @session-end) ────────
local log_entry = "- **" .. date_str .. " (ElevenLabs):** Sprachsession " .. time_str .. " UTC — Transkript: " .. filename
local pl2_ok, payload2 = pcall(cjson.encode, {
  tool  = "soul_write",
  input = { section = "Session Log (compressed)", content = log_entry, mode = "prepend" }
})
if pl2_ok then
  httpc:request_uri("http://127.0.0.1:3098/internal/run-tool", {
    method  = "POST",
    headers = mcp_headers,
    body    = payload2,
  })
end

ngx.status = 200
ngx.say(cjson.encode({ ok = true, saved = filename }))
