#!/bin/bash
# SYS Agent Runner — runs via cron or on-demand, processes tasks from agent.md
# Usage: sys-agent-run.sh [soul_id]
#   With soul_id: runs for that soul only, bypasses enabled check (for "run now")
#   Without args: cron mode — iterates all enabled souls

set -euo pipefail

SOULS_DIR="/var/lib/sys/souls"
CONFIG_DIR="/var/lib/sys/config"
AGENT_DIR="/var/lib/sys/agent"
LOG_MASTER="/var/log/sys_agent.log"

# Source dir written by init.sh — resolves correctly on both dev and fresh installs
_SYS_DIR_FILE="/var/lib/sys/sys_dir"
WORK_DIR=""
if [[ -f "$_SYS_DIR_FILE" ]]; then
  WORK_DIR="$(tr -d '[:space:]' < "$_SYS_DIR_FILE")"
fi
[[ -z "$WORK_DIR" || ! -d "$WORK_DIR" ]] && WORK_DIR="/opt/sys"

# Resolve claude binary: sentinel file → PATH
CLAUDE_BIN=""
if [[ -f /var/lib/sys/claude_path ]]; then
  CLAUDE_BIN="$(cat /var/lib/sys/claude_path | tr -d '[:space:]')"
  [[ -x "$CLAUDE_BIN" ]] || CLAUDE_BIN=""
fi
if [[ -z "$CLAUDE_BIN" ]]; then
  CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
fi

# Force-mode: specific soul_id passed as first arg (from "run now" button)
FORCE_SOUL="${1:-}"

mkdir -p "$AGENT_DIR/.claude"

ts() { date -u '+%Y-%m-%d %H:%M:%S UTC'; }

run_soul() {
  local soul_id="$1"
  local soul_dir="$SOULS_DIR/$soul_id"
  local CONFIG_FILE="$CONFIG_DIR/agent_cron_${soul_id}.json"
  local AGENT_MD="$soul_dir/vault/context/agent.md"
  local LOG_FILE="/var/log/sys_agent_${soul_id}.log"
  local SHORT_ID="${soul_id:0:8}"

  # Truncate soul log at run start — file always contains only the last run
  > "$LOG_FILE" 2>/dev/null || true

  log_s() { echo "[$(ts)] $*" >> "$LOG_FILE"; echo "[$(ts)] [$SHORT_ID] $*" >> "$LOG_MASTER"; }

  # In cron mode check enabled flag; in force mode skip this
  if [[ -z "$FORCE_SOUL" ]]; then
    [[ -f "$CONFIG_FILE" ]] || { echo "[$(ts)] [$SHORT_ID] no config — skip" >> "$LOG_MASTER"; return; }
    local enabled
    enabled=$(python3 -c "import json; d=json.load(open('$CONFIG_FILE')); print(d.get('enabled',False))" 2>/dev/null || echo "False")
    if [[ "$enabled" != "True" ]]; then
      echo "[$(ts)] [$SHORT_ID] agent disabled — skip" >> "$LOG_MASTER"
      return
    fi
  fi

  log_s "=== Agent run: soul $soul_id ==="

  if [[ -z "$CLAUDE_BIN" ]]; then
    log_s "ERROR: claude not found (checked /var/lib/sys/claude_path and PATH)"
    return
  fi
  log_s "claude: $CLAUDE_BIN"

  if [[ ! -f "$AGENT_MD" ]]; then
    log_s "agent.md not found — idle"
    return
  fi

  # Detect pending tasks — supports both formats:
  #   checkbox:  - [ ] task
  #   section:   **Status:** offen  |  Status: offen  |  status: open
  local task_count=0
  task_count=$(grep -cE "^- \[ \]|\*\*Status:\*\* offen|Status: offen|status: open" "$AGENT_MD" 2>/dev/null || true)

  if [[ "$task_count" -eq 0 ]]; then
    log_s "no pending tasks — idle"
    return
  fi

  log_s "$task_count pending task(s) found"

  # API key: soul config → master.json
  local API_KEY
  API_KEY="$(python3 -c "
import json
key = ''
try:
  d = json.load(open('$soul_dir/config.json'))
  key = d.get('anthropic_key', '')
except: pass
if not key:
  try:
    d = json.load(open('$CONFIG_DIR/master.json'))
    key = d.get('anthropic_key', '')
  except: pass
print(key)
" 2>/dev/null || echo "")"

  if [[ -z "$API_KEY" ]]; then
    log_s "ERROR: no anthropic_key — set in Settings → API tab"
    return
  fi
  log_s "API key: ok"

  export ANTHROPIC_API_KEY="$API_KEY"

  # MCP config (Zapier, etc.) — written as --mcp-config file, NOT settings.json
  local MCP_URL MCP_CONFIG_FILE MCP_CONFIG_ARG
  MCP_URL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('mcp_url',''))
