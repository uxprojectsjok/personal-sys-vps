<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="anchor" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Eigen', 'Verankern']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page vank-page">

            <!-- ── Header ── -->
            <div class="vank-head">
              <div class="eyebrow">Polygon · Blockchain</div>
              <h1 class="vank-title">Soul <em>verankern</em></h1>
              <p class="vank-lede">Schreibe einen kryptographischen Fingerabdruck deiner Soul on-chain — ein unwiderruflicher Zeitstempel, der deine Identität beweist.</p>
            </div>

            <!-- ── Status + Wallet card ── -->
            <div class="vank-card" :class="{ 'vank-card--on': hasAnchor }">
              <div class="vank-status-row">
                <span class="vank-dot" :class="{ 'vank-dot--on': hasAnchor }" />
                <span class="vank-status-label">{{ hasAnchor ? 'On-chain verankert' : 'Noch nicht verankert' }}</span>
                <svg class="vank-chain-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>
                </svg>
              </div>
              <div class="vank-wallet-row">
                <template v-if="walletRestoring">
                  <svg class="spin vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                  <span class="vank-wallet-hint">Wallet-Session prüfen…</span>
                </template>
                <template v-else-if="isConnected">
                  <span class="vank-dot vank-dot--on vank-dot--sm" />
                  <span class="vank-wallet-addr">{{ walletAddress }}</span>
                  <span class="vank-wallet-net">{{ currentNetwork }}</span>
                </template>
                <template v-else>
                  <span class="vank-wallet-hint">Keine Wallet verbunden</span>
                </template>
              </div>
            </div>

            <!-- ── Discovery-Tags ── -->
            <section class="vank-section">
              <div class="vank-section-body">
                <p class="vank-hint">Schlagwörter für soul_discover — KI und Menschen finden dich damit (Komma-getrennt)</p>
                <input
                  v-model="tagsRaw"
                  type="text"
                  class="vank-input"
                  placeholder="Marburg, AI, Design, Dezentralität…"
                  :disabled="isAnchoring"
                />
                <div v-if="tagsArray.length" class="vank-chips">
                  <span v-for="t in tagsArray" :key="t" class="vank-chip">{{ t }}</span>
                </div>
              </div>
            </section>

            <!-- ── Aktionen ── -->
            <section class="vank-section">
              <div class="vank-section-body">

                <div v-if="!canAnchor" class="vank-note">
                  Mindestens eine echte Session erforderlich. Führe ein Enrichment durch.
                </div>

                <div class="vank-actions">
                  <button
                    v-if="canAnchor && !isConnected"
                    class="vank-btn vank-btn--primary"
                    @click="connectWallet().then(() => recheckWallet())"
                  >
                    <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"/>
                    </svg>
                    Wallet verbinden
                  </button>
                  <button
                    v-if="canAnchor && isConnected"
                    class="vank-btn vank-btn--ghost"
                    @click="disconnectWallet()"
                  >
                    <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/>
                    </svg>
                    Wallet trennen
                  </button>
                  <button
                    class="vank-btn vank-btn--primary"
                    :class="{ 'vank-btn--busy': isCheckingRateLimit || isAnchoring }"
                    :disabled="!isConnected || !canAnchor || (rateLimitActive && !isAnchoring && !isCheckingRateLimit)"
                    @click="isCheckingRateLimit || isAnchoring ? handleCancel() : handleAnchor()"
                  >
                    <svg v-if="isCheckingRateLimit || isAnchoring" class="spin vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                    <svg v-else class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>
                    </svg>
                    {{ isCheckingRateLimit ? 'Prüfung… · Abbrechen' : isAnchoring ? 'Transaktion… · Abbrechen' : 'Soul verankern' }}
                  </button>
                </div>

                <div v-if="!canAnchor || (!isConnected && canAnchor)" class="vank-note vank-note--muted">
                  Verbinde zuerst eine Wallet, um zu verankern. Mindestens eine echte Session ist erforderlich.
                </div>

                <div v-if="isAnchoring" class="vank-note vank-note--info">
                  <svg class="spin vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                  Transaktion läuft — bitte in der Wallet-App bestätigen.
                </div>

                <div v-if="rateLimitActive" class="vank-note vank-note--warn">
                  Rate-Limit aktiv — nächster Anker möglich:<br>
                  <strong>{{ new Date(rateLimitUntil * 1000).toLocaleString('de-DE') }}</strong>
                </div>

                <div v-if="anchorError" class="vank-note vank-note--err">{{ anchorError }}</div>

                <!-- TX result -->
                <Transition name="slide-up">
                  <div v-if="anchorTx" class="vank-tx">
                    <div class="vank-tx-head">
                      <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      Transaktion · {{ anchorNetwork }}
                    </div>
                    <a :href="anchorExplorerUrl" target="_blank" rel="noopener noreferrer" class="vank-tx-hash">
                      <span>{{ anchorTx }}</span>
                      <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
                    </a>
                  </div>
                </Transition>

              </div>
            </section>

            <!-- ── Identität (nur wenn verankert) ── -->
            <template v-if="hasAnchor">
              <section class="vank-section">
                <div class="vank-section-body">
                  <button
                    class="vank-btn vank-btn--primary vank-btn--full"
                    :class="{ 'vank-btn--busy': isProvingIdentity || isConnectingForProof }"
                    @click="isProvingIdentity ? cancelProveIdentity() : handleProveIdentity()"
                  >
                    <svg v-if="isProvingIdentity || isConnectingForProof" class="spin vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                    <svg v-else class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"/>
                    </svg>
                    {{ isProvingIdentity ? 'Signiert… · Abbrechen' : isConnectingForProof ? 'Wallet verbinden…' : 'Identität nachweisen' }}
                  </button>

                  <Transition name="slide-up">
                    <div v-if="identityProof" class="vank-proof">
                      <div class="vank-proof-head">
                        <div class="vank-proof-title">
                          <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                          Proof generiert
                        </div>
                        <button class="vank-proof-copy" @click="copyProof">{{ proofCopied ? '✓ Kopiert' : 'Kopieren' }}</button>
                      </div>
                      <div class="vank-proof-data">
                        <div class="vank-proof-row"><span class="vank-proof-key">Anker</span><span class="vank-proof-val">{{ identityProof.anchorCount }}</span></div>
                        <div class="vank-proof-row"><span class="vank-proof-key">Seit</span><span class="vank-proof-val">{{ identityProof.firstAnchor }}</span></div>
                        <div class="vank-proof-row"><span class="vank-proof-key">Letzter</span><span class="vank-proof-val">{{ identityProof.latestAnchor }}</span></div>
                        <div class="vank-proof-row"><span class="vank-proof-key">Wallet</span><span class="vank-proof-val truncate">{{ identityProof.wallet }}</span></div>
                      </div>
                      <p class="vank-proof-text">
                        Kryptographischer Beweis: Diese Wallet besitzt diese Soul ·
                        {{ identityProof.anchorCount }} Anker seit {{ identityProof.firstAnchor }}
                      </p>
                    </div>
                  </Transition>
                </div>
              </section>
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
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useChainAnchor } from '~/composables/useChainAnchor.js'

