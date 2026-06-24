<template>
  <ClientOnly>
    <!-- ─── LANDING (no soul) ────────────────────────────────────────────── -->
    <template v-if="!hasSoul">
      <div class="gate" style="background:radial-gradient(120% 80% at 50% 0%,#1d1c19 0%,var(--bg) 60%)">
        <div class="gate-card">
          <div class="gate-mark">SYS<span class="dot">.</span></div>
          <div class="gate-sub">{{ config.public.nodeName }}</div>
          <h1>Save Your Soul<em>.</em></h1>
          <p class="welcome">{{ config.public.nodeTagline || $t('index.landing_sub') }}</p>
          <div style="display:flex;flex-direction:column;gap:12px;width:100%">
            <button v-if="allowCreateSoul" class="btn btn-primary btn-lg" @click="createSoulOpen = true">
              {{ $t('index.create_soul') }}
              <SysIcon name="arrow" style="width:18px;height:18px" />
            </button>
            <button class="btn btn-ghost btn-lg" @click="loginOpen = true">
              {{ $t('index.login_with_soul') }}
            </button>
          </div>
          <div class="gate-foot">
            <span class="live-dot" />
            {{ $t('index.private_node', { name: config.public.nodeName }) }}
          </div>
        </div>
      </div>
    </template>

    <!-- ─── SPA SHELL (soul active) ─────────────────────────────────────── -->
    <template v-else>
      <div class="app" :class="{ 'is-collapsed': sidebarCollapsed, 'drawer-open': drawerOpen }">

        <!-- Sidebar -->
        <SysSidebar
          :route="route"
          :soul-meta="soulMeta ? { ...soulMeta, maturity } : null"
          :collapsed="sidebarCollapsed"
          @go="onNav"
          @collapse="sidebarCollapsed = !sidebarCollapsed"
          @lock="lockGate"
        />

        <!-- Mobile scrim -->
        <div class="scrim-mob" @click="drawerOpen = false" />

        <!-- Main column -->
        <div class="main">
          <SysTopbar :crumbs="crumbs" @open-cmdk="cmdkOpen = true" @open-drawer="drawerOpen = true" />

          <!-- Scrollable view area -->
          <div class="scroll">

            <!-- ── Home ──────────────────────────────────────────────── -->
            <div v-if="route === 'home'" class="page">

              <!-- Hero -->
              <div class="hero">
                <div class="greet">{{ $t('home.welcome') }}</div>
                <h1>{{ soulMeta?.name || 'Soul' }}<em>.</em></h1>
                <div class="hero-sub">{{ $t('home.hero_sub') }}</div>
                <div class="hero-actions">
                  <button class="btn btn-primary" @click="onNav('chat')">
                    {{ $t('home.start_session') }}
                    <SysIcon name="arrow" style="width:16px;height:16px" />
                  </button>
                </div>
              </div>

              <!-- Overview -->
              <div class="section-head">
                <h3>{{ $t('home.overview') }}</h3>
              </div>
              <div class="stat-grid">
                <div class="stat">
                  <div class="stat-val">{{ maturity }}<small>%</small></div>
                  <div class="stat-label">{{ $t('home.soul_maturity') }}</div>
                  <div class="mat-bar" style="margin-top:10px">
                    <div class="mat-fill" :style="{ width: maturity + '%' }" />
                  </div>
                  <div class="stat-foot" :class="{ off: !hasAnchor }">
                    <span class="d" />{{ hasAnchor ? $t('home.anchored') : $t('home.no_anchor') }}
                  </div>
                </div>
                <div class="stat">
                  <div class="stat-val">{{ chainCount }}</div>
                  <div class="stat-label">{{ $t('home.sessions_in_chain') }}</div>
                  <div class="stat-foot">
                    <span class="d" />{{ $t('home.ready') }}
                  </div>
                </div>
                <div class="stat">
                  <div class="stat-val" style="font-size:20px">{{ $t('home.local') }}</div>
                  <div class="stat-label">{{ $t('home.soul_file') }}</div>
                  <div class="stat-foot" :class="{ off: !vaultConnected }">
                    <span class="d" />{{ vaultConnected ? $t('home.ready') : $t('home.offline') }}
                  </div>
                </div>
                <div class="stat">
                  <div class="stat-val" style="font-size:20px">{{ soulMeta?.version || 'v1' }}</div>
                  <div class="stat-label">{{ $t('home.soul_version') }}</div>
                  <div class="stat-foot">
                    <span class="d" />{{ shortCert }} · {{ $t('home.signed') }}
                  </div>
                </div>
              </div>

              <!-- Continue with -->
              <div class="section-head">
                <h3>{{ $t('home.continue_with') }}</h3>
              </div>
              <ul class="action-list">
                <li class="action" @click="onNav('setup')">
                  <div class="act-ic"><SysIcon name="settings" style="width:20px;height:20px" /></div>
                  <div class="act-body">
                    <div class="act-title">{{ $t('home.soul_setup') }}</div>
                    <div class="act-sub">{{ $t('home.soul_setup_sub') }}</div>
                  </div>
                  <SysIcon name="arrow" style="width:15px;height:15px" class="act-arr" />
                </li>
                <li class="action" @click="onNav('files')">
                  <div class="act-ic"><SysIcon name="files" style="width:20px;height:20px" /></div>
                  <div class="act-body">
                    <div class="act-title">{{ $t('home.manage_files') }}</div>
                    <div class="act-sub">{{ $t('home.manage_files_sub') }}</div>
                  </div>
                  <SysIcon name="arrow" style="width:15px;height:15px" class="act-arr" />
                </li>
                <li class="action" @click="onNav('export')">
                  <div class="act-ic"><SysIcon name="export" style="width:20px;height:20px" /></div>
                  <div class="act-body">
                    <div class="act-title">{{ $t('home.export_soul') }}</div>
                    <div class="act-sub">{{ $t('home.export_soul_sub') }}</div>
                  </div>
                  <SysIcon name="arrow" style="width:15px;height:15px" class="act-arr" />
                </li>
                <li class="action" @click="onNav('anchor')">
                  <div class="act-ic"><SysIcon name="anchor" style="width:20px;height:20px" /></div>
                  <div class="act-body">
                    <div class="act-title">{{ $t('home.anchor_polygon') }}</div>
                    <div class="act-sub">{{ $t('home.anchor_polygon_sub') }}</div>
                  </div>
                  <SysIcon name="arrow" style="width:15px;height:15px" class="act-arr" />
                </li>
              </ul>

              <!-- Chronicle preview -->
              <div class="section-head">
                <h3>{{ $t('home.chronicle_title') }}<em>.</em></h3>
                <button class="more" @click="onNav('chronik')">{{ $t('home.all_entries') }}</button>
              </div>
              <div v-if="journal.length === 0" class="empty-hint">{{ $t('home.no_entries') }}</div>
              <div v-else class="chronik">
                <div v-for="n in journal" :key="n.id" class="chron-item">
                  <div class="chron-when">{{ n.when[0] }}</div>
                  <div class="chron-body">{{ n.body }}</div>
                </div>
              </div>
            </div>

            <!-- ── Chronicle ─────────────────────────────────────────── -->
            <div v-else-if="route === 'chronik'" class="page">
              <div class="page-hero">
                <h2>{{ $t('chronicle.title') }}<em>.</em></h2>
                <span class="page-sub">{{ $t('chronicle.subtitle') }} · {{ journal.length }} {{ $t('chronicle.entries', { count: journal.length }) }}</span>
              </div>
              <div v-if="journal.length === 0" class="empty-hint">{{ $t('chronicle.no_entries') }}</div>
              <div v-else class="chronik">
                <div v-for="n in journal" :key="n.id" class="chron-item">
                  <div class="chron-when">{{ n.when[0] }}</div>
                  <div class="chron-body">{{ n.body }}</div>
                </div>
              </div>
            </div>

            <!-- ── Maturity ───────────────────────────────────────────── -->
            <div v-else-if="route === 'maturity'" class="page">
              <div class="page-hero">
                <h2>{{ $t('home.soul_maturity') }}<em>.</em></h2>
                <span class="page-sub">Growth &amp; Development</span>
              </div>
              <div class="mat-view">
                <div class="mat-ring-wrap">
                  <svg viewBox="0 0 120 120" class="mat-ring-svg" width="160" height="160">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="10" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="10"
                      stroke-dasharray="326.7" :stroke-dashoffset="326.7 * (1 - maturity / 100)"
                      stroke-linecap="round" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset .6s ease" />
                  </svg>
                  <div class="mat-ring-inner">
                    <span class="mat-pct">{{ maturity }}</span>
                    <span class="mat-unit">%</span>
                  </div>
                </div>
                <div class="mat-meta">
                  <div class="mat-level-label">{{ maturityLevel }}</div>
                  <div class="mat-bar-wrap">
                    <div class="mat-bar-track">
                      <div class="mat-fill" :style="{ width: maturity + '%' }" />
                    </div>
                    <div class="mat-ticks">
                      <span>{{ $t('home.maturity_levels.genesis') }}</span>
                      <span>{{ $t('home.maturity_levels.building') }}</span>
                      <span>{{ $t('home.maturity_levels.established') }}</span>
                      <span>{{ $t('home.maturity_levels.premium') }}</span>
                    </div>
                  </div>
                  <div class="mat-soul-id">Soul: {{ shortId }}</div>
                </div>
              </div>
            </div>

            <!-- ── Peers ──────────────────────────────────────────────── -->
            <div v-else-if="route === 'peers'" class="page">
              <div class="page-hero">
                <h2>Peers<em>.</em></h2>
                <span class="page-sub">{{ $t('home.peers_sub') }}</span>
              </div>
              <div class="empty-hint">{{ $t('home.peers_coming_soon') }}</div>
            </div>

            <!-- ── Calendar ───────────────────────────────────────────── -->
            <div v-else-if="route === 'calendar'" class="page">
              <div class="page-hero">
                <h2>{{ $t('nav.calendar') }}<em>.</em></h2>
                <span class="page-sub">{{ $t('home.calendar_sub') }}</span>
              </div>
              <div class="empty-hint">{{ $t('home.calendar_coming_soon') }}</div>
            </div>

            <!-- ── Connect ────────────────────────────────────────────── -->
            <div v-else-if="route === 'connect'" class="page">
              <div class="page-hero">
                <h2>{{ $t('nav.connect') }}<em>.</em></h2>
                <span class="page-sub">{{ $t('home.connect_sub') }}</span>
              </div>
              <div class="empty-hint">{{ $t('home.connect_coming_soon') }}</div>
            </div>

            <!-- ── Fallback ───────────────────────────────────────────── -->
            <div v-else class="page">
              <div class="empty-hint">{{ $t('home.not_available') }}</div>
            </div>

          </div><!-- .scroll -->
        </div><!-- .main -->

        <!-- Command Palette -->
        <SysCommandPalette
          :open="cmdkOpen"
          @close="cmdkOpen = false"
          @navigate="onNav"
          @insert="() => {}"
        />

      </div><!-- .app -->
    </template>

    <!-- ─── Modals ────────────────────────────────────────────────────────── -->
    <ModalCreateSoul
      :is-open="createSoulOpen"
      @create="handleSoulCreate"
      @cancel="createSoulOpen = false"
    />

    <!-- Login: sys.md upload -->
    <Teleport to="body">
      <Transition name="login-sheet">
        <div
          v-if="loginOpen"
          class="fixed inset-0 z-50 flex flex-col justify-end items-center"
          role="dialog" aria-modal="true" :aria-label="$t('index.load_soul_title')"
          @click.self="loginOpen = false"
        >
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="loginOpen = false" />
          <div class="login-sheet">
            <div class="login-handle">
              <div class="login-bar" />
              <button class="login-close" @click="loginOpen = false" :aria-label="$t('index.close')">✕</button>
            </div>
            <div class="login-kicker">{{ $t('index.login_modal_kicker') }}</div>
            <h2 class="login-title">{{ $t('index.login_modal_title') }}</h2>
            <p class="login-sub">
              {{ $t('index.login_modal_sub') }}
              <template v-if="allowCreateSoul">
                <br><em>{{ $t('index.login_modal_sub_import') }}</em>
              </template>
            </p>
            <div class="sys-field" style="margin-bottom:0">
              <span class="sys-field-label">{{ $t('index.soul_file_label') }}</span>
              <SoulUpload @uploaded="(text, name) => handleLoginUpload(text, name)" />
            </div>

            <div v-if="pendingResetSoulId" class="login-recovery">
              <p class="login-recovery-msg">{{ $t('index.recovery_msg') }}</p>
              <button class="login-recovery-btn" @click="handleResetRegistration" :disabled="resetBusy">
                {{ resetBusy ? $t('index.resetting') : $t('index.reset_registration') }}
              </button>
            </div>

            <div class="login-divider"><span>{{ $t('index.or') }}</span></div>
            <button class="login-alt" @click="openDecryptFromLogin">
              <span>{{ $t('index.load_encrypted_vault') }}</span>
              <span class="login-alt-sub">{{ $t('index.load_encrypted_sub') }}</span>
              <span class="login-arr">→</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- .soul Bundle -->
    <SoulDecryptModal :is-open="decryptOpen" @close="decryptOpen = false" @uploaded="decryptOpen = false" />

    <!-- Soul Setup -->
    <Teleport to="body">
      <Transition name="sys-modal">
        <div v-if="setupOpen" class="sys-modal-wrap" role="dialog" aria-modal="true" @click.self="setupOpen = false">
          <div class="sys-modal-panel">
            <div class="sys-modal-head">
              <div>
                <div class="sys-modal-kicker">{{ $t('index.kicker_config') }}</div>
                <h2 class="sys-modal-title">{{ $t('index.modal_setup_title') }}<em>.</em></h2>
              </div>
              <button class="sys-modal-close" @click="setupOpen = false" :aria-label="$t('index.close')"><span>×</span></button>
            </div>
            <div class="sys-modal-body">
              <SoulSetupWizard
                :soul-cert="soulToken"
                :soul-content="soulContent"
                :soul-id="soulMeta?.id || ''"
                :modal="true"
                @close="setupOpen = false"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Files -->
    <Teleport to="body">
      <Transition name="sys-modal">
        <div v-if="filesOpen" class="sys-modal-wrap" role="dialog" aria-modal="true" @click.self="filesOpen = false">
          <div class="sys-modal-panel sys-modal-panel--wide">
            <div class="sys-modal-head">
              <div>
                <div class="sys-modal-kicker">{{ $t('index.modal_vault_kicker') }}</div>
                <h2 class="sys-modal-title">{{ $t('index.modal_files_title') }}<em>.</em></h2>
              </div>
              <button class="sys-modal-close" @click="filesOpen = false" :aria-label="$t('index.close')"><span>×</span></button>
            </div>
            <div class="sys-modal-body">
              <VaultExplorer :soul-cert="soulToken" :soul-content="soulContent" @encrypt="encryptOpen = true" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <SoulEncryptModal :is-open="encryptOpen" @close="encryptOpen = false" />
    <SoulAnchorModal  :is-open="anchorOpen"  @close="anchorOpen = false" />

    <Teleport to="body">
      <AgentMarketplacePanel v-if="marketplaceOpen" :soul-cert="soulToken" @close="marketplaceOpen = false" />
    </Teleport>

    <ConfirmModal />
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" />
    <FirstSetupModal :token="firstSetupToken" @dismiss="firstSetupToken = null; setupOpen = true" @download-soul="onSetupDownload" @import-soul="onSetupImport" />

    <!-- PWA Install Banner -->
    <Teleport to="body">
      <Transition name="pwa-slide">
        <div v-if="pwa.isInstallable.value" class="pwa-banner" role="banner">
          <div class="pwa-banner-inner">
            <div class="pwa-banner-text">
              <span class="pwa-banner-title">{{ $t('index.pwa_install') }}</span>
              <span v-if="pwa.isIos.value" class="pwa-banner-sub">{{ $t('index.pwa_ios_hint') }}</span>
              <span v-else class="pwa-banner-sub">{{ $t('index.pwa_hint') }}</span>
            </div>
            <button v-if="!pwa.isIos.value" class="pwa-banner-btn" @click="pwa.promptInstall()">{{ $t('index.install') }}</button>
            <button class="pwa-banner-dismiss" @click="pwa.dismiss()" :aria-label="$t('index.close')">×</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<script setup>
