<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="files" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Vault', 'Dateien']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />

        <div class="scroll">
          <div class="dateien-page">

            <!-- ── Toast ── -->
            <Transition name="toast">
              <div v-if="toast" class="dt-toast" :class="`dt-toast-${toast.type}`">{{ toast.msg }}</div>
            </Transition>

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
                    <rect x="2" y="3" width="16" height="12" rx="1.5"/>
                    <path stroke-linecap="round" d="M6 18h8M10 15v3"/>
                  </svg>
                  Lokal
                </button>
                <button class="dt-tab" :class="{ on: tab === 'server' }" @click="switchToServer">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <rect x="2" y="3" width="16" height="5" rx="1.5"/>
                    <rect x="2" y="12" width="16" height="5" rx="1.5"/>
                    <circle cx="5.5" cy="5.5" r="1"/><circle cx="5.5" cy="14.5" r="1"/>
                  </svg>
                  Server
                </button>
              </div>
            </div>

            <!-- ── Toolbar ── -->
            <div class="dt-toolbar">
              <div class="dt-filters seg">
                <button v-for="f in FILTERS" :key="f.key" :class="{ on: typeFilter === f.key }" @click="typeFilter = f.key">{{ f.label }}</button>
              </div>
              <!-- Refresh -->
              <button class="icon-btn" :class="{ on: refreshing }" @click="refresh" :disabled="refreshing" title="Aktualisieren">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" :class="{ 'spin': refreshing }">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4a8 8 0 1 1 0 12"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4H0"/>
                </svg>
              </button>
              <!-- Alle lokalen Dateien auf Server laden -->
              <button v-if="tab === 'lokal' && vaultConnected" class="dt-upload-btn" @click="pushVaultToServer" :disabled="syncing" :title="syncing ? 'Wird hochgeladen…' : 'Vault auf Server laden'">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                  <rect x="2" y="12" width="16" height="5" rx="1.5"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 9V2m0 0L6 6m4-4 4 4"/>
                  <circle cx="5.5" cy="14.5" r="1"/>
                </svg>
                {{ syncing ? 'Lädt…' : 'Auf Server' }}
              </button>
              <!-- Upload from device (lokal: in vault; server: direkt auf server) -->
              <button class="dt-upload-btn" @click="triggerUpload">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 13V3m0 0L6 7m4-4 4 4"/>
                  <path stroke-linecap="round" d="M3 16h14"/>
                </svg>
                Hochladen
              </button>
              <input ref="fileInput" type="file" multiple class="dt-file-input" @change="handleFileUpload" />
              <!-- sys.md overwrite input -->
              <input ref="soulInput" type="file" accept=".md" class="dt-file-input" @change="handleSoulImport" />
            </div>

            <!-- ── File table ── -->
            <div class="dt-table">
              <div class="dt-table-head">
                <span class="dt-col-name">Name</span>
                <span class="dt-col-date">Hinzugefügt</span>
                <span class="dt-col-actions"></span>
              </div>

              <!-- Local: not connected -->
              <div v-if="tab === 'lokal' && !vaultConnected" class="dt-empty">
                <p class="dt-empty-text">Vault nicht verbunden.</p>
                <button class="dt-connect-btn" @click="connectVaultFn">Vault verbinden</button>
              </div>
              <!-- Server: loading -->
              <div v-else-if="tab === 'server' && !serverLoaded" class="dt-empty">
                <p class="dt-empty-text">Server-Dateien werden geladen…</p>
              </div>
              <!-- Empty -->
              <div v-else-if="filteredFiles.length === 0" class="dt-empty">
                <p class="dt-empty-text">{{ searchQuery ? 'Keine Ergebnisse.' : 'Keine Dateien vorhanden.' }}</p>
              </div>

              <!-- Rows -->
              <div v-else>
                <div v-for="file in filteredFiles" :key="file.id" class="dt-row" :class="{ busy: busy[file.id] }">
                  <!-- Icon + Name -->
                  <div class="dt-col-name dt-name-cell">
                    <div class="dt-file-icon" :class="`dt-icon-${file.type}`">
                      <svg v-if="file.type === 'soul'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <circle cx="8" cy="8" r="5.5"/><path stroke-linecap="round" d="M8 5v3l2 1.5"/>
                      </svg>
                      <svg v-else-if="file.type === 'audio'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <path stroke-linecap="round" d="M5 12V4l7-1.5V11"/>
                        <circle cx="3.5" cy="12" r="1.5"/><circle cx="10.5" cy="11" r="1.5"/>
                      </svg>
                      <svg v-else-if="file.type === 'video'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1" y="3" width="10" height="10" rx="1"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="m11 6 4-2v8l-4-2"/>
                      </svg>
                      <svg v-else-if="file.type === 'image'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>
                        <circle cx="5.5" cy="6" r="1.2"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="m1.5 10.5 4-3 3 3 2-2 3.5 3.5"/>
                      </svg>
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
                        <path stroke-linecap="round" d="M4 5h8M4 8h8M4 11h5"/>
                      </svg>
                    </div>
                    <div class="dt-name-info">
                      <span class="dt-filename">{{ file.displayName }}</span>
                      <span class="dt-filetype">{{ file.typeLabel }}</span>
                    </div>
                  </div>

                  <!-- Date -->
                  <span class="dt-col-date dt-meta">—</span>

                  <!-- Actions -->
                  <div class="dt-col-actions dt-actions">
                    <!-- sys.md specific -->
                    <template v-if="file.type === 'soul'">
                      <button class="dt-act-btn" @click="downloadSoul(file)" title="Herunterladen">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      </button>
                      <button v-if="tab === 'lokal'" class="dt-act-btn" @click="soulInput?.click()" title="Überschreiben">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 14V6m0 0 3 3M8 6 5 9"/><path stroke-linecap="round" d="M2 3h12"/></svg>
                      </button>
                      <button v-if="tab === 'lokal'" class="dt-act-btn" @click="pushSoulToServer" :disabled="busy['soul']" title="Auf Server hochladen">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V3m0 0-3 3m3-3 3 3"/><rect x="2" y="12" width="12" height="2" rx="1"/></svg>
                      </button>
                    </template>

                    <!-- Regular files -->
                    <template v-else>
                      <!-- Download (nur auf Server-Tab sinnvoll) -->
                      <button v-if="tab === 'server'" class="dt-act-btn" @click="downloadFile(file)" :disabled="!!busy[file.id]" title="Herunterladen">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      </button>
                      <!-- Upload to server (lokal only) -->
                      <button v-if="tab === 'lokal'" class="dt-act-btn" @click="uploadToServer(file)" :disabled="!!busy[file.id]" title="Auf Server hochladen">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V3m0 0-3 3m3-3 3 3"/><rect x="2" y="12" width="12" height="2" rx="1"/></svg>
                      </button>
                      <!-- Delete (nur auf Server-Tab) -->
                      <button v-if="tab === 'server'" class="dt-act-btn dt-act-del" @click="deleteFile(file)" :disabled="!!busy[file.id]" title="Löschen">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V2h4v2M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/></svg>
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Dateien lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useApiContext } from '~/composables/useApiContext.js'
import { useVaultSession } from '~/composables/useVaultSession.js'

