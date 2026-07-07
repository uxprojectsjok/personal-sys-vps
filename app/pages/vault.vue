<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="files" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_vault'), $t('nav.files')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />

        <div class="scroll">
          <div class="dateien-page">

            <!-- ── Toast ── -->
            <Transition name="toast">
              <div v-if="toast" class="dt-toast" :class="`dt-toast-${toast.type}`">{{ toast.msg }}</div>
            </Transition>

            <!-- ── Hero ── -->
            <div class="dt-hero">
              <div class="dt-eyebrow">VAULT</div>
              <h1 class="dt-title">{{ $t('files.title') }} <em>{{ $t('files.title_em') }}</em></h1>
            </div>

            <!-- ── Tab toggle ── -->
            <div class="dt-tabs-row">
              <div class="dt-tabs">
                <button class="dt-tab" :class="{ on: tab === 'lokal' }" @click="tab = 'lokal'">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <rect x="2" y="3" width="16" height="12" rx="1.5"/>
                    <path stroke-linecap="round" d="M6 18h8M10 15v3"/>
                  </svg>
                  {{ $t('files.tab_local') }}
                </button>
                <button class="dt-tab" :class="{ on: tab === 'server' }" @click="switchToServer">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <rect x="2" y="3" width="16" height="5" rx="1.5"/>
                    <rect x="2" y="12" width="16" height="5" rx="1.5"/>
                    <circle cx="5.5" cy="5.5" r="1"/><circle cx="5.5" cy="14.5" r="1"/>
                  </svg>
                  {{ $t('files.tab_server') }}
                </button>
                <button class="dt-tab" :class="{ on: tab === 'geteilt' }" @click="switchToShared">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <circle cx="5" cy="10" r="2.5"/><circle cx="15" cy="5" r="2.5"/><circle cx="15" cy="15" r="2.5"/>
                    <path stroke-linecap="round" d="M7.2 9 12.8 6M7.2 11 12.8 14"/>
                  </svg>
                  {{ $t('files.tab_shared') }}
                </button>
                <button v-if="euConsumerRights" class="dt-tab" :class="{ on: tab === 'widerruf' }" @click="switchToConsent">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14">
                    <rect x="3" y="2" width="14" height="16" rx="1.5"/>
                    <path stroke-linecap="round" d="M6.5 6.5h7M6.5 9.5h7M6.5 12.5h4"/>
                  </svg>
                  {{ $t('files.tab_consent') }}
                </button>
              </div>
            </div>

            <!-- ── Toolbar ── -->
            <div class="dt-toolbar">
              <div class="dt-filters seg">
                <button v-for="f in FILTERS" :key="f.key" :class="{ on: typeFilter === f.key }" @click="typeFilter = f.key">{{ f.label }}</button>
              </div>
              <!-- Refresh -->
              <button class="icon-btn" :class="{ on: refreshing }" @click="refresh" :disabled="refreshing" :title="$t('files.refresh')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" :class="{ 'spin': refreshing }">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4a8 8 0 1 1 0 12"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4H0"/>
                </svg>
              </button>
              <!-- Alle lokalen Dateien auf Server laden -->
              <button v-if="tab === 'lokal' && vaultConnected" class="dt-upload-btn" @click="pushVaultToServer" :disabled="syncing" :title="syncing ? $t('files.upload_to_server_loading') : $t('files.upload_to_server')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                  <rect x="2" y="12" width="16" height="5" rx="1.5"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 9V2m0 0L6 6m4-4 4 4"/>
                  <circle cx="5.5" cy="14.5" r="1"/>
                </svg>
                {{ syncing ? $t('files.loading') : $t('files.on_server') }}
              </button>
              <!-- Geteilt: direkter Upload -->
              <button v-if="tab === 'geteilt' && soulToken" class="dt-upload-btn" @click="sharedInput?.click()" :disabled="sharedUploading" :title="sharedUploading ? $t('files.upload_to_server_loading') : $t('files.upload')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" :class="{ spin: sharedUploading }">
                  <path v-if="!sharedUploading" stroke-linecap="round" stroke-linejoin="round" d="M10 9V2m0 0L6 6m4-4 4 4"/>
                  <path v-if="!sharedUploading" stroke-linecap="round" stroke-linejoin="round" d="M2 14v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
                  <path v-if="sharedUploading" stroke-linecap="round" d="M4 4a8 8 0 1 1 0 12"/>
                </svg>
                {{ sharedUploading ? $t('files.loading') : $t('files.upload') }}
              </button>
              <input ref="sharedInput" type="file" class="dt-file-input" @change="handleSharedUpload" />
              <!-- sys.md lokal importieren -->
              <input ref="soulInput" type="file" accept=".md" class="dt-file-input" @change="handleSoulImport" />
              <!-- sys.md auf Server ersetzen -->
              <input ref="soulServerInput" type="file" accept=".md" class="dt-file-input" @change="replaceSoulOnServer" />
            </div>

            <!-- ── Geteilt Tab ── -->
            <template v-if="tab === 'geteilt'">
              <div v-if="!soulToken" class="dt-empty">
                <p class="dt-empty-text">{{ $t('files.no_soul_cert') }}</p>
              </div>
              <div v-else-if="sharedLoading" class="dt-empty">
                <svg class="spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4a8 8 0 1 1 0 12"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4H0"/>
                </svg>
              </div>
              <div v-else-if="filteredSharedFiles.length === 0" class="dt-empty">
                <p class="dt-empty-text">{{ $t('files.no_shared_files') }}</p>
              </div>
              <div v-else class="dt-table" style="margin-top:14px">
                <div class="dt-table-head" style="grid-template-columns: 1fr 90px">
                  <span class="dt-col-name">{{ $t('files.col_name') }}</span>
                  <span class="dt-col-actions"></span>
                </div>
                <div v-for="f in filteredSharedFiles" :key="f.name"
                  class="dt-row" :style="'grid-template-columns: 1fr 90px'"
                  :class="{ busy: !!sharedBusy[f.name] }"
                >
                  <div class="dt-name-cell">
                    <div class="dt-file-icon dt-icon-doc">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
                        <path stroke-linecap="round" d="M4 5h8M4 8h8M4 11h5"/>
                      </svg>
                    </div>
                    <div class="dt-name-info">
                      <span class="dt-filename">{{ f.name }}</span>
                      <span class="dt-filetype">{{ formatSharedSize(f.size) }} · {{ formatSharedDate(f.mtime) }}</span>
                    </div>
                  </div>
                  <div class="dt-actions">
                    <button class="dt-act-btn" @click="downloadSharedFile(f)" :disabled="!!sharedBusy[f.name]" :title="$t('files.download')">
                      <svg v-if="sharedBusy[f.name] === 'down'" class="spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                    </button>
                    <button class="dt-act-btn dt-act-del" @click="deleteSharedFile(f.name)" :disabled="!!sharedBusy[f.name]" :title="$t('files.delete')">
                      <svg v-if="sharedBusy[f.name] === 'del'" class="spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" d="M8 2v8m0 0-3-3m3 3 3-3"/></svg>
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V2h4v2M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- ── Widerruf (EU-Consent) Tab ── -->
            <template v-if="tab === 'widerruf'">
              <div v-if="!soulToken" class="dt-empty">
                <p class="dt-empty-text">{{ $t('files.no_soul_cert') }}</p>
              </div>
              <div v-else-if="consentLoading" class="dt-empty">
                <svg class="spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4a8 8 0 1 1 0 12"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4H0"/>
                </svg>
              </div>
              <div v-else-if="consentFiles.length === 0" class="dt-empty">
                <p class="dt-empty-text">{{ $t('files.no_consent_files') }}</p>
              </div>
              <div v-else class="dt-table" style="margin-top:14px">
                <div class="dt-table-head" style="grid-template-columns: 1fr 90px">
                  <span class="dt-col-name">{{ $t('files.col_name') }}</span>
                  <span class="dt-col-actions"></span>
                </div>
                <div v-for="f in consentFiles" :key="f.reference_id"
                  class="dt-row" :style="'grid-template-columns: 1fr 90px'"
                  :class="{ busy: !!consentBusy[f.reference_id] }"
                >
                  <div class="dt-name-cell">
                    <div class="dt-file-icon dt-icon-doc">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12">
                        <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
                        <path stroke-linecap="round" d="M4 5h8M4 8h8M4 11h5"/>
                      </svg>
                    </div>
                    <div class="dt-name-info">
                      <span class="dt-filename">{{ $t('files.consent_ref') }}: {{ f.reference_id }}</span>
                      <span class="dt-filetype">{{ formatSharedSize(f.size) }} · {{ formatSharedDate(f.mtime) }}</span>
                    </div>
                  </div>
                  <div class="dt-actions">
                    <button class="dt-act-btn" @click="downloadConsentFile(f)" :disabled="!!consentBusy[f.reference_id]" :title="$t('files.download')">
                      <svg v-if="consentBusy[f.reference_id] === 'down'" class="spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                    </button>
                    <button class="dt-act-btn dt-act-del" @click="deleteConsentFile(f)" :disabled="!!consentBusy[f.reference_id]" :title="$t('files.delete')">
                      <svg v-if="consentBusy[f.reference_id] === 'del'" class="spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" d="M8 2v8m0 0-3-3m3 3 3-3"/></svg>
                      <svg v-else viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V2h4v2M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- ── File table (Lokal/Server) ── -->
            <div v-if="tab !== 'geteilt' && tab !== 'widerruf'" class="dt-table">
              <div class="dt-table-head">
                <span class="dt-col-name">{{ $t('files.col_name') }}</span>
                <span class="dt-col-date">{{ $t('files.col_added') }}</span>
                <span class="dt-col-actions"></span>
              </div>

              <!-- Local: not connected -->
              <div v-if="tab === 'lokal' && !vaultConnected" class="dt-empty">
                <p class="dt-empty-text">{{ $t('files.vault_not_connected') }}</p>
                <button class="dt-connect-btn" @click="connectVaultFn">{{ $t('files.vault_connect') }}</button>
              </div>
              <!-- Server: loading -->
              <div v-else-if="tab === 'server' && !serverLoaded" class="dt-empty">
                <p class="dt-empty-text">{{ $t('files.server_loading') }}</p>
              </div>
              <!-- Empty -->
              <div v-else-if="filteredFiles.length === 0" class="dt-empty">
                <p class="dt-empty-text">{{ searchQuery ? $t('files.no_results') : $t('files.no_files') }}</p>
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
                      <button v-if="tab === 'server'" class="dt-act-btn" @click="downloadSoul(file)" :title="$t('files.title_download')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      </button>
                      <button v-if="tab === 'server'" class="dt-act-btn" @click="soulServerInput?.click()" :disabled="busy['soul']" :title="$t('files.title_replace_server')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V3m0 0-3 3m3-3 3 3"/><rect x="2" y="12" width="12" height="2" rx="1"/></svg>
                      </button>
                      <button v-if="tab === 'lokal'" class="dt-act-btn" @click="soulInput?.click()" :title="$t('files.title_import_local')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V3m0 0-3 3m3-3 3 3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      </button>
                    </template>

                    <!-- Regular files -->
                    <template v-else>
                      <!-- Upload to server (Lokal-Tab) -->
                      <button v-if="tab === 'lokal' && vaultConnected && soulToken" class="dt-act-btn" @click="uploadToServer(file)" :disabled="!!busy[file.id]" :title="$t('files.title_upload_server')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10V2m0 0L5 5m3-3 3 3"/><rect x="2" y="12" width="12" height="3" rx="1"/></svg>
                      </button>
                      <!-- Download (nur auf Server-Tab sinnvoll) -->
                      <button v-if="tab === 'server'" class="dt-act-btn" @click="downloadFile(file)" :disabled="!!busy[file.id]" :title="$t('files.download')">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v8m0 0-3-3m3 3 3-3"/><path stroke-linecap="round" d="M2 13h12"/></svg>
                      </button>
                      <!-- Delete (nur auf Server-Tab) -->
                      <button v-if="tab === 'server'" class="dt-act-btn dt-act-del" @click="deleteFile(file)" :disabled="!!busy[file.id]" :title="$t('files.delete')">
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
    <SysPageLoading v-else />
    <ConfirmModal />
