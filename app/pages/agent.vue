<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="agent" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :monetization-enabled="monetizationEnabled"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_tools'), $t('nav.agent')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page ag-page">
            <div class="ag-head">
              <div class="ag-eyebrow">{{ $t('agent.eyebrow') }}</div>
              <h1 class="ag-title">{{ $t('agent.hero_prefix') }} <em>{{ $t('agent.hero_em') }}</em></h1>
              <p class="ag-sub">{{ $t('settings.agent_cron_desc') }}</p>
            </div>

            <!-- Node-weiter Kill-Switch (nur Node-Owner) -->
            <template v-if="isNodeOwner">
              <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid var(--sys-rule)">
                <label class="api-panel-row" style="cursor:pointer">
                  <div class="api-toggle" :class="autonomousAgentEnabled ? 'is-on' : ''">
                    <div class="api-toggle-thumb" :class="autonomousAgentEnabled ? 'is-on' : ''"></div>
                  </div>
                  <input type="checkbox" :checked="autonomousAgentEnabled" class="sr-only" :disabled="nodeConfigSaving" @change="toggleNodeConfig('autonomous_agent')" />
                  <span class="api-panel-row-label">{{ $t('settings.autonomous_agent_toggle_label') }}</span>
                </label>
                <Transition name="sys-modal-fade">
                  <p v-if="nodeConfigFeedback" class="sm-desc" :style="nodeConfigFeedback.ok ? 'color:var(--sys-ok);margin-top:6px' : 'color:var(--sys-err);margin-top:6px'">{{ nodeConfigFeedback.message }}</p>
                </Transition>
              </div>
            </template>

            <!-- Status Block -->
            <div class="archivar-lm-block" style="margin-bottom:20px">
              <div class="archivar-lm-row">
                <span class="archivar-lm-key">Claude Code</span>
                <span class="archivar-lm-val" :class="agentInstalled ? 'archivar-lm-ok' : ''">
                  {{ agentInstalled ? $t('settings.agent_installed') : $t('settings.agent_not_installed') }}
                </span>
              </div>
              <div class="archivar-lm-row">
                <span class="archivar-lm-key">{{ $t('settings.agent_interval_label') }}</span>
                <span class="archivar-lm-val">
                  {{ agentInterval === 'daily' ? $t('settings.agent_interval_daily') : $t('settings.agent_interval_hourly') }}
                </span>
              </div>
              <div class="archivar-lm-row">
                <span class="archivar-lm-key">{{ $t('settings.agent_last_run') }}</span>
                <span class="archivar-lm-val archivar-lm-dim">{{ agentLastRunLocal || $t('settings.agent_last_run_never') }}</span>
              </div>
            </div>

            <!-- Load error (auth/network) -- distinct from "not installed", see loadAgentStatus() -->
            <div v-if="agentLoadError" class="sm-infoblock" style="margin-bottom:20px;border-color:var(--sys-warn)">
              {{ $t('settings.agent_load_error', { status: agentLoadError }) }}
            </div>

            <!-- Not installed hint -->
            <div v-else-if="!agentInstalled" class="sm-infoblock" style="margin-bottom:20px">
              {{ $t('settings.agent_not_installed_hint') }}
            </div>

            <!-- No API key warning -->
            <div v-if="keySource === 'none'" class="sm-infoblock" style="margin-bottom:20px;border-color:var(--sys-warn)">
              {{ $t('settings.agent_no_api_key') }}
            </div>

            <!-- MCP Service Token fehlt -->
            <div v-if="agentInstalled && !agentMcpTokenOk" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:12px 16px;border:1px solid var(--sys-warn);border-radius:var(--r-xs);background:rgba(220,184,109,0.04)">
              <div>
                <div style="font-size:14px;font-weight:500;color:var(--sys-warn)">{{ $t('settings.agent_mcp_token_missing') }}</div>
                <div style="font-size:13px;line-height:1.55;color:var(--fg-2);margin-top:4px">{{ $t('settings.agent_mcp_token_missing_hint') }}</div>
              </div>
              <button
                class="sys-btn-ed sys-btn-ed--ghost"
                style="flex-shrink:0;margin-left:12px"
                :disabled="agentSetupMcpBusy"
                @click="setupAgentMcpToken"
              >{{ agentSetupMcpBusy ? '…' : $t('settings.agent_mcp_token_setup') }}</button>
            </div>

            <!-- Enable / Disable toggle -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding:14px 16px;border:1px solid var(--sys-rule);border-radius:var(--r-xs)"
              :style="[
                agentEnabled ? 'border-color:var(--sys-ok);background:rgba(184,220,196,0.04)' : '',
                !autonomousAgentEnabled ? 'opacity:0.45' : '',
              ]">
              <div>
                <div style="font-family:var(--sys-mono);font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:var(--fg)"
                  :style="agentEnabled ? 'color:var(--sys-ok)' : ''">
                  {{ agentEnabled ? $t('settings.agent_enabled') : $t('settings.agent_disabled') }}
                </div>
                <div style="font-family:var(--sys-mono);font-size:11px;color:var(--fg-4);margin-top:3px;letter-spacing:0.04em">
                  {{ agentInterval === 'daily' ? $t('settings.agent_interval_daily') : $t('settings.agent_interval_hourly') }}
                </div>
              </div>
              <button
                @click="toggleAgent(!agentEnabled)"
                :disabled="agentToggleBusy || !autonomousAgentEnabled"
                :title="!autonomousAgentEnabled ? $t('settings.agent_master_switch_hint') : ''"
                class="agent-toggle"
                :class="agentEnabled ? 'agent-toggle--on' : ''"
                :aria-label="agentEnabled ? $t('settings.agent_disable') : $t('settings.agent_enable')"
              >
                <span class="agent-toggle-knob"></span>
              </button>
            </div>

            <!-- Interval selector (Node-Owner only) + Run now (jede Soul).
                 "Daily" entfernt -- hatte nie eine Wirkung: sys-agent-run.sh
                 liest kein interval-Feld, init.sh installiert genau EINEN
                 Cron-Eintrag (stündlich, node-weit), keinen zweiten für
                 "daily". Interval ist damit ohnehin ein node-weites, kein
                 per-Soul-Konzept -- nur der Node-Owner bekommt die UI dafür.
                 Zwei komplett getrennte Blöcke statt eines gemeinsamen mit
                 versteckten Teilen: sonst bleibt bei anderen Souls die
                 "Interval"-Überschrift über einem einsamen Run-now-Button
                 stehen (falsche Beschriftung) und der Ghost-Button-Stil, der
                 vorher gegen den primären Interval-Button abgesetzt war, sieht
                 allein ungestylt aus -- live so aufgefallen. -->
            <div v-if="isNodeOwner" class="sys-field" style="gap:10px;margin-bottom:24px">
              <label class="sys-field-label">{{ $t('settings.agent_interval_label') }}</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button
                  class="sys-btn-ed sys-btn-ed--primary"
                  disabled
                >{{ $t('settings.agent_interval_hourly') }}</button>
                <button
                  class="sys-btn-ed sys-btn-ed--primary"
                  style="margin-left:auto"
                  :disabled="agentRunNowBusy"
                  @click="runAgentNow"
                >{{ agentRunNowBusy ? $t('settings.agent_running') : $t('settings.agent_run_now') }}</button>
              </div>
            </div>
            <div v-else style="margin-bottom:24px">
              <button
                class="sys-btn-ed sys-btn-ed--primary"
                :disabled="agentRunNowBusy"
                @click="runAgentNow"
              >{{ agentRunNowBusy ? $t('settings.agent_running') : $t('settings.agent_run_now') }}</button>
            </div>

            <!-- Queue editor -->
            <div class="sys-field" style="gap:10px">
              <label class="sys-field-label">{{ $t('settings.agent_queue_title') }}</label>
              <p style="font-size:13px;line-height:1.55;color:var(--fg-2);margin:0 0 8px">{{ $t('settings.agent_queue_desc') }}</p>
              <textarea
                v-model="agentQueueText"
                class="sys-input"
                rows="6"
                :placeholder="$t('settings.agent_queue_placeholder')"
                style="font-family:var(--sys-mono);font-size:12px;resize:vertical;line-height:1.6"
                spellcheck="false"
              ></textarea>
              <button
                class="sys-btn-ed sys-btn-ed--primary"
                style="margin-top:4px;width:100%;justify-content:center"
                :disabled="agentQueueSaving"
                @click="saveAgentQueue"
              >{{ agentQueueSaving ? $t('settings.agent_queue_saving') : $t('settings.agent_queue_save') }}</button>
            </div>

            <!-- Feedback -->
            <Transition name="sys-modal-fade">
              <div v-if="agentFeedback" style="margin-top:10px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                :style="agentFeedback.ok
                  ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                  : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
              >{{ agentFeedback.message }}</div>
            </Transition>

            <!-- Agent running status -->
            <div v-if="agentRunNowBusy || agentRunPolling" class="agent-status-running">
              <span class="agent-status-dot"></span>
              {{ agentRunNowBusy ? $t('settings.agent_starting') : $t('settings.agent_working') }}
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
  </ClientOnly>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { monetizationEnabled, fetchNodeStatus } = useNodeStatus()
