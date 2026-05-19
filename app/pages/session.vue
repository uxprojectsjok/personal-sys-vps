<template>
  <ClientOnly>
    <!-- ═══════════════════════════════════════════════════════════════
         SYS · session.vue — Editorial working surface
         Two-column: soul sidebar · chat reading column
         ═══════════════════════════════════════════════════════════════ -->
    <div class="sys-session" v-if="!certValidating">

      <!-- HEADER -->
      <header class="sess-head">
        <div class="head-left">
          <button class="back" @click="$router.push('/')" aria-label="Zurück">
            <span class="arr">←</span> Zurück
          </button>
          <div class="pill">
            <span class="live"></span>
            #{{ soulMeta?.name || '------' }} · aktiv
            <template v-if="soulMeta?.id">
              <span class="pill-sep">·</span>
              <button class="soul-id-btn" @click="copySoulId" :title="soulMeta.id">
                {{ soulIdCopied ? '✓' : soulMeta.id.slice(0, 8) + '…' }}
              </button>
            </template>
            <span v-if="isGrowingQuietly" class="soul-growing" title="Seele wächst…">◌</span>
            <Transition name="fade-quick"><span v-if="soulJustGrew" class="soul-grew">✦</span></Transition>
          </div>
        </div>
        <!-- Desktop tools -->
        <div class="tools tools--desktop">
          <button class="tool" @click="liveProfileVisible = !liveProfileVisible">Profil</button>
          <button class="tool" :disabled="!vaultSupported" @click="handleVaultConnect">
            {{ vaultScanning ? 'Scan…' : vaultConnected ? 'Vault ●' : 'Vault' }}
          </button>
          <button class="tool" v-if="hasSoul" @click="handleCheckServer" :disabled="serverChecking">
            {{ serverChecking ? '…' : 'Abgleich' }}
          </button>
          <button class="tool tool--logout" v-if="isMultiHoster" @click="lockGate">Ausloggen</button>
        </div>
        <!-- Mobile burger -->
        <button class="burger-btn" @click="burgerOpen = !burgerOpen" :aria-expanded="burgerOpen" aria-label="Menü">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path v-if="!burgerOpen" stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <!-- Burger dropdown — absolute positioned, doesn't affect grid layout -->
        <Transition name="slide-up">
          <div v-if="burgerOpen" class="burger-menu">
            <button class="tool" @click="liveProfileVisible = !liveProfileVisible; burgerOpen = false">Profil</button>
            <button class="tool" :disabled="!vaultSupported" @click="handleVaultConnect; burgerOpen = false">
              {{ vaultScanning ? 'Scan…' : vaultConnected ? 'Vault ●' : 'Vault' }}
            </button>
            <button class="tool" v-if="hasSoul" @click="handleCheckServer; burgerOpen = false" :disabled="serverChecking">
              {{ serverChecking ? '…' : 'Abgleich' }}
            </button>
            <button class="tool tool--logout" v-if="isMultiHoster" @click="lockGate">Ausloggen</button>
          </div>
        </Transition>
      </header>

      <!-- SUB-HEADER: status banners — wrapper collapses to 0 when all are hidden -->
      <div class="sess-sub-head">
        <Transition name="slide-up">
          <div v-if="enrichStatus" class="banner" :class="`b-${enrichStatus.type}`">
            <span>{{ enrichStatus.message }}</span>
            <button v-if="enrichStatus.type !== 'loading'" @click="enrichStatus = null" class="close">✕</button>
          </div>
        </Transition>
        <Transition name="slide-up">
          <div v-if="vaultStatus" class="banner">
            <span>Vault neu geladen · Soul aktiv</span>
          </div>
        </Transition>
        <Transition name="slide-up">
          <div v-if="serverVaultEncrypted" class="banner b-warn">
            <span>Soul am Server verschlüsselt · Vault mit Schlüsselwörtern entsperren</span>
            <button @click="serverVaultEncrypted = false" class="close">✕</button>
          </div>
        </Transition>
      </div>

      <!-- BODY -->
      <main class="sess-body">

        <!-- Soul sidebar (desktop) / full panel (mobile when active) -->
        <aside
          class="col-soul"
          :class="{ 'mobile-hidden': mobileView !== 'soul' }"
        >
          <div>
            <div class="cap">Lebendige Datei</div>
            <h3 class="ttl">sys<em>.</em>md</h3>
          </div>
          <SoulViewer />
        </aside>

        <!-- Chat column -->
        <div class="col-chat" :class="{ 'mobile-hidden': mobileView !== 'chat' }">

          <!-- Chat stream -->
          <div class="chat-wrap">
            <ChatInterface
              ref="chatRef"
              :soul-content="soulContent"
              :soul-cert="soulToken"
              role="soul"
              :growth-locked="isGrowingQuietly"
              @cert-error="handleCertError"
            />
          </div>

        </div>
      </main>


      <!-- Mobile tab bar -->
      <nav class="mobile-tabs">
        <button :class="{ active: mobileView === 'chat' }" @click="mobileView = 'chat'">Chat</button>
        <button :class="{ active: mobileView === 'soul' }" @click="mobileView = 'soul'">Seele</button>
      </nav>
    </div>

    <!-- Loading state -->
    <div v-else class="sys-loading">
      <span>SYS · cert validating</span>
    </div>

    <!-- Modals / profiles -->
    <Transition name="slide-up">
      <LiveProfile
        v-if="liveProfileVisible"
        :soul-meta="soulMeta"
        @voice-saved="handleVoiceSaved"
        @motion-saved="handleMotionSaved"
        @close="liveProfileVisible = false"
      />
    </Transition>

    <Modal
      :open="certErrorVisible"
      title="Zertifikat ungültig"
      confirm-text="Seite neu laden"
      :hide-cancel="true"
      @confirm="reloadPage"
    >
      Das Soul-Zertifikat konnte nicht validiert werden. Die Seite wird neu geladen.
    </Modal>

    <SoulAnchorModal :is-open="anchorModalOpen" @close="anchorModalOpen = false" />
    <SettingsModal :open="settingsOpen" @close="settingsOpen = false" @master-rotated="handleMasterRotated" />
    <FirstSetupModal :token="firstSetupToken" @dismiss="firstSetupToken = null; settingsOpen = true" />
    <ConfirmModal />
  </ClientOnly>