</ClientOnly>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useApiContext } from '~/composables/useApiContext.js'
import { useVaultSession } from '~/composables/useVaultSession.js'
import { useConfirm } from '~/composables/useConfirm.js'
import ConfirmModal from '~/components/ConfirmModal.vue'

definePageMeta({ layout: false })

const { t } = useI18n()
const router = useRouter()
const { soulMeta, hasSoul, soulToken, soulContent, soulFilename, save: saveSoul, pushToServer, importFromText, isLoaded } = useSoul()
const { isConnected: vaultConnected, allFiles, connectVault: connectVaultFn, readVaultFile, deleteLocalFile, scanVault: scanLocalVault } = useVault()
const { syncedFiles, loaded: serverLoaded, loadContext, syncFile, deleteVaultFile } = useApiContext()
const { vaultKey } = useVaultSession()
const { ask: confirmAsk } = useConfirm()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)
const tab              = ref('lokal')
const typeFilter       = ref('all')
const searchQuery      = ref('')
const refreshing       = ref(false)
const soulInput        = ref(null)
const soulServerInput  = ref(null)
const busy             = reactive({})
const syncing          = ref(false)
const toast            = ref(null)
let   toastTimer       = null

const sharedFiles     = ref([])
const sharedSoulId    = ref('')
const sharedBusy      = reactive({})
const sharedLoading   = ref(false)
const sharedUploading = ref(false)
const sharedInput     = ref(null)