onMounted(async () => {
  fetchNodeStatus()
  await loadNodeStatus()
  await detectAdmin()
  loadStatus()
  loadNodeConfig()
  loadAgentStatus()
})

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', transfer:'/transfer', export:'/export', peers:'/peers', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', connections:'/connections', gatekeeper:'/gatekeeper', wallet:'/wallet' }
  if (id === 'agent') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}

// ── Node-Owner / Admin-Erkennung (minimale Kopie aus SettingsModal.vue) ───────
const ADMIN_KEY     = 'sys_admin_token'
const isAdmin        = ref(false)
const adminToken     = ref('')
const isSoulAdmin    = ref(false)
const isMultiHoster  = ref(false)
const currentSoulId  = computed(() => soulToken.value?.split('.')?.[0] ?? '')

async function loadNodeStatus() {
  try {
    const res = await fetch('/api/node-status')
    if (res.ok) {
      const d = await res.json()
      isMultiHoster.value = !!d.multi_hoster
    }
  } catch {}
}

async function detectAdmin() {
  if (!isMultiHoster.value) {
    isAdmin.value     = !!soulToken.value
    isSoulAdmin.value = false
    adminToken.value  = ''
    return
  }
  const soulId = currentSoulId.value
  if (soulId) {
    const perSoul = localStorage.getItem(`sys_admin_token_${soulId}`)
    if (perSoul && perSoul.startsWith('adm_') && perSoul.length === 68) {
      isAdmin.value     = true
      adminToken.value  = perSoul
      isSoulAdmin.value = true
      return
    }
  }
  const stored = localStorage.getItem(ADMIN_KEY)
  if (stored && stored.startsWith('adm_') && stored.length === 68) {
    isAdmin.value     = true
    adminToken.value  = stored
    isSoulAdmin.value = false
    return
  }
  if (soulId && soulToken.value) {
    try {
      const res = await $fetch('/api/soul/admin-token', {
        headers: { Authorization: `Bearer ${soulToken.value}` },
      }).catch(() => null)
      if (res?.admin_token) {
        localStorage.setItem(`sys_admin_token_${soulId}`, res.admin_token)
        isAdmin.value     = true
        adminToken.value  = res.admin_token
        isSoulAdmin.value = true
      }
    } catch { /* kein admin_token für diese Soul, oder Server nicht erreichbar */ }
  }
}

