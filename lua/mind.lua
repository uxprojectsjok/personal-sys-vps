-- /etc/openresty/lua/mind.lua
-- GET /api/mind → KI-Konfigurationsdatei lesen (oder Default-Template)
-- PUT /api/mind → Sektion schreiben (mit Schreibschutz)
-- Auth: access_by_lua_file soul_auth.lua

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") or #soul_id > 64 then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid soul identity"}')
  return
end

local base_dir  = "/var/lib/sys/souls/" .. soul_id
local MIND_PATH = base_dir .. "/vault/context/mind.md"
local MIND_DIR  = base_dir .. "/vault/context"

local DEFAULT_MIND = require("default_mind").get()

-- ── Verschlüsselung (soul_auth.lua setzt ngx.ctx.vault_key nicht -- Key wird
-- eigenständig aus api_context.json gelesen, gleiches Muster wie vault_sync.lua) ──
local MAGIC = "SYS\x01"
local function hex_to_bin(hex)
  return (hex:gsub("..", function(h) return string.char(tonumber(h, 16)) end))
end

local function load_vault_meta()
  local cf = io.open(base_dir .. "/api_context.json", "r")
  if not cf then return nil, "ciphered" end
  local raw = cf:read("*a"); cf:close()
  local ok, ctx = pcall(cjson.decode, raw)
  if not ok or type(ctx) ~= "table" then return nil, "ciphered" end
  local key = type(ctx.vault_key_hex) == "string" and #ctx.vault_key_hex == 64 and ctx.vault_key_hex or nil
  return key, ctx.cipher_mode or "ciphered"
end

local function decrypt_content(data, vault_key_hex)
  if not vault_key_hex then return nil end
  local resty_aes  = require("resty.aes")
  local iv         = data:sub(5, 20)
  local ciphertext = data:sub(21)
  local key        = hex_to_bin(vault_key_hex)
  local aes_ctx    = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  return aes_ctx:decrypt(ciphertext)
end

local function encrypt_content(plaintext, vault_key_hex)
  local resty_aes    = require("resty.aes")
  local resty_random = require("resty.random")
  local iv = resty_random.bytes(16, true)
  if not iv then return nil end
  local key = hex_to_bin(vault_key_hex)
  local aes_ctx = resty_aes:new(key, nil, resty_aes.cipher(256, "cbc"), { iv = iv })
  if not aes_ctx then return nil end
  local ciphertext = aes_ctx:encrypt(plaintext)
  if not ciphertext then return nil end
  return MAGIC .. iv .. ciphertext
end

local function read_mind()
  local f = io.open(MIND_PATH, "rb")
  if not f then
    os.execute("mkdir -p " .. MIND_DIR)
    local wf = io.open(MIND_PATH, "w")
    if wf then wf:write(DEFAULT_MIND); wf:close() end
    return DEFAULT_MIND
  end
  local content = f:read("*a"); f:close()
  if content:sub(1, 4) == MAGIC then
    local vault_key = load_vault_meta()
    local decrypted = vault_key and decrypt_content(content, vault_key)
    if decrypted then return decrypted end
    -- Kein/ungültiger Vault-Key verfügbar: Datei NICHT überschreiben, nur für
    -- diese eine Antwort auf das Default-Template zurückfallen.
    return DEFAULT_MIND
  end
  return content
end

local function write_mind(content)
  os.execute("mkdir -p " .. MIND_DIR)
  local vault_key, cipher_mode = load_vault_meta()
  local to_write = content
  if cipher_mode == "ciphered" and vault_key then
    local encrypted = encrypt_content(content, vault_key)
    if encrypted then to_write = encrypted end
  end
  local f = io.open(MIND_PATH, "wb")
  if not f then return false end
  f:write(to_write); f:close()
  return true
end

