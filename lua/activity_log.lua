-- /etc/openresty/lua/activity_log.lua
-- 14-Tage-Rolling-Log für Schreibzugriffe verbundener Service-Tokens
-- (ChatGPT, Mistral, Claude, ...). Liegt in vault/context/, also automatisch
-- über context_get/context_list für jede KI abfragbar — kein eigenes Tool nötig.
-- Ergänzt die freiwillige Selbstauskunft aus mind.md ("## Signature"): dort
-- signiert die KI ihre Einträge selbst, hier läuft unabhängig davon ein
-- serverseitiger Fallback mit, der nicht von der KI-Mitarbeit abhängt.
--
-- Kein Langzeit-Log: Einträge älter als RETENTION_DAYS werden bei jedem
-- Schreibvorgang verworfen, die Datei überschreibt sich also selbst.

local M = {}
local RETENTION_DAYS = 14

function M.record(soul_id, actor, method, uri)
  if type(soul_id) ~= "string" or soul_id == "" then return end

  local dir  = "/var/lib/sys/souls/" .. soul_id .. "/vault/context"
  local path = dir .. "/activity.md"

  local now_ts   = math.floor(ngx.now())
  local ts_str   = os.date("!%Y-%m-%dT%H:%MZ", now_ts)
  local new_line = "- " .. ts_str .. " | " .. (actor or "?") .. " | " .. method .. " " .. uri

  local lines = {}
  local f = io.open(path, "r")
  if f then
    for line in f:lines() do lines[#lines + 1] = line end
    f:close()
  end

  -- Grobes 14-Tage-Fenster (UTC vs. lokale os.time()-Interpretation wird
  -- bewusst ignoriert — ein paar Stunden Abweichung sind für dieses
  -- Kontextsignal irrelevant, kein forensisches Audit-Log).
  local cutoff = now_ts - (RETENTION_DAYS * 86400)
  local kept   = { new_line }
  for _, line in ipairs(lines) do
    local y, mo, d, h, mi = line:match("^%- (%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d)Z")
    if y then
      local line_ts = os.time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d),
                                 hour = tonumber(h), min = tonumber(mi) })
      if line_ts >= cutoff then kept[#kept + 1] = line end
    else
      kept[#kept + 1] = line  -- unbekanntes Format (z.B. eine Kopfzeile) behalten
    end
  end

  os.execute("mkdir -p " .. dir)
  local wf = io.open(path, "w")
  if wf then
    wf:write(table.concat(kept, "\n") .. "\n")
    wf:close()
    os.execute("chown www-data:www-data " .. path .. " 2>/dev/null || true")
  end
end

return M