definePageMeta({ layout: false })

const router = useRouter()
const { soulMeta, hasSoul, soulToken, soulContent, soulFilename, save: saveSoul, pushToServer, importFromText } = useSoul()
const { isConnected: vaultConnected, allFiles, connectVault: connectVaultFn, writeFile, readVaultFile, deleteLocalFile, scanVault: scanLocalVault } = useVault()
const { syncedFiles, loaded: serverLoaded, loadContext, syncFile, deleteVaultFile } = useApiContext()
const { vaultKey } = useVaultSession()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)
const tab              = ref('lokal')
const typeFilter       = ref('all')
const searchQuery      = ref('')
const refreshing       = ref(false)
const fileInput        = ref(null)
const soulInput        = ref(null)
const busy             = reactive({})
const syncing          = ref(false)
const toast            = ref(null)
let   toastTimer       = null

const FILTERS = [
  { key: 'all',   label: 'Alle' },
  { key: 'soul',  label: 'sys.md' },
  { key: 'audio', label: 'Audio' },
  { key: 'video', label: 'Video' },
  { key: 'image', label: 'Bilder' },
  { key: 'doc',   label: 'Kontext' },
]

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
  clearTimeout(toastTimer)
  toast.value = { msg, type }
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

// ── Type helpers ───────────────────────────────────────────────────────────
function kindToType(kind) {
  if (!kind) return 'doc'
  const k = kind.toLowerCase()
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|weba|audio)$/.test(k)) return 'audio'
  if (/^(mp4|webm|mov|avi|mkv|m4v|video)$/.test(k)) return 'video'
  if (/^(jpg|jpeg|png|webp|gif|avif|heic|image|profile|profile-archive)$/.test(k)) return 'image'
  return 'doc'
}
function nameToApiType(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|weba|webm)$/.test(ext)) return 'audio'
  if (/^(mp4|mov|avi|mkv|m4v)$/.test(ext)) return 'video'
  if (/^(jpg|jpeg|png|webp|gif|avif|heic)$/.test(ext)) return 'image'
  return 'context'
}
const TYPE_DISPLAY = { soul: 'sys.md', audio: 'Audio', video: 'Video', image: 'Bild', doc: 'Dokument' }