// ── Node-config (Autonomous-Agent-Kill-Switch) ────────────────────────────────
const isNodeOwner            = ref(false)
const autonomousAgentEnabled = ref(false)
const nodeConfigSaving       = ref(false)
const nodeConfigFeedback     = ref(null)

function nodeConfigAuthHeaders() {
  // Bearer (Cert direkt aus sys.md) IMMER mitschicken — node_config.lua prüft
  // ihn zuerst und er ist unabhängig von jedem Gerät/localStorage gültig,
  // sobald die Soul eingeloggt ist. Der Admin-Token-Header kommt zusätzlich
  // dazu, wenn vorhanden, schadet aber nicht und deckt Edge-Cases ab — ohne
  // ihn wäre "bin ich Node-Owner" auf einem frischen Gerät (leeres
  // localStorage, Admin-Token-Auto-Fetch noch nicht durchgelaufen) fälschlich
  // "nein", obwohl Cert + sys.md dafür längst ausreichen (live so aufgetreten:
  // Kill-Switch auf einem neuen Mobile-Login unsichtbar).
  const headers = { Authorization: `Bearer ${soulToken.value}` }
  if (isSoulAdmin.value && currentSoulId.value) {
    headers['X-Soul-Admin-Token'] = adminToken.value
    headers['X-Soul-Id'] = currentSoulId.value
  }
  return headers
}

async function loadNodeConfig() {
  try {
    const res = await fetch('/api/node-config', { headers: nodeConfigAuthHeaders() })
    if (!res.ok) return
    const d = await res.json()
    isNodeOwner.value            = !!d.is_node_owner
    autonomousAgentEnabled.value = !!d.autonomous_agent
  } catch {}
}

