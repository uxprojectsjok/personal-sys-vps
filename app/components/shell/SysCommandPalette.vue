<template>
  <Teleport to="#teleports">
    <Transition name="cmdk-fade">
      <div v-if="open" class="cmdk-scrim" @mousedown="$emit('close')">
        <div class="cmdk" @mousedown.stop>
          <div class="cmdk-search">
            <SysIcon name="search" style="width:19px;height:19px" />
            <input
              ref="inputEl"
              v-model="q"
              placeholder="Suchen, navigieren oder @-Befehl…"
              @keydown="onKey"
            />
            <span class="esc">ESC</span>
          </div>
          <div class="cmdk-results">
            <template v-if="flat.length === 0">
              <div class="cmdk-empty">Nichts gefunden für „{{ q }}"</div>
            </template>
            <template v-else>
              <template v-if="filteredNav.length > 0">
                <div class="cmdk-group-label">Navigation</div>
                <div
                  v-for="(it, i) in filteredNav"
                  :key="'n' + it.id"
                  :class="['cmdk-item', { sel: sel === i }]"
                  @mouseenter="sel = i"
                  @click="run(it)"
                >
                  <span class="ck-ic"><SysIcon :name="it.icon" style="width:17px;height:17px" /></span>
                  <span class="ck-body">
                    <div class="ck-title">{{ it.label }}</div>
                    <div class="ck-sub">{{ it.sub }}</div>
                  </span>
                  <span class="ck-arr">↵</span>
                </div>
              </template>
              <template v-if="filteredCmds.length > 0">
                <div class="cmdk-group-label">@-Befehle</div>
                <div
                  v-for="(it, i) in filteredCmds"
                  :key="'c' + it.cmd"
                  :class="['cmdk-item', { sel: sel === filteredNav.length + i }]"
                  @mouseenter="sel = filteredNav.length + i"
                  @click="runCmd(it)"
                >
                  <span class="ck-ic"><span class="ck-at">@</span></span>
                  <span class="ck-body">
                    <div class="ck-title">{{ it.cmd }}</div>
                    <div class="ck-sub">{{ it.desc }}</div>
                  </span>
                  <span class="ck-arr">↵</span>
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'navigate', 'insert'])

const q = ref('')
const sel = ref(0)
const inputEl = ref(null)

const NAV_ITEMS = [
  { id: 'home',     icon: 'home',     label: 'Start',          sub: 'Übersicht' },
  { id: 'chat',     icon: 'chat',     label: 'Session',        sub: 'Mit SoulKI sprechen' },
  { id: 'soul',     icon: 'soul',     label: 'sys.md',         sub: 'Lebendige Identitätsdatei' },
  { id: 'chronik',  icon: 'history',  label: 'Chronik',        sub: 'Alle Session-Einträge' },
  { id: 'maturity', icon: 'spark',    label: 'Reife',          sub: 'Soul-Entwicklung' },
  { id: 'files',    icon: 'files',    label: 'Dateien',        sub: 'Vault · Audio · Video · Bilder' },
  { id: 'calendar', icon: 'calendar', label: 'Kalender',       sub: 'Termine & Einträge' },
  { id: 'peers',    icon: 'peers',    label: 'Peers',          sub: 'Vertraute Souls' },
  { id: 'connect',  icon: 'qr',       label: 'Verbindung',     sub: 'QR-Connect · MCP-Endpoint teilen' },
  { id: 'market',   icon: 'market',   label: 'Marketplace',    sub: 'Souls & Agenten' },
  { id: 'anchor',   icon: 'anchor',   label: 'Verankern',      sub: 'Polygon Blockchain' },
  { id: 'export',   icon: 'export',   label: 'Exportieren',    sub: '.soul · AES-GCM · 12 Wörter' },
  { id: 'settings', icon: 'settings', label: 'Einstellungen',  sub: 'Node-Konfiguration' },
]

const AT_COMMANDS = [
  { cmd: '@suche',        desc: 'KI-Websuche' },
  { cmd: '@create-media', desc: 'KI-Bild generieren' },
  { cmd: '@audio',        desc: 'Stimme aufnehmen' },
  { cmd: '@gesicht',      desc: 'Gesicht aufnehmen' },
  { cmd: '@bewegung',     desc: 'Bewegung aufnehmen' },
  { cmd: '@sprechen',     desc: 'Sprachaufnahme' },
  { cmd: '@contact',      desc: 'Peer hinzufügen' },
  { cmd: '@alle',         desc: 'An alle Peers' },
  { cmd: '@agent',        desc: 'Agent Sandbox' },
  { cmd: '@session-end',  desc: 'Session eintragen' },
]

const ql = computed(() => q.value.trim().toLowerCase())

const filteredNav = computed(() =>
  NAV_ITEMS.filter(i => !ql.value || i.label.toLowerCase().includes(ql.value) || i.sub.toLowerCase().includes(ql.value))
)
const filteredCmds = computed(() =>
  AT_COMMANDS.filter(i => !ql.value || i.cmd.toLowerCase().includes(ql.value) || i.desc.toLowerCase().includes(ql.value))
)
const flat = computed(() => [...filteredNav.value, ...filteredCmds.value])

watch(() => props.open, async (v) => {
  if (v) { q.value = ''; sel.value = 0; await nextTick(); inputEl.value?.focus() }
})
watch(q, () => sel.value = 0)

function run(it) { emit('navigate', it.id); emit('close') }
function runCmd(it) { emit('insert', it.cmd + ' '); emit('close') }

function onKey(e) {
  if (e.key === 'Escape') { emit('close') }
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = Math.min(sel.value + 1, flat.value.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = Math.max(sel.value - 1, 0) }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flat.value[sel.value]
    if (!item) return
    if (sel.value < filteredNav.value.length) run(item)
    else runCmd(item)
  }
}
</script>

<style scoped>
.cmdk-fade-enter-active, .cmdk-fade-leave-active { transition: opacity .18s; }
.cmdk-fade-enter-from, .cmdk-fade-leave-to { opacity: 0; }
</style>
