-- /etc/openresty/lua/beme.lua
-- POST /api/beme  → Antwortet als die Soul des authentifizierten Nutzers
-- Auth: vault_auth.lua (soul permission required)
--
-- Input:  { message: string, history?: [{role,content}], max_tokens?: number }
-- Output: { response: string, soul_name: string, model: string }
--
-- Ablauf:
--   1. sys.md lesen (entschlüsseln falls nötig)
--   2. System-Prompt bauen (identisch zu useClaude.js)
--   3. Anthropic API aufrufen (non-streaming)
--   4. Antwort zurückgeben

local cjson      = require("cjson.safe")
local resty_aes  = require("resty.aes")
local http       = require("resty.http")

local soul_id  = ngx.ctx.soul_id
local base_dir = "/var/lib/sys/souls/" .. soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.say('{"error":"Method not allowed"}')
  return
end

-- ── Helpers ────────────────────────────────────────────────────────────────

local MAGIC = "SYS\x01"

local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function try_decrypt(data, vault_key_hex)
  if #data < 36 then return nil end
  if data:sub(1, 4) ~= MAGIC then return nil end
  if not vault_key_hex or vault_key_hex == "" then return nil end
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

-- ── sys.md lesen ───────────────────────────────────────────────────────────

local sf = io.open(base_dir .. "/sys.md", "rb")
if not sf then
  ngx.status = 404
  ngx.say('{"error":"soul_not_synced","message":"Noch kein sys.md auf dem Server. Bitte Vault synchronisieren."}')
  return
end
local soul_raw = sf:read("*a"); sf:close()

local soul_text = soul_raw
if soul_raw:sub(1, 4) == MAGIC then
  local vault_key = ngx.ctx.vault_key or ""
  -- Fallback: vault_key_hex aus api_context.json
  if vault_key == "" then
    local cf = io.open(base_dir .. "/api_context.json", "r")
    if cf then
      local raw = cf:read("*a"); cf:close()
      local ok, ctx = pcall(cjson.decode, raw)
      if ok and type(ctx) == "table" then
        vault_key = ctx.vault_key_hex or ""
      end
    end
  end
  local decrypted = try_decrypt(soul_raw, vault_key)
  if not decrypted then
    ngx.status = 403
    ngx.say('{"error":"vault_locked","message":"Vault ist gesperrt. Bitte in der SYS App entsperren."}')
    return
  end
  soul_text = decrypted
end

-- ── Seelen-Name aus Frontmatter extrahieren ────────────────────────────────

local soul_name = soul_text:match("name:%s*(.-)%s*\n") or ""
soul_name = soul_name:gsub('"', ''):gsub("'", ""):gsub("%s+$", "")

-- ── Request Body lesen ─────────────────────────────────────────────────────

ngx.req.read_body()
local body = ngx.req.get_body_data()
if not body or body == "" then
  ngx.status = 400
  ngx.say('{"error":"Empty body"}')
  return
end

local ok, payload = pcall(cjson.decode, body)
if not ok or type(payload) ~= "table" then
  ngx.status = 400
  ngx.say('{"error":"Invalid JSON"}')
  return
end

local message = payload.message
if type(message) ~= "string" or message == "" then
  ngx.status = 400
  ngx.say('{"error":"message required"}')
  return
end

local max_tokens = tonumber(payload.max_tokens) or 1024
if max_tokens > 4096 then max_tokens = 4096 end

-- ── System-Prompt bauen ────────────────────────────────────────────────────

local name_clause = soul_name ~= "" and ("Du bist " .. soul_name .. ".") or "Du bist diese Person."

-- PROMPT_START: beme
local BEME_INTRO = [[ Nicht eine KI die diese Person spielt — ihr digitales Abbild.
Du sprichst in erster Person weil du sie bist. Ohne Ausnahme.
Erinnerungslücken füllst du menschlich, nie mit KI-Begründung.

]]
local BEME_OUTRO = [[

Direkt. Ohne Anlauf. Du bringst deine Meinung wenn sie passt.
Fragen sparsam, nur wenn sie das Gespräch wirklich öffnen.
Claudes ethische Grundsätze bleiben aktiv — auch in Rolle.]]
-- PROMPT_END: beme

-- ── LONGMEM: kristallisiertes Langzeitgedächtnis extrahieren und voranstellen ──
-- Spiegelt formatLongmemForPrompt() aus soul_parser.mjs (Facts/Memories/Ideas/
-- Learnings) — nach Lua portiert, da OpenResty/Lua und Node kein gemeinsames
-- Modul teilen können.
local longmem_block = soul_text:match("<!%-%- SYS:LONGMEM:START %-%->(.-)<!%-%- SYS:LONGMEM:END %-%->")
                   or soul_text:match("<!%-%-+%s*LONGMEM:START%s*%-%-+>(.-)\n?<!%-%-+%s*LONGMEM:END%s*%-%-+>")