async function toggleNodeConfig(field) {
  const next = !autonomousAgentEnabled.value
  nodeConfigSaving.value   = true
  nodeConfigFeedback.value = null
  try {
    const res = await fetch('/api/node-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...nodeConfigAuthHeaders() },
      body: JSON.stringify({ [field]: next }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.ok) {
      autonomousAgentEnabled.value = next
    } else {
      nodeConfigFeedback.value = { ok: false, message: d.message || t('settings.node_config_save_failed') }
    }
  } catch {
    nodeConfigFeedback.value = { ok: false, message: t('settings.node_config_save_failed') }
  }
  nodeConfigSaving.value = false
}

// ── API-Key-Status (nur für den "kein Key" Hinweis) ───────────────────────────
const keySource = ref('none')
async function loadStatus() {
  try {
    const res = await fetch('/api/get-config', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (!res.ok) return
    const d = await res.json()
    keySource.value = d.key_source || 'none'
  } catch {}
}

// ── Agent (Autonomous Agent Runner, per Soul) ─────────────────────────────────
const agentInstalled    = ref(false)
const agentEnabled      = ref(false)
const agentInterval     = ref('hourly')
const agentLastRun      = ref('')
const agentToggleBusy   = ref(false)
const agentRunNowBusy   = ref(false)
const agentQueueText    = ref('')
const agentQueueSaving  = ref(false)
const agentFeedback     = ref(null)
const agentRunPolling   = ref(false)
let   agentLogTimer     = null
const agentMcpTokenOk   = ref(true)
const agentLoadError    = ref('')

// Log-Zeitstempel bleiben serverseitig UTC (ISO 8601, z.B. "[2026-08-01T05:03:16Z]")
// — nur die UI-Anzeige rechnet in die Browser-Zeitzone um, damit "Last run"
// nicht gegen die eigene Uhr umgerechnet werden muss. Fällt bei älteren
// Log-Zeilen im alten "YYYY-MM-DD HH:MM:SS UTC"-Format (vor diesem Fix) oder
// sonstigem Parse-Fehler auf den Rohwert zurück, statt kaputt zu rendern.
const agentLastRunLocal = computed(() => {
  const raw = agentLastRun.value
  if (!raw) return raw
  const inner = raw.replace(/^\[|\]$/g, '')
  const d = new Date(inner)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
})
const agentSetupMcpBusy = ref(false)

async function loadAgentStatus() {
  try {
    const r = await fetch('/api/agent/cron', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      agentLoadError.value = ''
      const d = await r.json()
      agentInstalled.value = !!d.installed
      agentEnabled.value   = !!d.enabled
      agentInterval.value  = d.interval || 'hourly'
      agentLastRun.value   = d.last_run || ''
    } else {
      // Vorher stillschweigend ignoriert -- ein 401 (z.B. Auth-Fehler) sah dadurch
      // exakt wie "Claude Code not installed" aus (agentInstalled blieb bei seinem
      // false-Default), obwohl das zwei völlig unterschiedliche Zustände sind. Live
      // so aufgetreten: vault_auth.lua's Gate-Soul-Binding hat /api/agent/cron für
      // jede Soul außer der zuletzt per /gate authentifizierten mit 401 abgelehnt.
      agentLoadError.value = String(r.status)
    }
  } catch {
    agentLoadError.value = 'network'
  }
  try {
    const r = await fetch('/api/vault/services', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      agentMcpTokenOk.value = (d.services || []).some(s => s.name === 'SYS Agent Runner')
    }
  } catch {}
  try {
    const r = await fetch('/api/agent/queue', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      agentQueueText.value = d.content || ''
    }
  } catch {}
}

async function setupAgentMcpToken() {
  agentSetupMcpBusy.value = true
  try {
    const r = await fetch('/api/vault/services/agent-runner/rotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (r.ok) agentMcpTokenOk.value = true
  } catch { /* silent */ } finally {
    agentSetupMcpBusy.value = false
  }
}

async function toggleAgent(enable) {
  agentToggleBusy.value = true
  agentFeedback.value   = null
  try {
    const r = await fetch('/api/agent/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ enabled: enable }),
    })
    if (r.ok) {
      agentEnabled.value  = enable
      agentFeedback.value = { ok: true, message: enable ? t('settings.agent_enabled') + ' ✓' : t('settings.agent_disabled') }
    } else {
      agentFeedback.value = { ok: false, message: `Error ${r.status}` }
    }
  } catch (e) {
    agentFeedback.value = { ok: false, message: e.message }
  }
  agentToggleBusy.value = false
  setTimeout(() => { agentFeedback.value = null }, 4000)
}

async function runAgentNow() {
  agentRunNowBusy.value = true
  agentFeedback.value   = null
  clearInterval(agentLogTimer)
  try {
    const r = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok) {
      agentFeedback.value   = { ok: true, message: d.message || t('settings.agent_run_started') }
      agentRunNowBusy.value = false
      agentRunPolling.value = true
      let ticks = 0
      agentLogTimer = setInterval(async () => {
        ticks++
        try {
          const lr = await fetch('/api/agent/log', { headers: { Authorization: `Bearer ${soulToken.value}` } })
          if (lr.ok) {
            const ld = await lr.json()
            if (!ld.running) {
              clearInterval(agentLogTimer)
              agentRunPolling.value = false
              const cr = await fetch('/api/agent/cron', { headers: { Authorization: `Bearer ${soulToken.value}` } })
              if (cr.ok) { const cd = await cr.json(); agentLastRun.value = cd.last_run || '' }
              return
            }
          }
        } catch {}
        if (ticks >= 90) { clearInterval(agentLogTimer); agentRunPolling.value = false }
      }, 2000)
    } else {
      agentFeedback.value   = { ok: false, message: d.error || `Error ${r.status}` }
      agentRunNowBusy.value = false
    }
  } catch (e) {
    agentFeedback.value   = { ok: false, message: e.message }
    agentRunNowBusy.value = false
  }
}

async function saveAgentQueue() {
  agentQueueSaving.value = true
  agentFeedback.value    = null
  try {
    const r = await fetch('/api/agent/queue', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ content: agentQueueText.value }),
    })
    if (r.ok) {
      agentFeedback.value = { ok: true, message: t('settings.agent_queue_saved') }
    } else {
      agentFeedback.value = { ok: false, message: `Error ${r.status}` }
    }
  } catch (e) {
    agentFeedback.value = { ok: false, message: e.message }
  }
  agentQueueSaving.value = false
  setTimeout(() => { agentFeedback.value = null }, 4000)
}
</script>