definePageMeta({ layout: false })
import { computed, ref, onMounted } from 'vue'
import { useConfirm } from '~/composables/useConfirm.js'
import { usePwaInstall } from '~/composables/usePwaInstall.js'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useProfile } from '~/composables/useProfile.js'
import { computeMaturity } from '#shared/utils/soulMaturity.js'
import { parseSoul } from '#shared/utils/soulParser.js'
import ConfirmModal from '~/components/ConfirmModal.vue'
import ModalCreateSoul from '~/components/ModalCreateSoul.vue'
import SoulEncryptModal from '~/components/SoulEncryptModal.vue'
import SoulAnchorModal from '~/components/SoulAnchorModal.vue'
import AgentMarketplacePanel from '~/components/AgentMarketplacePanel.vue'
import SoulDecryptModal from '~/components/SoulDecryptModal.vue'
import SoulUpload from '~/components/SoulUpload.vue'
import SoulSetupWizard from '~/components/SoulSetupWizard.vue'
import VaultExplorer from '~/components/VaultExplorer.vue'
import FirstSetupModal from '~/components/FirstSetupModal.vue'
import SettingsModal from '~/components/SettingsModal.vue'

const config = useRuntimeConfig()
const { t } = useI18n()
const { ask: confirmAsk } = useConfirm()
const { hasSoul, soulContent, soulToken, soulMeta, importFromText, importAndSetup, createNew, pushToServer, exportAsBlob, clear: _clear, firstSetupToken, refreshCert, soulFilename, setSoulFilename } = useSoul()
const { isConnected: vaultConnected } = useVault()
const { hasProfile, profileUrl, handleUpload: handleProfileUpload } = useProfile()
const { allowCreateSoul, fetchNodeStatus } = useNodeStatus()
const pwa = usePwaInstall()