definePageMeta({ layout: false })

const router = useRouter()
const { hasSoul, soulMeta, soulContent, pushToServer, isLoaded } = useSoul()

const {
  walletAddress, currentNetwork, isConnected, isAnchoring, isProvingIdentity,
  anchorError, hasAnchor, sessionCount,
  connectWallet, disconnectWallet, anchorSoul, cancelAnchor, checkNextAnchorAllowed,
  syncAnchorFromChain, proveIdentity, recheckWallet,
} = useChainAnchor()

// ── Shell state ──────────────────────────────────────────────────────────────
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

// ── Local state ──────────────────────────────────────────────────────────────
const walletRestoring      = ref(false)
const tagsRaw              = ref('')
const anchorTx             = ref('')
const anchorNetwork        = ref('')
const anchorExplorerUrl    = ref('')
const rateLimitUntil       = ref(0)
const isCheckingRateLimit  = ref(false)
const isCancelled          = ref(false)
const identityProof        = ref(null)
const proofCopied          = ref(false)
const isConnectingForProof = ref(false)

const tagsArray = computed(() =>
  tagsRaw.value.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length <= 32).slice(0, 10)
)
const canAnchor = computed(() => sessionCount.value > 0)
const rateLimitActive = computed(() => rateLimitUntil.value > 0 && rateLimitUntil.value * 1000 > Date.now())

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  walletRestoring.value = true
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent ?? '')
  await new Promise(r => setTimeout(r, isMobile ? 1_200 : 400))
  recheckWallet()
  walletRestoring.value = false
  refreshRateLimit()
  syncAnchorFromChain().then(result => {
    if (!result) return
    pushToServer()
    if (result.nextAllowed > 0) rateLimitUntil.value = result.nextAllowed
  })
})

watch(isConnected, v => { if (v) refreshRateLimit() })
watch(walletAddress, v => { if (v) refreshRateLimit() })