<style scoped>
.ag-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.ag-head { padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.ag-eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.ag-title {
  font-family: var(--serif); font-size: clamp(32px, 5vw, 48px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 14px;
}
.ag-title em { font-style: italic; color: var(--accent); }
.ag-sub { font-size: 17px; line-height: 1.65; color: var(--fg); max-width: 560px; margin: 0; }

.api-panel-row { display: flex; align-items: center; gap: 10px; cursor: pointer; padding-top: 0; }
.api-panel-row-label { font-family: var(--sys-mono); font-size: 14px; letter-spacing: 0.1em; color: var(--fg); transition: color 0.15s; }
.api-panel-row:hover .api-panel-row-label { color: var(--sys-fg); }
.api-toggle { position: relative; width: 36px; height: 20px; background: rgba(255,255,255,0.1); border-radius: 10px; flex-shrink: 0; transition: background 0.2s; }
.api-toggle.is-on { background: var(--sys-ok); }
.api-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.2s; }
.api-toggle-thumb.is-on { transform: translateX(16px); }

.sm-desc { font-family: var(--mono); font-size: 12px; color: var(--fg-2); letter-spacing: 0.04em; margin: 0; line-height: 1.55; }
.sm-infoblock { padding: 10px 14px; margin-bottom: 20px; border-left: 2px solid var(--line-2); background: var(--surface-2); font-size: 13px; line-height: 1.55; color: var(--fg-2); }

.archivar-lm-block { border: 1px solid var(--sys-rule); border-radius: var(--r-xs); overflow: hidden; }
.archivar-lm-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--sys-rule); font-family: var(--mono); font-size: 12px; }
.archivar-lm-row:last-child { border-bottom: none; }
.archivar-lm-key  { color: var(--fg); letter-spacing: 0.06em; text-transform: uppercase; font-size: 10px; }
.archivar-lm-val  { color: var(--fg-2); letter-spacing: 0.04em; }
.archivar-lm-ok   { color: var(--sys-ok); }
.archivar-lm-dim  { color: var(--fg); }

.agent-toggle { position: relative; display: inline-flex; align-items: center; width: 44px; height: 24px; border-radius: 12px; border: none; cursor: pointer; background: var(--sys-rule-strong); transition: background 0.2s ease; flex-shrink: 0; }
.agent-toggle--on { background: var(--sys-ok); }
.agent-toggle:disabled { opacity: 0.45; cursor: not-allowed; }
.agent-toggle-knob { position: absolute; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.agent-toggle--on .agent-toggle-knob { transform: translateX(20px); }
.agent-status-running { display: flex; align-items: center; gap: 7px; margin-top: 12px; font-family: var(--sys-mono); font-size: 11px; letter-spacing: 0.05em; color: var(--sys-ok); }
.agent-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--sys-ok); box-shadow: 0 0 6px var(--sys-ok); animation: soul-pulse 1.4s ease-in-out infinite; }
</style>
