-- /etc/openresty/lua/fetch_bundle.lua
-- POST /api/fetch-bundle
-- Holt ein .soul-Bundle von einer öffentlichen URL (server-seitig, kein CORS).
-- Kein Auth erforderlich – das Bundle ist client-seitig AES-256-GCM-verschlüsselt.
-- Sicherheit: SSRF-Schutz, HTTPS-only, Größenlimit, JSON-Validierung.

local cjson = require("cjson.safe")
local http  = require("resty.http")

-- Nur POST
if ngx.req.get_method() ~= "POST" then
  ngx.status = 405
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"method_not_allowed"}')
  return
end

ngx.req.read_body()
local raw = ngx.req.get_body_data()
if not raw or #raw == 0 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"empty_body"}')
  return
end

local ok, body = pcall(cjson.decode, raw)
if not ok or type(body) ~= "table" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json"}')
  return
end

local url = body.url
if not url or type(url) ~= "string" or url == "" then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"url_required","message":"url-Parameter fehlt."}')
  return
end

-- Whitespace trimmen
url = url:match("^%s*(.-)%s*$")

-- Nur HTTPS
if not url:match("^https://") then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"https_only","message":"Nur HTTPS-URLs werden unterstützt."}')
  return
end

-- URL-Länge begrenzen
if #url > 2048 then
  ngx.status = 400
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"url_too_long"}')
  return
end

-- SSRF-Schutz: private IPs / Loopback / Link-Local blockieren
local url_host = url:match("^https://([^/?#]+)")
if url_host then
  local blocked = {
    "localhost", "^127%.", "^10%.", "^192%.168%.", "^172%.1[6-9]%.",
    "^172%.2[0-9]%.", "^172%.3[01]%.", "^169%.254%.", "%[::1%]", "^0%.0%.0%.0"
  }
  local host_lc = url_host:lower():gsub(":%d+$", "") -- Port entfernen
  for _, pat in ipairs(blocked) do
    if host_lc:find(pat) then
      ngx.status = 400
      ngx.header["Content-Type"] = "application/json"
      ngx.say('{"error":"ssrf_blocked","message":"Interne Adressen sind nicht erlaubt."}')
      return
    end
  end
end

-- Google Drive Share-URL → Direct-Download umschreiben
-- https://drive.google.com/file/d/FILE_ID/view  →  uc?export=download&confirm=t&id=FILE_ID
-- https://drive.google.com/open?id=FILE_ID      →  uc?export=download&confirm=t&id=FILE_ID
local fetch_url = url
if url_host and url_host:lower():find("drive%.google%.com") then
  local gd_id = url:match("/file/d/([A-Za-z0-9_%-]+)")
  if not gd_id then
    gd_id = url:match("[?&]id=([A-Za-z0-9_%-]+)")
  end
  if gd_id then
    fetch_url = "https://drive.google.com/uc?export=download&confirm=t&id=" .. gd_id
  end
end

-- Fetch (resolver in nginx.conf: 1.1.1.1 / 8.8.8.8)
local httpc = http.new()
httpc:set_timeout(20000)

local res, err = httpc:request_uri(fetch_url, {
  method     = "GET",
  ssl_verify = true,
  headers    = { ["User-Agent"] = "SYS-FetchBundle/1.0" }
})

-- Redirect folgen (max. 1 Hop – typisch bei Google Drive / S3)
if res and (res.status == 301 or res.status == 302 or res.status == 303
            or res.status == 307 or res.status == 308) then
  local location = res.headers and (res.headers["Location"] or res.headers["location"])
  if location and location:match("^https://") then
    -- SSRF-Check für Redirect-Ziel
    local red_host = location:match("^https://([^/?#]+)")
    local redirect_ok = true
    if red_host then
      local rh = red_host:lower():gsub(":%d+$", "")
      local blocked2 = {
        "localhost", "^127%.", "^10%.", "^192%.168%.", "^172%.1[6-9]%.",
        "^172%.2[0-9]%.", "^172%.3[01]%.", "^169%.254%.", "%[::1%]", "^0%.0%.0%.0"
      }
      for _, pat in ipairs(blocked2) do
        if rh:find(pat) then redirect_ok = false; break end
      end
    end
    if redirect_ok then
      res, err = httpc:request_uri(location, {
        method     = "GET",
        ssl_verify = true,
        headers    = { ["User-Agent"] = "SYS-FetchBundle/1.0" }
      })
    end
  end
end

if not res then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  local msg = (err or "Verbindung fehlgeschlagen"):gsub('"', '\\"')
  ngx.say('{"error":"fetch_failed","message":"' .. msg .. '"}')
  return
end

if res.status ~= 200 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"upstream_error","status":' .. res.status
    .. ',"message":"Externe Quelle antwortete mit HTTP ' .. res.status .. '"}')
  return
end

local response_body = res.body
if not response_body or #response_body == 0 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"empty_response","message":"Leere Antwort von der Quelle."}')
  return
end

-- Größenlimit: 50 MB
if #response_body > 50 * 1024 * 1024 then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"response_too_large","message":"Bundle überschreitet 50 MB Limit."}')
  return
end

-- Oberflächliche JSON-Validierung (vollständige Schema-Prüfung im Client)
local ok2, parsed = pcall(cjson.decode, response_body)
if not ok2 or type(parsed) ~= "table" then
  ngx.status = 502
  ngx.header["Content-Type"] = "application/json"
  ngx.say('{"error":"invalid_json","message":"Antwort ist kein gültiges JSON."}')
  return
end

ngx.header["Content-Type"]  = "application/json; charset=utf-8"
ngx.header["Cache-Control"] = "no-store"
ngx.say(response_body)
