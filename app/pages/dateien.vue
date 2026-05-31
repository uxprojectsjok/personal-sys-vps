<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="files" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Vault', 'Dateien']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="() => {}">
          <div class="dt-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" class="dt-search-icon">
              <circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input v-model="searchQuery" class="dt-search" type="search" placeholder="Suchen oder Befehl…" autocomplete="off" spellcheck="false" />
          </div>
        </SysTopbar>

        <div class="scroll">
          <div class="dateien-page">

            <!-- ── Hero ── -->
            <div class="dt-hero">
              <div class="dt-eyebrow">VAULT</div>
              <h1 class="dt-title">Dein Kontext, <em>verschlüsselt</em></h1>
            </div>

            <!-- ── Tab toggle ── -->
            <div class="dt-tabs-row">
              <div class="dt-tabs">
                <button class="dt-tab" :class="{ on: tab === 'lokal' }" @click="tab = 'lokal'">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <rect x="3" y="4" width="14" height="11" rx="1.5"/>
                    <path stroke-linecap="round" d="M7 4V3M13 4V3"/>
                  </svg>
                  Lokal
                </button>
                <button class="dt-tab" :class="{ on: tab === 'server' }" @click="switchToServer">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7Z"/>
                    <path stroke-linecap="round" d="M3 12v1a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-1"/>
                  </svg>
                  Server
                </button>
              </div>
              <span class="dt-tab-desc">{{ tab === 'lokal' ? 'Alles bleibt auf diesem Gerät — kein Upload.' : 'Verschlüsselt auf deinem SYS-Knoten · Sync über Gerät.' }}</span>
            </div>

            <!-- ── Storage bar ── -->
            <div class="dt-storage">
              <template v-if="tab === 'lokal'">
                <div class="dt-storage-info">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" class="dt-storage-icon">
                    <rect x="2" y="6" width="16" height="10" rx="1.5"/>
                    <path stroke-linecap="round" d="M5 11h2M5 9h4"/>
                  </svg>
                  <span class="dt-storage-label">Lokaler Speicher · AES-256</span>
                </div>
                <div v-if="vaultConnected" class="dt-storage-bar-wrap">
                  <div class="dt-storage-bar">
                    <div class="dt-storage-fill" :style="{ width: '4%' }" />
                  </div>
                </div>
                <span class="dt-storage-size">{{ localFileCount }} Dateien</span>
              </template>
              <template v-else>
                <div class="dt-storage-info">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" class="dt-storage-icon">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.5 10a5 5 0 0 1 5-5h5a5 5 0 0 1 0 10h-5a5 5 0 0 1-5-5Z"/>
                  </svg>
                  <span class="dt-storage-label">Verschlüsselter Server</span>
                  <span v-if="serverLoaded" class="dt-storage-sync">· Sync aktiv</span>
                </div>
                <span class="dt-storage-size">{{ serverFileCount }} Dateien</span>
              </template>
            </div>

            <!-- ── Stats chips ── -->
            <div class="dt-stats">
              <span class="dt-stat"><span class="dt-stat-dot dt-stat-audio" />Audio {{ statsCount('audio') }}</span>
              <span class="dt-stat-sep">·</span>
              <span class="dt-stat"><span class="dt-stat-dot dt-stat-video" />Video {{ statsCount('video') }}</span>
              <span class="dt-stat-sep">·</span>
              <span class="dt-stat"><span class="dt-stat-dot dt-stat-image" />Bilder {{ statsCount('image') }}</span>
              <span class="dt-stat-sep">·</span>
              <span class="dt-stat"><span class="dt-stat-dot dt-stat-doc" />Kontext {{ statsCount('doc') }}</span>
            </div>

            <!-- ── Filter + Upload ── -->
            <div class="dt-toolbar">
              <div class="dt-filters seg">
                <button v-for="f in FILTERS" :key="f.key" :class="{ on: typeFilter === f.key }" @click="typeFilter = f.key">{{ f.label }}</button>
              </div>
              <button class="dt-upload-btn" @click="triggerUpload">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 14V4m0 0L6 8m4-4 4 4"/>
                  <path stroke-linecap="round" d="M3 16h14"/>
                </svg>
                Hochladen
              </button>
              <input ref="fileInput" type="file" multiple class="dt-file-input" @change="handleFileUpload" />
            </div>

            <!-- ── File table ── -->
            <div class="dt-table">
              <div class="dt-table-head">
                <span class="dt-col-name">Name</span>
                <span class="dt-col-size">Größe</span>
                <span class="dt-col-date">Hinzugefügt</span>
                <span class="dt-col-status">{{ tab === 'server' ? 'Sync' : 'Status' }}</span>
              </div>

              <!-- Local: not connected -->
              <div v-if="tab === 'lokal' && !vaultConnected" class="dt-empty">
                <p class="dt-empty-text">Vault nicht verbunden.</p>
                <button class="dt-connect-btn" @click="connectVault">Vault verbinden</button>
              </div>

              <!-- Server: loading -->
              <div v-else-if="tab === 'server' && !serverLoaded" class="dt-empty">
                <p class="dt-empty-text">Server-Dateien werden geladen…</p>
              </div>

              <!-- Empty state -->
              <div v-else-if="filteredFiles.length === 0" class="dt-empty">
                <p class="dt-empty-text">{{ searchQuery ? 'Keine Ergebnisse.' : 'Keine Dateien vorhanden.' }}</p>
              </div>

              <!-- File rows -->
              <div v-else>
                <div v-for="file in filteredFiles" :key="file.name" class="dt-row">
                  <div class="dt-col-name dt-name-cell">
                    <div class="dt-file-icon" :class="`dt-icon-${file.type}`">
                      <!-- audio -->
                      <svg v-if="file.type === 'audio'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <path stroke-linecap="round" d="M6 12V4l7-1.5V11"/>
                        <circle cx="4.5" cy="12" r="1.5"/><circle cx="11.5" cy="11" r="1.5"/>
                      </svg>
                      <!-- video -->
                      <svg v-else-if="file.type === 'video'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1" y="3" width="10" height="10" rx="1"/><path stroke-linecap="round" stroke-linejoin="round" d="m11 6 4-2v8l-4-2"/>
                      </svg>
                      <!-- image -->
                      <svg v-else-if="file.type === 'image'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
                        <circle cx="5.5" cy="6" r="1.2"/><path stroke-linecap="round" stroke-linejoin="round" d="m1.5 10.5 4-3 3 3 2-2 3.5 3.5"/>
                      </svg>
                      <!-- doc / default -->
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <path stroke-linecap="round" d="M4 5h8M4 8h8M4 11h5"/>
                        <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
                      </svg>
                    </div>
                    <div class="dt-name-info">
                      <span class="dt-filename">{{ file.displayName }}</span>
                      <span class="dt-filetype">{{ file.typeLabel }}</span>
                    </div>
                  </div>
                  <span class="dt-col-size dt-meta">{{ file.size || '—' }}</span>
                  <span class="dt-col-date dt-meta">{{ file.date || '—' }}</span>
                  <span class="dt-col-status">
                    <span v-if="tab === 'server'" class="dt-status-sync">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m2.5 9 3.5 3.5 7.5-8"/>
                      </svg>
                      synchron
                    </span>
                    <span v-else class="dt-status-local">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11">
                        <rect x="2" y="7" width="12" height="8" rx="1"/><path stroke-linecap="round" d="M5 7V5a3 3 0 0 1 6 0v2"/>
                      </svg>
                      versch.
                    </span>
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Dateien lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useApiContext } from '~/composables/useApiContext.js'