// ── File lists ─────────────────────────────────────────────────────────────
const soulEntry = computed(() => ({
  id: 'soul', name: 'soul', displayName: soulFilename?.value || 'sys.md',
  type: 'soul', typeLabel: 'sys.md', apiType: 'soul',
}))

const localFileList = computed(() => {
  const items = [soulEntry.value]
  for (const f of allFiles.value) {
    if (['soul', 'profile-json'].includes(f.kind)) continue
    const type = kindToType(f.kind)
    items.push({
      id: f.name, name: f.name,
      displayName: f.name.split('/').pop(),
      type, typeLabel: TYPE_DISPLAY[type] || f.kind,
      apiType: nameToApiType(f.name),
    })
  }
  return items
})

const serverFileList = computed(() => {
  const items = [soulEntry.value]
  const sf = syncedFiles.value || {}
  const add = (arr, type, apiType) => {
    for (const name of (arr || [])) {
      items.push({ id: `srv:${name}`, name, displayName: name.split('/').pop(), type, typeLabel: TYPE_DISPLAY[type], apiType })
    }
  }
  add(sf.audio,   'audio', 'audio')
  add(sf.video,   'video', 'video')
  add(sf.images,  'image', 'image')
  add(sf.context, 'doc',   'context')
  return items
})

const activeList = computed(() => tab.value === 'lokal' ? localFileList.value : serverFileList.value)

const filteredFiles = computed(() => {
  let list = activeList.value
  if (typeFilter.value !== 'all') list = list.filter(f => f.type === typeFilter.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f => f.displayName.toLowerCase().includes(q))
  }
  return list
})

const localFileCount  = computed(() => localFileList.value.length)
const serverFileCount = computed(() => serverFileList.value.length)
function statsCount(type) {
  const n = activeList.value.filter(f => f.type === type).length
  return n > 0 ? n : '—'
}

// ── Refresh ────────────────────────────────────────────────────────────────
async function refresh() {
  refreshing.value = true
  try {
    if (tab.value === 'lokal') await scanLocalVault()
    else await loadContext(soulToken.value)
  } finally { refreshing.value = false }
}

// ── Server switch ──────────────────────────────────────────────────────────
async function switchToServer() {
  tab.value = 'server'
  if (!serverLoaded.value && soulToken.value) await loadContext(soulToken.value)
}

