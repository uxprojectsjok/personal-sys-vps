-- /etc/openresty/lua/vault_share_link.lua
-- GET    /api/vault/share-links           → aktive Links auflisten
-- POST   /api/vault/share-links           → Link erstellen { file, type, label? }
-- DELETE /api/vault/share-links/{id}      → Link deaktivieren
-- Auth: soul_auth.lua → ngx.ctx.soul_id

local cjson   = require("cjson.safe")
local soul_id = ngx.ctx.soul_id

ngx.header["Content-Type"]  = "application/json"
ngx.header["Cache-Control"] = "no-store"

if not soul_id or not soul_id:match("^[a-zA-Z0-9%-]+$") then
  ngx.status = 403; ngx.say('{"error":"invalid_soul"}'); return
end

local LINKS_FILE = "/var/lib/sys/souls/" .. soul_id .. "/share_links.json"
local MAX_LINKS  = 50

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function read_links()
  local f = io.open(LINKS_FILE, "r")
  if not f then return { links = {} } end
  local raw = f:read("*a"); f:close()
  local ok, data = pcall(cjson.decode, raw)
  if ok and type(data) == "table" and type(data.links) == "table" then return data end
  return { links = {} }
end

local function write_links(data)
  local f = io.open(LINKS_FILE, "w")
  if not f then return false end
  f:write(cjson.encode(data)); f:close()
  return true
end

local function rand_token()
  local f = io.open("/dev/urandom", "rb")
  if not f then return nil end
  local bytes = f:read(16); f:close()
  if not bytes or #bytes < 16 then return nil end
  local hex = ""
  for i = 1, #bytes do hex = hex .. string.format("%02x", bytes:byte(i)) end
  return hex  -- 32 hex chars
end

local function rand_id()
  local f = io.open("/dev/urandom", "rb")
  if not f then return tostring(math.floor(ngx.now() * 1000)) end
  local b = f:read(4); f:close()
  local hex = ""
  for i = 1, 4 do hex = hex .. string.format("%02x", b:byte(i)) end
  return hex  -- 8 hex chars
end

local function link_url(token)
  local scheme = "https"
  local host   = ngx.var.host or "localhost"
  return scheme .. "://" .. host .. "/api/vault/link/" .. soul_id .. "/" .. token
end

-- ── Routing ───────────────────────────────────────────────────────────────────

local method = ngx.req.get_method()
local uri    = ngx.var.uri  -- z.B. /api/vault/share-links oder /api/vault/share-links/abc12345

-- DELETE /api/vault/share-links/{id}
if method == "DELETE" then
  local link_id = uri:match("^/api/vault/share%-links/([A-Za-z0-9]+)$")
  if not link_id then
    ngx.status = 400; ngx.say('{"error":"invalid_id"}'); return
  end
  local data = read_links()
  local found = false
  for _, l in ipairs(data.links) do
    if l.id == link_id then
      l.active = false; found = true
    end
  end
  if not found then ngx.status = 404; ngx.say('{"error":"not_found"}'); return end
  write_links(data)
  ngx.say('{"ok":true}')
  return
end

-- GET /api/vault/share-links
if method == "GET" then
  local data = read_links()
  -- Nur aktive zurückgeben + URL ergänzen
  local active = {}
  for _, l in ipairs(data.links) do
    if l.active then
      active[#active + 1] = {
        id      = l.id,
        file    = l.file,
        type    = l.type,
        label   = l.label or l.file,
        created = l.created,
        url     = link_url(l.token),
      }
    end
  end
  ngx.say(cjson.encode({ ok = true, links = active }))
  return
end

-- POST /api/vault/share-links
if method == "POST" then
  ngx.req.read_body()
  local body = ngx.req.get_body_data() or ""
  local ok_j, req = pcall(cjson.decode, body)
  if not ok_j or type(req) ~= "table" then
    ngx.status = 400; ngx.say('{"error":"invalid_json"}'); return
  end

  local file = tostring(req.file or "")
  local typ  = tostring(req.type or "context")
  local lbl  = tostring(req.label or file)

  if file == "" or file:find("%.%.") or file:find("[^A-Za-z0-9%.%-%_]") then
    ngx.status = 400; ngx.say('{"error":"invalid_file"}'); return
  end
  if typ:find("[^a-z]") or #typ > 20 then
    ngx.status = 400; ngx.say('{"error":"invalid_type"}'); return
  end

  -- Datei existiert?
  local fpath = "/var/lib/sys/souls/" .. soul_id .. "/vault/" .. typ .. "/" .. file
  local ft = io.open(fpath, "r")
  if not ft then ngx.status = 404; ngx.say('{"error":"file_not_found"}'); return end
  ft:close()

  local data = read_links()

  -- Limit prüfen
  local active_count = 0
  for _, l in ipairs(data.links) do
    if l.active then active_count = active_count + 1 end
  end
  if active_count >= MAX_LINKS then
    ngx.status = 429; ngx.say('{"error":"too_many_links"}'); return
  end

  local token = rand_token()
  local lid   = rand_id()
  if not token then
    ngx.status = 500; ngx.say('{"error":"token_gen_failed"}'); return
  end

  table.insert(data.links, {
    id      = lid,
    token   = token,
    file    = file,
    type    = typ,
    label   = lbl,
    created = math.floor(ngx.now()),
    active  = true,
  })
  write_links(data)

  ngx.say(cjson.encode({
    ok    = true,
    id    = lid,
    url   = link_url(token),
    file  = file,
    label = lbl,
  }))
  return
end

ngx.status = 405; ngx.say('{"error":"method_not_allowed"}')