-- Parst write_protected aus dem Frontmatter
local function get_write_protected(md)
  local protected = {}
  local fm = md:match("^%-%-%-(.-)%-%-%-")
  if fm then
    local wp = fm:match("write_protected:%s*([^\n]+)")
    if wp then
      for sec in (wp .. ","):gmatch("([^,]+),") do
        protected[sec:match("^%s*(.-)%s*$")] = true
      end
    end
  end
  return protected
end

-- Findet Zeilenanfang und -ende einer ## Sektion (einfacher Vergleich, kein Regex)
local function find_section(lines, heading)
  local target = "## " .. heading
  local s, e = nil, nil
  for i, line in ipairs(lines) do
    if line == target then
      s = i
    elseif s and not e and #line >= 3 and line:sub(1, 3) == "## " then
      e = i - 1
      break
    end
  end
  if s and not e then e = #lines end
  return s, e
end

local function split_lines(text)
  local lines = {}
  for line in (text .. "\n"):gmatch("([^\n]*)\n") do
    lines[#lines + 1] = line
  end
  return lines
end

-- Sektionsnamen: Englisch (aktuelles Default-Template, siehe default_mind.lua)
-- und Deutsch (Alt-Souls von vor der Umstellung) je Sektion. Bidirektional,
-- damit egal ob der Aufrufer Englisch oder Deutsch schickt, immer die Sektion
-- getroffen wird die in DIESER konkreten mind.md tatsächlich existiert —
-- sonst entsteht eine neue, doppelte Sektion statt die bestehende zu treffen.
local SECTION_ALIASES = {
  ["Identity"]      = "Identität",       ["Identität"]       = "Identity",
  ["Communication"] = "Kommunikation",   ["Kommunikation"]   = "Communication",
  ["Intellect"]     = "Intellekt",       ["Intellekt"]       = "Intellect",
  ["Tools"]         = "Werkzeuge",       ["Werkzeuge"]       = "Tools",
  ["Network"]       = "Netzwerk",        ["Netzwerk"]        = "Network",
  ["Signature"]     = "Signatur",        ["Signatur"]        = "Signature",
  ["Self-Reflection"] = "Selbstreflexion", ["Selbstreflexion"] = "Self-Reflection",
  ["Session End"]   = "Session-Ende",    ["Session-Ende"]    = "Session End",
  ["Boundaries"]    = "Grenzen",         ["Grenzen"]         = "Boundaries",
}

-- Löst eine angefragte Sektion auf die tatsächlich in md vorhandene Variante auf.
-- Existiert die angefragte Variante selbst → unverändert zurückgeben (deckt auch
-- alle Nicht-Kern-Sektionen wie "ElevenLabs Agent" ab, die nur eine Sprache haben).
local function resolve_section(md, requested)
  local target = "## " .. requested
  for _, line in ipairs(split_lines(md)) do
    if line == target then return requested end
  end
  local alias = SECTION_ALIASES[requested]
  if alias then
    local alias_target = "## " .. alias
    for _, line in ipairs(split_lines(md)) do
      if line == alias_target then return alias end
    end
  end
  return requested
end

local function join_lines(lines)
  return table.concat(lines, "\n")
end

local function trim_trailing_empty(lines)
  while #lines > 0 and lines[#lines]:match("^%s*$") do
    table.remove(lines)
  end
  return lines
end

local function update_section(md, heading, new_content, mode)
  local lines = split_lines(md)
  local sec_start, sec_end = find_section(lines, heading)

  if not sec_start then
    -- Sektion fehlt → am Ende anhängen
    local trimmed = md:gsub("%s+$", "")
    return trimmed .. "\n\n## " .. heading .. "\n" .. new_content:gsub("%s+$", "") .. "\n"
  end

  -- Bestehender Inhalt der Sektion (ohne Heading-Zeile)
  local existing_lines = {}
  for i = sec_start + 1, sec_end do
    existing_lines[#existing_lines + 1] = lines[i]
  end
  trim_trailing_empty(existing_lines)
  local existing = join_lines(existing_lines)

  local body
  if mode == "replace" then
    body = new_content:gsub("%s+$", "")
  elseif mode == "prepend" then
    body = new_content:gsub("%s+$", "") .. (existing ~= "" and "\n\n" .. existing or "")
  else
    body = (existing ~= "" and existing .. "\n\n" or "") .. new_content:gsub("%s+$", "")
  end

  -- Ergebnis zusammensetzen
  local result = {}
  for i = 1, sec_start do result[#result + 1] = lines[i] end
  for line in (body .. "\n"):gmatch("([^\n]*)\n") do result[#result + 1] = line end
  -- Leerzeile nach Sektion falls nächste Sektion folgt
  if sec_end < #lines then
    result[#result + 1] = ""
    for i = sec_end + 1, #lines do result[#result + 1] = lines[i] end
  end

  return join_lines(result)
end

-- ── GET ──────────────────────────────────────────────────────────────────────

if ngx.req.get_method() == "GET" then
  local content = read_mind()
  ngx.header["Content-Type"]  = "text/plain; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.print(content)
  return
end

-- ── PUT ──────────────────────────────────────────────────────────────────────

if ngx.req.get_method() ~= "PUT" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw or raw == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Empty body"}')
  return
end

local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Invalid JSON"}')
  return
end

local section = body.section
local content = body.content
local mode    = body.mode or "replace"

if type(section) ~= "string" or section == "" or #section > 200 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"section fehlt oder ungültig"}')
  return
end
if type(content) ~= "string" or content == "" or #content > 100000 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"content fehlt oder zu lang (max. 100 KB)"}')
  return
end
if mode ~= "replace" and mode ~= "append" and mode ~= "prepend" then
  mode = "replace"
end

local current = read_mind()
-- Angefragte Sektion auf die tatsächlich in dieser mind.md vorhandene Sprachvariante
-- auflösen — verhindert doppelte Sektionen bei Sprach-Mismatch zwischen Aufrufer
-- (z.B. KI mit "Self-Reflection") und Alt-Soul-Datei (z.B. "## Selbstreflexion").
section = resolve_section(current, section)
local protected = get_write_protected(current)

if protected[section] then
  ngx.status = 403
  ngx.header["Content-Type"] = "application/json"
  ngx.say(cjson.encode({
    error   = "write_protected",
    message = "Sektion '" .. section .. "' ist schreibgeschützt."
  }))
  return
end

local updated = update_section(current, section, content, mode)

-- Selbstreflexion: Rolling Window — max. 20 DATUM:-Einträge behalten
-- (section wurde oben bereits auf die tatsächlich vorhandene Sprachvariante aufgelöst)
if (section == "Self-Reflection" or section == "Selbstreflexion") and (mode == "prepend" or mode == "append") then
  local sec_lines = split_lines(updated)
  local sr_start, sr_end = find_section(sec_lines, section)
  if sr_start and sr_end then
    local blocks, current_block = {}, nil
    for i = sr_start + 1, sr_end do
      local line = sec_lines[i]
      if line:match("^%d%d%d%d%-%d%d%-%d%d") then
        if current_block then blocks[#blocks + 1] = current_block end
        current_block = { line }
      elseif current_block and not line:match("^%s*$") then
        current_block[#current_block + 1] = line
      elseif current_block then
        blocks[#blocks + 1] = current_block
        current_block = nil
      end
    end
    if current_block then blocks[#blocks + 1] = current_block end

    if #blocks > 20 then
      local new_body = {}
      for i = 1, 20 do
        for _, l in ipairs(blocks[i]) do new_body[#new_body + 1] = l end
        new_body[#new_body + 1] = ""
      end
      updated = update_section(updated, section,
        table.concat(new_body, "\n"):gsub("%s+$", ""), "replace")
    end
  end
end

if not write_mind(updated) then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Storage error"}')
  return
end

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({ ok = true, section = section, mode = mode }))