definePageMeta({ layout: false })

const router = useRouter()
const { soulMeta, hasSoul, soulToken } = useSoul()
const { isConnected: vaultConnected, allFiles, connectVault: connectVaultFn } = useVault()
const { syncedFiles, loaded: serverLoaded, loadContext } = useApiContext()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const tab              = ref('lokal')
const typeFilter       = ref('all')
const searchQuery      = ref('')
const fileInput        = ref(null)

const FILTERS = [
  { key: 'all',    label: 'Alle' },
  { key: 'audio',  label: 'Audio' },
  { key: 'video',  label: 'Video' },
  { key: 'image',  label: 'Bilder' },
  { key: 'face',   label: 'Gesicht' },
  { key: 'doc',    label: 'Kontext' },
]

// ── File type helpers ─────────────────────────────────────────────────────
function kindToType(kind) {
  if (!kind) return 'doc'
  const k = kind.toLowerCase()
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|weba|audio)$/.test(k)) return 'audio'
  if (/^(mp4|webm|mov|avi|mkv|m4v|video)$/.test(k)) return 'video'
  if (/^(jpg|jpeg|png|webp|gif|avif|heic|image|profile|profile-archive)$/.test(k)) return 'image'
  return 'doc'
}
function nameToType(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus)$/.test(ext)) return 'audio'
  if (/^(mp4|webm|mov|avi|mkv|m4v)$/.test(ext)) return 'video'
  if (/^(jpg|jpeg|png|webp|gif|avif|heic)$/.test(ext)) return 'image'
  return 'doc'
}
const TYPE_LABELS = { audio: 'audio', video: 'video', image: 'image', doc: 'doc', face: 'image' }
const TYPE_DISPLAY = { audio: 'Audio', video: 'Video', image: 'Bild', doc: 'Dokument', face: 'Gesicht' }

