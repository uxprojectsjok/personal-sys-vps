-- /etc/openresty/lua/default_mind.lua
-- Liefert die Default-mind.md-Vorlage. Single Source of Truth für alle
-- "mind.md fehlt/ist beschädigt → neu anlegen"-Stellen (soul_cert.lua, mind.lua,
-- api_serve.lua, api_context.lua) statt einer Kopie pro Datei.
--
-- Primärquelle: /var/lib/sys/config/default_mind.md (aus shared/constants/
-- default_mind.md, wird von init.sh/update.sh dorthin kopiert).
-- Fallback: knapper eingebauter Minimal-Text, falls die Datei mal fehlt
-- (gleiches Muster wie die hardcodierten Werte in soul_price.lua).

local M = {}

local TEMPLATE_PATH = "/var/lib/sys/config/default_mind.md"

local FALLBACK = [[---
ki_name: SYS-AI
version: 1
write_protected: Identity,Boundaries
---

## Identity
You are the AI of this SYS node — not a generic instance, but the AI of this specific person.

## Boundaries
Claude's ethical principles are active and non-negotiable. This section is write-protected and cannot be changed via mind_write.
]]

function M.get()
  local f = io.open(TEMPLATE_PATH, "r")
  if not f then return FALLBACK end
  local content = f:read("*a"); f:close()
  if not content or content == "" then return FALLBACK end
  return content
end

return M
