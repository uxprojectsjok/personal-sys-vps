<template>
  <ClientOnly>
    <div class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="calendar" :soul-meta="soulMeta || null" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Vault', 'Kalender']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />

        <div class="scroll">
          <div class="kal-page">

            <!-- Page header -->
            <div class="kal-hero">
              <div class="eyebrow">Kalender</div>
              <h1 class="kal-title">Deine <em>Zeitachse</em></h1>
              <p class="kal-sub">Sessions, Vault-Einträge und Verankerungen — gespiegelt auf den Monat.<br class="br-hide"> Tippe einen Tag, um eigene Einträge hinzuzufügen.</p>
            </div>

            <!-- Month navigation -->
            <div class="kal-nav">
              <div class="kal-nav-left">
                <button class="icon-btn" @click="prevMonth" aria-label="Vorheriger Monat">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>
                <span class="kal-month-label">{{ monthLabel }}</span>
                <button class="icon-btn" @click="nextMonth" aria-label="Nächster Monat">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
              <button class="kal-today-btn" @click="goToday">Heute</button>
            </div>

            <!-- Calendar + Detail panel -->
            <div class="kal-body" :class="{ 'has-detail': selectedDate }">

              <!-- Calendar grid -->
              <div class="kal-grid-wrap">
                <!-- Day headers -->
                <div class="kal-day-headers">
                  <span v-for="d in DAY_LABELS" :key="d" class="kal-dh">{{ d }}</span>
                </div>
                <!-- Day cells -->
                <div class="kal-grid">
                  <button
                    v-for="cell in cells"
                    :key="cell.key"
                    class="kal-cell"
                    :class="{
                      'out': !cell.inMonth,
                      'today': cell.isToday,
                      'selected': selectedDate === cell.date,
                      'has-entry': cell.hasEntry,
                    }"
                    :disabled="!cell.inMonth"
                    @click="cell.inMonth && selectDay(cell)"
                  >
                    <span class="kal-num">{{ cell.inMonth ? cell.day : '' }}</span>
                    <span class="kal-dots">
                      <span v-for="type in cell.entryTypes" :key="type" class="kal-dot" :class="`dot-${type}`" />
                    </span>
                  </button>
                </div>
              </div>

              <!-- Day detail panel -->
              <Transition name="detail-slide">
                <div v-if="selectedDate" class="kal-detail">
                  <div class="kd-head">
                    <div>
                      <div class="kd-date">{{ detailDateLabel }}</div>
                      <div class="kd-count">{{ selectedEntries.length }} {{ selectedEntries.length === 1 ? 'Eintrag' : 'Einträge' }}</div>
                    </div>
                    <button class="icon-btn" @click="selectedDate = null" aria-label="Schließen">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  <div class="kd-entries">
                    <div v-if="!selectedEntries.length" class="kd-empty">Keine Einträge für diesen Tag.</div>
                    <div v-for="(entry, i) in selectedEntries" :key="i" class="kd-entry">
                      <span class="kd-type-dot" :class="`dot-${entry.type}`" />
                      <div class="kd-entry-info">
                        <div class="kd-entry-text">{{ entry.text }}</div>
                        <div class="kd-entry-type">{{ TYPE_LABELS[entry.type] }}</div>
                      </div>
                      <button class="kd-del" @click="deleteEntry(i)" title="Löschen">✕</button>
                    </div>
                  </div>

                  <button class="kd-add-btn" @click="openAdd">
                    + Eintrag am {{ detailDayShort }} hinzufügen
                  </button>
                </div>
              </Transition>
            </div>

            <!-- Legend -->
            <div class="kal-legend">
              <span v-for="t in ENTRY_TYPES" :key="t.type" class="kal-leg-item">
                <span class="kal-dot" :class="`dot-${t.type}`" />
                {{ t.label }}
              </span>
            </div>

          </div><!-- /kal-page -->
        </div><!-- /scroll -->
      </div><!-- /main -->
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>

    <!-- Add entry modal -->
    <Transition name="fade-quick">
      <div v-if="addOpen" class="modal-scrim" @click.self="addOpen = false">
        <div class="modal-box">
          <div class="modal-head">
            <span>Eintrag · {{ detailDateLabel }}</span>
            <button class="icon-btn" @click="addOpen = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="modal-row">
              <label class="modal-label">Typ</label>
              <div class="modal-types">
                <button v-for="t in ENTRY_TYPES" :key="t.type"
                  class="modal-type-btn" :class="{ active: addType === t.type }"
                  @click="addType = t.type">
                  <span class="kal-dot" :class="`dot-${t.type}`" />
                  {{ t.label }}
                </button>
              </div>
            </div>
            <div class="modal-row">
              <label class="modal-label">Notiz</label>
              <textarea v-model="addText" class="modal-textarea" placeholder="Gedanke, Ereignis, Notiz…" rows="3" />
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn-ghost" @click="addOpen = false">Abbrechen</button>
            <button class="btn-accent" :disabled="!addText.trim() || saving" @click="saveEntry">
              {{ saving ? '…' : '+ Speichern' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </ClientOnly>
</template>

<script setup>
definePageMeta({ layout: false })
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { parseSoul, appendCalendarEntry, deleteCalendarEntry } from '#shared/utils/soulParser.js'

const router = useRouter()
const { soulContent, soulMeta, updateContent } = useSoul()
const { isConnected: vaultConnected, writeSoulMd } = useVault()

function lockGate() {
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/gate'
}

// ── Shell state ──────────────────────────────────────────────────────────
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

// ── Calendar state ────────────────────────────────────────────────────────
const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS     = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

const ENTRY_TYPES = [
  { type: 'session', label: 'Session' },
  { type: 'post',    label: 'Post'    },
  { type: 'vault',   label: 'Vault'   },
  { type: 'anker',   label: 'Anker'   },
]
const TYPE_LABELS = { session: 'Session', post: 'Post', vault: 'Vault', anker: 'Anker' }

const viewDate    = ref(new Date())
const selectedDate = ref(null)
const addOpen     = ref(false)
const addText     = ref('')
const addType     = ref('post')
const saving      = ref(false)

const monthLabel = computed(() => {
  const d = viewDate.value
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
})

const todayStr = computed(() => new Date().toISOString().split('T')[0])

function prevMonth() {
  const d = new Date(viewDate.value)
  d.setDate(1); d.setMonth(d.getMonth() - 1)
  viewDate.value = d
}
function nextMonth() {
  const d = new Date(viewDate.value)
  d.setDate(1); d.setMonth(d.getMonth() + 1)
  viewDate.value = d
}
function goToday() {
  viewDate.value = new Date()
  selectedDate.value = todayStr.value
}

// ── Parse calendar entries from sys.md ────────────────────────────────────
const calendarEntries = computed(() => {
  const map = new Map()
  if (!soulContent.value) return map
  const { sections } = parseSoul(soulContent.value)
  const cal = sections['Kalender'] || ''
  for (const line of cal.split('\n')) {
    const m = line.match(/\*\*(\d{4}-\d{2}-\d{2}):\*\*\s*(.+)/) ||
              line.match(/\*\*(\d{4}-\d{2}-\d{2})\*\*:\s*(.+)/)
    if (!m) continue
    const [, date, raw] = m
    if (!map.has(date)) map.set(date, [])
    const text = raw.trim()
    const lower = text.toLowerCase()
    let type = 'post'
    if (lower.startsWith('session') || lower.includes('[session]')) type = 'session'
    else if (lower.includes('[vault]') || lower.includes('vault:')) type = 'vault'
    else if (lower.includes('[anker]') || lower.includes('anker:')) type = 'anker'
    map.get(date).push({ text, type })
  }
  return map
})

// ── Grid cells ────────────────────────────────────────────────────────────
const cells = computed(() => {
  const d     = viewDate.value
  const year  = d.getFullYear()
  const month = d.getMonth()
  const firstDow   = new Date(year, month, 1).getDay()
  const offset     = firstDow === 0 ? 6 : firstDow - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey   = todayStr.value
  const result = []
  for (let i = 0; i < offset; i++) result.push({ key: `e-${i}`, inMonth: false })
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const entries = calendarEntries.value.get(dateStr) || []
    const types = [...new Set(entries.map(e => e.type))]
    result.push({ key: dateStr, day, date: dateStr, inMonth: true, isToday: dateStr === todayKey, hasEntry: entries.length > 0, entryTypes: types })
  }
  const rem = result.length % 7
  if (rem !== 0) for (let i = 0; i < 7 - rem; i++) result.push({ key: `t-${i}`, inMonth: false })
  return result
})

// ── Day detail ────────────────────────────────────────────────────────────
function selectDay(cell) {
  selectedDate.value = selectedDate.value === cell.date ? null : cell.date
}

const selectedEntries = computed(() => {
  if (!selectedDate.value) return []
  return calendarEntries.value.get(selectedDate.value) || []
})

const detailDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  const [y, m, day] = selectedDate.value.split('-').map(Number)
  return `${day}. ${MONTHS[m - 1]} ${y}`
})

