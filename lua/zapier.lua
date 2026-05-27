-- /etc/openresty/lua/zapier.lua
-- POST /api/zapier
-- Zapier-Eingangs-Webhook: schreibt Nachrichten in den Agent-Sandbox oder Social Sphere.
-- Auth: webhook_token aus api_context.json (Bearer oder ?token=... oder X-Webhook-Token Header)
--
-- Body (optional): {
--   message: "Text den Zapier sendet",
--   source:  "gmail|calendar|slack|..." (Absender, default: "zapier")
--   action:  "write" | "read" | "notify"
--             write  → Agent-Sandbox (default wenn message vorhanden)
--             read   → Soul-Kurzauszug zurückgeben
--             notify → Social Sphere (sichtbar für Peers)
--   subject: "E-Mail-Betreff o.ä." (optional, für strukturiertes Format)
--   from:    "absender@domain.de"  (optional, für Gmail/Calendar)
--   reply_to: "message-id o.ä."   (optional, für Reply-Kontext)
-- }
--
-- Antwort: { ok, soul_id, soul_name, action, message_written?, soul_snippet? }

local cjson    = require("cjson.safe")
local soul_id  = ngx.ctx.soul_id
local base_dir = "/var/lib/sys/souls/" .. soul_id

ngx.header["Content-Type"]                  = "application/json"
ngx.header["Cache-Control"]                 = "no-store"
ngx.header["Access-Control-Allow-Origin"]   = "*"
ngx.header["Access-Control-Allow-Methods"]  = "POST, OPTIONS"
ngx.header["Access-Control-Allow-Headers"]  = "Authorization, X-Webhook-Token, Content-Type"

if ngx.req.get_method() == "OPTIONS" then
  ngx.status = 204; return
end

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"method_not_allowed"}')
  return
end

-- ── Kontext laden ─────────────────────────────────────────────────────────────
local cf = io.open(base_dir .. "/api_context.json", "r")
if not cf then
  ngx.status = 404
  ngx.say('{"error":"no_api_context"}')
  return
end
local ctx_raw = cf:read("*a"); cf:close()
local ok, ctx = pcall(cjson.decode, ctx_raw)
if not ok or type(ctx) ~= "table" then
  ngx.status = 500
  ngx.say('{"error":"context_parse_error"}')
  return
end
if not ctx.enabled then
  ngx.status = 403
  ngx.say('{"error":"api_not_enabled"}')
  return
end

-- ── Request-Body lesen ────────────────────────────────────────────────────────
ngx.req.read_body()
local raw = ngx.req.get_body_data() or "{}"
local _, payload = pcall(cjson.decode, raw)
if type(payload) ~= "table" then payload = {} end

local message  = payload.message
local subject  = type(payload.subject)  == "string" and payload.subject  or ""
local from     = type(payload.from)     == "string" and payload.from     or ""
local reply_to = type(payload.reply_to) == "string" and payload.reply_to or ""

local source = tostring(payload.source or "zapier"):gsub("[^%w%-_]", ""):sub(1, 32)
if source == "" then source = "zapier" end

local action = payload.action
if action ~= "read" and action ~= "write" and action ~= "notify" then
  action = (message and message ~= "") and "write" or "read"
end

-- ── Strukturiertes Format je nach Source ──────────────────────────────────────
local function format_message(src, msg, subj, sndr, repl)
  if msg then msg = msg:match("^%s*(.-)%s*$") end
  if msg == "" then msg = nil end

  if src == "gmail" then
    local parts = {}
    if sndr ~= "" then table.insert(parts, "Von: " .. sndr) end
    if subj ~= "" then table.insert(parts, "Betreff: " .. subj) end
    if msg  then  table.insert(parts, msg) end
    if repl ~= "" then table.insert(parts, "[reply_to:" .. repl .. "]") end
    return table.concat(parts, " | ")
  end

  if src == "calendar" then
    local parts = {}
    if subj ~= "" then table.insert(parts, "Termin: " .. subj) end
    if sndr ~= "" then table.insert(parts, "Von: " .. sndr) end
    if msg  then  table.insert(parts, msg) end
    return table.concat(parts, " | ")
  end

  -- generisch
  local parts = {}
  if subj ~= "" then table.insert(parts, subj) end
  if msg  then  table.insert(parts, msg) end
  if sndr ~= "" then table.insert(parts, "(von " .. sndr .. ")") end
  return table.concat(parts, " — ")
end

local formatted = format_message(source, message, subject, from, reply_to)

-- ── sys.md lesen ──────────────────────────────────────────────────────────────
local soul_text = ""
local soul_name = "Soul"
local sf = io.open(base_dir .. "/sys.md", "r")
if sf then
  soul_text = sf:read("*a"); sf:close()
  if soul_text:sub(1, 4) == "SYS\x01" then soul_text = "" end
end
if soul_text ~= "" then
  local m = soul_text:match("soul_name:%s*(.-)%s*\n")
  if m and m ~= '""' and m ~= "" then soul_name = m end
end

-- ── Nachricht schreiben ───────────────────────────────────────────────────────
local message_written = false

local function write_to_block(text, start_tag, end_tag, fallback_header)
  if soul_text == "" or formatted == "" then return false end
  -- Zeilenumbrüche + --> escapen
  local safe = text:gsub("%-%-", "- -"):gsub("\n", " | "):sub(1, 2000)
  local timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
  local entry = "<!-- @msg " .. timestamp .. " " .. source .. " agent " .. safe .. " -->"
  local updated

  if soul_text:find(start_tag, 1, true) and soul_text:find(end_tag, 1, true) then
    local escaped_end = end_tag:gsub("%-", "%%-"):gsub("<!%-%- ", "<!%%-%%- "):gsub(" %%->", " %-%%->")
    updated = soul_text:gsub("(" .. escaped_end .. ")", entry .. "\n%1", 1)
  else
    updated = soul_text:gsub("%s*$", "") ..
      "\n\n" .. fallback_header .. "\n" .. start_tag .. "\n" .. entry .. "\n" .. end_tag .. "\n"
  end

  if updated ~= soul_text then
    local wf = io.open(base_dir .. "/sys.md", "w")
    if wf then wf:write(updated); wf:close(); soul_text = updated; return true end
  end
  return false
end

if formatted ~= "" then
  if action == "write" then
    message_written = write_to_block(
      formatted,
      "<!-- AGENT:START -->", "<!-- AGENT:END -->",
      "## Agent Sandbox"
    )
  elseif action == "notify" then
    message_written = write_to_block(
      formatted,
      "<!-- SOCIAL:START -->", "<!-- SOCIAL:END -->",
      "## Social Sphere"
    )
  end
end

-- ── Antwort ────────────────────────────────────────────────────────────────────
local response = {
  ok              = true,
  soul_id         = soul_id,
  soul_name       = soul_name,
  action          = action,
  message_written = message_written,
}

if action == "read" and soul_text ~= "" then
  local snippet = soul_text:match("## Core Identity(.-)##") or soul_text:sub(1, 1000)
  response.soul_snippet = snippet:match("^%s*(.-)%s*$"):sub(1, 800)
end

ngx.say(cjson.encode(response))