// ── Flat file lists ───────────────────────────────────────────────────────
const localFileList = computed(() =>
  allFiles.value
    .filter(f => !['soul', 'profile-json'].includes(f.kind))
    .map(f => ({
      name: f.name,
      displayName: f.name.split('/').pop(),
      type: kindToType(f.kind),
      typeLabel: TYPE_DISPLAY[kindToType(f.kind)] || f.kind,
      size: null,
      date: null,
    }))
)

const serverFileList = computed(() => {
  const sf = syncedFiles.value || {}
  const items = []
  for (const name of (sf.audio  || [])) items.push({ name, displayName: name.split('/').pop(), type: 'audio',  typeLabel: 'Audio', size: null, date: null })
  for (const name of (sf.video  || [])) items.push({ name, displayName: name.split('/').pop(), type: 'video',  typeLabel: 'Video', size: null, date: null })
  for (const name of (sf.images || [])) items.push({ name, displayName: name.split('/').pop(), type: 'image',  typeLabel: 'Bild',  size: null, date: null })
  for (const name of (sf.context|| [])) items.push({ name, displayName: name.split('/').pop(), type: 'doc',    typeLabel: 'Dokument', size: null, date: null })
  return items
})

const activeList = computed(() => tab.value === 'lokal' ? localFileList.value : serverFileList.value)

const filteredFiles = computed(() => {
  let list = activeList.value
  if (typeFilter.value !== 'all') {
    const t = typeFilter.value === 'face' ? 'image' : typeFilter.value
    list = list.filter(f => f.type === t)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f => f.displayName.toLowerCase().includes(q))
  }
  return list
})

// ── Stats ─────────────────────────────────────────────────────────────────
const localFileCount  = computed(() => localFileList.value.length)
const serverFileCount = computed(() => serverFileList.value.length)

function statsCount(type) {
  const list = activeList.value
  const count = list.filter(f => f.type === type).length
  return count > 0 ? count : '—'
}

// ── Actions ───────────────────────────────────────────────────────────────
async function connectVault() {
  await connectVaultFn()
}

async function switchToServer() {
  tab.value = 'server'
  if (!serverLoaded.value && soulToken.value) {
    await loadContext(soulToken.value)
  }
}

function triggerUpload() { fileInput.value?.click() }
function handleFileUpload() { /* handled by VaultExplorer / parent flow */ }

onMounted(() => {
  if (soulToken.value && !serverLoaded.value) {
    loadContext(soulToken.value).catch(() => {})
  }
})

// ── Navigation ────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'files')    return
  if (id === 'chat')     { router.push('/session');    return }
  if (id === 'soul')     { router.push('/soul');       return }
  if (id === 'chronik')  { router.push('/chronik');    return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'maturity') { router.push('/reife');      return }
  if (id === 'calendar') { router.push('/kalender');   return }
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

.dateien-page {
  max-width: 900px;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

/* ── Search ── */
.dt-search-wrap {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--line-2); border-radius: var(--r-xs);
  padding: 0 10px; height: 30px; background: var(--surface-2);
}
.dt-search-icon { color: var(--fg-3); flex: none; }
.dt-search {
  background: transparent; border: none; outline: none;
  color: var(--fg); font-family: var(--sans); font-size: 13px; width: 160px;
}
.dt-search::placeholder { color: var(--fg-3); }

/* ── Hero ── */
.dt-hero {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
}
.dt-eyebrow {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.dt-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin: 0;
}
.dt-title em { font-style: italic; color: var(--fg-2); }

/* ── Tabs ── */
.dt-tabs-row {
  display: flex; align-items: center; gap: 16px;
  margin-bottom: 16px; flex-wrap: wrap;
}
.dt-tabs {
  display: flex; gap: 0;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  overflow: hidden; flex: none;
}
.dt-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 16px; font-family: var(--sans); font-size: 13px;
  color: var(--fg-3); background: transparent; border: none; cursor: pointer;
  border-right: 1px solid var(--line); transition: all 0.15s;
}
.dt-tab:last-child { border-right: none; }
.dt-tab.on { background: var(--surface); color: var(--fg); }
.dt-tab:hover:not(.on) { color: var(--fg-2); }
.dt-tab-desc {
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
  letter-spacing: 0.04em;
}