// Node-Status beim Start laden
const chainCountServer = ref(null)
onMounted(() => {
  fetchNodeStatus()
  fetch('/api/soul/chain-metrics').then(r => r.ok ? r.json() : null).then(d => {
    if (d?.anchor_count != null) chainCountServer.value = d.anchor_count
  }).catch(() => {})
})

// ── Modal-State ───────────────────────────────────────────────────────────
const createSoulOpen    = ref(false)
const loginOpen         = ref(false)
const decryptOpen       = ref(false)
const setupOpen         = ref(false)
const filesOpen         = ref(false)
const encryptOpen       = ref(false)
const anchorOpen        = ref(false)
const marketplaceOpen   = ref(false)
const settingsOpen      = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────
const initial      = computed(() => (soulMeta.value?.name || 'S').charAt(0).toUpperCase())
const shortId      = computed(() => { const id = soulMeta.value?.id || ''; return id ? id.slice(0, 8) + '…' + id.slice(-4) : '—' })
const idCopied     = ref(false)
async function copyId() {
  if (!soulMeta.value?.id) return
  await navigator.clipboard.writeText(soulMeta.value.id).catch(() => {})
  idCopied.value = true
  setTimeout(() => { idCopied.value = false }, 2000)
}
const shortCert    = computed(() => { const c = soulMeta.value?.cert || ''; return c ? c.slice(0, 8) + '…' : '—' })