// ── Helpers ───────────────────────────────────────────────────────────────────
async function refreshRateLimit() {
  if (isCheckingRateLimit.value) return
  isCancelled.value = false
  isCheckingRateLimit.value = true
  try {
    const ts = await Promise.race([
      checkNextAnchorAllowed(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 12_000)),
    ])
    if (!isCancelled.value) rateLimitUntil.value = ts
  } catch (e) {
    if (e?.message !== 'TIMEOUT' && !isCancelled.value) rateLimitUntil.value = 0
  } finally {
    isCheckingRateLimit.value = false
  }
}

function handleCancel() {
  isCancelled.value = true
  isCheckingRateLimit.value = false
  cancelAnchor()
}

function cancelProveIdentity() {
  isProvingIdentity.value = false
}

async function handleAnchor() {
  anchorTx.value = ''
  anchorExplorerUrl.value = ''
  anchorNetwork.value = ''
  const tx = await anchorSoul(tagsArray.value)
  if (tx) {
    anchorTx.value = tx
    const m = soulContent.value?.match(/soul_chain_anchor:\s*(\{.+\})/m)
    if (m) {
      try {
        const stored = JSON.parse(m[1])
        anchorExplorerUrl.value = stored.explorer ?? `https://polygonscan.com/tx/${tx}`
        anchorNetwork.value = stored.network ?? 'Polygon Mainnet'
      } catch {
        anchorExplorerUrl.value = `https://polygonscan.com/tx/${tx}`
        anchorNetwork.value = 'Polygon Mainnet'
      }
    }
    refreshRateLimit()
    pushToServer()
  }
}

async function handleProveIdentity() {
  identityProof.value = null
  if (!isConnected.value) {
    isConnectingForProof.value = true
    try {
      await connectWallet()
      await new Promise(r => setTimeout(r, 600))
    } finally {
      isConnectingForProof.value = false
    }
    if (!isConnected.value) return
  }
  identityProof.value = await proveIdentity()
}

function copyProof() {
  if (!identityProof.value) return
  navigator.clipboard.writeText(JSON.stringify(identityProof.value, null, 2))
  proofCopied.value = true
  setTimeout(() => { proofCopied.value = false }, 2000)
}

// ── Navigation ────────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'anchor')   return
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/verbindung');  return }
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/einrichten');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/einnahmen');   return }
  if (id === 'maturity') { router.push('/reife');       return }
  if (id === 'calendar') { router.push('/kalender');    return }
  if (id === 'settings') { router.push('/einstellungen'); return }
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

.vank-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 100px;
}

/* ── Header ── */
.vank-head { margin-bottom: 28px; }
.vank-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 40px);
  font-weight: 400; letter-spacing: -0.025em; color: var(--fg);
  line-height: 1.1; margin: 8px 0 12px;
}
.vank-title em { font-style: italic; color: var(--accent); }
.vank-lede {
  font-size: 15px; line-height: 1.65; color: var(--fg); margin: 0; max-width: 560px;
}

/* ── Status + Wallet card ── */
.vank-card {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  overflow: hidden;
  margin-bottom: 8px;
  transition: border-color 0.3s;
}
.vank-card--on { border-color: rgba(109,184,154,0.30); }

.vank-status-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-2);
}
.vank-card--on .vank-status-row { color: var(--fg-2); background: rgba(109,184,154,0.04); }
.vank-status-label { flex: 1; }
.vank-chain-ic { width: 14px; height: 14px; flex: none; opacity: 0.35; }

.vank-wallet-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px;
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
  min-height: 44px;
}
.vank-wallet-addr { flex: 1; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vank-wallet-net  { flex: none; font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg-3); }
.vank-wallet-hint { color: var(--fg-3); }

/* ── Dot ── */
.vank-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: rgba(244,241,234,0.20);
  transition: background 0.3s, box-shadow 0.3s;
}
.vank-dot--on {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent-glow);
  animation: vank-pulse 2s infinite;
}
.vank-dot--sm { width: 6px; height: 6px; }
@keyframes vank-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

/* ── Section ── */
.vank-section { margin-top: 8px; }

.vank-divider {
  display: flex; align-items: center; gap: 12px;
  padding: 0;
  color: var(--fg-2);
  margin-bottom: 0;
}
.vank-divider::before, .vank-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--line);
}
.vank-divider span {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; padding: 12px 0; white-space: nowrap;
}

.vank-section-body {
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  background: var(--surface);
  padding: 16px 20px;
  display: flex; flex-direction: column; gap: 12px;
}

