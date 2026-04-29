-- /etc/openresty/lua/soul_meta.lua
-- GET /api/soul/meta?soul_id={uuid}
-- Öffentlich, kein Auth. NFT-Metadata-Standard (ERC-721/ERC-1155 kompatibel).
-- Gibt öffentliche Soul-Metadaten zurück — keine sensiblen Inhalte.

local cjson = require("cjson.safe")

if ngx.req.get_method() ~= "GET" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"Method not allowed"}')
  return
end

ngx.header["Content-Type"]                = "application/json"
ngx.header["Cache-Control"]               = "public, max-age=300"
ngx.header["Access-Control-Allow-Origin"] = "*"

local args      = ngx.req.get_uri_args()
local soul_id   = args and args.soul_id
local SOULS_DIR = "/var/lib/sys/souls/"

-- soul_id validieren
if not soul_id or not soul_id:match("^[a-fA-F0-9%-]+$") or #soul_id > 64 then
  ngx.status = 400
  ngx.say(cjson.encode({ error = "soul_id required (UUID format)" }))
  return
end

local sys_path = SOULS_DIR .. soul_id .. "/sys.md"
local sf = io.open(sys_path, "r")
if not sf then
  ngx.status = 404
  ngx.say(cjson.encode({ error = "Soul not found" }))
  return
end
local raw = sf:read("*a"); sf:close()

-- Verschlüsselte Souls: nur Basis-Metadaten aus Frontmatter lesen
local is_encrypted = raw:sub(1, 4) == "SYS\x01"

local name, created_at, version, maturity
if is_encrypted then
  -- Kein Zugriff auf Inhalt — nur soul_id bekannt
  name       = "Unknown"
  created_at = nil
  version    = nil
  maturity   = nil
else
  -- YAML-Frontmatter parsen (--- ... ---)
  local front = raw:match("^%-%-%-\n(.-)%-%-%-")
  if front then
    name       = front:match("soul_name:%s*(.-)%s*\n")
    created_at = front:match("created_at:%s*(.-)%s*\n")
    version    = front:match("version:%s*(.-)%s*\n")
    maturity   = tonumber(front:match("maturity:%s*(.-)%s*\n"))
  end
end

-- api_context.json: nur enabled + cipher_mode
local ctx_path = SOULS_DIR .. soul_id .. "/api_context.json"
local api_enabled = false
local cipher_mode = "unknown"
local cf = io.open(ctx_path, "r")
if cf then
  local craw = cf:read("*a"); cf:close()
  local ok, ctx = pcall(cjson.decode, craw)
  if ok and type(ctx) == "table" then
    api_enabled = ctx.enabled == true
    cipher_mode = ctx.cipher_mode or "unknown"
  end
end

-- vault_public/config.json: ist Public Vault aktiv?
local pub_enabled = false
local pub_cfg_path = SOULS_DIR .. soul_id .. "/vault_public/config.json"
local pf = io.open(pub_cfg_path, "r")
if pf then
  local praw = pf:read("*a"); pf:close()
  local ok, pcfg = pcall(cjson.decode, praw)
  if ok and type(pcfg) == "table" then
    pub_enabled = pcfg.enabled == true
  end
end

local meta = {
  soul_id        = soul_id,
  name           = name or "Unknown",
  schema         = "saveyoursoul/soul/1.0",
  encrypted      = is_encrypted,
  cipher_mode    = cipher_mode,
  api_enabled    = api_enabled,
  public_vault   = pub_enabled,
  mcp_endpoint   = "https://sys.uxprojects-jok.com/mcp",
  soul_endpoint  = "https://sys.uxprojects-jok.com/api/soul/meta?soul_id=" .. soul_id,
}

if created_at then meta.created_at = created_at end
if version     then meta.version    = version    end
if maturity    then meta.maturity   = maturity   end

ngx.say(cjson.encode(meta))