const detailDayShort = computed(() => {
  if (!selectedDate.value) return ''
  return selectedDate.value.split('-')[2].replace(/^0/, '') + '.'
})

// ── Add / delete entries ──────────────────────────────────────────────────
function openAdd() {
  addText.value = ''
  addType.value = 'post'
  addOpen.value = true
}

async function saveEntry() {
  if (!addText.value.trim() || !selectedDate.value) return
  saving.value = true
  const prefix = addType.value !== 'post' ? `[${addType.value.charAt(0).toUpperCase() + addType.value.slice(1)}] ` : ''
  const updated = appendCalendarEntry(soulContent.value, selectedDate.value, prefix + addText.value.trim())
  updateContent(updated)
  if (vaultConnected.value) writeSoulMd(updated, 'sys').catch(() => {})
  addOpen.value = false
  saving.value = false
}

async function deleteEntry(idx) {
  const entry = selectedEntries.value[idx]
  if (!entry || !selectedDate.value) return
  const updated = deleteCalendarEntry(soulContent.value, selectedDate.value, entry.text)
  updateContent(updated)
  if (vaultConnected.value) writeSoulMd(updated, 'sys').catch(() => {})
}

// ── Navigation ────────────────────────────────────────────────────────────
function onNav(id) {
  if (id === 'calendar') return
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/einrichten');   return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/einnahmen');   return }
  if (id === 'maturity') { router.push('/reife');       return }
  if (id === 'anchor')   { router.push('/verankern');    return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/verbindung');  return }
  if (id === 'settings') { router.push('/einstellungen'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
/* ── Page layout ── */
.kal-page {
  padding: clamp(24px, 4vw, 48px) clamp(20px, 5vw, 56px);
  max-width: 1000px;
  margin: 0 auto;
  padding-bottom: 80px;
}

/* ── Hero ── */
.kal-hero { margin-bottom: 32px; }
.kal-title {
  font-family: var(--serif);
  font-size: clamp(32px, 5vw, 48px);
  font-weight: 400;
  letter-spacing: -0.03em;
  color: var(--fg);
  margin: 6px 0 10px;
  line-height: 1.1;
}
.kal-title em { font-style: italic; color: var(--accent); }
.kal-sub {
  font-size: 15px;
  color: var(--fg);
  line-height: 1.65;
  max-width: 480px;
}
.br-hide { display: none; }
@media (min-width: 600px) { .br-hide { display: block; } }

/* ── Month nav ── */
.kal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.kal-nav-left { display: flex; align-items: center; gap: 12px; }
.kal-month-label {
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--fg);
  min-width: 120px;
  text-align: center;
}
.kal-today-btn {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
  border: 1px solid var(--line);
  padding: 5px 12px;
  background: transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.kal-today-btn:hover { color: var(--fg); border-color: var(--fg-3); }

/* ── Body layout ── */
.kal-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  align-items: start;
}
.kal-body.has-detail {
  grid-template-columns: 1fr 300px;
}

/* ── Calendar grid ── */
.kal-day-headers {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}
.kal-dh {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--fg-4);
  text-align: center;
  padding: 4px 0;
}
.kal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 1px solid var(--line);
}
.kal-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  aspect-ratio: 1;
  border: 1px solid transparent;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background 0.12s;
  background: transparent;
  padding: 0;
  min-height: 44px;
}
.kal-cell:nth-child(7n) { border-right: none; }
.kal-cell:disabled, .kal-cell.out { pointer-events: none; }
.kal-cell:not(.out):not(.today):hover { background: rgba(255,255,255,0.04); }
.kal-cell.selected { background: rgba(109,184,154,0.09); }
.kal-cell.today .kal-num {
  background: var(--accent);
  color: var(--bg);
  width: 26px; height: 26px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.kal-num {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg-2);
  line-height: 1;
}
.kal-cell.today .kal-num { font-size: 12px; }
.kal-cell.selected .kal-num { color: var(--accent); }