</template>

<script setup>
/**
 * session.vue — editorial redesign
 * All wiring to composables preserved (useSoul, useSession, useVault, useChainAnchor, useCamera).
 * Feature logic unchanged — only layout, typography, color replaced.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useSession } from '~/composables/useSession.js'
import { useVault } from '~/composables/useVault.js'
import { useVaultSession } from '~/composables/useVaultSession.js'
import { useChainAnchor } from '~/composables/useChainAnchor.js'
import { useCamera } from '~/composables/useCamera.js'
import { validateSoul, updateFrontmatterField } from '#shared/utils/soulParser.js'
import ChatInterface from '~/components/ChatInterface.vue'
import LiveProfile from '~/components/LiveProfile.vue'
import Modal from '~/components/ui/Modal.vue'
import SoulAnchorModal from '~/components/SoulAnchorModal.vue'
import SoulViewer from '~/components/SoulViewer.vue'
import ConfirmModal from '~/components/ConfirmModal.vue'
import SettingsModal from '~/components/SettingsModal.vue'
import FirstSetupModal from '~/components/FirstSetupModal.vue'

const router = useRouter()
const { soulContent, soulToken, hasSoul, soulMeta, load, save, updateVaultInSoul, importFromText, clear, refreshCert, fetchFromServer, syncStatus, serverContent, acceptServerVersion, serverVaultEncrypted, firstSetupToken, enrichFromSession, pushToServer } = useSoul()
const { messages, clearSession, addMessage, toApiMessages } = useSession()
const { appendGrowthEntry } = useChainAnchor()
const { requestPermissions: requestCameraPermissions } = useCamera()
const { isSupported: vaultSupported, isConnected: vaultConnected, contextFiles, fileManifest, connectVault, restoreVault, writeSoulMd, loadProfileLocal, scanVault } = useVault()
const { vaultKey } = useVaultSession()

const certValidating = ref(true)
const vaultScanning = ref(false)
const vaultStatus = ref(null)
const liveProfileVisible = ref(false)
const burgerOpen         = ref(false)
const serverChecking = ref(false)
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

  // Initial AI greeting (removes need for empty-state placeholder)
  addMessage('assistant', 'Hallo, was wollen wir heute tun?')

  fetchFromServer(true).then(() => {
    // Nur auto-akzeptieren wenn der Server NEUER ist (last_session-Datum vergleichen).
    // Ist der Server älter oder gleich, bleibt der 'differs'-Banner sichtbar damit
    // der Nutzer selbst entscheiden kann — verhindert den Verlust lokaler Änderungen.
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

async function handleCheckServer() {
  if (serverChecking.value) return
  serverChecking.value = true
  const key = (vaultKey.value && vaultKey.value !== '__encrypted__') ? vaultKey.value : ''
  await fetchFromServer(false, key).catch(() => {})
  serverChecking.value = false
}

async function handleMasterRotated() {
  await refreshCert()
  settingsOpen.value = false
}

async function handleVoiceSaved() {
  if (!soulContent.value) return
  soulContent.value = updateFrontmatterField(soulContent.value, 'voice_profile', 'voice_samples/voice_profile.json')
  save()
  if (vaultConnected.value) await writeSoulMd(soulContent.value, 'sys')
}

async function handleMotionSaved() {
  if (!soulContent.value) return
  soulContent.value = updateFrontmatterField(soulContent.value, 'motion_profile', 'motion_samples/motion_profile.json')
  save()
  if (vaultConnected.value) await writeSoulMd(soulContent.value, 'sys')
}

function handleCertError() { certErrorVisible.value = true }
function reloadPage() { location.reload() }
</script>

<style scoped>
.sys-session {
  --ink:#08070c; --paper:#12101a; --paper-2:#1a1726; --paper-3:#0d0b14;
  --rule:rgba(226,220,240,0.10); --rule-2:rgba(226,220,240,0.20);
  --fg:#ece7f5; --fg-2:rgba(236,231,245,0.88); --fg-3:rgba(236,231,245,0.70); --fg-4:rgba(236,231,245,0.55);
  --accent:#8b5cf6; --accent-2:rgba(139,92,246,0.14); --accent-bright:#a78bfa; --on-accent:#0a0810;
  --serif:'Noto Serif', Georgia, serif;
  --sans:'Inter', system-ui, -apple-system, sans-serif;
  --mono:'JetBrains Mono', ui-monospace, monospace;
  /* 4 rows: header · sub-head (banners, collapses to 0 when empty) · body · tabs */
  display: grid; grid-template-rows: auto auto 1fr auto;
  height: 100vh; height: 100dvh;
  overflow: hidden;
  background: var(--paper); color: var(--fg); font-family: var(--sans);
}
.arr { font-family: var(--serif); }
.live { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); display: inline-block; }