except: print('')
" 2>/dev/null || echo "")"

  MCP_CONFIG_FILE="$AGENT_DIR/mcp.json"
  MCP_CONFIG_ARG=""
  MCP_TOOLS=""
  if [[ -n "$MCP_URL" ]]; then
    python3 -c "
import json
cfg = {'mcpServers': {'zapier': {'type': 'http', 'url': '$MCP_URL'}}}
with open('$MCP_CONFIG_FILE','w') as f:
  json.dump(cfg, f, indent=2)
" 2>/dev/null \
    && log_s "MCP: Zapier configured (mcp.json)" \
    || log_s "WARNING: could not write mcp.json"
    MCP_CONFIG_ARG="--mcp-config $MCP_CONFIG_FILE"
    MCP_TOOLS=",mcp__zapier__*"
  else
    rm -f "$MCP_CONFIG_FILE"
    log_s "MCP: not configured (no mcp_url in config)"
  fi

  local MODEL
  MODEL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('model','claude-sonnet-4-6') or 'claude-sonnet-4-6')
except: print('claude-sonnet-4-6')
" 2>/dev/null || echo "claude-sonnet-4-6")"

  log_s "model: $MODEL"

  local TODAY
  TODAY="$(date -u '+%Y-%m-%d')"

  local CLAUDE_MD="$AGENT_DIR/CLAUDE.md"
  local CLAUDE_MD_HINT=""
  [[ -f "$CLAUDE_MD" ]] && CLAUDE_MD_HINT="First read $CLAUDE_MD — it defines your scope and allowed tools.

"

  local PROMPT="${CLAUDE_MD_HINT}Read $AGENT_MD and work through every pending task.

## Sections in agent.md
- **## Dauertasks** — standing rules, always apply after completing each task. Never mark them done.
- **## Offene Tasks** — tasks to complete. Identified by '**Status:** offen' or '- [ ]'.
- **## Erledigte Tasks** — completed tasks archive.

## Steps for each pending task
1. Complete it fully using your available tools.
2. Apply all rules from '## Dauertasks' (e.g. send a summary email).
3. Rewrite agent.md:
   - Move the completed task block from '## Offene Tasks' to '## Erledigte Tasks'
   - Change '**Status:** offen' to '**Status:** erledigt $TODAY'
   - checkbox format: change '- [ ]' to '- [x] $TODAY —'
   - If '## Erledigte Tasks' only has '*(leer)*', replace that line with the task block
   - Leave '## Dauertasks' section completely unchanged

Work sequentially. Be careful and conservative."

  # Pre-fix ownership so www-data can read/write during the run
  chown -R www-data:www-data "$soul_dir/vault/context/" 2>/dev/null || true

  log_s "launching Claude..."

  # cd into soul dir so agent.md is in the project scope (Claude Code requires
  # files to be within cwd or --add-dir for Edit/Write to be auto-approved).
  cd "$soul_dir/vault/context"
  # shellcheck disable=SC2086
  echo "$PROMPT" | "$CLAUDE_BIN" \
    --model "$MODEL" \
    --print \
    --add-dir /var/lib/sys \
    --add-dir "$WORK_DIR" \
    --allowedTools "Read,Edit,Write,Bash,Glob,Grep,LS,WebSearch,WebFetch,TodoWrite,TodoRead${MCP_TOOLS}" \
    $MCP_CONFIG_ARG \
    >> "$LOG_FILE" 2>&1 \
    || log_s "WARNING: claude exited non-zero"

  # Restore www-data ownership on files the runner (root) may have created/modified
  chown -R www-data:www-data "$soul_dir/vault/context/" 2>/dev/null || true
  log_s "ownership restored"

  log_s "=== Run complete ==="
}

# ── Main ─────────────────────────────────────────────────────────────────────
MODE="$( [[ -n "$FORCE_SOUL" ]] && echo "force ($FORCE_SOUL)" || echo "scan" )"
echo "[$(ts)] cron fired — mode: $MODE" >> "$LOG_MASTER"

if [[ -n "$FORCE_SOUL" ]]; then
  run_soul "$FORCE_SOUL"
else
  soul_count=0
  for soul_dir in "$SOULS_DIR"/*/; do
    [[ -d "$soul_dir" ]] || continue
    soul_count=$((soul_count+1))
    run_soul "$(basename "$soul_dir")"
  done
  echo "[$(ts)] scan complete — $soul_count soul(s) checked" >> "$LOG_MASTER"
fi
