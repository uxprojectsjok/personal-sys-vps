-- /etc/openresty/lua/write_lock.lua
-- Lua-seitiges Gegenstück zu soul-mcp/lib/write_lock.mjs — schließt NICHT
-- dieselbe Lücke (das JS-Lock ist reine In-Process-Sperre im soul-mcp-
-- Node-Prozess, unsichtbar für OpenResty-Worker; dieses Lock ist reine
-- In-Worker-Sperre über ngx.shared, unsichtbar für den Node-Prozess — beide
-- schützen nur innerhalb der eigenen Laufzeit, nicht gegeneinander). Deckt
-- aber ab, was vorher komplett ungeschützt war: mehrere gleichzeitige
-- Lua-Requests (z.B. soul_paid_write.lua + soul_paid_comment.lua von einem
-- zahlenden Agenten, oder api_context.lua von zwei Browser-Tabs), die
-- dieselbe sys.md lasen, im Speicher änderten und zurückschrieben — der
-- zweite Write gewann, der erste verschwand spurlos (Lost-Update).
--
-- lua_shared_dict sys_write_lock (siehe nginx.conf/sys-node-globals.conf)
-- muss deklariert sein; ohne sie fail-open (wie an anderen Stellen im
-- Code, z.B. gate_sessions-Checks) statt Requests zu blockieren.

local M = {}

local DICT       = ngx.shared.sys_write_lock
local MAX_WAIT_S = 5      -- Requests warten max. 5s auf den Lock
local POLL_S     = 0.02   -- Poll-Intervall
local TTL_S      = 10     -- Sicherheitsnetz: Lock läuft spätestens nach 10s ab,
                           -- falls release() durch einen echten Absturz nie kommt

-- Blockiert (nicht-busy-waiting via ngx.sleep, blockiert also nur diesen
-- Request, keine andere Verbindung) bis der Lock für `key` frei ist, dann
-- übernimmt er ihn. true = übernommen, false = Timeout (Aufrufer sollte
-- dann 503 statt unsynchronisiert weiterzuschreiben).
function M.acquire(key)
  if not DICT then return true end
  local waited = 0
  while not DICT:add(key, true, TTL_S) do
    if waited >= MAX_WAIT_S then return false end
    ngx.sleep(POLL_S)
    waited = waited + POLL_S
  end
  return true
end

function M.release(key)
  if DICT then DICT:delete(key) end
end

-- Schlüssel-Konvention: pro Ressourcentyp + soul_id, bewusst NICHT im
-- selben Format wie write_lock.mjs's writeLockKey() (soulId@nodeUrl) —
-- unterschiedliche Namespaces, die sich nie überschneiden sollen, damit
-- niemand fälschlich annimmt, beide Locks wären dasselbe/kompatibel.
function M.sysmd_key(soul_id)
  return "sysmd:" .. soul_id
end

return M