// Lokaler Parse: inline JSON array oder YAML-Blockliste
const chainCountLocal = computed(() => {
  if (!soulContent.value) return 0
  const m = soulContent.value.match(/soul_growth_chain:\s*(\[[\s\S]*?\])/m)
  if (m) {
    try {
      const arr = JSON.parse(m[1].replace(/,(\s*[\]\}])/g, '$1'))
      return Array.isArray(arr) ? arr.length : 0
    } catch {
      return m[1].split('\n').filter(l => l.trim().startsWith('-')).length
    }
  }
  const block = soulContent.value.match(/soul_growth_chain:\s*\n((?:[ \t]*-[^\n]*\n?)+)/m)
  if (block) return block[1].split('\n').filter(l => l.trim().startsWith('-')).length
  return 0
})
// Höchster Wert gewinnt: frischer VPS hat server=0 aber lokal=18; alter VPS kann server>lokal haben
const effectiveChainCount = computed(() => Math.max(chainCountServer.value ?? 0, chainCountLocal.value))
const chainCount = computed(() => effectiveChainCount.value)

// hasAnchor: true wenn soul_chain_anchor nicht null/leer
const hasAnchor = computed(() => {
  if (!soulContent.value) return false
  const m = soulContent.value.match(/soul_chain_anchor:\s*(.+)/)
  const val = m?.[1]?.trim()
  return !!val && val !== 'null' && val !== '~' && val !== ''
})