const consentFiles    = ref([])
const consentSoulId   = ref('')
const consentBusy     = reactive({})
const consentLoading  = ref(false)

const FILTERS = computed(() => [
  { key: 'all',   label: t('files.type_all')   },
  { key: 'soul',  label: t('files.type_soul')  },
  { key: 'audio', label: t('files.type_audio') },
  { key: 'video', label: t('files.type_video') },
  { key: 'image', label: t('files.type_image') },
  { key: 'doc',   label: t('files.type_doc')   },
])

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
  if (/^(mp3|wav|ogg|flac|aac|m4a|opus|weba)$/.test(ext)) return 'audio'
  if (ext === 'webm') return /(?:^|\/)motion[_-]/i.test(name) ? 'video' : 'audio'
  if (/^(mp4|mov|avi|mkv|m4v)$/.test(ext)) return 'video'
  if (/^(jpg|jpeg|png|webp|gif|avif|heic)$/.test(ext)) return 'image'
  return 'context'
}
const TYPE_DISPLAY = computed(() => ({
  soul:  t('files.type_label_soul'),
  audio: t('files.type_label_audio'),
  video: t('files.type_label_video'),
  image: t('files.type_label_image'),
  doc:   t('files.type_label_doc'),
}))

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
      type, typeLabel: TYPE_DISPLAY.value[type] || f.kind,
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
      items.push({ id: `srv:${name}`, name, displayName: name.split('/').pop(), type, typeLabel: TYPE_DISPLAY.value[type], apiType })
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

