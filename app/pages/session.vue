<template>
  <ClientOnly>
    <div v-if="!certValidating" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="chat" :soul-meta="soulMeta ? { ...soulMeta, maturity } : null" :collapsed="sidebarCollapsed" @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Seele', 'Session']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="() => {}">
          <!-- Filter toggle -->
          <button class="icon-btn sess-filter-toggle" :class="{ on: filterOpen, 'has-filter': filter !== 'all' }" @click="filterOpen = !filterOpen" aria-label="Filter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="17" height="17">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M7 12h10M11 18h2"/>
            </svg>
            <span v-if="filter !== 'all'" class="sess-filter-dot" />
          </button>
          <!-- Filter pills — shown when toggle is open -->
          <Transition name="seg-reveal">
            <div v-show="filterOpen" class="sess-seg seg">
              <button :class="{ on: filter === 'all' }"    @click="filter = 'all'">Alle</button>
              <button :class="{ on: filter === 'soul' }"   @click="filter = 'soul'">SoulKI</button>
              <button :class="{ on: filter === 'peers' }"  @click="filter = 'peers'">Peers</button>
              <button :class="{ on: filter === 'agents' }" @click="filter = 'agents'">Agent</button>
            </div>
          </Transition>
          <button class="icon-btn" :class="{ on: soulPanelOpen }" @click="soulPanelOpen = !soulPanelOpen" aria-label="Soul Panel">
            <SysIcon name="soul" style="width:18px;height:18px" />
          </button>
          <span v-if="isGrowingQuietly" class="soul-growing" title="Seele waechst">&#x25CC;</span>
          <Transition name="fade-quick"><span v-if="soulJustGrew" class="soul-grew">&#x2726;</span></Transition>
        </SysTopbar>

        <div class="sess-banners">
          <Transition name="slide-up">
            <div v-if="enrichStatus" class="banner" :class="`b-${enrichStatus.type}`">
              <span>{{ enrichStatus.message }}</span>
              <button v-if="enrichStatus.type !== 'loading'" @click="enrichStatus = null" class="banner-close">&#x2715;</button>
            </div>
          </Transition>
          <Transition name="slide-up">
            <div v-if="vaultStatus" class="banner b-success">
              <span>Vault neu geladen &middot; Soul aktiv</span>
            </div>
          </Transition>
          <Transition name="slide-up">
            <div v-if="serverVaultEncrypted" class="banner b-warn">
              <span>Soul am Server verschluesselt &middot; Vault mit Schlusselwoertern entsperren</span>
              <button @click="serverVaultEncrypted = false" class="banner-close">&#x2715;</button>
            </div>
          </Transition>
        </div>

        <div :class="['chat-shell', { 'with-panel': soulPanelOpen }]">
          <div class="chat-col">
            <ChatInterface
              ref="chatRef"
              :soul-content="soulContent"
              :soul-cert="soulToken"
              role="soul"
              :growth-locked="isGrowingQuietly"
              v-model:filter="filter"
              @cert-error="handleCertError"
              @session-end="forceSessionEnd"
            />
          </div>
          <aside v-if="soulPanelOpen" class="soulpanel">
            <div class="sp-head">
              <div>
                <div class="eyebrow">Lebendige Datei</div>
                <h3>sys<em>.</em>md</h3>
              </div>
              <button class="icon-btn sp-close" @click="soulPanelOpen = false" aria-label="Panel schliessen">
                <SysIcon name="close" style="width:16px;height:16px" />
              </button>
            </div>
            <div class="sp-grow">
              <span class="live-dot" />
              {{ isGrowingQuietly ? 'Seele waechst...' : 'Lebendige Seele aktiv' }}
            </div>
            <div class="sp-scroll"><SoulViewer /></div>
          </aside>
        </div>
      </div>
    </div>

    <div v-else class="sys-loading">
      <span>SYS &middot; cert validating</span>
    </div>

    <Modal :open="certErrorVisible" title="Zertifikat ungueltig" confirm-text="Seite neu laden" :hide-cancel="true" @confirm="reloadPage">
      Das Soul-Zertifikat konnte nicht validiert werden. Die Seite wird neu geladen.
    </Modal>
    <SoulAnchorModal :is-open="anchorModalOpen" @close="anchorModalOpen = false" />
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" @master-rotated="handleMasterRotated" />
    <FirstSetupModal :token="firstSetupToken" @dismiss="firstSetupToken = null; settingsOpen = true" @download-soul="onSetupDownload" @import-soul="onSetupImport" />
    <ConfirmModal />
    <EmergencyModal v-if="emergencyOpen" :soul-cert="soulToken" @close="emergencyOpen = false" @status-change="handleEmergencyChange" />
  </ClientOnly>