// Maturity wird live aus dem Soul-Content berechnet
const maturityData  = computed(() => computeMaturity(soulContent.value, {}, null, 0, effectiveChainCount.value || null))
const maturity      = computed(() => maturityData.value.score)
const maturityLevel = computed(() => maturityData.value.level)

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}
function lockGate() {
  _clear?.()
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/gate'
}

async function confirmReset() {
  const ok = await confirmAsk({
    title: t('index.logout_title'),
    message: t('index.logout_msg'),
    confirmText: t('index.logout_confirm'),
    cancelText: t('index.cancel'),
    danger: true,
  })
  if (ok) lockGate()
}

async function handleSoulCreate({ name, idea }) {
  await createNew(name, idea)
  await pushToServer()
  createSoulOpen.value = false
  fetchNodeStatus()
}

async function onSetupDownload() {
  await exportAsBlob()
  firstSetupToken.value = null
  setupOpen.value = true
}

async function onSetupImport(markdown) {
  const lockedId = soulMeta.value?.id
  if (lockedId) {
    try {
      await $fetch('/api/soul/reset-registration', {
        method: 'POST',
        body: { soul_id: lockedId, clear_lock: true },
      })
    } catch { /* ignore */ }
  }
  const tokenBefore = firstSetupToken.value
  const result = await importAndSetup(markdown)
  if (!result.ok) {
    firstSetupToken.value = null
    setupOpen.value = true
    return
  }
  await exportAsBlob()
  const newToken = firstSetupToken.value
  if (newToken && newToken !== '__single__' && newToken !== tokenBefore) {
    return
  }
  firstSetupToken.value = null
  setupOpen.value = true
}