/* ── Tags ── */
.vank-hint {
  font-family: var(--mono); font-size: 12px; color: var(--fg-2);
  letter-spacing: 0.06em; margin: 0; line-height: 1.5;
}
.vank-input {
  width: 100%; box-sizing: border-box;
  background: var(--surface-2); border: 1px solid var(--line-2);
  border-radius: var(--r-xs); color: var(--fg);
  font-family: var(--mono); font-size: 13px;
  padding: 9px 12px; outline: none; transition: border-color 0.15s;
}
.vank-input:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-glow); }
.vank-input:disabled { opacity: 0.4; cursor: not-allowed; }
.vank-input::placeholder { color: var(--fg-3); }

.vank-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vank-chip {
  font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.08em;
  padding: 3px 10px; border-radius: 99px;
  background: var(--accent-dim); border: 1px solid rgba(109,184,154,0.30);
  color: var(--accent-bright);
}

/* ── Actions ── */
.vank-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.vank-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 16px;
  border: 1px solid var(--line-2); border-radius: var(--r-xs);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg-2);
  transition: all 0.15s; white-space: nowrap;
}
.vank-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--fg); border-color: var(--line-2); }
.vank-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.vank-btn--ghost { color: var(--fg-3); }
.vank-btn--ghost:hover:not(:disabled) { color: var(--fg); }

.vank-btn--primary {
  background: var(--accent-dim); border-color: rgba(109,184,154,0.30); color: var(--accent-bright);
}
.vank-btn--primary:hover:not(:disabled) {
  background: var(--accent); color: var(--on-accent);
  box-shadow: 0 6px 20px var(--accent-glow);
  border-color: var(--accent);
}
.vank-btn--primary:disabled { background: transparent; color: var(--fg-4); border-color: var(--line); }
.vank-btn--busy { background: var(--surface-2) !important; color: var(--fg-3) !important; border-color: var(--line) !important; box-shadow: none !important; }

.vank-btn--full { width: 100%; grid-column: 1 / -1; }

/* ── Notes ── */
.vank-note {
  font-family: var(--serif); font-size: 13.5px; line-height: 1.6; color: var(--fg-3); margin: 0;
}
.vank-note--muted { color: var(--fg-4); font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.04em; }
.vank-note--info { display: flex; align-items: center; gap: 8px; color: var(--fg-3); }
.vank-note--warn {
  padding: 10px 14px; border-radius: var(--r-xs);
  background: rgba(109,184,154,0.06); border: 1px solid rgba(109,184,154,0.18);
  color: var(--accent-bright); font-family: var(--mono); font-size: 12px; letter-spacing: 0.04em;
}
.vank-note--warn strong { color: var(--accent-bright); }
.vank-note--err {
  padding: 10px 14px; border-radius: var(--r-xs);
  background: rgba(224,108,117,0.06); border: 1px solid rgba(224,108,117,0.20);
  color: #e06c75; font-family: var(--mono); font-size: 12px;
}

/* ── TX ── */
.vank-tx {
  padding: 14px; border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--surface-2); display: flex; flex-direction: column; gap: 8px;
}
.vank-tx-head {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--accent);
}
.vank-tx-hash {
  display: flex; align-items: flex-start; gap: 6px;
  font-family: var(--mono); font-size: 12px; color: var(--fg-2);
  text-decoration: none; word-break: break-all;
}
.vank-tx-hash:hover { color: var(--accent-bright); text-decoration: underline; }

/* ── Proof ── */
.vank-proof {
  padding: 14px; border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--surface-2); display: flex; flex-direction: column; gap: 12px;
}
.vank-proof-head { display: flex; align-items: center; justify-content: space-between; }
.vank-proof-title {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--accent);
}
.vank-proof-copy {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--fg-3); background: transparent;
  border: 1px solid var(--line); border-radius: var(--r-xs); padding: 3px 10px; cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.vank-proof-copy:hover { color: var(--fg); border-color: var(--line-2); }
.vank-proof-data { display: flex; flex-direction: column; gap: 5px; }
.vank-proof-row { display: flex; gap: 12px; font-family: var(--mono); font-size: 12px; }
.vank-proof-key { color: var(--fg-4); min-width: 56px; }
.vank-proof-val { color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.vank-proof-text {
  font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.06em;
  line-height: 1.6; color: var(--fg-3); margin: 0;
}

/* ── Shared ── */
.vank-ic { width: 14px; height: 14px; flex: none; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.slide-up-enter-active { transition: all 0.2s ease; }
.slide-up-enter-from { opacity: 0; transform: translateY(6px); }

@media (max-width: 900px) {
  .vank-actions { grid-template-columns: 1fr; }
  .vank-btn--full { grid-column: 1; }
  .vank-page { padding: 20px 16px 100px; }
}
</style>