</template>

<script setup>
/**
 * session.vue — editorial redesign
 * All wiring to composables preserved (useSoul, useSession, useVault, useChainAnchor, useCamera).
 * Feature logic unchanged — only layout, typography, color replaced.
 */
definePageMeta({ layout: false })
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useSession } from '~/composables/useSession.js'
import { useVault } from '~/composables/useVault.js'
import { useVaultSession } from '~/composables/useVaultSession.js'
import { useChainAnchor } from '~/composables/useChainAnchor.js'
import { useCamera } from '~/composables/useCamera.js'
import { validateSoul } from '#shared/utils/soulParser.js'
import ChatInterface from '~/components/ChatInterface.vue'
import EmergencyModal from '~/components/EmergencyModal.vue'
import Modal from '~/components/ui/Modal.vue'
import SoulAnchorModal from '~/components/SoulAnchorModal.vue'
import SoulViewer from '~/components/SoulViewer.vue'
import ConfirmModal from '~/components/ConfirmModal.vue'
import SettingsModal from '~/components/SettingsModal.vue'
import FirstSetupModal from '~/components/FirstSetupModal.vue'
import { computeMaturity } from '#shared/utils/soulMaturity.js'

const router = useRouter()
const { soulContent, soulToken, hasSoul, soulMeta, load, save, updateVaultInSoul, importFromText, importAndSetup, exportAsBlob, clear, refreshCert, fetchFromServer, syncStatus, serverContent, acceptServerVersion, serverVaultEncrypted, firstSetupToken, enrichFromSession, pushToServer } = useSoul()
const { messages, clearSession, addMessage, toApiMessages } = useSession()
const { appendGrowthEntry } = useChainAnchor()
const { requestPermissions: requestCameraPermissions } = useCamera()
const { isSupported: vaultSupported, isConnected: vaultConnected, contextFiles, fileManifest, connectVault, restoreVault, writeSoulMd, loadProfileLocal, scanVault } = useVault()
const { vaultKey } = useVaultSession()

const certValidating = ref(true)
const vaultScanning = ref(false)
const emergencyOpen   = ref(false)
const emergencyLevel  = ref(0)
const emergencyActive = computed(() => emergencyLevel.value > 0)

function handleEmergencyChange({ active, level }) {
  emergencyLevel.value = active ? level : 0
}
const vaultStatus = ref(null)
const mobileView = ref('chat')
const anchorModalOpen = ref(false)
const settingsOpen    = ref(false)
const isEnriching = ref(false)
const enrichStatus = ref(null)
const certErrorVisible = ref(false)
const chatRef = ref(null)
const isMultiHoster = ref(false)

// ── Soul ID copy
const soulIdCopied = ref(false)
async function copySoulId() {
  if (!soulMeta.value?.id) return
  await navigator.clipboard.writeText(soulMeta.value.id).catch(() => {})
  soulIdCopied.value = true
  setTimeout(() => { soulIdCopied.value = false }, 2000)
}

// ── Background soul growth ──────────────────────────────────────────
// The synthesis KI observes conversations and silently grows the soul.
// Fires every 20 min when there's meaningful new content.
let _soulGrowthTimer    = null
let _lastGrowthAiCount  = 0
const burgerOpen        = ref(false)
const isGrowingQuietly  = ref(false)
const soulJustGrew      = ref(false)   // brief flash indicator

function buildLiveSphereContext() {
  const social = chatRef.value?.getSocialMessages() ?? []
  if (!social.length) return ''
  const lines = social.slice(-8).map(m => {
    const from = m.from === 'me' ? 'Ich' : m.from.slice(0, 8)
    const to   = m.to === 'peer' ? '→ Peer' : m.to === 'agent' ? '→ Agent' : '→ Alle'
    return `[${(m.ts || '').slice(0, 10)}] ${from} ${to}: ${(m.content || '').replace(/^\[KI\]\s*/, '').slice(0, 200)}`
  }).join('\n')
  return `## Social Sphere\n${lines}`
}