const pendingResetText   = ref('')
const pendingResetSoulId = ref('')
const resetBusy = ref(false)

async function handleLoginUpload(text, filename) {
  pendingResetText.value   = ''
  pendingResetSoulId.value = ''
  if (filename) setSoulFilename(filename)

  if (allowCreateSoul.value) {
    const result = await importAndSetup(text)
    if (!result.ok) {
      if (result.error === 'invalid_proof') {
        const idMatch = text.match(/soul_id:\s*([a-f0-9-]{36})/i)
        if (idMatch) {
          pendingResetText.value   = text
          pendingResetSoulId.value = idMatch[1].trim()
        }
      } else {
        const msg = result.error === 'node_locked'
          ? t('index.error.node_locked')
          : result.error === 'no_soul_id'
          ? t('index.error.no_soul_id')
          : t('index.error.import_failed', { error: result.error })
        await confirmAsk({ title: t('index.error.import_title'), message: msg, confirmText: t('common.ok'), danger: false, hideCancel: true })
      }
      return
    }
    if (firstSetupToken.value === '__single__') {
      firstSetupToken.value = null
      loginOpen.value = false
      fetchNodeStatus()
      await exportAsBlob()
      setupOpen.value = true
      return
    }
  } else {
    // Validate cert against server before importing — prevents loading a foreign soul
    const result = await importAndSetup(text)
    if (!result.ok) {
      const msg = result.error === 'node_locked'
        ? t('index.error.node_locked')
        : result.error === 'no_soul_id'
        ? t('index.error.no_soul_id')
        : t('index.error.import_failed', { error: result.error })
      await confirmAsk({ title: t('index.error.import_title'), message: msg, confirmText: t('common.ok'), danger: false, hideCancel: true })
      return
    }
    // Invite-Token-Registration: setup wizard öffnen wie bei allowCreateSoul
    if (firstSetupToken.value) {
      loginOpen.value = false
      fetchNodeStatus()
      await exportAsBlob()
      setupOpen.value = true
      sessionStorage.removeItem('sys.invite_login')
      return
    }
  }
  loginOpen.value = false
  fetchNodeStatus()
}

async function handleResetRegistration() {
  if (!pendingResetSoulId.value || resetBusy.value) return
  resetBusy.value = true
  try {
    const res = await fetch('/api/soul/reset-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: pendingResetSoulId.value })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(t('index.error.reset_failed', { error: err.error || res.status }))
      return
    }
    const text = pendingResetText.value
    pendingResetText.value   = ''
    pendingResetSoulId.value = ''
    await handleLoginUpload(text)
  } catch (e) {
    alert(t('index.error.reset_failed', { error: e.message }))
  } finally {
    resetBusy.value = false
  }
}

function openDecryptFromLogin() {
  loginOpen.value   = false
  decryptOpen.value = true
}

// ── Chronik: letzte 4 Einträge aus Session-Log Section ───────────────────
const journal = computed(() => {
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

  return entries.slice(0, 4).map((e, i) => {
    let when = [e.dateStr, '']
    try {
      const d = new Date(e.dateStr)
      if (!isNaN(d)) {
        const today = new Date()
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
        if (d.toDateString() === today.toDateString()) {
          when = [t('chronicle.today'), '']
        } else if (d.toDateString() === yesterday.toDateString()) {
          when = [t('chronicle.yesterday'), '']
        } else {
          when = [d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }), '']
        }
      }
    } catch {}
    return { id: i, when, body: e.body, tag: 'Log' }
  })
})

// ── Shell navigation ──────────────────────────────────────────────────────
const route            = ref('home')
const sidebarCollapsed = ref(false)
const drawerOpen       = ref(false)
const cmdkOpen         = ref(false)

const MODAL_MAP = {
  soul: () => { setupOpen.value    = true },
  files: () => { filesOpen.value   = true },
  anchor: () => { navigateTo('/anchor') },
  export: () => { navigateTo('/export') },
  settings: () => { navigateTo('/settings') },
  market: () => { navigateTo('/marketplace') },
}

