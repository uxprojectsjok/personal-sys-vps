-- /etc/openresty/lua/zapier.lua
-- POST /api/zapier
-- Zapier-Eingangs-Webhook: liest Soul-Daten und kann Nachrichten in den Agent-Sandbox schreiben.
-- Auth: webhook_token aus api_context.json (Bearer oder ?token=... oder X-Webhook-Token Header)
--
-- Body (optional): {
--   message: "Text den Zapier sendet (z.B. E-Mail-Inhalt)",
--   source:  "gmail|calendar|slack|..." (wird als Absender eingetragen, default: "zapier"),
--   action:  "write" | "read"  (default: "write" wenn message vorhanden, sonst "read")
-- }
--
-- Antwort: { ok, soul_id, soul_name, message_written?, soul (wenn action=read) }

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

local message = payload.message
local source  = tostring(payload.source or "zapier"):gsub("[^%w%-_]", ""):sub(1, 32)
if source == "" then source = "zapier" end
local action  = payload.action
if action ~= "read" and action ~= "write" then
  action = (message and message ~= "") and "write" or "read"
end

-- ── sys.md lesen ──────────────────────────────────────────────────────────────
local soul_text  = ""
local soul_name  = "Soul"
local sf = io.open(base_dir .. "/sys.md", "r")
if sf then
  soul_text = sf:read("*a"); sf:close()
  -- Verschluesselte Soul: nicht ausgeben
  if soul_text:sub(1, 4) == "SYS\x01" then soul_text = "" end
end
if soul_text ~= "" then
  local m = soul_text:match("soul_name:%s*(.-)%s*\n")
  if m and m ~= '""' and m ~= "" then soul_name = m end
end

-- ── Nachricht in Agent-Sandbox schreiben ──────────────────────────────────────
local message_written = false

if action == "write" and message and #message > 0 then
  -- Nachricht auf 2000 Zeichen begrenzen
  if #message > 2000 then message = message:sub(1, 2000) .. " [...]" end
  -- Zeilenumbrueche escapen (HTML-Kommentar darf kein --> enthalten)
  local safe_msg = message:gsub("%-%-", "- -"):gsub("\n", " | ")

  local timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
  local entry     = "<!-- @msg " .. timestamp .. " " .. source .. " agent " .. safe_msg .. " -->"

  if soul_text ~= "" and not (soul_text:sub(1, 4) == "SYS\x01") then
    local updated
    -- Agent-Sandbox-Block vorhanden?
    if soul_text:find("<!-- AGENT:START -->", 1, true) and soul_text:find("<!-- AGENT:END -->", 1, true) then
      -- Vor dem End-Tag einfuegen
      updated = soul_text:gsub("(<!%-%- AGENT:END %-%->)",
        entry .. "\n%1", 1)
    else
      -- Block fehlt → am Ende anhaengen
      updated = soul_text:gsub("%s*$", "") ..
        "\n\n## Agent Sandbox\n<!-- AGENT:START -->\n" .. entry .. "\n<!-- AGENT:END -->\n"
    end

    if updated ~= soul_text then
      local wf = io.open(base_dir .. "/sys.md", "w")
      if wf then
        wf:write(updated); wf:close()
        message_written = true
        soul_text = updated
      end
    end
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
  -- Soul-Kurzauszug: erstes 1 KB der relevanten Sektionen
  local snippet = soul_text:match("## Core Identity(.-)##") or soul_text:sub(1, 1000)
  response.soul_snippet = snippet:match("^%s*(.-)%s*$"):sub(1, 800)
end

ngx.say(cjson.encode(response))
