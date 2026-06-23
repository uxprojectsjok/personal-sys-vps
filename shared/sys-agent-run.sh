#!/bin/bash
# SYS Agent Runner — runs via cron or on-demand, processes tasks from agent.md
# Usage: sys-agent-run.sh [soul_id]
#   With soul_id: runs for that soul only, bypasses enabled check (for "run now")
#   Without args: cron mode — iterates all enabled souls

set -euo pipefail

SOULS_DIR="/var/lib/sys/souls"
CONFIG_DIR="/var/lib/sys/config"
AGENT_DIR="/var/lib/sys/agent"
WORK_DIR="/var/www/SaveYourSoul_init"

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

run_soul() {
  local soul_id="$1"
  local soul_dir="$SOULS_DIR/$soul_id"
  local CONFIG_FILE="$CONFIG_DIR/agent_cron_${soul_id}.json"
  local AGENT_MD="$soul_dir/vault/context/agent.md"
  local LOG_FILE="/var/log/sys_agent_${soul_id}.log"

  # In cron mode check enabled flag; in force mode skip this
  if [[ -z "$FORCE_SOUL" ]]; then
    [[ -f "$CONFIG_FILE" ]] || return
    local enabled
    enabled=$(python3 -c "import json; d=json.load(open('$CONFIG_FILE')); print(d.get('enabled',False))" 2>/dev/null || echo "False")
    [[ "$enabled" == "True" ]] || return
  fi

  if [[ -z "$CLAUDE_BIN" ]]; then
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] ERROR: claude not found (checked /var/lib/sys/claude_path and PATH)" >> "$LOG_FILE"
    return
  fi

  [[ -f "$AGENT_MD" ]] || {
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] No agent.md found — idle." >> "$LOG_FILE"
    return
  }

  # Detect pending tasks — supports both formats:
  #   checkbox:  - [ ] task
  #   section:   **Status:** offen  |  Status: offen  |  status: open
  local has_tasks=false
  if grep -qE "^- \[ \]|\*\*Status:\*\* offen|Status: offen|status: open" "$AGENT_MD" 2>/dev/null; then
    has_tasks=true
  fi

  if [[ "$has_tasks" == "false" ]]; then
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] No pending tasks — idle." >> "$LOG_FILE"
    return
  fi

  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] === Agent run: soul $soul_id ===" >> "$LOG_FILE"

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
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] ERROR: No anthropic_key — set in Settings → API tab" >> "$LOG_FILE"
    return
  fi

  export ANTHROPIC_API_KEY="$API_KEY"

  # MCP config (Zapier, etc.)
  local MCP_URL
  MCP_URL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('mcp_url',''))
except: print('')
" 2>/dev/null || echo "")"

  if [[ -n "$MCP_URL" ]]; then
    python3 -c "
import json
cfg = {'mcpServers': {'zapier': {'type': 'http', 'url': '$MCP_URL'}}}
with open('$AGENT_DIR/.claude/settings.json','w') as f:
  json.dump(cfg, f, indent=2)
" 2>/dev/null \
    && echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Zapier MCP configured." >> "$LOG_FILE" \
    || echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] WARNING: could not write settings.json" >> "$LOG_FILE"
  else
    rm -f "$AGENT_DIR/.claude/settings.json"
  fi

  local MODEL
  MODEL="$(python3 -c "
import json
try:
  d = json.load(open('$soul_dir/config.json'))
  print(d.get('model','claude-sonnet-4-6') or 'claude-sonnet-4-6')
except: print('claude-sonnet-4-6')
" 2>/dev/null || echo "claude-sonnet-4-6")"

  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] model: $MODEL" >> "$LOG_FILE"

  local TODAY
  TODAY="$(date -u '+%Y-%m-%d')"

  local CLAUDE_MD="$AGENT_DIR/CLAUDE.md"
  local CLAUDE_MD_HINT=""
  [[ -f "$CLAUDE_MD" ]] && CLAUDE_MD_HINT="First read $CLAUDE_MD — it defines your scope and allowed tools.

"

  local PROMPT="${CLAUDE_MD_HINT}Read $AGENT_MD and work through every pending task.

Pending tasks are lines starting with '- [ ]' OR sections with '**Status:** offen'.

For each pending task:
1. Complete it fully using your available tools.
2. Mark it done:
   - checkbox format: change '- [ ]' to '- [x] $TODAY —'
   - section format:  change '**Status:** offen' to '**Status:** erledigt $TODAY'

Work sequentially. Be careful and conservative."

  # Build settings arg — point to agent .claude/ dir if it has a settings.json
  local SETTINGS_ARG=""
  local SETTINGS_FILE="$AGENT_DIR/.claude/settings.json"
  [[ -f "$SETTINGS_FILE" ]] && SETTINGS_ARG="--settings $SETTINGS_FILE"

  cd "$WORK_DIR"
  # shellcheck disable=SC2086
  echo "$PROMPT" | "$CLAUDE_BIN" \
    --model "$MODEL" \
    --print \
    --add-dir /var/lib/sys \
    --allowedTools "Read,Edit,Write,Bash,Glob,Grep,LS,WebSearch,WebFetch,TodoWrite,TodoRead" \
    $SETTINGS_ARG \
    >> "$LOG_FILE" 2>&1 \
    || echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] WARNING: claude exited non-zero" >> "$LOG_FILE"

  # Restore www-data ownership on files the runner (root) may have created/modified
  chown -R www-data:www-data "$soul_dir/vault/context/" 2>/dev/null || true

  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] === Run complete ===" >> "$LOG_FILE"
}

# ── Main ─────────────────────────────────────────────────────────────────────
if [[ -n "$FORCE_SOUL" ]]; then
  run_soul "$FORCE_SOUL"
else
  for soul_dir in "$SOULS_DIR"/*/; do
    [[ -d "$soul_dir" ]] || continue
    run_soul "$(basename "$soul_dir")"
  done
fi
