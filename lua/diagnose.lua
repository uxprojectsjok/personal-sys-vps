-- /etc/openresty/lua/diagnose.lua
-- GET /api/diagnose
-- Auth: soul_auth.lua (soul_cert required)
-- Reads the last ~200 lines of the OpenResty error log, filters Lua errors,
-- and returns them as a JSON array so the chat UI can surface them as @diagnose.

local cjson = require("cjson.safe")

local LOG_PATH  = "/var/log/openresty/error.log"
local TAIL_LINES = 200  -- scan window
local MAX_OUT    = 40   -- max entries returned

-- Read last TAIL_LINES lines without shelling out
local function tail_file(path, n)
  local f = io.open(path, "r")
  if not f then return {} end
  local lines = {}
  for line in f:lines() do
    lines[#lines + 1] = line
    if #lines > n * 2 then
      table.remove(lines, 1)
    end
  end
  f:close()
  -- keep last n
  local start = math.max(1, #lines - n + 1)
  local out = {}
  for i = start, #lines do out[#out + 1] = lines[i] end
  return out
end

local lines = tail_file(LOG_PATH, TAIL_LINES)

-- Filter: keep lines that mention lua errors, script errors, or 500s
local results = {}
for _, line in ipairs(lines) do
  local lo = line:lower()
  if lo:find("lua", 1, true)
     or lo:find("attempt to", 1, true)
     or lo:find("stack traceback", 1, true)
     or lo:find("error", 1, true)
  then
    -- Strip long nginx internal prefixes to keep output readable
    -- Typical format: 2026/05/24 10:23:45 [error] 12345#0: *1 ...
    local short = line:match("^%d+/%d+/%d+%s+%d+:%d+:%d+%s+(.+)$") or line
    results[#results + 1] = short
    if #results >= MAX_OUT then break end
  end
end

-- Reverse so newest is first
local reversed = {}
for i = #results, 1, -1 do reversed[#reversed + 1] = results[i] end

local now = ngx.now and ngx.now() or os.time()
local ts  = os.date("!%Y-%m-%dT%H:%M:%SZ", math.floor(now))

ngx.header["Content-Type"] = "application/json"
ngx.header["Cache-Control"] = "no-store"
ngx.say(cjson.encode({
  lines       = reversed,
  total_found = #results,
  checked_at  = ts,
  log_path    = LOG_PATH,
}))
