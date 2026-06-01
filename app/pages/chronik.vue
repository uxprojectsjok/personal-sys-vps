<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="chronik" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Seele', 'Chronik']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true">
          <div class="ch-search-wrap">
            <svg class="ch-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
              <circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input
              v-model="query"
              class="ch-search"
              type="search"
              placeholder="Suchen oder Befehl…"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </SysTopbar>

        <div class="scroll">
          <div class="chronik-page">

            <!-- ── Hero ── -->
            <div class="ch-hero">
              <div class="ch-eyebrow">CHRONO</div>
              <h1 class="ch-title">Deine <em>Geschichte</em></h1>
              <p class="ch-sub">Jede Session, chronologisch. Verankerte Einträge sind kryptographisch auf Polygon signiert — unwiderruflich.</p>
            </div>

            <!-- ── Feed ── -->
            <div v-if="filtered.length === 0" class="ch-empty">
              <span v-if="query">Keine Einträge für „{{ query }}"</span>
              <span v-else>Noch keine Einträge im Session-Log.</span>
            </div>

            <div v-else class="ch-feed">
              <template v-for="group in groupedEntries" :key="group.date">
                <div class="ch-date-sep">{{ group.date }}</div>
                <div v-for="entry in group.entries" :key="entry.id" class="ch-entry">
                  <div class="ch-entry-left">
                    <div class="ch-dot" :class="`ch-dot-${entry.type}`">
                      <!-- session -->
                      <svg v-if="entry.type === 'session'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <circle cx="8" cy="8" r="5"/>
                      </svg>
                      <!-- peer -->
                      <svg v-else-if="entry.type === 'peer'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <circle cx="6" cy="6" r="2.5"/><circle cx="10" cy="10" r="2.5"/>
                        <path stroke-linecap="round" d="M8.5 7.5 l1 1"/>
                      </svg>
                      <!-- health -->
                      <svg v-else-if="entry.type === 'health'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2 8h2.5l1.5-3 2 6 1.5-3H14"/>
                      </svg>
                      <!-- vault -->
                      <svg v-else-if="entry.type === 'vault'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="2" y="5" width="12" height="9" rx="1.5"/><path stroke-linecap="round" d="M5 5V4a3 3 0 0 1 6 0v1"/>
                        <circle cx="8" cy="9.5" r="1.2"/>
                      </svg>
                      <!-- anchor/chain -->
                      <svg v-else-if="entry.type === 'anchor'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <circle cx="8" cy="4" r="1.5"/><path stroke-linecap="round" d="M8 5.5v7M5 10c0 1.66 1.34 3 3 3s3-1.34 3-3"/>
                      </svg>
                      <!-- genesis -->
                      <svg v-else-if="entry.type === 'genesis'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 2 L9.8 6.2 L14 6.9 L11 9.8 L11.7 14 L8 11.9 L4.3 14 L5 9.8 L2 6.9 L6.2 6.2 Z"/>
                      </svg>
                      <!-- default log -->
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <path stroke-linecap="round" d="M4 8h8M4 5h8M4 11h5"/>
                      </svg>
                    </div>
                    <div class="ch-line" />
                  </div>
                  <div class="ch-entry-right">
                    <div class="ch-entry-head">
                      <span class="ch-entry-title">{{ entry.title }}</span>
                      <span v-if="entry.time" class="ch-time">{{ entry.time }}</span>
                      <span v-if="entry.badge" class="ch-badge" :class="`ch-badge-${entry.type}`">{{ entry.badge }}</span>
                    </div>
                    <p class="ch-entry-body">{{ entry.body }}</p>
                  </div>
                </div>
              </template>
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Chronik lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { parseSoul } from '#shared/utils/soulParser.js'

definePageMeta({ layout: false })

const router = useRouter()
const { soulContent, soulMeta, hasSoul } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)
const query            = ref('')