function onNav(id) {
  if (id === 'chat')     { navigateTo('/session');    return }
  if (id === 'setup')    { navigateTo('/setup'); return }
  if (id === 'soul')     { navigateTo('/soul');       return }
  if (id === 'chronik')  { navigateTo('/chronicle');    return }
  if (id === 'maturity') { navigateTo('/maturity');      return }
  if (id === 'health')   { navigateTo('/health'); return }
  if (id === 'calendar') { navigateTo('/calendar');   return }
  if (id === 'files')    { navigateTo('/vault');    return }
  if (id === 'peers')    { navigateTo('/peers');      return }
  if (id === 'connect')  { navigateTo('/connection'); return }
  if (id === 'earnings') { navigateTo('/earnings');  return }
  const modalFn = MODAL_MAP[id]
  if (modalFn) { modalFn(); return }
  route.value     = id
  drawerOpen.value = false
}

const navLabels = computed(() => ({
  home: t('nav.home'), chat: t('nav.session'), soul: 'sys.md', chronik: t('nav.chronik'), maturity: t('nav.maturity'),
  files: t('nav.files'), calendar: t('nav.calendar'), peers: t('nav.peers'), connect: t('nav.connect'),
  market: t('nav.marketplace'), anchor: t('nav.anchor'), export: t('nav.export'), settings: t('nav.settings'),
}))
const crumbs = computed(() => ['SYS', navLabels.value[route.value] || t('nav.home')])

onMounted(() => {
  if (!import.meta.client) return
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); cmdkOpen.value = !cmdkOpen.value }
  })
})
</script>

<style scoped>
/* ── Landing card uses gate CSS from sys-v2.css ─────────────────────── */
.gate h1 em { font-style: italic; color: var(--accent-bright); }

/* ── Inline page layouts ─────────────────────────────────────────────── */
.page-hero { display: flex; align-items: baseline; gap: 16px; padding: 20px 0 24px; border-bottom: 1px solid var(--line); margin-bottom: 24px; flex-wrap: wrap; }
.page-hero h2 em { font-style: italic; color: var(--accent); }
.page-sub { font-family: var(--mono); font-size: 12px; color: var(--fg-2); letter-spacing: 0.08em; }
.empty-hint { color: var(--fg-2); font-size: 14px; padding: 40px 0; text-align: center; }

/* ── Maturity view ────────────────────────────────────────────────────── */
.mat-view { display: flex; align-items: center; gap: 40px; padding: 24px 0; flex-wrap: wrap; }
.mat-ring-wrap { position: relative; display: grid; place-items: center; }
.mat-ring-inner { position: absolute; text-align: center; }
.mat-pct { font-family: var(--serif); font-size: 32px; color: var(--fg); }
.mat-unit { font-family: var(--mono); font-size: 14px; color: var(--fg-2); margin-left: 2px; }
.mat-meta { flex: 1; min-width: 200px; }
.mat-level-label { font-family: var(--serif); font-size: 22px; color: var(--fg); margin-bottom: 20px; }
.mat-bar-wrap { margin-bottom: 16px; }
.mat-bar-track { height: 6px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
.mat-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent-deep), var(--accent-bright)); transition: width .6s var(--ease); }
.mat-ticks { display: flex; justify-content: space-between; margin-top: 8px; font-family: var(--mono); font-size: 11px; color: var(--fg-4); }
.mat-soul-id { font-family: var(--mono); font-size: 12px; color: var(--fg-3); }

