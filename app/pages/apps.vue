<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="apps" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :monetization-enabled="monetizationEnabled"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_tools'), $t('nav.apps')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="ap-page">

            <!-- ── Toast ── -->
            <Transition name="toast">
              <div v-if="toast" class="dt-toast" :class="`dt-toast-${toast.type}`">{{ toast.msg }}</div>
            </Transition>

            <div class="ap-head">
              <div class="ap-eyebrow">{{ $t('apps.eyebrow') }}</div>
              <h1 class="ap-title">{{ $t('apps.hero_prefix') }} <em>{{ $t('apps.hero_em') }}</em></h1>
              <p class="ap-lede">{{ $t('apps.lede') }}</p>
            </div>

            <div v-if="!soulToken" class="dt-empty">
              <p class="dt-empty-text">{{ $t('files.no_soul_cert') }}</p>
            </div>
            <div v-else-if="appsLoading" class="dt-empty">
              <svg class="spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4a8 8 0 1 1 0 12"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4H0"/>
              </svg>
            </div>
            <template v-else>
              <div v-if="apps.length === 0" class="dt-empty">
                <p class="dt-empty-text">{{ $t('vault_apps.empty') }}</p>
              </div>
              <div v-else class="dt-table" style="margin-top:14px">
                <div class="dt-table-head apps-row" style="grid-template-columns: 1fr 120px">
                  <span class="dt-col-name">{{ $t('files.col_name') }}</span>
                  <span class="dt-col-actions"></span>
                </div>
                <template v-for="a in apps" :key="a.name">
                  <div class="dt-row apps-row" style="grid-template-columns: 1fr 120px">
                    <button type="button" class="dt-name-cell" style="text-decoration:none;background:none;border:none;cursor:pointer;text-align:left;width:100%" @click="toggleAppFiles(a)">
                      <div class="dt-file-icon dt-icon-doc">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                          <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
                          <path stroke-linecap="round" d="M4 5h8M4 8h8M4 11h5"/>
                        </svg>
                      </div>
                      <div class="dt-name-info">
                        <span class="dt-filename">{{ a.title || a.name }}</span>
                        <span class="dt-filetype">{{ a.name }}</span>
                      </div>
                    </button>
                    <div class="dt-actions">
                      <a :href="`/apps/${appsSoulId}/${a.name}/`" target="_blank" rel="noopener" class="dt-act-btn" :title="$t('vault_apps.open')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3h7v7M13 3 6.5 9.5M11 8v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/></svg>
                      </a>
                      <a :href="`/apps/${appsSoulId}/${a.name}/download.zip`" class="dt-act-btn" :title="$t('vault_apps.download_zip')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg>
                      </a>
                      <button class="dt-act-btn dt-act-del" @click="handleDeleteApp(a)" :title="$t('files.delete')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V2h4v2M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/></svg>
                      </button>
                    </div>
                  </div>
                  <div v-if="appFilesOpen[a.name]" style="padding:8px 12px 14px 40px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:7px">
                    <p v-if="appFilesLoading[a.name]" class="dt-filetype">{{ $t('vault_apps.loading_files') }}</p>
                    <template v-else>
                      <p v-if="!appFiles[a.name]?.length" class="dt-filetype">{{ $t('vault_apps.no_files') }}</p>
                      <div v-for="f in appFiles[a.name]" :key="f.path" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                        <span class="dt-filetype" style="font-family:var(--mono)">{{ f.path }} <span style="opacity:.6">({{ formatSharedSize(f.size) }})</span></span>
                        <div style="display:flex;align-items:center;gap:8px;flex:none">
                          <span v-if="f.protected" class="dt-filetype" style="opacity:.6;font-size:12px">{{ $t('vault_apps.manifest_hint') }}</span>
                          <a :href="`/apps/${appsSoulId}/${a.name}/${f.path}?download`" class="dt-act-btn" :title="$t('vault_apps.download_file')">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3M3 12v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg>
                          </a>
                          <button v-if="!f.protected" class="dt-act-btn dt-act-del" @click="deleteAppFile(a.name, f.path)" :title="$t('files.delete')">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V2h4v2M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/></svg>
                          </button>
                        </div>
                      </div>
                      <label class="dt-tab" style="align-self:flex-start;margin-top:4px;border:1px dashed var(--line);border-radius:var(--r-xs);cursor:pointer;padding:6px 10px;font-size:13px">
                        {{ $t('vault_apps.add_files') }}
                        <input type="file" multiple style="display:none" @change="onAddFilesToApp(a.name, $event)" />
                      </label>
                    </template>
                  </div>
                </template>
              </div>

              <!-- Upload -->
              <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;max-width:420px">
                <input
                  :value="newAppName"
                  @input="onAppNameInput"
                  type="text"
                  :placeholder="$t('vault_apps.app_name_placeholder')"
                  style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-xs);color:var(--fg);font-family:var(--sans);font-size:15px;outline:none"
                />
                <div style="display:flex;gap:8px">
                  <label class="dt-tab" style="flex:1;justify-content:center;border:1px dashed var(--line);border-radius:var(--r-xs);cursor:pointer">
                    {{ $t('vault_apps.pick_folder') }}
                    <input type="file" webkitdirectory multiple style="display:none" @change="onPickAppFolder" />
                  </label>
                  <label class="dt-tab" style="flex:1;justify-content:center;border:1px dashed var(--line);border-radius:var(--r-xs);cursor:pointer">
                    {{ $t('vault_apps.pick_files') }}
                    <input type="file" multiple style="display:none" @change="onPickAppFiles" />
                  </label>
                </div>
                <p v-if="pendingAppFiles.length" class="dt-filetype" style="text-align:center">{{ $t('vault_apps.pending_count', { n: pendingAppFiles.length }) }}</p>
                <button
                  class="dt-upload-btn"
                  style="justify-content:center"
                  :disabled="appUploadBusy"
                  @click="doUploadApp"
                >{{ appUploadBusy ? $t('vault_apps.uploading') : $t('vault_apps.btn_upload') }}</button>
              </div>
            </template>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
    <ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { ref, computed, reactive, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'
import { useConfirm } from '~/composables/useConfirm.js'
import ConfirmModal from '~/components/ConfirmModal.vue'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { monetizationEnabled, fetchNodeStatus } = useNodeStatus()
const { ask: confirmAsk } = useConfirm()
onMounted(async () => { fetchNodeStatus(); appsLoading.value = true; await loadApps(); appsLoading.value = false })

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', export:'/export', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', connections:'/connections', gatekeeper:'/gatekeeper', wallet:'/wallet', agent:'/agent', impressum:'/impressum', datenschutz:'/datenschutz', lizenz:'/lizenz' }
  if (id === 'apps') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}