async function runBackgroundSoulGrowth() {
  if (isGrowingQuietly.value) return
  if (typeof window !== 'undefined' && localStorage.getItem('sys_archivar_enabled') === 'false') return
  const aiMsgs     = toApiMessages(12)
  const sphereCtx  = buildLiveSphereContext()
  const aiUserMsgs = aiMsgs.filter(m => m.role === 'user').length
  const socialCount = (chatRef.value?.getSocialMessages() ?? []).length
  if (aiUserMsgs < 2 && socialCount < 3) return
  if (aiUserMsgs <= _lastGrowthAiCount && socialCount === 0) return

  isGrowingQuietly.value = true
  try {
    const result = await enrichFromSession(aiMsgs, sphereCtx)
    if (result?.changed) {
      _lastGrowthAiCount = aiUserMsgs
      await appendGrowthEntry().catch(() => {})
      await pushToServer().catch(() => {})
      if (vaultConnected.value) {
        await writeSoulMd(soulContent.value, 'sys').catch(() => {})
      }
      soulJustGrew.value = true
      setTimeout(() => { soulJustGrew.value = false }, 3000)
    }
  } catch { /* silent */ } finally {
    isGrowingQuietly.value = false
  }
}

// Manueller Trigger via @session-end — bypassed Mindest-Checks
async function forceSessionEnd() {
  if (isGrowingQuietly.value) return
  const aiMsgs    = toApiMessages(12)
  const sphereCtx = buildLiveSphereContext()
  isGrowingQuietly.value = true
  try {
    const result = await enrichFromSession(aiMsgs, sphereCtx)
    if (result?.changed) {
      _lastGrowthAiCount = aiMsgs.filter(m => m.role === 'user').length
      await appendGrowthEntry().catch(() => {})
      await pushToServer().catch(() => {})
      if (vaultConnected.value) await writeSoulMd(soulContent.value, 'sys').catch(() => {})
      soulJustGrew.value = true
      setTimeout(() => { soulJustGrew.value = false }, 3000)
    }
    chatRef.value?.addAssistantMessage?.('Session eingetragen ✓')
  } catch { /* silent */ } finally {
    isGrowingQuietly.value = false
  }
}

// Also trigger on every 4th new user message — captures short sessions
watch(
  () => messages.value.filter(m => m.role === 'user').length,
  (n) => { if (n > 0 && n % 4 === 0) runBackgroundSoulGrowth() }
)

// ── Derived display values
const sessionNo = computed(() => String(soulMeta.value?.chainCount ?? 0).padStart(3, '0'))
const sessionStart = computed(() => new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }))
const messageCount = computed(() => messages.value?.length ?? 0)
const tokenCount = computed(() => {
  const chars = messages.value?.reduce((n, m) => n + (m.content?.length || 0), 0) ?? 0
  const k = chars / 4 / 1000
  return k >= 1 ? `${k.toFixed(1)}k` : `${Math.round(k * 1000)}`
})

// Rolling topic index — feed from real session topics when available
const indexStrip = computed(() => {
  const fromSession = messages.value?.filter(m => m.role === 'user').slice(-4).map(m => (m.content || '').slice(0, 40))
  return fromSession?.length
    ? fromSession
    : ['Designentscheidungen', 'Typografie-Hierarchie', 'Klarheit vs. Spektakel', 'Editorial als UI']
})

function lockGate() {
  clear()
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/gate'
}