/* ── Login sheet (reused from old design, simplified) ─────────────────── */
.login-sheet {
  position: relative; z-index: 10;
  background: var(--surface); border-top: 1px solid var(--line-2);
  border-radius: 20px 20px 0 0;
  padding: 20px clamp(16px,5vw,28px) 40px;
  max-height: 92dvh; overflow-y: auto;
  width: 100%; max-width: 520px; box-sizing: border-box;
}
.login-handle { display: flex; align-items: center; margin-bottom: 20px; }
.login-bar { flex: 1; display: flex; justify-content: center; }
.login-bar::after { content: ""; display: block; width: 40px; height: 2px; background: var(--line-2); border-radius: 2px; }
.login-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); background: transparent; color: var(--fg-3); cursor: pointer; font-size: 12px; border-radius: 8px; }
.login-kicker { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
.login-title { font-family: var(--serif); font-weight: 400; font-size: clamp(28px,4vw,36px); letter-spacing: -0.025em; margin: 0 0 10px; color: var(--fg); line-height: 1; }
.login-title em { font-style: italic; color: var(--accent); }
.login-sub { font-size: 15px; color: var(--fg); line-height: 1.5; margin: 0 0 20px; }
.login-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; }
.login-divider::before, .login-divider::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.login-divider span { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-4); }
.login-alt { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 16px 18px; background: transparent; border: 1px solid var(--line); color: var(--fg); cursor: pointer; text-align: left; font: inherit; transition: all 0.15s; box-sizing: border-box; border-radius: var(--r-sm); }
.login-alt:hover { border-color: var(--accent); background: var(--accent-dim); }
.login-alt span { font-family: var(--serif); font-size: clamp(15px,3.5vw,18px); letter-spacing: -0.01em; min-width: 0; }
.login-alt-sub { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-3); flex: 1; display: none; }
@media (min-width: 400px) { .login-alt-sub { display: block; } }
.login-arr { font-family: var(--serif); font-size: 20px; color: var(--fg-3); }
.login-sheet-enter-active, .login-sheet-leave-active { transition: transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease; }
.login-sheet-enter-from, .login-sheet-leave-to { transform: translateY(100%); opacity: 0; }
.login-recovery { margin-top: 14px; padding: 14px 16px; border: 1px solid rgba(223,144,144,0.35); background: rgba(223,144,144,0.06); border-radius: var(--r-sm); }
.login-recovery-msg { font-size: 14px; color: var(--fg-2); line-height: 1.5; margin: 0 0 12px; }
.login-recovery-btn { width: 100%; padding: 11px 16px; background: transparent; border: 1px solid rgba(223,144,144,0.5); color: var(--c-danger); font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; border-radius: var(--r-sm); transition: all 0.15s; }
.login-recovery-btn:hover:not(:disabled) { background: rgba(223,144,144,0.12); }
.login-recovery-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Generic modals ───────────────────────────────────────────────────── */
.sys-modal-wrap {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: var(--scrim); backdrop-filter: blur(10px);
}
.sys-modal-panel {
  position: relative; z-index: 10;
  background: var(--surface); border: 1px solid var(--line-2);
  border-radius: var(--r);
  width: 100%; max-width: 520px; max-height: 92dvh;
  display: flex; flex-direction: column; overflow: hidden;
}
.sys-modal-panel--wide { max-width: 760px; }
.sys-modal-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 8px 16px; min-height: 52px; border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}
.sys-modal-kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 3px; }
.sys-modal-title { font-family: var(--serif); font-size: 20px; letter-spacing: -0.02em; margin: 0; color: var(--fg); }
.sys-modal-title em { font-style: italic; color: var(--accent); }
.sys-modal-close { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); background: transparent; color: var(--fg-3); cursor: pointer; font-size: 22px; border-radius: var(--r-sm); }
.sys-modal-close:hover { color: var(--fg); }
.sys-modal-body { flex: 1; overflow-y: auto; padding: 24px 28px; }
.sys-modal-enter-active, .sys-modal-leave-active { transition: opacity 0.2s ease; }
.sys-modal-enter-active .sys-modal-panel, .sys-modal-leave-active .sys-modal-panel { transition: transform 0.25s ease, opacity 0.2s; }
.sys-modal-enter-from, .sys-modal-leave-to { opacity: 0; }
.sys-modal-enter-from .sys-modal-panel, .sys-modal-leave-to .sys-modal-panel { transform: translateY(16px) scale(0.98); opacity: 0; }
@media (max-width: 639px) { .sys-modal-wrap { padding: 12px; } .sys-modal-body { padding: 20px 16px; } }

/* ── PWA Banner ───────────────────────────────────────────────────────── */
.pwa-banner { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 9000; width: min(calc(100vw - 32px), 500px); }
.pwa-banner-inner { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--accent-glow); border-radius: var(--r); backdrop-filter: blur(16px); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
.pwa-banner-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pwa-banner-title { font-size: 13px; font-weight: 500; color: var(--fg); }
.pwa-banner-sub { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }
.pwa-banner-btn { flex-shrink: 0; padding: 8px 16px; background: var(--accent); color: var(--on-accent); border: none; border-radius: var(--r-sm); font-family: var(--mono); font-size: 12px; cursor: pointer; }
.pwa-banner-btn:hover { background: var(--accent-bright); }
.pwa-banner-dismiss { flex-shrink: 0; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--fg-3); font-size: 18px; cursor: pointer; }
.pwa-banner-dismiss:hover { color: var(--fg); }
.pwa-slide-enter-active { transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); }
.pwa-slide-leave-active { transition: all 0.2s ease; }
.pwa-slide-enter-from { opacity: 0; transform: translateX(-50%) translateY(20px); }
.pwa-slide-leave-to   { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>
