-- /etc/openresty/lua/vault_share_link_serve.lua
-- GET /api/vault/link/{soul_id}/{token}
-- Kein Auth — der Token IST die Berechtigung.
-- Liefert den verlinkten Kontext/Vault-Inhalt zurück.

local cjson = require("cjson.safe")

ngx.header["Cache-Control"] = "no-store"

if ngx.req.get_method() ~= "GET" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 405; ngx.say('{"error":"method_not_allowed"}'); return
end

local UUID_PAT  = "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$"
local TOKEN_PAT = "^[a-f0-9]+$"

local soul_id, token = ngx.var.uri:match("^/api/vault/link/([^/]+)/([a-f0-9]+)$")

if not soul_id or not token then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_url"}'); return
end

if not soul_id:match(UUID_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_soul_id"}'); return
end

if #token < 32 or not token:match(TOKEN_PAT) then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"invalid_token"}'); return
end

-- share_links.json lesen
local links_path = "/var/lib/sys/souls/" .. soul_id .. "/share_links.json"
local lf = io.open(links_path, "r")
if not lf then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 404; ngx.say('{"error":"no_links"}'); return
end
local raw = lf:read("*a"); lf:close()
local ok, data = pcall(cjson.decode, raw)
if not ok or type(data) ~= "table" or type(data.links) ~= "table" then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 500; ngx.say('{"error":"links_corrupt"}'); return
end

-- Token suchen
local entry = nil
for _, l in ipairs(data.links) do
  if l.token == token then
    entry = l; break
  end
end

if not entry then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 401; ngx.say('{"error":"token_not_found"}'); return
end

if not entry.active then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 403; ngx.say('{"error":"link_deactivated"}'); return
end

-- Datei lesen
local file = tostring(entry.file or "")
local typ  = tostring(entry.type or "context")
if file == "" or file:find("%.%.") or file:find("[^A-Za-z0-9%.%-%_]") then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 400; ngx.say('{"error":"invalid_file"}'); return
end

local fpath = "/var/lib/sys/souls/" .. soul_id .. "/vault/" .. typ .. "/" .. file
local ff = io.open(fpath, "rb")
if not ff then
  ngx.header["Content-Type"] = "application/json"
  ngx.status = 404; ngx.say('{"error":"file_not_found"}'); return
end
local content = ff:read("*a"); ff:close()

-- MIME
local MIME = {
  md="text/markdown; charset=utf-8", txt="text/plain; charset=utf-8",
  json="application/json", pdf="application/pdf",
  csv="text/csv; charset=utf-8",
}
local ext  = (file:match("%.([^%.]+)$") or ""):lower()
local mime = MIME[ext] or "text/plain; charset=utf-8"

-- X-Content-Label für KI-Clients
ngx.header["Content-Type"]  = mime
ngx.header["X-Soul-File"]   = file
ngx.header["X-Soul-Label"]  = entry.label or file
ngx.print(content)