// ── Lifecycle (preserves original init order)
onMounted(async () => {
  clearSession()
  load()
  if (!hasSoul.value) { certValidating.value = false; router.replace('/'); return }
  fetch('/api/node-status').then(r => r.json()).then(d => { isMultiHoster.value = !!d.multi_hoster }).catch(() => {})
  fetch('/api/emergency/status', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    .then(r => r.json()).then(d => { if (d.active) emergencyLevel.value = d.level || 1 }).catch(() => {})

  // Initial AI greeting (removes need for empty-state placeholder)
  addMessage('assistant', 'Hallo, was wollen wir heute tun?')

  fetchFromServer(true).then(() => {
    // Nur auto-akzeptieren wenn der Server NEUER ist (last_session-Datum vergleichen).
    // Ist der Server alter oder gleich, bleibt der 'differs'-Banner sichtbar damit
    // der Nutzer selbst entscheiden kann — verhindert den Verlust lokaler Anderungen.
    if (syncStatus.value === 'differs' && serverContent.value) {
      const localDate  = soulContent.value.match(/last_session:\s*(.+)/)?.[1]?.trim() ?? '';
      const serverDate = serverContent.value.match(/last_session:\s*(.+)/)?.[1]?.trim() ?? '';
      if (serverDate > localDate) acceptServerVersion();
    }
  }).catch(() => {})
  requestCameraPermissions().catch(() => {})

  if (soulMeta.value?.id) {
    const restored = await restoreVault(soulMeta.value.id)
    if (restored) { syncVaultSoul(); updateVaultInSoul(fileManifest.value) }
    else loadProfileLocal(soulMeta.value?.id)
  }
  await refreshCert()
  certValidating.value = false

  fetch('/api/validate', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    .then(res => { if (res.status === 401) { clear(); router.replace('/') } })
    .catch(() => {})

  // Amortization-Restore bei VPS-Migration: wenn Server keine Config hat aber Browser schon
  try {
    const cached = localStorage.getItem('sys_amort_config')
    if (cached && soulToken.value) {
      fetch('/api/soul/amortization', { headers: { Authorization: `Bearer ${soulToken.value}` } })
        .then(r => r.json()).then(d => {
          const serverAmort = d.amortization || {}
          // Nur restore wenn Server kein Wallet eingetragen hat
          if (!serverAmort.wallet) {
            const local = JSON.parse(cached)
            if (local.wallet) {
              fetch('/api/soul/amortization', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(local),
              }).catch(() => {})
            }
          }
        }).catch(() => {})
    }
  } catch {}

  if (!soulContent.value) router.replace('/')

  // Background soul growth — first at 3 min, then every 8 min
  setTimeout(() => { runBackgroundSoulGrowth() }, 3 * 60 * 1000)
  _soulGrowthTimer = setInterval(() => { runBackgroundSoulGrowth() }, 8 * 60 * 1000)
})

onUnmounted(() => { clearInterval(_soulGrowthTimer) })

function syncVaultSoul() {
  const f = contextFiles.value.find(x => x.name.toLowerCase().endsWith('.md') && validateSoul(x.text).valid)
  if (!f) return
  const vDate = f.text.match(/last_session:\s*(.+)/)?.[1]?.trim() ?? ''
  const lDate = soulMeta.value?.lastSession ?? ''
  const fenceCount = (f.text.match(/^---$/gm) || []).length
  if (fenceCount !== 2) return
  if (vDate > lDate) importFromText(f.text)
}

async function handleVaultConnect() {
  if (!soulMeta.value?.id) return
  if (vaultConnected.value) {
    vaultScanning.value = true
    await scanVault()
    const f = contextFiles.value.find(x => x.name.toLowerCase().endsWith('.md') && validateSoul(x.text).valid)
    if (f) importFromText(f.text)
    updateVaultInSoul(fileManifest.value)
    await refreshCert()
    vaultScanning.value = false
    vaultStatus.value = { ok: true }
    setTimeout(() => { vaultStatus.value = null }, 3000)
    return
  }
  const ok = await connectVault(soulMeta.value.id)
  if (ok) { syncVaultSoul(); updateVaultInSoul(fileManifest.value); await refreshCert() }
}


async function handleMasterRotated() {
  await refreshCert()
  settingsOpen.value = false
}

function handleCertError() { certErrorVisible.value = true }
function reloadPage() { location.reload() }

async function onSetupDownload() {
  await exportAsBlob()
  firstSetupToken.value = null
  settingsOpen.value = true
}

async function onSetupImport(markdown) {
  const lockedId = soulMeta.value?.id
  if (lockedId) {
    try {
      await $fetch('/api/soul/reset-registration', {
        method: 'POST',
        body: { soul_id: lockedId, clear_lock: true },
      })
    } catch { /* ignore — may already be clean */ }
  }
  const tokenBefore = firstSetupToken.value
  const result = await importAndSetup(markdown)
  if (!result.ok) {
    firstSetupToken.value = null
    settingsOpen.value = true
    return
  }
  await exportAsBlob()
  const newToken = firstSetupToken.value
  if (newToken && newToken !== '__single__' && newToken !== tokenBefore) {
    // Neuer Admin-Token → Modal zeigt ihn; Einstellungen oeffnen via dismiss-Handler
    return
  }
  firstSetupToken.value = null
  settingsOpen.value = true
}

// ── Shell nav state (UI only, no business logic)
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const soulPanelOpen    = ref(false)
const filterOpen       = ref(false)
const filter           = ref('all')
const maturity         = computed(() => computeMaturity(soulContent.value).score)

function onNav(id) {
  if (id === 'chat')     return
  if (id === 'soul')     { router.push('/soul');    return }
  if (id === 'chronik')  { router.push('/chronik'); return }
  if (id === 'settings') { settingsOpen.value = true; return }
  if (id === 'anchor')   { anchorModalOpen.value = true; return }
  if (id === 'maturity') { router.push('/reife'); return }
  if (id === 'calendar') { router.push('/kalender'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
/* ── Loading ── */
.sys-loading {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
}

/* ── Filter toggle button ── */
.sess-filter-toggle { position: relative; color: var(--fg-2); }
.sess-filter-toggle.on { background: var(--accent-dim) !important; color: var(--accent-bright) !important; }
.sess-filter-toggle.has-filter { color: var(--accent); }
.sess-filter-toggle.on.has-filter { color: var(--accent-bright) !important; }
.sess-filter-dot {
  position: absolute; top: 5px; right: 5px;
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--accent);
}

/* ── Filter seg — inline on desktop, wraps to full row on mobile ── */
@media (max-width: 900px) {
  .sess-seg {
    order: 10;
    width: 100%;
    padding: 6px 0 8px;
    border-top: 1px solid var(--line);
    gap: 4px;
  }
  .sess-seg button { flex: 1; justify-content: center; padding: 0 4px; font-size: 11.5px; }
}

/* ── Transition ── */
.seg-reveal-enter-active, .seg-reveal-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.seg-reveal-enter-from, .seg-reveal-leave-to { opacity: 0; transform: scale(0.95); }

.sess-banners { display: flex; flex-direction: column; flex-shrink: 0; }
.banner {
  padding: 10px clamp(16px,3vw,32px); border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--fg-3); display: flex; align-items: center; gap: 14px;
}
.banner.b-loading { color: var(--fg-3); }
.banner.b-success { color: var(--accent); }
.banner.b-error   { color: #e06c75; border-color: rgba(224,108,117,0.25); }
.banner.b-warn    { color: var(--accent-bright); border-color: rgba(138,208,179,0.25); }
.banner-close { margin-left: auto; background: transparent; border: 0; color: inherit; opacity: 0.5; cursor: pointer; font-size: 12px; }
.banner-close:hover { opacity: 1; }

/* ── Soul growth indicators ── */
.soul-growing { font-size: 13px; color: var(--accent); opacity: 0.6; animation: soul-pulse 1.4s ease-in-out infinite; }
.soul-grew    { font-size: 12px; color: var(--accent); }
@keyframes soul-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
.fade-quick-enter-active, .fade-quick-leave-active { transition: opacity 0.5s; }
.fade-quick-enter-from, .fade-quick-leave-to { opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(8px); }

/* ── Child component overrides ── */
:deep(h2), :deep(h3), :deep(h4) {
  font-family: var(--serif) !important; letter-spacing: -0.02em; font-weight: 400; color: var(--fg);
}
:deep(.rounded-xl), :deep(.rounded-2xl), :deep(.rounded-lg) { border-radius: 0 !important; }
:deep(.rounded-full) { border-radius: 2px !important; }
:deep(input:not([type="file"])), :deep(textarea), :deep(select) {
  border-radius: 0 !important; background: rgba(255,255,255,0.03) !important; color: var(--fg) !important;
}
:deep(input:focus), :deep(textarea:focus) {
  outline: none !important; border-color: var(--accent) !important; box-shadow: 0 0 0 1px var(--accent) !important;
}
.soulpanel :deep(h3) {
  font-family: var(--serif) !important; font-size: 17px !important; font-weight: 400 !important;
  letter-spacing: -0.015em !important; color: var(--fg) !important;
  padding-top: 16px; margin-top: 16px !important; margin-bottom: 6px !important; border-top: 1px solid var(--line);
}
.soulpanel :deep(p) { font-size: 13px; line-height: 1.6; color: var(--fg-2); }
</style>