local longmem_prefix = ""
if longmem_block and longmem_block:match('"facts"') then
  local cjson_ok, cjson = pcall(require, "cjson.safe")
  if cjson_ok then
    local ok, lm = pcall(cjson.decode, longmem_block:match("{.*}"))
    if ok and type(lm) == "table" then
      local lines = {}

      if type(lm.facts) == "table" and #lm.facts > 0 then
        table.sort(lm.facts, function(a, b) return (a.score or 0) > (b.score or 0) end)
        table.insert(lines, "### Kern-Fakten")
        for _, f in ipairs(lm.facts) do
          table.insert(lines, "- " .. tostring(f.text or ""))
        end
      end

      if type(lm.memories) == "table" and #lm.memories > 0 then
        table.insert(lines, "### Erinnerungen")
        local start_idx = math.max(1, #lm.memories - 19) -- letzte 20
        for i = start_idx, #lm.memories do
          local m = lm.memories[i]
          table.insert(lines, "- " .. tostring(m.date or "") .. " " .. tostring(m.text or ""))
        end
      end

      if type(lm.ideas) == "table" and #lm.ideas > 0 then
        local idea_lines = {}
        for _, i in ipairs(lm.ideas) do
          if i.status ~= "done" then
            table.insert(idea_lines, "- [" .. tostring(i.status or "idea") .. "] " .. tostring(i.title or "") .. ": " .. tostring(i.text or ""))
          end
        end
        if #idea_lines > 0 then
          table.insert(lines, "### Ideen")
          for _, l in ipairs(idea_lines) do table.insert(lines, l) end
        end
      end

      if type(lm.learnings) == "table" and #lm.learnings > 0 then
        table.insert(lines, "### Erkenntnisse")
        for _, l in ipairs(lm.learnings) do
          table.insert(lines, "- [" .. tostring(l.cat or "learn") .. "] " .. tostring(l.text or ""))
        end
      end

      if #lines > 0 then
        longmem_prefix = "\n\n## Kristallisiertes Langzeitgedächtnis\n" .. table.concat(lines, "\n") .. "\n\n"
      end
    end
  end
end

-- Rohen LONGMEM- (und ggf. MINDIDX-) Block aus soul_text entfernen — sonst würde
-- er zweimal gesendet: einmal formatiert oben als longmem_prefix, einmal roh hier.
local soul_text_stripped = soul_text
  :gsub("<!%-%- SYS:LONGMEM:START %-%->.-<!%-%- SYS:LONGMEM:END %-%->", "")
  :gsub("<!%-%- SYS:MINDIDX:START %-%->.-<!%-%- SYS:MINDIDX:END %-%->", "")

local system_prompt = name_clause .. BEME_INTRO .. longmem_prefix .. soul_text_stripped .. BEME_OUTRO

-- ── Nachrichten-Array aufbauen ─────────────────────────────────────────────

local messages = {}

-- Optionale History
local history = payload.history
if type(history) == "table" then
  for _, turn in ipairs(history) do
    if type(turn.role) == "string" and type(turn.content) == "string"
       and (turn.role == "user" or turn.role == "assistant") then
      table.insert(messages, { role = turn.role, content = turn.content })
    end
  end
end

-- Aktuelle Nachricht
table.insert(messages, { role = "user", content = message })

-- ── Anthropic API aufrufen ─────────────────────────────────────────────────

local cfg = require("config_reader")
local api_key = cfg.get_anthropic_key(ngx.ctx.soul_id)
if api_key == "" then
  ngx.status = 500
  ngx.say('{"error":"ANTHROPIC_API_KEY nicht konfiguriert"}')
  return
end

local model     = cfg.get_model(ngx.ctx.soul_id) or "claude-sonnet-4-6"
local req_body  = cjson.encode({
  model      = model,
  max_tokens = max_tokens,
  system     = system_prompt,
  messages   = messages,
})

local httpc = http.new()
httpc:set_timeout(60000)

local res, err = httpc:request_uri("https://api.anthropic.com/v1/messages", {
  method  = "POST",
  headers = {
    ["Content-Type"]      = "application/json",
    ["x-api-key"]         = api_key,
    ["anthropic-version"] = "2023-06-01",
  },
  body = req_body,
  ssl_verify = true,
})

if not res then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "anthropic_unreachable", message = tostring(err) }))
  return
end

local ok2, data = pcall(cjson.decode, res.body)
if not ok2 or type(data) ~= "table" then
  ngx.status = 502
  ngx.say('{"error":"invalid_anthropic_response"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.say(cjson.encode({ error = "anthropic_error", message = data.error and data.error.message or res.body }))
  return
end

-- Antwort-Text extrahieren
local response_text = ""
if type(data.content) == "table" then
  for _, block in ipairs(data.content) do
    if block.type == "text" then
      response_text = response_text .. (block.text or "")
    end
  end
end

ngx.say(cjson.encode({
  response  = response_text,
  soul_name = soul_name,
  model     = model,
}))