function sharedFileType(name) {
  return kindToType((name || '').split('.').pop().toLowerCase())
}
const filteredSharedFiles = computed(() => {
  if (typeFilter.value === 'all') return sharedFiles.value
  if (typeFilter.value === 'soul') return []
  return sharedFiles.value.filter(f => sharedFileType(f.name) === typeFilter.value)
})
function statsCount(type) {
  const n = activeList.value.filter(f => f.type === type).length
  return n > 0 ? n : '—'
}

// ── Refresh ────────────────────────────────────────────────────────────────
async function refresh() {
  refreshing.value = true
  try {
    if (tab.value === 'lokal') await scanLocalVault()
    else if (tab.value === 'geteilt') await loadSharedFiles()
    else if (tab.value === 'widerruf') await loadConsentFiles()
    else await loadContext(soulToken.value)
  } finally { refreshing.value = false }
}

// ── Server switch ──────────────────────────────────────────────────────────
async function switchToServer() {
  tab.value = 'server'
  if (soulToken.value) await loadContext(soulToken.value)
}

// ── Shared tab ─────────────────────────────────────────────────────────────
function formatSharedSize(bytes) {
  if (!bytes) return '–'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
function formatSharedDate(mtime) {
  if (!mtime) return '–'
  return new Date(mtime * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
async function loadSharedFiles() {
  if (!soulToken.value) return
  try {
    const r = await fetch('/api/vault/shared-list', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      sharedFiles.value  = d.files || []
      sharedSoulId.value = d.soul_id || ''
    }
  } catch {}
}
async function switchToShared() {
  tab.value = 'geteilt'
  sharedLoading.value = true
  await loadSharedFiles()
  sharedLoading.value = false
}
async function downloadSharedFile(f) {
  if (!soulToken.value || !sharedSoulId.value) return
  sharedBusy[f.name] = 'down'
  try {
    const res = await fetch(`/api/vault/shared/${encodeURIComponent(sharedSoulId.value)}/${encodeURIComponent(f.name)}`, {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (!res.ok) { showToast(t('files.download_failed'), 'err'); return }
    const blob = await res.blob()
    if (!blob.size) { showToast(t('files.download_failed'), 'err'); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = f.name; a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 5000)
    showToast(t('files.downloading', { name: f.name }))
  } catch { showToast(t('files.download_failed'), 'err') }
  finally { delete sharedBusy[f.name] }
}
async function deleteSharedFile(name) {
  if (!soulToken.value) return
  const ok = await confirmAsk({
    title:       t('files.confirm_delete_file'),
    message:     t('files.confirm_delete_shared', { name }),
    confirmText: t('files.delete'),
    cancelText:  t('common.cancel'),
    danger:      true,
  })
  if (!ok) return
  sharedBusy[name] = 'del'
  try {
    const res = await fetch(`/api/vault/shared/${encodeURIComponent(name)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (res.ok) { sharedFiles.value = sharedFiles.value.filter(f => f.name !== name); showToast(t('files.deleted_ok', { name })) }
    else showToast(t('files.delete_failed'), 'err')
  } catch { showToast(t('files.delete_failed'), 'err') }
  finally { delete sharedBusy[name] }
}

// ── Widerruf (EU-Consent) tab ────────────────────────────────────────────────
async function loadConsentFiles() {
  if (!soulToken.value) return
  try {
    const r = await fetch('/api/vault/consent-list', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      consentFiles.value  = d.files || []
      consentSoulId.value = d.soul_id || ''
    }
  } catch {}
}
async function switchToConsent() {
  tab.value = 'widerruf'
  consentLoading.value = true
  await loadConsentFiles()
  consentLoading.value = false
}
async function downloadConsentFile(f) {
  if (!consentSoulId.value) return
  consentBusy[f.reference_id] = 'down'
  try {
    // Öffentlicher, UUID-gesicherter Link — kein Bearer nötig (siehe vault_consent_serve.lua)
    const res = await fetch(`/api/vault/consent/${encodeURIComponent(consentSoulId.value)}/${encodeURIComponent(f.name)}`)
    if (!res.ok) { showToast(t('files.download_failed'), 'err'); return }
    const blob = await res.blob()
    if (!blob.size) { showToast(t('files.download_failed'), 'err'); return }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = f.name; a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 5000)
    showToast(t('files.downloading', { name: f.name }))
  } catch { showToast(t('files.download_failed'), 'err') }
  finally { delete consentBusy[f.reference_id] }
}
async function deleteConsentFile(f) {
  if (!soulToken.value) return
  const ok = await confirmAsk({
    title:       t('files.confirm_delete_file'),
    message:     t('files.confirm_delete_consent', { name: f.name }),
    confirmText: t('files.delete'),
    cancelText:  t('common.cancel'),
    danger:      true,
  })
  if (!ok) return
  consentBusy[f.reference_id] = 'del'
  try {
    const res = await fetch(`/api/vault/consent-doc/${encodeURIComponent(f.reference_id)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (res.ok) { consentFiles.value = consentFiles.value.filter(x => x.reference_id !== f.reference_id); showToast(t('files.deleted_ok', { name: f.name })) }
    else showToast(t('files.delete_failed'), 'err')
  } catch { showToast(t('files.delete_failed'), 'err') }
  finally { delete consentBusy[f.reference_id] }
}

async function handleSharedUpload(e) {
  const file = e.target.files?.[0]
  if (!file || !soulToken.value) return
  if (file.size > 50 * 1024 * 1024) { showToast(t('files.max_50mb'), 'err'); e.target.value = ''; return }
  sharedUploading.value = true
  try {
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })
    const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') || 'datei'
    const resp = await fetch('/api/vault/shared', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ name: safeName, data: b64, mime: file.type || '' }),
    })
    if (resp.ok) { showToast(t('files.uploaded_ok', { name: file.name })); await loadSharedFiles() }
    else { const d = await resp.json().catch(() => ({})); showToast(d.error || t('files.upload_failed'), 'err') }
  } catch { showToast(t('files.upload_failed'), 'err') }
  finally { sharedUploading.value = false; e.target.value = '' }
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
async function downloadSoul() {
  // Immer direkt vom Server holen — nie den sessionStorage-Cache verwenden
  try {
    const res = await fetch('/api/soul', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (res.ok) {
      const text = await res.text()
      triggerDownload(new Blob([text], { type: 'text/markdown' }), soulFilename?.value || 'sys.md')
      return
    }
  } catch {}
  // Fallback: lokaler Stand
  triggerDownload(new Blob([soulContent.value || ''], { type: 'text/markdown' }), soulFilename?.value || 'sys.md')
}

async function handleSoulImport(e) {
  const file = e.target.files?.[0]; if (!file) return
  const text = await file.text()
  importFromText(text)
  saveSoul()
  showToast(t('files.soul_overwritten'))
  e.target.value = ''
}

// Gemeinsame Funktion für sys.md Upload — genutzt von Einzelupload und Gesamt-Upload
async function uploadSoulText(text) {
  const currentV = parseInt(soulContent.value?.match(/cert_version:\s*(\d+)/)?.[1] || '0', 10)
  const uploadV  = parseInt(text.match(/cert_version:\s*(\d+)/)?.[1] || '0', 10)
  if (currentV > uploadV && text.includes('cert_version:')) {
    text = text.replace(/cert_version:\s*\d+/, `cert_version: ${currentV}`)
  }
  const res = await fetch('/api/context', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
    body: JSON.stringify({ soul_content: text })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return true
}

async function replaceSoulOnServer(e) {
  const file = e.target.files?.[0]; if (!file) return
  busy['soul'] = true
  try {
    const text = await file.text()
    await uploadSoulText(text)
    showToast(t('files.soul_replaced'))
    await loadContext(soulToken.value)
  } catch (err) { showToast(err.message || t('files.replace_failed'), 'err') }
  finally { busy['soul'] = false; e.target.value = '' }
}

// ── Download file ──────────────────────────────────────────────────────────
async function downloadFile(file) {
  busy[file.id] = true
  try {
    if (tab.value === 'lokal') {
      const buf = await readVaultFile(file.name)
      if (!buf) { showToast(t('files.file_unreadable'), 'err'); return }
      triggerDownload(buf, file.displayName)
    } else {
      const res = await fetch(`/api/vault/${file.apiType}/${encodeURIComponent(file.name)}`, {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      })
      if (!res.ok) { showToast(t('files.download_failed'), 'err'); return }
      triggerDownload(await res.arrayBuffer(), file.displayName)
    }
    showToast(t('files.downloaded_ok', { name: file.displayName }))
  } catch { showToast(t('files.download_error'), 'err') }
  finally { busy[file.id] = false }
}

// ── Upload local → server ──────────────────────────────────────────────────
async function uploadToServer(file) {
  busy[file.id] = true
  try {
    const buf = await readVaultFile(file.displayName)
    if (!buf) { showToast(t('files.file_unreadable'), 'err'); return }
    const key = vaultKey.value === '__encrypted__' ? '' : (vaultKey.value || '')
    const res = await syncFile(soulToken.value, file.apiType, file.displayName, buf, key)
    if (res.ok) { showToast(t('files.uploaded_ok', { name: file.displayName })); await loadContext(soulToken.value); await scanLocalVault() }
    else showToast(res.error || t('files.upload_failed'), 'err')
  } catch { showToast(t('files.upload_error'), 'err') }
  finally { busy[file.id] = false }
}

// ── Delete file ────────────────────────────────────────────────────────────
async function deleteFile(file) {
  const ok = await confirmAsk({
    title:       t('files.confirm_delete_file'),
    message:     t('files.confirm_delete_file_msg', { name: file.displayName }),
    confirmText: t('files.delete'),
    cancelText:  t('common.cancel'),
    danger:      true,
  })
  if (!ok) return
  busy[file.id] = true
  try {
    if (tab.value === 'lokal') {
      const ok = await deleteLocalFile(file.name)
      if (ok) showToast(t('files.deleted_ok', { name: file.displayName }))
      else showToast(t('files.delete_failed'), 'err')
    } else {
      const res = await deleteVaultFile(soulToken.value, file.apiType, file.name)
      if (res?.ok !== false) { showToast(t('files.deleted_ok', { name: file.displayName })); await loadContext(soulToken.value) }
      else showToast(t('files.delete_failed'), 'err')
    }
  } catch { showToast(t('files.delete_error'), 'err') }
  finally { busy[file.id] = false }
}

// ── Ganzen lokalen Vault auf Server laden ──────────────────────────────────
async function pushVaultToServer() {
  if (syncing.value) return
  syncing.value = true
  try {
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
    // sys.md: Datei aus Vault lesen und gleichen Weg wie Einzelupload nutzen
    const soulFile = await readVaultFile(soulFilename?.value || 'sys.md')
    if (soulFile) {
      const text = await soulFile.text()
      await uploadSoulText(text)
      ok++
    } else {
      fail++
    }
    if (fail === 0) showToast(t('files.vault_uploaded', { ok, plural: ok !== 1 ? 'en' : '' }))
    else showToast(t('files.vault_upload_partial', { ok, fail }), ok === 0 ? 'err' : 'ok')
    await loadContext(soulToken.value)
    await scanLocalVault()
  } finally {
    syncing.value = false
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}
function onNav(id) {
  if (id === 'files')    return
  if (id === 'chat')     { router.push('/session');    return }
  if (id === 'setup')    { router.push('/setup');  return }
  if (id === 'soul')     { router.push('/soul');       return }
  if (id === 'chronik')  { router.push('/chronicle');    return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/earnings');   return }
  if (id === 'maturity') { router.push('/maturity');      return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'calendar') { router.push('/calendar');   return }
  if (id === 'anchor')   { router.push('/anchor');    return }
  if (id === 'export')   { router.push('/export'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/connection');  return }
  if (id === 'settings') { router.push('/settings'); return }
  drawerOpen.value = false
  router.push('/')
}

const euConsumerRights = ref(false)
onMounted(() => {
  if (soulToken.value && !serverLoaded.value) loadContext(soulToken.value).catch(() => {})
  if (soulToken.value) {
    fetch('/api/get-config', { headers: { Authorization: `Bearer ${soulToken.value}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) euConsumerRights.value = !!d.eu_consumer_rights })
      .catch(() => {})
  }
})
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase;
}

.dateien-page { max-width: 900px; margin: 0 auto; padding: 36px clamp(22px, 4vw, 42px) 88px; }

/* ── Toast ── */
.dt-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 9px 18px; border-radius: var(--r-xs); z-index: 200;
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.06em;
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
.dt-search { background: transparent; border: none; outline: none; color: var(--fg); font-family: var(--sans); font-size: 15px; width: 140px; }
.dt-search::placeholder { color: var(--fg-3); }

/* ── Hero ── */
.dt-hero { padding-bottom: 24px; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
.dt-eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; margin-bottom: 10px; }
.dt-title { font-family: var(--serif); font-size: clamp(28px, 4vw, 42px); font-weight: 400; letter-spacing: -0.03em; color: var(--fg); line-height: 1.05; margin: 0; }
.dt-title em { font-style: italic; color: var(--accent); }

/* ── Tabs ── */
.dt-tabs-row { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.dt-tabs { display: flex; border: 1px solid var(--line); border-radius: var(--r-xs); overflow: hidden; flex: none; }
.dt-tab { display: flex; align-items: center; gap: 6px; padding: 7px 16px; font-family: var(--sans); font-size: 16px; color: var(--fg); background: transparent; border: none; border-right: 1px solid var(--line); cursor: pointer; transition: all 0.15s; box-shadow: inset 0 -2px 0 0 transparent; }
.dt-tab:last-child { border-right: none; }
.dt-tab.on { background: var(--surface); color: var(--fg); box-shadow: inset 0 -2px 0 0 var(--accent); }
.dt-tab:hover:not(.on) { color: var(--fg-2); background: rgba(255,255,255,0.03); }
.dt-tab-desc { font-family: var(--mono); font-size: 13px; color: var(--fg-2); letter-spacing: 0.04em; }

/* ── Storage ── */
.dt-storage { display: flex; align-items: center; gap: 10px; padding: 9px 14px; margin-bottom: 14px; border: 1px solid var(--line); background: var(--surface-2); border-radius: var(--r-xs); flex-wrap: wrap; }
.dt-storage-info { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.dt-storage-label { font-family: var(--mono); font-size: 13px; color: var(--fg); letter-spacing: 0.04em; }
.dt-storage-sync { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.04em; }
.dt-storage-bar-wrap { flex: 1; min-width: 80px; max-width: 180px; }
.dt-storage-bar { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; }
.dt-storage-fill { height: 100%; background: var(--accent); border-radius: 2px; }
.dt-storage-size { font-family: var(--mono); font-size: 13px; color: var(--fg); letter-spacing: 0.04em; flex: none; }

/* ── Stats ── */
.dt-stats { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 13px; color: var(--fg); letter-spacing: 0.04em; margin-bottom: 18px; flex-wrap: wrap; }
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
  font-family: var(--sans); font-size: 15px; font-weight: 500; cursor: pointer;
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
.dt-table-head span { font-family: var(--mono); font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg); }
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
.dt-icon-doc   { background: rgba(236,236,236,0.07); color: var(--fg-3); }
.dt-name-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dt-filename { font-family: var(--sans); font-size: 17px; font-weight: 500; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-filetype { font-family: var(--mono); font-size: 14px; color: var(--fg-2); letter-spacing: 0.04em; }

/* ── Meta / status ── */
.dt-meta { font-family: var(--mono); font-size: 15px; color: var(--fg-2); }
.dt-status-sync { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.04em; }
.dt-status-local { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 13px; color: var(--fg-2); letter-spacing: 0.04em; }

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
.dt-empty-text { font-family: var(--mono); font-size: 14px; color: var(--fg-2); letter-spacing: 0.06em; margin: 0; }
.dt-connect-btn { padding: 7px 18px; border: 1px solid var(--line-2); border-radius: var(--r-xs); background: transparent; color: var(--fg-2); font-family: var(--sans); font-size: 15px; cursor: pointer; transition: all 0.15s; }
.dt-connect-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Mobile ── */
@media (max-width: 900px) {
  .dt-search-wrap { display: none; }
  .dt-title { font-size: clamp(24px, 7vw, 32px); }
  .dt-table-head,
  .dt-row { grid-template-columns: 1fr 90px !important; }
  .dt-col-date { display: none; }
  .dt-tab-desc { font-size: 12px; }
}
</style>