.kal-dots { display: flex; gap: 2px; min-height: 5px; }
.kal-dot {
  width: 5px; height: 5px; border-radius: 50%; flex: none;
}
.dot-session { background: #4a9eff; }
.dot-post    { background: rgba(244,241,234,0.35); }
.dot-vault   { background: var(--accent); }
.dot-anker   { background: #f59e0b; }

/* ── Day detail panel ── */
.kal-detail {
  border: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
}
.kd-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--line);
}
.kd-date {
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--fg);
}
.kd-count {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--fg-4);
  margin-top: 3px;
}
.kd-entries { padding: 8px 0; flex: 1; }
.kd-empty {
  padding: 12px 16px;
  font-size: 12px;
  color: var(--fg-2);
  font-family: var(--mono);
}
.kd-entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}
.kd-entry:last-child { border-bottom: none; }
.kd-type-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 4px;
}
.kd-entry-info { flex: 1; min-width: 0; }
.kd-entry-text { font-size: 13px; color: var(--fg); line-height: 1.4; }
.kd-entry-type {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-top: 3px;
}
.kd-del {
  background: none; border: none;
  color: var(--fg-4); font-size: 11px; cursor: pointer;
  opacity: 0; transition: opacity 0.15s;
  padding: 2px 4px;
}
.kd-entry:hover .kd-del { opacity: 1; }
.kd-del:hover { color: #e06c75; }

.kd-add-btn {
  margin: 0;
  padding: 12px 16px;
  text-align: left;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--accent);
  background: transparent;
  border: none;
  border-top: 1px solid var(--line);
  cursor: pointer;
  transition: background 0.12s;
  width: 100%;
}
.kd-add-btn:hover { background: rgba(109,184,154,0.06); }