// ── Toast ──────────────────────────────────────────────────────────────────
const toast = ref(null)
let   toastTimer = null
function showToast(msg, type = 'ok') {
  clearTimeout(toastTimer)
  toast.value = { msg, type }
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

function formatSharedSize(bytes) {
  if (!bytes) return '–'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Apps (vault_shared/apps/) ────────────────────────────────────────────
const apps            = ref([])
const appsSoulId      = computed(() => soulToken.value?.split('.')?.[0] ?? '')
const appsLoading     = ref(false)
const newAppName      = ref('')
const pendingAppFiles = ref([]) // [{ path, file }]
const appUploadBusy   = ref(false)
const APP_NAME_RE     = /^[a-z0-9_-]{1,64}$/
const appFilesOpen    = reactive({}) // { [app.name]: boolean }
const appFiles        = reactive({}) // { [app.name]: [{path,size}] }
const appFilesLoading = reactive({}) // { [app.name]: boolean }
async function loadAppFiles(name) {
  appFilesLoading[name] = true
  try {
    const res  = await fetch(`/api/vault/apps/${encodeURIComponent(name)}/files`, { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const data = await res.json().catch(() => ({}))
    appFiles[name] = data.files || []
  } catch {
    appFiles[name] = appFiles[name] || []
  } finally {
    appFilesLoading[name] = false
  }
}
async function toggleAppFiles(a) {
  const open = !appFilesOpen[a.name]
  appFilesOpen[a.name] = open
  if (open) await loadAppFiles(a.name)
}
async function deleteAppFile(appName, path) {
  const ok = await confirmAsk({
    title:       t('vault_apps.delete_file_title'),
    message:     t('vault_apps.delete_file_msg', { name: path }),
    confirmText: t('vault_apps.delete_confirm'),
    cancelText:  t('common.cancel'),
    danger:      true,
  })
  if (!ok) return
  const encPath = path.split('/').map(encodeURIComponent).join('/')
  await fetch(`/api/vault/apps/${encodeURIComponent(appName)}/files/${encPath}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${soulToken.value}` },
  })
  appFiles[appName] = (appFiles[appName] || []).filter(f => f.path !== path)
  await loadApps() // z.B. falls index.html gelöscht wurde und die App aus der Liste verschwindet
}
async function onAddFilesToApp(appName, e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!files.length) return
  try {
    const filesPayload = await Promise.all(files.map(async f => ({ path: f.name, content_b64: await readAppFileAsBase64(f) })))
    const res  = await fetch('/api/vault/apps', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body:    JSON.stringify({ app_name: appName, files: filesPayload }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) {
      showToast(t('vault_apps.upload_success', { n: data.files ?? filesPayload.length }))
      await loadAppFiles(appName)
      await loadApps()
    } else {
      showToast(data.error || t('vault_apps.upload_error'), 'err')
    }
  } catch (err) {
    showToast(err.message || t('vault_apps.upload_error'), 'err')
  }
}
async function loadApps() {
  if (!soulToken.value) return
  try {
    const res  = await fetch('/api/vault/apps', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const data = await res.json().catch(() => ({}))
    apps.value = data.apps || []
  } catch {}
}
function slugifyAppName(raw) {
  return (raw || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 64)
}
function deriveAppNameFrom(relPath) {
  const top = relPath.split('/')[0] || ''
  return slugifyAppName(top)
}
// Live-Sanitize statt hartem Reject beim Absenden — verhindert den früheren
// "unerlaubte Zeichen"-Fehler bei z.B. "Verify Identity App" komplett, indem
// das Feld nie einen ungültigen Wert annehmen kann.
function onAppNameInput(e) {
  const pos = e.target.selectionStart
  const before = e.target.value
  const clean = slugifyAppName(before)
  newAppName.value = clean
  // Cursor-Position grob erhalten (Länge kann sich durch -+ Kollaps ändern)
  nextTick(() => {
    const diff = before.length - clean.length
    const newPos = Math.max(0, (pos ?? clean.length) - diff)
    e.target.setSelectionRange(newPos, newPos)
  })
}
function onPickAppFolder(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!files.length) { showToast(t('vault_apps.pick_empty'), 'err'); return }
  const first = files[0].webkitRelativePath || files[0].name
  if (!newAppName.value.trim()) newAppName.value = deriveAppNameFrom(first)
  pendingAppFiles.value = files.map(f => ({
    path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name,
    file: f,
  }))
  showToast(t('vault_apps.pending_count', { n: pendingAppFiles.value.length }))
}
function onPickAppFiles(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!files.length) { showToast(t('vault_apps.pick_empty'), 'err'); return }
  pendingAppFiles.value = files.map(f => ({ path: f.name, file: f }))
  showToast(t('vault_apps.pending_count', { n: pendingAppFiles.value.length }))
}
function readAppFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(String(reader.result).split(',').pop())
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
async function doUploadApp() {
  if (pendingAppFiles.value.length === 0) {
    showToast(t('vault_apps.pick_empty'), 'err')
    return
  }
  if (!APP_NAME_RE.test(newAppName.value.trim())) {
    showToast(t('vault_apps.invalid_name'), 'err')
    return
  }
  appUploadBusy.value = true
  try {
    const filesPayload = await Promise.all(
      pendingAppFiles.value.map(async ({ path, file }) => ({ path, content_b64: await readAppFileAsBase64(file) }))
    )
    const res  = await fetch('/api/vault/apps', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body:    JSON.stringify({ app_name: newAppName.value.trim(), files: filesPayload }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok) {
      showToast(t('vault_apps.upload_success', { n: data.files ?? filesPayload.length }))
      newAppName.value = ''
      pendingAppFiles.value = []
      await loadApps()
    } else {
      showToast(data.error || t('vault_apps.upload_error'), 'err')
    }
  } catch (e) {
    showToast(e.message || t('vault_apps.upload_error'), 'err')
  } finally {
    appUploadBusy.value = false
  }
}
async function handleDeleteApp(a) {
  const ok = await confirmAsk({
    title:       t('vault_apps.delete_title'),
    message:     t('vault_apps.delete_msg', { name: a.title || a.name }),
    confirmText: t('vault_apps.delete_confirm'),
    cancelText:  t('common.cancel'),
    danger:      true,
  })
  if (!ok) return
  await fetch(`/api/vault/apps/${encodeURIComponent(a.name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${soulToken.value}` } })
  await loadApps()
}
</script>