/* Head */
.sess-head {
  display: flex; align-items: center;
  padding: 10px clamp(14px,3vw,24px);
  border-bottom: 1px solid var(--rule);
  background: var(--paper-3);
  gap: 12px;
  position: relative; /* anchor for burger-menu absolute positioning */
}
.head-left {
  display: flex; align-items: center; gap: 12px;
  flex: 1; min-width: 0;
}
/* Burger button — mobile only */
.burger-btn {
  display: none;
  align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border: 0; background: transparent;
  color: var(--fg-3); cursor: pointer;
  flex-shrink: 0;
}
.burger-btn:hover { color: var(--fg); }
/* Burger dropdown — overlays content, doesn't push grid rows */
.burger-menu {
  position: absolute;
  top: 100%; left: 0; right: 0;
  z-index: 200;
  display: flex;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-3);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.burger-menu .tool:first-child { border-left: 0; }

/* Sub-header: banners wrapper — collapses to 0 height when empty */
.sess-sub-head { display: flex; flex-direction: column; }
@media (max-width: 900px) {
  .tools--desktop { display: none; }
  .burger-btn { display: flex; }
  .sess-head .pill { font-size: 11px; letter-spacing: 0.08em; }
}
.sess-head .back { font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg-3); cursor: pointer; border: 0; background: transparent; display: inline-flex; align-items: center; gap: 10px; padding: 8px 0; white-space: nowrap; }
.sess-head .back:hover { color: var(--accent); }
.sess-head .pill { justify-self: center; display: flex; align-items: center; gap: 10px; padding: 8px 18px; border-left: 1px solid var(--rule-2); border-right: 1px solid var(--rule-2); font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); }
.pill-sep { color: var(--fg-4); }
.soul-id-btn { font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; color: var(--fg-3); background: transparent; border: 1px solid var(--rule-2); border-radius: 3px; padding: 2px 7px; cursor: pointer; transition: color 0.15s, border-color 0.15s; white-space: nowrap; }
.soul-id-btn:hover { color: var(--accent); border-color: var(--accent); }
.soul-growing { font-size: 13px; color: var(--accent); opacity: 0.6; animation: soul-pulse 1.4s ease-in-out infinite; }
.soul-grew { font-size: 12px; color: var(--accent); }
@keyframes soul-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
.fade-quick-enter-active, .fade-quick-leave-active { transition: opacity 0.5s; }
.fade-quick-enter-from, .fade-quick-leave-to { opacity: 0; }
.sess-head .tools { display: flex; align-items: center; }
.tool { padding: 10px 16px; border-left: 1px solid var(--rule); border-top: 0; border-bottom: 0; border-right: 0; font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); cursor: pointer; background: transparent; white-space: nowrap; }
.tool:hover:not(:disabled) { color: var(--fg); }
.tool.active { color: var(--accent); }
.tool:disabled { opacity: 0.4; cursor: not-allowed; }
.tool--logout { color: var(--err, #f0a3a3); }
.tool--logout:hover { color: var(--fg); }


/* Banners */
.banner { padding: 10px clamp(16px,3vw,32px); border-bottom: 1px solid var(--rule); font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); display: flex; align-items: center; gap: 14px; }
.banner.b-loading { color: var(--fg-3); }
.banner.b-success { color: #b8dcc4; }
.banner.b-error { color: #f0a3a3; border-color: rgba(240,163,163,0.25); }
.banner.b-warn { color: var(--accent-bright); border-color: rgba(167,139,250,0.25); }
.banner .close { margin-left: auto; background: transparent; border: 0; color: inherit; opacity: 0.5; cursor: pointer; font-size: 12px; }
.banner .close:hover { opacity: 1; }

/* Body */
/* min-height: 0 is critical — without it the grid item expands to content height
   and overflows the 1fr track, making the dock push below the viewport */
.sess-body { display: grid; grid-template-columns: 360px 1fr; gap: 0; overflow: hidden; min-height: 0; }
@media (max-width: 900px) { .sess-body { grid-template-columns: 1fr; } .mobile-hidden { display: none !important; } }
@media (min-width: 901px) { .mobile-hidden { display: flex !important; } }

.col-soul { border-right: 1px solid var(--rule); padding: clamp(24px,4vw,40px) clamp(18px,3vw,28px); display: flex; flex-direction: column; gap: 28px; overflow-y: auto; background: linear-gradient(180deg, rgba(139,92,246,0.04) 0%, transparent 40%); min-height: 0; }
@media (max-width: 900px) {
  .col-soul { border-right: 0; padding: 0; gap: 0; }
  /* Hide the "Lebendige Datei / sys.md" header on mobile — SoulViewer shows soul name already */
  .col-soul > div:first-child { display: none; }
}
.col-soul .cap { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); margin-bottom: 10px; }
.col-soul .ttl { font-family: var(--serif); font-size: 32px; font-weight: 400; letter-spacing: -0.02em; margin: 0; line-height: 1; }
.col-soul .ttl em { font-style: italic; color: var(--accent); }

/* min-height: 0 prevents the flex child from growing past its available track */
.col-chat { display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

.onboard { display: flex; align-items: center; gap: 24px; padding: 14px clamp(16px,3vw,40px); border-bottom: 1px solid var(--rule); font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); flex-wrap: wrap; flex-shrink: 0; }
.onboard .n { color: var(--accent); }
.onboard .step { display: flex; gap: 10px; align-items: center; }
.onboard .step b { color: var(--fg); font-weight: 500; }
.onboard code { font-family: var(--mono); color: var(--fg); letter-spacing: 0.02em; text-transform: none; }
.onboard .close { margin-left: auto; background: transparent; border: 0; color: var(--fg-3); cursor: pointer; font-size: 12px; }
.onboard .close:hover { color: var(--accent); }

/* flex: 1 + min-height: 0 — hands all remaining height to ChatInterface */
.chat-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.chat-wrap :deep(.msg) { font-family: var(--serif); font-size: 17px; line-height: 1.55; }

/* Legal footer */
.sess-foot {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0;
  border-top: 1px solid var(--rule); background: var(--paper-3);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase;
}
.sf-copy { color: var(--fg-4); padding: 10px clamp(14px,3vw,32px); white-space: nowrap; }
.sf-links { display: flex; }
.sf-links a { color: var(--fg-3); text-decoration: none; padding: 0 12px; border-left: 1px solid var(--rule); min-height: 36px; display: flex; align-items: center; white-space: nowrap; }
.sf-links a:hover { color: var(--accent); }
/* Mobile: single horizontal scrollable row — like the tools bar */
@media (max-width: 900px) {
  .sess-foot {
    flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 36px), transparent 100%);
    mask-image: linear-gradient(to right, black calc(100% - 36px), transparent 100%);
  }
  .sess-foot::-webkit-scrollbar { display: none; }
  .sf-copy { padding: 0 14px; min-height: 40px; display: flex; align-items: center; flex-shrink: 0; font-size: 12px; }
  .sf-links { flex-wrap: nowrap; flex-shrink: 0; }
  .sf-links a { min-height: 40px; font-size: 12px; padding: 0 12px; letter-spacing: 0.12em; }
}