/* ── Storage ── */
.dt-storage {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; margin-bottom: 14px;
  border: 1px solid var(--line); background: var(--surface-2);
  border-radius: var(--r-xs); flex-wrap: wrap; gap: 10px;
}
.dt-storage-info {
  display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;
}
.dt-storage-icon { color: var(--accent); flex: none; }
.dt-storage-label {
  font-family: var(--mono); font-size: 11px; color: var(--fg-2);
  letter-spacing: 0.04em; white-space: nowrap;
}
.dt-storage-sync {
  font-family: var(--mono); font-size: 11px; color: var(--accent);
  letter-spacing: 0.04em;
}
.dt-storage-bar-wrap { flex: 1; min-width: 80px; max-width: 200px; }
.dt-storage-bar {
  height: 3px; background: var(--line); border-radius: 2px; overflow: hidden;
}
.dt-storage-fill {
  height: 100%; background: var(--accent); border-radius: 2px;
  transition: width 0.4s ease;
}
.dt-storage-size {
  font-family: var(--mono); font-size: 11px; color: var(--fg-2);
  letter-spacing: 0.04em; flex: none;
}

/* ── Stats chips ── */
.dt-stats {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 11px; color: var(--fg-2);
  letter-spacing: 0.04em; margin-bottom: 20px;
  flex-wrap: wrap;
}
.dt-stat { display: flex; align-items: center; gap: 5px; }
.dt-stat-sep { color: var(--fg-4); }
.dt-stat-dot {
  width: 6px; height: 6px; border-radius: 50%; flex: none;
}
.dt-stat-audio { background: var(--accent); }
.dt-stat-video { background: #7ab8d4; }
.dt-stat-image { background: #c4a96e; }
.dt-stat-doc   { background: var(--fg-4); }

/* ── Toolbar ── */
.dt-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 0; flex-wrap: wrap;
}
.dt-filters { display: flex; flex-wrap: wrap; flex: 1; }
.dt-upload-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 16px; border: none; border-radius: var(--r-xs);
  background: var(--accent); color: var(--on-accent);
  font-family: var(--sans); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background 0.15s; flex: none; white-space: nowrap;
}
.dt-upload-btn:hover { background: var(--accent-bright); }
.dt-file-input { display: none; }

/* ── Table ── */
.dt-table {
  border: 1px solid var(--line); border-radius: var(--r-xs);
  overflow: hidden; margin-top: 16px;
}
.dt-table-head {
  display: grid;
  grid-template-columns: 1fr 90px 110px 110px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}
.dt-table-head span {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-4);
}
.dt-row {
  display: grid;
  grid-template-columns: 1fr 90px 110px 110px;
  padding: 10px 16px; align-items: center;
  border-bottom: 1px solid var(--line);
  transition: background 0.12s;
}
.dt-row:last-child { border-bottom: none; }
.dt-row:hover { background: var(--surface-2); }

/* ── File icon ── */
.dt-name-cell {
  display: flex; align-items: center; gap: 10px; min-width: 0;
}
.dt-file-icon {
  width: 30px; height: 30px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
}
.dt-icon-audio { background: rgba(109,184,154,0.18); color: var(--accent); }
.dt-icon-video { background: rgba(122,184,212,0.18); color: #7ab8d4; }
.dt-icon-image { background: rgba(196,169,110,0.18); color: #c4a96e; }
.dt-icon-doc   { background: rgba(244,241,234,0.08); color: var(--fg-3); }

/* ── File name info ── */
.dt-name-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dt-filename {
  font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dt-filetype {
  font-family: var(--mono); font-size: 10px; color: var(--fg-4);
  letter-spacing: 0.06em; text-transform: lowercase;
}

/* ── Meta columns ── */
.dt-meta {
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  letter-spacing: 0.02em;
}

/* ── Status ── */
.dt-status-sync {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--mono); font-size: 11px; color: var(--accent);
  letter-spacing: 0.04em;
}
.dt-status-local {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
  letter-spacing: 0.04em;
}

/* ── Empty ── */
.dt-empty {
  padding: 40px 24px;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.dt-empty-text {
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  letter-spacing: 0.06em; margin: 0;
}
.dt-connect-btn {
  padding: 7px 18px; border: 1px solid var(--line-2); border-radius: var(--r-xs);
  background: transparent; color: var(--fg-2); font-family: var(--sans);
  font-size: 13px; cursor: pointer; transition: border-color 0.15s, color 0.15s;
}
.dt-connect-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Mobile ── */
@media (max-width: 900px) {
  .dt-search-wrap { display: none; }
  .dt-title { font-size: clamp(24px, 7vw, 32px); }
  .dt-table-head,
  .dt-row {
    grid-template-columns: 1fr 70px 80px !important;
  }
  .dt-col-date { display: none; }
  .dt-tab-desc { display: none; }
  .dt-filters { gap: 4px; }
}
</style>