<style scoped>
.ap-page { max-width: 900px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.ap-head { padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.ap-eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.ap-title {
  font-family: var(--serif); font-size: clamp(32px, 5vw, 48px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 14px;
}
.ap-title em { font-style: italic; color: var(--accent); }
.ap-lede { font-size: 17px; line-height: 1.65; color: var(--fg); max-width: 560px; margin: 0; }

.spin { animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.dt-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 9px 18px; border-radius: var(--r-xs); z-index: 200;
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.06em;
  background: rgba(23,23,23,0.55); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--line-2); color: var(--fg-2);
  white-space: nowrap; pointer-events: none;
}
.dt-toast-ok  { border-color: rgba(109,184,154,0.4); color: var(--accent); }
.dt-toast-err { border-color: rgba(224,108,117,0.4); color: #e06c75; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

.dt-tab { display: flex; align-items: center; gap: 6px; padding: 7px 16px; font-family: var(--sans); font-size: 16px; color: var(--fg); background: transparent; border: none; cursor: pointer; transition: all 0.15s; }
.dt-upload-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
  border: none; border-radius: var(--r-xs); background: var(--accent); color: var(--on-accent);
  font-family: var(--sans); font-size: 15px; font-weight: 500; cursor: pointer;
  transition: background 0.15s; flex: none; white-space: nowrap;
}
.dt-upload-btn:hover { background: var(--accent-bright); }
.dt-upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.dt-table { border: 1px solid var(--line); border-radius: var(--r-xs); overflow: hidden; margin-top: 14px; background: rgba(23,23,23,0.55); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
.dt-table-head { display: grid; padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.dt-table-head span { font-family: var(--mono); font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg); }
.dt-row { display: grid; padding: 9px 14px; align-items: center; border-bottom: 1px solid var(--line); transition: background 0.12s; }
.dt-row:last-child { border-bottom: none; }
.dt-row:hover { background: var(--surface-2); }

.dt-name-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.dt-file-icon { width: 28px; height: 28px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; }
.dt-icon-doc  { background: rgba(236,236,236,0.07); color: var(--fg-3); }
.dt-name-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dt-filename { font-family: var(--sans); font-size: 17px; font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-filetype { font-family: var(--mono); font-size: 14px; color: var(--fg-2); letter-spacing: 0.04em; }

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

.dt-empty { padding: 40px 24px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.dt-empty-text { font-family: var(--mono); font-size: 14px; color: var(--fg-2); letter-spacing: 0.06em; margin: 0; }

@media (max-width: 900px) {
  .ap-title { font-size: clamp(24px, 7vw, 32px); }
  .dt-table-head,
  .dt-row { grid-template-columns: 1fr 112px !important; }
}
</style>