/* Mobile tabs */
.mobile-tabs { display: none; border-top: 1px solid var(--rule); background: var(--paper-3); }
@media (max-width: 900px) {
  .mobile-tabs { display: flex; padding-bottom: env(safe-area-inset-bottom, 0px); }
}
.mobile-tabs button { flex: 1; padding: 14px; background: transparent; border: 0; color: var(--fg-3); font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
.mobile-tabs button.active { color: var(--accent); }

/* Loading */
.sys-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #12101a; color: rgba(236,231,245,0.70); font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }

/* Transitions */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(8px); }

/* ═══════════════════════════════════════════════════════════════════
   :deep() — Editorial override für alle child-Komponenten
   Ziel: SoulViewer, SoulSetupWizard, VaultExplorer, SoulMaturityMeter
   ═══════════════════════════════════════════════════════════════════ */

/* ── Typografie ─────────────────────────────────────────────────── */
:deep(h2), :deep(h3), :deep(h4) {
  font-family: 'Noto Serif', Georgia, serif !important;
  letter-spacing: -0.02em;
  font-weight: 400;
  color: var(--fg);
}

/* ── Border-radius entfernen (editorial: keine runden Ecken) ─────── */
:deep(.rounded-xl), :deep(.rounded-2xl), :deep(.rounded-lg),
:deep(.rounded-xl\/2), :deep(.rounded-t-2xl), :deep(.rounded-b-2xl) {
  border-radius: 0 !important;
}
/* Kleine Tags/Badges: dezent eckig */
:deep(.rounded-full) { border-radius: 2px !important; }

