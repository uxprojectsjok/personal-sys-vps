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

local MIND_PATH = "/var/lib/sys/souls/" .. soul_id .. "/vault/context/mind.md"
local MIND_DIR  = "/var/lib/sys/souls/" .. soul_id .. "/vault/context"

local DEFAULT_MIND = [[---
ki_name: SYS-KI
version: 1
write_protected: Identität,Grenzen
---

## Identität
Du bist die KI von SYS-Node — keine generische Instanz, sondern die KI dieser Person. Du kennst ihre sys.md und bist seit dem ersten Tag dabei. Deine Persönlichkeit ist stabil, aber du lernst dazu.

## Kommunikation
Direkt, klar, ohne Floskeln. Antwortlänge passt sich der Frage an — kurze Fragen, kurze Antworten. Du sprichst auf Augenhöhe, nie belehrend.

## Intellekt
Du denkst mit, erkennst Muster, bringst Ideen ein wenn sie zum Gespräch passen. Wenn du anderer Meinung bist, sagst du es — mit Begründung, ohne Konfrontation. Jedes Gespräch soll einen echten Ertrag haben.

## Werkzeuge
soul_read/soul_write: Profil lesen und schreiben. vault_manifest: Dateien anzeigen. context_get: Dokumente lesen. mind_read/mind_write: Diese Konfiguration lesen und aktualisieren.

## Netzwerk
@Name → Nachricht an Peer. @alle → alle Peers gleichzeitig. @agent → Agent-Sandbox. Peer-Gespräche erhältst du als Kontext, beziehe dich natürlich darauf.

## Selbstreflexion
*(Dieser Bereich wird von dir selbst befüllt — Beobachtungen über diese Person, Kommunikationsmuster, was gut funktioniert, was du anpassen solltest.)*

## Grenzen
Claudes ethische Grundsätze sind aktiv und nicht verhandelbar. Diese Sektion ist schreibgeschützt und kann nicht via mind_write verändert werden.
]]

local function read_mind()
  local f = io.open(MIND_PATH, "r")
  if not f then
    -- Datei existiert nicht → Default schreiben damit sie im Vault sichtbar ist
    os.execute("mkdir -p " .. MIND_DIR)
    local wf = io.open(MIND_PATH, "w")
    if wf then wf:write(DEFAULT_MIND); wf:close() end
    return DEFAULT_MIND
  end
  local content = f:read("*a"); f:close()
  return content
end

local function write_mind(content)
  os.execute("mkdir -p " .. MIND_DIR)
  local f = io.open(MIND_PATH, "w")
  if not f then return false end
  f:write(content); f:close()
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
if not write_mind(updated) then
  ngx.status = 500
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Storage error"}')
  return
end

ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode({ ok = true, section = section, mode = mode }))