// ── Blob download helper ───────────────────────────────────────────────────
function triggerDownload(buf, filename) {
  const url = URL.createObjectURL(new Blob([buf]))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// ── sys.md actions ─────────────────────────────────────────────────────────
function downloadSoul() {
  const blob = new Blob([soulContent.value || ''], { type: 'text/markdown' })
  triggerDownload(blob.arrayBuffer ? blob : new Uint8Array(new TextEncoder().encode(soulContent.value)), soulFilename?.value || 'sys.md')
}

async function handleSoulImport(e) {
  const file = e.target.files?.[0]; if (!file) return
  const text = await file.text()
  importFromText(text)
  saveSoul()
  showToast('sys.md überschrieben ✓')
  e.target.value = ''
}

async function pushSoulToServer() {
  busy['soul'] = true
  try { await pushToServer(); showToast('sys.md auf Server hochgeladen ✓') }
  catch { showToast('Upload fehlgeschlagen', 'err') }
  finally { busy['soul'] = false }
}

// ── Download file ──────────────────────────────────────────────────────────
async function downloadFile(file) {
  busy[file.id] = true
  try {
    if (tab.value === 'lokal') {
      const buf = await readVaultFile(file.name)
      if (!buf) { showToast('Datei nicht lesbar', 'err'); return }
      triggerDownload(buf, file.displayName)
    } else {
      const res = await fetch(`/api/vault/${file.apiType}/${encodeURIComponent(file.name)}`, {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { showToast('Download fehlgeschlagen', 'err'); return }
      triggerDownload(await res.arrayBuffer(), file.displayName)
    }
    showToast(`${file.displayName} heruntergeladen ✓`)
  } catch { showToast('Fehler beim Herunterladen', 'err') }
  finally { busy[file.id] = false }
}

// ── Upload local → server ──────────────────────────────────────────────────
async function uploadToServer(file) {
  busy[file.id] = true
  try {
    const buf = await readVaultFile(file.displayName)
    if (!buf) { showToast('Datei nicht lesbar', 'err'); return }
    const key = vaultKey.value === '__encrypted__' ? '' : (vaultKey.value || '')
    const res = await syncFile(soulToken.value, file.apiType, file.displayName, buf, key)
    if (res.ok) { showToast(`${file.displayName} hochgeladen ✓`); await loadContext(soulToken.value) }
    else showToast(res.error || 'Upload fehlgeschlagen', 'err')
  } catch { showToast('Fehler beim Hochladen', 'err') }
  finally { busy[file.id] = false }
}

// ── Delete file ────────────────────────────────────────────────────────────
async function deleteFile(file) {
  if (!confirm(`„${file.displayName}" wirklich löschen?`)) return
  busy[file.id] = true
  try {
    if (tab.value === 'lokal') {
      const ok = await deleteLocalFile(file.name)
      if (ok) showToast(`${file.displayName} gelöscht ✓`)
      else showToast('Löschen fehlgeschlagen', 'err')
    } else {
      const res = await deleteVaultFile(soulToken.value, file.apiType, file.name)
      if (res?.ok !== false) { showToast(`${file.displayName} gelöscht ✓`); await loadContext(soulToken.value) }
      else showToast('Löschen fehlgeschlagen', 'err')
    }
  } catch { showToast('Fehler beim Löschen', 'err') }
  finally { busy[file.id] = false }
}

// ── Upload from device ─────────────────────────────────────────────────────
function triggerUpload() { fileInput.value?.click() }

async function handleFileUpload(e) {
  const files = Array.from(e.target.files || []); if (!files.length) return
  // Server-Tab: direkt auf Server hochladen
  if (tab.value === 'server') {
    let ok = 0
    const key = vaultKey.value === '__encrypted__' ? '' : (vaultKey.value || '')
    for (const file of files) {
      const buf     = await file.arrayBuffer()
      const apiType = nameToApiType(file.name)
      const res     = await syncFile(soulToken.value, apiType, file.name, buf, key)
      if (res.ok) ok++
      else showToast(`${file.name}: ${res.error || 'Upload fehlgeschlagen'}`, 'err')
    }
    if (ok) { showToast(`${ok} Datei${ok !== 1 ? 'en' : ''} auf Server hochgeladen ✓`); await loadContext(soulToken.value) }
    e.target.value = ''; return
  }
  // Lokal-Tab: in Vault speichern
  let ok = 0
  for (const file of files) {
    const buf = await file.arrayBuffer()
    const saved = await writeFile(file.name, buf)
    if (saved) ok++
  }
  await scanLocalVault()
  showToast(`${ok} Datei${ok !== 1 ? 'en' : ''} hinzugefügt ✓`)
  e.target.value = ''
}

// ── Ganzen lokalen Vault auf Server laden ──────────────────────────────────
async function pushVaultToServer() {
  if (syncing.value) return
  syncing.value = true
  const key = vaultKey.value === '__encrypted__' ? '' : (vaultKey.value || '')
  let ok = 0, fail = 0
  const uploadable = localFileList.value.filter(f => f.type !== 'soul')
  for (const file of uploadable) {
    const buf = await readVaultFile(file.displayName)
    if (!buf) { fail++; continue }
    const res = await syncFile(soulToken.value, file.apiType, file.displayName, buf, key)
    if (res.ok) ok++
    else fail++
  }
  // sys.md separat
  try { await pushToServer() } catch { fail++ }
  syncing.value = false
  if (fail === 0) showToast(`Vault hochgeladen — ${ok + 1} Dateien ✓`)
  else showToast(`${ok} hochgeladen, ${fail} fehlgeschlagen`, fail === ok + 1 ? 'err' : 'ok')
  await loadContext(soulToken.value)
}

// ── Navigation ─────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}
function onNav(id) {
  if (id === 'files')    return
  if (id === 'chat')     { router.push('/session');    return }
  if (id === 'setup')    { router.push('/einrichten');  return }
  if (id === 'soul')     { router.push('/soul');       return }
  if (id === 'chronik')  { router.push('/chronik');    return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'maturity') { router.push('/reife');      return }
  if (id === 'calendar') { router.push('/kalender');   return }
  if (id === 'anchor')   { router.push('/verankern');    return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/verbindung');  return }
  if (id === 'settings') { router.push('/einstellungen'); return }
  drawerOpen.value = false
  router.push('/')
}

onMounted(() => {
  if (soulToken.value && !serverLoaded.value) loadContext(soulToken.value).catch(() => {})
})
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
}

.dateien-page { max-width: 900px; margin: 0 auto; padding: 32px clamp(16px, 3vw, 32px) 80px; }

/* ── Toast ── */
.dt-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 9px 18px; border-radius: var(--r-xs); z-index: 200;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em;
  background: var(--surface); border: 1px solid var(--line-2); color: var(--fg-2);
  white-space: nowrap; pointer-events: none;
}
.dt-toast-ok    { border-color: rgba(109,184,154,0.4); color: var(--accent); }
.dt-toast-err   { border-color: rgba(224,108,117,0.4); color: #e06c75; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* ── Search ── */
.dt-search-wrap {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--line-2); border-radius: var(--r-xs);
  padding: 0 10px; height: 30px; background: var(--surface-2);
}
.dt-search-icon { color: var(--fg-3); flex: none; }
.dt-search { background: transparent; border: none; outline: none; color: var(--fg); font-family: var(--sans); font-size: 13px; width: 140px; }
.dt-search::placeholder { color: var(--fg-3); }

/* ── Hero ── */
.dt-hero { padding-bottom: 24px; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
.dt-eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; margin-bottom: 10px; }
.dt-title { font-family: var(--serif); font-size: clamp(28px, 4vw, 42px); font-weight: 400; letter-spacing: -0.03em; color: var(--fg); line-height: 1.05; margin: 0; }
.dt-title em { font-style: italic; color: var(--fg-2); }

/* ── Tabs ── */
.dt-tabs-row { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.dt-tabs { display: flex; border: 1px solid var(--line); border-radius: var(--r-xs); overflow: hidden; flex: none; }
.dt-tab { display: flex; align-items: center; gap: 6px; padding: 7px 16px; font-family: var(--sans); font-size: 13px; color: var(--fg-3); background: transparent; border: none; border-right: 1px solid var(--line); cursor: pointer; transition: all 0.15s; }
.dt-tab:last-child { border-right: none; }
.dt-tab.on { background: var(--surface); color: var(--fg); }
.dt-tab:hover:not(.on) { color: var(--fg-2); }
.dt-tab-desc { font-family: var(--mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; }

/* ── Storage ── */
.dt-storage { display: flex; align-items: center; gap: 10px; padding: 9px 14px; margin-bottom: 14px; border: 1px solid var(--line); background: var(--surface-2); border-radius: var(--r-xs); flex-wrap: wrap; }
.dt-storage-info { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.dt-storage-label { font-family: var(--mono); font-size: 11px; color: var(--fg-2); letter-spacing: 0.04em; }
.dt-storage-sync { font-family: var(--mono); font-size: 11px; color: var(--accent); letter-spacing: 0.04em; }
.dt-storage-bar-wrap { flex: 1; min-width: 80px; max-width: 180px; }
.dt-storage-bar { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
.dt-storage-fill { height: 100%; background: var(--accent); border-radius: 2px; }
.dt-storage-size { font-family: var(--mono); font-size: 11px; color: var(--fg-2); letter-spacing: 0.04em; flex: none; }

/* ── Stats ── */
.dt-stats { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11px; color: var(--fg-2); letter-spacing: 0.04em; margin-bottom: 18px; flex-wrap: wrap; }
.dt-stat { display: flex; align-items: center; gap: 5px; }
.dt-stat-sep { color: var(--fg-4); }
.dt-stat-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.dt-stat-audio { background: var(--accent); }
.dt-stat-video { background: #7ab8d4; }
.dt-stat-image { background: #c4a96e; }
.dt-stat-doc   { background: var(--fg-4); }

/* ── Toolbar ── */
.dt-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 0; flex-wrap: wrap; }
.dt-filters { display: flex; flex-wrap: wrap; flex: 1; }
.spin { animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.dt-upload-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
  border: none; border-radius: var(--r-xs); background: var(--accent); color: var(--on-accent);
  font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer;
  transition: background 0.15s; flex: none; white-space: nowrap;
}
.dt-upload-btn:hover { background: var(--accent-bright); }
.dt-file-input { display: none; }

/* ── Table ── */
.dt-table { border: 1px solid var(--line); border-radius: var(--r-xs); overflow: hidden; margin-top: 14px; }
.dt-table-head {
  display: grid; grid-template-columns: 1fr 110px 100px;
  padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--surface-2);
}
.dt-table-head span { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-4); }
.dt-row {
  display: grid; grid-template-columns: 1fr 110px 100px;
  padding: 9px 14px; align-items: center;
  border-bottom: 1px solid var(--line); transition: background 0.12s;
}
.dt-row:last-child { border-bottom: none; }
.dt-row:hover { background: var(--surface-2); }
.dt-row.busy { opacity: 0.5; pointer-events: none; }

/* ── File icon + name ── */
.dt-name-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dt-file-icon { width: 28px; height: 28px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; }
.dt-icon-soul  { background: rgba(109,184,154,0.22); color: var(--accent); }
.dt-icon-audio { background: rgba(109,184,154,0.15); color: var(--accent); }
.dt-icon-video { background: rgba(122,184,212,0.15); color: #7ab8d4; }
.dt-icon-image { background: rgba(196,169,110,0.15); color: #c4a96e; }
.dt-icon-doc   { background: rgba(244,241,234,0.07); color: var(--fg-3); }
.dt-name-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dt-filename { font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-filetype { font-family: var(--mono); font-size: 10px; color: var(--fg-4); letter-spacing: 0.06em; }

/* ── Meta / status ── */
.dt-meta { font-family: var(--mono); font-size: 12px; color: var(--fg-4); }
.dt-status-sync { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 11px; color: var(--accent); letter-spacing: 0.04em; }
.dt-status-local { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; }

/* ── Row actions ── */
.dt-actions { display: flex; align-items: center; gap: 2px; justify-content: flex-end; }
.dt-act-btn {
  width: 28px; height: 28px; border: none; background: transparent;
  color: var(--fg-3); cursor: pointer; border-radius: var(--r-xs);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.dt-act-btn:hover { background: var(--surface-2); color: var(--fg); }
.dt-act-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.dt-act-del:hover { color: #e06c75 !important; background: rgba(224,108,117,0.10) !important; }

/* ── Empty ── */
.dt-empty { padding: 40px 24px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.dt-empty-text { font-family: var(--mono); font-size: 12px; color: var(--fg-3); letter-spacing: 0.06em; margin: 0; }
.dt-connect-btn { padding: 7px 18px; border: 1px solid var(--line-2); border-radius: var(--r-xs); background: transparent; color: var(--fg-2); font-family: var(--sans); font-size: 13px; cursor: pointer; transition: all 0.15s; }
.dt-connect-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Mobile ── */
@media (max-width: 900px) {
  .dt-search-wrap { display: none; }
  .dt-title { font-size: clamp(24px, 7vw, 32px); }
  .dt-table-head,
  .dt-row { grid-template-columns: 1fr 90px !important; }
  .dt-col-date { display: none; }
  .dt-tab-desc { font-size: 10px; }
}
</style>