/* ── Legend ── */
.kal-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  flex-wrap: wrap;
}
.kal-leg-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-4);
}

/* ── Detail panel transition ── */
.detail-slide-enter-active, .detail-slide-leave-active { transition: opacity 0.2s, transform 0.2s; }
.detail-slide-enter-from, .detail-slide-leave-to { opacity: 0; transform: translateX(8px); }

/* ── Add entry modal ── */
.modal-scrim {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.modal-box {
  background: var(--surface);
  border: 1px solid var(--line);
  width: 100%; max-width: 420px;
  display: flex; flex-direction: column;
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--fg-3);
}
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.modal-row { display: flex; flex-direction: column; gap: 8px; }
.modal-label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-4);
}
.modal-types { display: flex; gap: 6px; flex-wrap: wrap; }
.modal-type-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px; border: 1px solid var(--line);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
  color: var(--fg-3); background: transparent; cursor: pointer;
  transition: all 0.15s;
}
.modal-type-btn.active { border-color: rgba(109,184,154,0.4); color: var(--accent); background: rgba(109,184,154,0.07); }
.modal-textarea {
  width: 100%; background: rgba(255,255,255,0.03);
  border: 1px solid var(--line); padding: 10px 12px;
  font-family: inherit; font-size: 13px; color: var(--fg); line-height: 1.5;
  resize: none;
}
.modal-textarea:focus { outline: none; border-color: var(--accent); }
.modal-foot {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
}
.btn-ghost {
  padding: 7px 16px; background: transparent; border: 1px solid var(--line);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
  color: var(--fg-3); cursor: pointer;
}
.btn-accent {
  padding: 7px 16px; background: rgba(109,184,154,0.12);
  border: 1px solid rgba(109,184,154,0.3);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
  color: var(--accent); cursor: pointer;
  transition: background 0.15s;
}
.btn-accent:disabled { opacity: 0.35; cursor: default; }
.btn-accent:not(:disabled):hover { background: rgba(109,184,154,0.20); }

/* ── Mobile ── */
@media (max-width: 900px) {
  .kal-body.has-detail { grid-template-columns: 1fr; }
  .kal-detail { border-left: none; }
  .kal-page { padding: 20px 16px 100px; }
}

.fade-quick-enter-active, .fade-quick-leave-active { transition: opacity 0.2s; }
.fade-quick-enter-from, .fade-quick-leave-to { opacity: 0; }
</style>