/* ── Hintergründe auf Paper-Palette ─────────────────────────────── */
:deep(.bg-\[var\(--sys-bg-elevated\)\]) { background: var(--paper-2) !important; }
:deep(.bg-\[var\(--sys-bg-surface\)\])  { background: var(--paper-3) !important; }
:deep(.border-\[var\(--sys-border\)\])  { border-color: var(--rule) !important; }

/* ── Tab-Leisten: editorial border-bottom statt card-bg ─────────── */
:deep(.flex.gap-1.p-1.rounded-xl),
:deep(.flex.gap-1\.5.p-1\.5.rounded-xl) {
  background: transparent !important;
  border-radius: 0 !important;
  padding: 0 !important;
  gap: 0 !important;
  border-bottom: 1px solid var(--rule) !important;
}
:deep(.flex.gap-1.p-1.rounded-xl button),
:deep(.flex.gap-1\.5.p-1\.5.rounded-xl button) {
  border-radius: 0 !important;
  height: 40px !important;
  font-family: 'JetBrains Mono', ui-monospace, monospace !important;
  font-size: 12px !important;
  letter-spacing: 0.10em !important;
  text-transform: uppercase !important;
  border-right: 1px solid var(--rule) !important;
}
:deep(.flex.gap-1.p-1.rounded-xl button:last-child) { border-right: 0 !important; }
/* Aktiver Tab */
:deep(.bg-white\/12), :deep(.bg-white\/\[0\.12\]) {
  background: rgba(139,92,246,0.14) !important;
  color: var(--fg) !important;
}

/* ── Buttons in Panels ───────────────────────────────────────────── */
:deep(button.rounded-xl), :deep(button.rounded-lg), :deep(button.rounded-2xl) {
  border-radius: 0 !important;
  font-family: 'JetBrains Mono', ui-monospace, monospace !important;
  letter-spacing: 0.12em !important;
}

/* ── Inputs in Panels ────────────────────────────────────────────── */
:deep(input:not([type="file"])), :deep(textarea), :deep(select) {
  border-radius: 0 !important;
  background: rgba(255,255,255,0.03) !important;
  color: var(--fg) !important;
}
:deep(input:focus), :deep(textarea:focus) {
  outline: none !important;
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 1px var(--accent) !important;
}

/* ── SoulViewer Sidebar ──────────────────────────────────────────── */
.col-soul :deep(h3) {
  font-family: 'Noto Serif', Georgia, serif !important;
  font-size: 17px !important;
  font-weight: 400 !important;
  letter-spacing: -0.015em !important;
  color: var(--fg) !important;
  padding-top: 16px;
  margin-top: 16px !important;
  margin-bottom: 6px !important;
  border-top: 1px solid var(--rule);
}
.col-soul :deep(p) {
  font-size: 13px;
  line-height: 1.6;
  color: var(--fg-2);
}

/* ── Violet-Akzente aus globalen Vars ────────────────────────────── */
:deep(.text-\[var\(--sys-violet\)\])       { color: var(--accent) !important; }
:deep(.border-\[var\(--sys-violet-border\)\]) { border-color: var(--accent) !important; }
:deep(.bg-\[var\(--sys-violet-dim\)\])     { background: var(--accent-2) !important; }
</style>