// ── Parse all journal entries ──────────────────────────────────────────────
const allEntries = computed(() => {
  if (!soulContent.value) return []
  const { sections } = parseSoul(soulContent.value)
  const raw = (sections['Session-Log (komprimiert)'] || sections['Session-Log'] || '').replace(/\r/g, '')
  if (!raw.trim()) return []

  const entries = []
  const lines = raw.split('\n')
  let current = null
  for (const line of lines) {
    const m = line.match(/^-\s+\*\*([^*:]+):?\*\*:?\s*(.*)/)
    if (m) {
      if (current) entries.push(current)
      current = { dateStr: m[1].trim(), body: m[2].trim() }
    } else if (current && line.trim() && !line.trim().startsWith('-')) {
      current.body += ' ' + line.trim()
    }
  }
  if (current) entries.push(current)
  if (!entries.length) return []

  return entries.map((e, i) => {
    const body  = e.body.trim()
    const lower = body.toLowerCase()
    const ds    = e.dateStr

    // infer type
    let type  = 'log'
    let title = 'Log-Eintrag'
    let badge = null

    if (/soul erschaff|genesis|initialisiert/i.test(lower + ds)) {
      type = 'genesis'; title = 'Soul erschaffen'; badge = 'genesis'
    } else if (/peer|verbindung|@/i.test(lower + ds)) {
      type = 'peer'; title = 'Peer-Verbindung'
      const handle = body.match(/@([\w_]+)/); if (handle) badge = '@' + handle[1]
    } else if (/health|garmin|puls|schlaf|schritt/i.test(lower + ds)) {
      type = 'health'; title = 'Health-Sync'
    } else if (/vault|verschlüss|stimm|kalibrierung|gesicht|aufnahm/i.test(lower + ds)) {
      type = 'vault'; title = 'Vault erweitert'
    } else if (/polygon|anchor|verankert|on-chain|onchain/i.test(lower + ds)) {
      type = 'anchor'; title = 'Verankerung'; badge = 'on-chain'
    } else if (/session\s*\d+|session #/i.test(lower + ds)) {
      type = 'session'
      const num = (lower + ds).match(/session\s*#?(\d+)/i);
      title = 'Session ' + (num ? num[1] : '')
      badge = num ? String(num[1]) : null
    } else if (/session/i.test(lower + ds)) {
      type = 'session'; title = 'Session'
    }

    // parse date/time
    let dateLabel = ds
    let time = ''
    try {
      const d = new Date(ds)
      if (!isNaN(d)) {
        const today     = new Date()
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
        if (d.toDateString() === today.toDateString()) {
          dateLabel = 'Heute'
        } else if (d.toDateString() === yesterday.toDateString()) {
          dateLabel = 'Gestern'
        } else {
          dateLabel = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
        }
        time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      }
    } catch {}

    return { id: i, dateLabel, time, type, title, badge, body }
  })
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allEntries.value
  return allEntries.value.filter(e =>
    e.title.toLowerCase().includes(q) ||
    e.body.toLowerCase().includes(q) ||
    (e.badge || '').toLowerCase().includes(q)
  )
})

const groupedEntries = computed(() => {
  const groups = []
  const map = new Map()
  for (const entry of filtered.value) {
    if (!map.has(entry.dateLabel)) {
      const g = { date: entry.dateLabel, entries: [] }
      map.set(entry.dateLabel, g)
      groups.push(g)
    }
    map.get(entry.dateLabel).entries.push(entry)
  }
  return groups
})

// ── Navigation ────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'chronik')  return
  if (id === 'chat')     { router.push('/session');  return }
  if (id === 'setup')    { router.push('/einrichten'); return }
  if (id === 'soul')     { router.push('/soul');     return }
  if (id === 'files')    { router.push('/dateien');    return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'maturity') { router.push('/reife');    return }
  if (id === 'calendar') { router.push('/kalender'); return }
  if (id === 'anchor')   { router.push('/verankern'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
}

.chronik-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

/* ── Search ── */
.ch-search-wrap {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--line-2); border-radius: var(--r-xs);
  padding: 0 10px; height: 30px;
  background: var(--surface-2);
}
.ch-search-icon { color: var(--fg-3); flex: none; }
.ch-search {
  background: transparent; border: none; outline: none;
  color: var(--fg); font-family: var(--sans); font-size: 13px;
  width: 160px;
}
.ch-search::placeholder { color: var(--fg-3); }

/* ── Hero ── */
.ch-hero {
  padding-bottom: 32px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 32px;
}
.ch-eyebrow {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.ch-title {
  font-family: var(--serif); font-size: clamp(32px, 5vw, 48px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 14px;
}
.ch-title em { font-style: italic; color: var(--fg-2); }
.ch-sub {
  font-size: 14px; line-height: 1.65; color: var(--fg-2);
  max-width: 540px; margin: 0;
}

/* ── Empty ── */
.ch-empty {
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  letter-spacing: 0.06em; padding: 32px 0;
}

/* ── Feed ── */
.ch-feed { display: flex; flex-direction: column; }

.ch-date-sep {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3);
  padding: 24px 0 12px;
}
.ch-date-sep:first-child { padding-top: 0; }

.ch-entry {
  display: flex; gap: 16px;
  padding-bottom: 20px;
}

/* ── Left column: dot + line ── */
.ch-entry-left {
  display: flex; flex-direction: column; align-items: center;
  flex: none; width: 28px;
}
.ch-dot {
  width: 28px; height: 28px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--line-2);
  background: var(--surface-2);
  color: var(--fg-3);
}
.ch-dot-session { border-color: var(--accent); color: var(--accent); background: rgba(109,184,154,0.08); }
.ch-dot-peer    { border-color: var(--accent-bright); color: var(--accent-bright); background: rgba(138,208,179,0.08); }
.ch-dot-health  { border-color: #7ab8d4; color: #7ab8d4; background: rgba(122,184,212,0.08); }
.ch-dot-vault   { border-color: #c4a96e; color: #c4a96e; background: rgba(196,169,110,0.08); }
.ch-dot-anchor  { border-color: #b89edb; color: #b89edb; background: rgba(184,158,219,0.08); }
.ch-dot-genesis { border-color: var(--accent); color: var(--accent); background: rgba(109,184,154,0.15); }

.ch-line {
  flex: 1; width: 1px; background: var(--line); min-height: 8px; margin-top: 4px;
}
.ch-entry:last-child .ch-line { display: none; }

/* ── Right column ── */
.ch-entry-right { flex: 1; min-width: 0; padding-top: 4px; }

.ch-entry-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.ch-entry-title {
  font-family: var(--sans); font-size: 15px; font-weight: 500;
  color: var(--fg); letter-spacing: -0.01em;
}
.ch-time {
  font-family: var(--mono); font-size: 11px; color: var(--fg-4);
  letter-spacing: 0.04em;
}
.ch-badge {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
  padding: 2px 7px; border-radius: 20px;
  background: var(--surface-2); color: var(--fg-3);
  border: 1px solid var(--line);
}
.ch-badge-session { color: var(--accent); border-color: rgba(109,184,154,0.3); background: rgba(109,184,154,0.08); }
.ch-badge-peer    { color: var(--accent-bright); border-color: rgba(138,208,179,0.3); }
.ch-badge-anchor  { color: #b89edb; border-color: rgba(184,158,219,0.3); }
.ch-badge-genesis { color: var(--accent); border-color: rgba(109,184,154,0.3); background: rgba(109,184,154,0.08); }

.ch-entry-body {
  font-size: 14px; line-height: 1.65; color: var(--fg-2);
  margin: 0; word-break: break-word;
}

@media (max-width: 900px) {
  .ch-search-wrap { display: none; }
  .ch-title { font-size: clamp(28px, 8vw, 38px); }
}
</style>
