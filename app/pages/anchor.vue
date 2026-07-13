<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="anchor" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('anchor.crumb_own'), $t('anchor.crumb_anchor')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page vank-page">

            <!-- ── Header ── -->
            <div class="vank-head">
              <div class="eyebrow">{{ $t('anchor.kicker') }}</div>
              <h1 class="vank-title">{{ $t('anchor.title_prefix') }} <em>{{ $t('anchor.title_em') }}</em></h1>
              <p class="vank-lede">{{ $t('anchor.lede') }}</p>
            </div>

            <!-- ── Datenschutz-Opt-out-Warnung ── -->
            <div v-if="!discoverable" class="anc-discover-warn">
              {{ $t('anchor.discoverable_off_warning') }}
            </div>

            <!-- ── Status + Wallet card ── -->
            <div class="vank-card" :class="{ 'vank-card--on': hasAnchor }">
              <div class="vank-status-row">
                <span class="vank-dot" :class="{ 'vank-dot--on': hasAnchor }" />
                <span class="vank-status-label">{{ hasAnchor ? $t('anchor.status_anchored') : $t('anchor.status_not_anchored') }}</span>
                <svg class="vank-chain-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/>
                </svg>
              </div>
              <div class="vank-wallet-row">
                <template v-if="walletRestoring">
                  <svg class="spin vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                  <span class="vank-wallet-hint">{{ $t('anchor.wallet_checking') }}</span>
                </template>
                <template v-else-if="isConnected">
                  <span class="vank-dot vank-dot--on vank-dot--sm" />
                  <span class="vank-wallet-addr">{{ walletAddress }}</span>
                  <span class="vank-wallet-net">{{ currentNetwork }}</span>
                </template>
                <template v-else>
                  <span class="vank-wallet-hint">{{ $t('anchor.wallet_none') }}</span>
                </template>
              </div>
            </div>

            <!-- ── Genesis Chain Metrics ── -->
            <Transition name="slide-up">
              <div v-if="chainMetrics && chainMetrics.anchor_count > 0" class="vank-genesis-card">
                <div class="vank-genesis-head">
                  <span class="vank-genesis-badge">{{ $t('anchor.chain_genesis_badge') }}</span>
                  <span class="vank-genesis-title">{{ $t('anchor.chain_genesis_title') }}</span>
                  <span class="vank-genesis-since">
                    {{ $t('anchor.chain_since_label') }} {{ chainMetrics.genesis_ts ? new Date(chainMetrics.genesis_ts).toLocaleDateString() : '—' }}
                  </span>
                </div>
                <div class="vank-genesis-metrics">
                  <div class="vank-genesis-metric">
                    <span class="vank-genesis-val">{{ chainMetrics.chain_age_blocks?.toLocaleString() }}</span>
                    <span class="vank-genesis-unit">{{ $t('anchor.chain_blocks_suffix') }}</span>
                    <span class="vank-genesis-label">{{ $t('anchor.chain_age_label') }}</span>
                    <span class="vank-genesis-sub">~ {{ chainMetrics.chain_age_human }}</span>
                  </div>
                  <div class="vank-genesis-metric">
                    <span class="vank-genesis-val">{{ chainMetrics.knowledge_blocks?.toLocaleString() }}</span>
                    <span class="vank-genesis-unit">{{ $t('anchor.chain_knowledge_suffix') }}</span>
                    <span class="vank-genesis-label">{{ $t('anchor.chain_knowledge_label') }}</span>
                    <span class="vank-genesis-sub">{{ $t('anchor.chain_anchors_label') }}: {{ chainMetrics.anchor_count }}</span>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- ── Chain Visibility ── -->
            <Transition name="slide-up">
              <div v-if="chainMetrics && chainMetrics.visibility_zone && chainMetrics.visibility_zone !== 'unknown'"
                   class="vank-visibility-card"
                   :class="`vank-visibility--${chainMetrics.visibility_zone}`">
                <div class="vank-vis-head">
                  <span class="vank-vis-badge">{{ $t(`anchor.vis_zone_${chainMetrics.visibility_zone}`) }}</span>
                  <span class="vank-vis-title">{{ $t('anchor.vis_title') }}</span>
                </div>
                <div class="vank-vis-metrics">
                  <div class="vank-vis-metric">
                    <span class="vank-vis-val">{{ visVal(chainMetrics.days_since_last_anchor) }}</span>
                    <span class="vank-vis-unit">{{ visUnit(chainMetrics.days_since_last_anchor) }}</span>
                    <span class="vank-vis-label">{{ $t('anchor.vis_ago') }}</span>
                    <div class="vank-vis-bar-wrap">
                      <div class="vank-vis-bar">
                        <div class="vank-vis-fill"
                             :style="{ width: Math.min(100, ((chainMetrics.days_since_last_anchor ?? 0) / (chainMetrics.discover_window_days ?? 11)) * 100) + '%' }">
                        </div>
                        <div class="vank-vis-threshold"></div>
                      </div>
                      <span class="vank-vis-bar-label">/ {{ chainMetrics.discover_window_days ?? 11 }}d</span>
                    </div>
                  </div>
                  <div class="vank-vis-hint-col">
                    <p class="vank-vis-hint">{{ $t(`anchor.vis_hint_${chainMetrics.visibility_zone}`) }}</p>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- ── Kontinuitäts-Kette: alle Glieder, Zahlen & Verknüpfungen ── -->
            <Transition name="slide-up">
              <div v-if="chainLinks && chainLinks.length" class="vank-chain-card">
                <div class="vank-chain-head">
                  <span class="vank-chain-badge">{{ $t('anchor.chain_links_badge') }}</span>
                  <span class="vank-chain-title">{{ $t('anchor.chain_links_title') }}</span>
                  <span class="vank-chain-count">{{ chainLinks.length }}</span>
                </div>
                <div class="vank-chain-list">
                  <div v-for="(link, idx) in chainLinks" :key="link.link_id" class="vank-chain-link">
                    <span v-if="idx < chainLinks.length - 1" class="vank-chain-connector" />
                    <div class="vank-chain-link-row">
                      <span class="vank-chain-idx">{{ String(idx + 1).padStart(2, '0') }}</span>
                      <span class="vank-chain-type">{{ link.attestation_type }}</span>
                      <span class="vank-chain-conf" :class="`vank-chain-conf--${link.confidence}`">{{ $t(`anchor.chain_conf_${link.confidence}`) }}</span>
                      <span class="vank-chain-ts">{{ new Date(link.timestamp).toLocaleString() }}</span>
                    </div>
                    <div class="vank-chain-hash-row">
                      <span class="vank-chain-hash">{{ link.link_hash?.slice(0, 12) }}</span>
                      <span class="vank-chain-prev">
                        ↳ {{ link.prev_link_hash ? $t('anchor.chain_built_on') : '' }}
                        {{ link.prev_link_hash ? link.prev_link_hash.slice(0, 12) : $t('anchor.chain_genesis_link') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- ── Discovery-Tags ── -->
            <section class="vank-section">
              <div class="vank-section-body">
                <p class="vank-hint">{{ $t('marketplace.field_tags_hint') }}</p>
                <input
                  v-model="tagsRaw"
                  type="text"
                  class="vank-input"
                  :placeholder="$t('anchor.tags_placeholder')"
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
                  {{ $t('anchor.need_session') }}
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
                    {{ $t('anchor.wallet_connect') }}
                  </button>
                  <button
                    v-if="canAnchor && isConnected"
                    class="vank-btn vank-btn--ghost"
                    @click="disconnectWallet()"
                  >
                    <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/>
                    </svg>
                    {{ $t('anchor.wallet_disconnect') }}
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
                    {{ isCheckingRateLimit ? $t('anchor.btn_checking_cancel') : isAnchoring ? $t('anchor.btn_tx_cancel') : $t('anchor.btn_anchor') }}
                  </button>
                </div>

                <div v-if="!canAnchor || (!isConnected && canAnchor)" class="vank-note vank-note--muted">
                  {{ $t('anchor.connect_wallet_note') }}
                </div>

                <div v-if="isAnchoring" class="vank-note vank-note--info">
                  <svg class="spin vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                  {{ $t('anchor.tx_pending') }}
                </div>

                <div v-if="rateLimitActive" class="vank-note vank-note--warn">
                  {{ $t('anchor.rate_limit_active') }}<br>
                  <strong>{{ new Date(rateLimitUntil * 1000).toLocaleString() }}</strong>
                </div>

                <div v-if="anchorError" class="vank-note vank-note--err">{{ anchorError }}</div>

                <!-- TX result -->
                <Transition name="slide-up">
                  <div v-if="anchorTx" class="vank-tx">
                    <div class="vank-tx-head">
                      <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      {{ $t('anchor.tx_label', { network: anchorNetwork }) }}
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
                    {{ isProvingIdentity ? $t('anchor.btn_signing_cancel') : isConnectingForProof ? $t('anchor.btn_connecting_wallet') : $t('anchor.btn_prove_identity') }}
                  </button>

                  <Transition name="slide-up">
                    <div v-if="identityProof" class="vank-proof">
                      <div class="vank-proof-head">
                        <div class="vank-proof-title">
                          <svg class="vank-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                          {{ $t('anchor.proof_generated') }}
                        </div>
                        <button class="vank-proof-copy" @click="copyProof">{{ proofCopied ? $t('anchor.proof_copied') : $t('anchor.proof_copy') }}</button>
                      </div>
                      <div class="vank-proof-data">
                        <div class="vank-proof-row"><span class="vank-proof-key">{{ $t('anchor.proof_count_label') }}</span><span class="vank-proof-val">{{ identityProof.anchorCount }}</span></div>
                        <div class="vank-proof-row"><span class="vank-proof-key">{{ $t('anchor.proof_since_label') }}</span><span class="vank-proof-val">{{ identityProof.firstAnchor }}</span></div>
                        <div class="vank-proof-row"><span class="vank-proof-key">{{ $t('anchor.proof_last_label') }}</span><span class="vank-proof-val">{{ identityProof.latestAnchor }}</span></div>
                        <div class="vank-proof-row"><span class="vank-proof-key">{{ $t('anchor.proof_wallet_label') }}</span><span class="vank-proof-val truncate">{{ identityProof.wallet }}</span></div>
                      </div>
                      <p class="vank-proof-text">
                        {{ $t('anchor.proof_text', { count: identityProof.anchorCount, since: identityProof.firstAnchor }) }}
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useChainAnchor } from '~/composables/useChainAnchor.js'

definePageMeta({ layout: false })

const { t } = useI18n()

const router = useRouter()
const { hasSoul, soulMeta, soulContent, soulToken, pushToServer, isLoaded } = useSoul()

const {
  walletAddress, currentNetwork, isConnected, isAnchoring, isProvingIdentity,
  anchorError, hasAnchor, sessionCount,
  connectWallet, disconnectWallet, anchorSoul, cancelAnchor, checkNextAnchorAllowed,
  syncAnchorFromChain, proveIdentity, recheckWallet,
  chainMetrics, fetchChainMetrics,
  chainLinks, fetchChainList,
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
const discoverable         = ref(true)
let chainMetricsTimer      = null

const tagsArray = computed(() =>
  tagsRaw.value.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length <= 32).slice(0, 10)
)
const canAnchor = computed(() => sessionCount.value > 0)
const rateLimitActive = computed(() => rateLimitUntil.value > 0 && rateLimitUntil.value * 1000 > Date.now())

function visVal(days) {
  if (days === null || days === undefined) return '—'
  if (days < 1) return Math.round(days * 24)
  return Math.floor(days)
}
function visUnit(days) {
  if (days === null || days === undefined) return ''
  return days < 1 ? 'h' : t('anchor.vis_days_unit')
}

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  walletRestoring.value = true
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent ?? '')
  await new Promise(r => setTimeout(r, isMobile ? 1_200 : 400))
  recheckWallet()
  walletRestoring.value = false
  refreshRateLimit()
  fetchChainMetrics()
  fetchChainList()
  fetch('/api/soul/privacy', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d) discoverable.value = d.discoverable !== false })
    .catch(() => {})
  syncAnchorFromChain().then(result => {
    if (!result) return
    pushToServer()
    if (result.nextAllowed > 0) rateLimitUntil.value = result.nextAllowed
  })

  // Chain-Metrics-Heartbeat: alle ~2.5s neu holen (trifft Polygons Block-Kadenz,
  // damit chain_age_blocks live tickt) — pausiert wenn der Tab nicht sichtbar ist,
  // statt im Hintergrund unnötig weiter zu pollen.
  chainMetricsTimer = setInterval(() => {
    if (document.visibilityState === 'visible') fetchChainMetrics()
  }, 2_500)
})
onUnmounted(() => { if (chainMetricsTimer) clearInterval(chainMetricsTimer) })

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
    fetchChainMetrics()
    fetchChainList()
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
  if (id === 'export')   { router.push('/export'); return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/connection');  return }
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/setup');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronicle');     return }
  if (id === 'files')    { router.push('/vault');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/earnings');   return }
  if (id === 'maturity') { router.push('/maturity');       return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'settings') { router.push('/settings'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase;
}

.vank-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 36px clamp(22px, 4vw, 42px) 100px;
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
  font-size: 17px; line-height: 1.65; color: var(--fg); margin: 0; max-width: 560px;
}

/* ── Status + Wallet card ── */
.vank-card {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
  margin-bottom: 12px;
  transition: border-color 0.3s;
}
.vank-card--on { border-color: rgba(109,184,154,0.30); }

.vank-status-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  font-family: var(--sans); font-size: 16px; letter-spacing: 0;
  color: var(--fg);
}
.vank-card--on .vank-status-row { color: var(--fg); background: rgba(109,184,154,0.04); }
.vank-status-label { flex: 1; }
.vank-chain-ic { width: 14px; height: 14px; flex: none; opacity: 0.35; }

.vank-wallet-row {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px;
  font-family: var(--sans); font-size: 16px; color: var(--fg);
  min-height: 44px;
}
.vank-wallet-addr { flex: 1; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vank-wallet-net  { flex: none; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg); }
.vank-wallet-hint { color: var(--fg); }

/* ── Dot ── */
.vank-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: rgba(236,236,236,0.20);
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
.vank-section { margin-top: 12px; }

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
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.14em;
  text-transform: uppercase; padding: 12px 0; white-space: nowrap;
}

.vank-section-body {
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 16px 20px;
  display: flex; flex-direction: column; gap: 12px;
}

/* ── Tags ── */
.vank-hint {
  font-family: var(--sans); font-size: 16px; color: var(--fg);
  margin: 0; line-height: 1.55;
}
.vank-input {
  width: 100%; box-sizing: border-box;
  background: var(--surface-2); border: 1px solid var(--line-2);
  border-radius: var(--r-xs); color: var(--fg);
  font-family: var(--sans); font-size: 16px;
  padding: 9px 12px; outline: none; transition: border-color 0.15s;
}
.vank-input:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-glow); }
.vank-input:disabled { opacity: 0.4; cursor: not-allowed; }
.vank-input::placeholder { color: var(--fg-3); }

.vank-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vank-chip {
  font-family: var(--mono); font-size: 13.5px; letter-spacing: 0.08em;
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
  font-family: var(--sans); font-size: 16px; letter-spacing: 0;
  color: var(--fg);
  transition: all 0.15s; white-space: nowrap;
}
.vank-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--fg); border-color: var(--line-2); }
.vank-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.vank-btn--ghost { color: var(--fg); }
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
  font-family: var(--sans); font-size: 17px; line-height: 1.65; color: var(--fg); margin: 0;
}
.vank-note--muted { color: var(--fg); font-family: var(--sans); font-size: 16px; }
.vank-note--info { display: flex; align-items: center; gap: 8px; color: var(--fg); }
.vank-note--warn {
  padding: 10px 14px; border-radius: var(--r-xs);
  background: rgba(109,184,154,0.06); border: 1px solid rgba(109,184,154,0.18);
  color: var(--accent-bright); font-family: var(--mono); font-size: 14px; letter-spacing: 0.04em;
}
.vank-note--warn strong { color: var(--accent-bright); }
.vank-note--err {
  padding: 10px 14px; border-radius: var(--r-xs);
  background: rgba(224,108,117,0.06); border: 1px solid rgba(224,108,117,0.20);
  color: #e06c75; font-family: var(--mono); font-size: 14px;
}
.anc-discover-warn {
  padding: 12px 16px; border-radius: var(--r-xs); margin-bottom: 16px;
  background: rgba(232,163,63,0.06); border: 1px solid rgba(232,163,63,0.25);
  color: #e8a33f; font-family: var(--mono); font-size: 13px; line-height: 1.6;
}

/* ── TX ── */
.vank-tx {
  padding: 14px; border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--surface-2); display: flex; flex-direction: column; gap: 8px;
}
.vank-tx-head {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--accent);
}
.vank-tx-hash {
  display: flex; align-items: flex-start; gap: 6px;
  font-family: var(--mono); font-size: 14px; color: var(--fg);
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
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--accent);
}
.vank-proof-copy {
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--fg-2); background: transparent;
  border: 1px solid var(--line); border-radius: var(--r-xs); padding: 3px 10px; cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.vank-proof-copy:hover { color: var(--fg); border-color: var(--line-2); }
.vank-proof-data { display: flex; flex-direction: column; gap: 5px; }
.vank-proof-row { display: flex; gap: 12px; font-family: var(--mono); font-size: 14px; }
.vank-proof-key { color: var(--fg-2); min-width: 56px; }
.vank-proof-val { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.vank-proof-text {
  font-family: var(--mono); font-size: 13.5px; letter-spacing: 0.06em;
  line-height: 1.6; color: var(--fg); margin: 0;
}

/* ── Genesis Chain Card ── */
.vank-genesis-card {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
  margin-bottom: 12px;
}
.vank-genesis-head {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
}
.vank-genesis-badge {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em;
  text-transform: uppercase; padding: 2px 8px;
  background: var(--surface-2); border: 1px solid var(--line-2);
  border-radius: 99px; color: var(--fg); flex: none;
}
.vank-genesis-title {
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg); flex: 1;
}
.vank-genesis-since {
  font-family: var(--mono); font-size: 13px; color: var(--fg-2);
  letter-spacing: 0.04em; flex-basis: 100%;
}
.vank-genesis-metrics {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 0;
}
.vank-genesis-metric {
  display: flex; flex-direction: column; gap: 1px;
  padding: 14px 18px;
}
.vank-genesis-metric:first-child {
  border-right: 1px solid var(--line);
}
.vank-genesis-val {
  font-family: var(--mono); font-size: 22px; font-weight: 500;
  letter-spacing: -0.02em; color: var(--fg); line-height: 1;
}
.vank-genesis-unit {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3); margin-top: 2px;
}
.vank-genesis-label {
  font-family: var(--sans); font-size: 14px; color: var(--fg-2);
  margin-top: 6px;
}
.vank-genesis-sub {
  font-family: var(--mono); font-size: 13px; color: var(--fg-3);
  letter-spacing: 0.04em;
}

/* ── Chain Visibility Card ── */
.vank-visibility-card {
  border-radius: var(--r);
  overflow: hidden;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.vank-vis-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
}
.vank-vis-badge {
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.14em;
  text-transform: uppercase; padding: 4px 12px;
  background: var(--surface-2); border: 1px solid var(--line-2);
  border-radius: 99px; color: var(--fg); flex: none;
}
.vank-visibility--fading .vank-vis-badge {
  background: rgba(212,175,55,0.15); border-color: rgba(212,175,55,0.35); color: #d4af37;
}
.vank-visibility--invisible .vank-vis-badge {
  background: rgba(224,108,117,0.12); border-color: rgba(224,108,117,0.35); color: #e06c75;
}
.vank-vis-title {
  font-family: var(--mono); font-size: 15px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg); flex: 1;
}
.vank-vis-metrics {
  display: grid; grid-template-columns: auto 1fr; gap: 0;
}
.vank-vis-metric {
  display: flex; flex-direction: column; gap: 2px;
  padding: 18px 20px;
  border-right: 1px solid var(--line);
  min-width: 120px;
}
.vank-vis-val {
  font-family: var(--mono); font-size: 32px; font-weight: 500;
  letter-spacing: -0.02em; color: var(--fg); line-height: 1;
}
.vank-visibility--fading .vank-vis-val    { color: #d4af37; }
.vank-visibility--invisible .vank-vis-val { color: #e06c75; }
.vank-vis-unit {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3); margin-top: 2px;
}
.vank-visibility--fading .vank-vis-unit    { color: rgba(212,175,55,0.6); }
.vank-visibility--invisible .vank-vis-unit { color: rgba(224,108,117,0.6); }
.vank-vis-label {
  font-family: var(--sans); font-size: 14px; color: var(--fg-2); margin-top: 6px;
}
.vank-vis-bar-wrap {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
}
.vank-vis-bar {
  flex: 1; height: 5px; border-radius: 99px;
  background: rgba(255,255,255,0.06); position: relative; overflow: visible;
  min-width: 60px;
}
.vank-vis-fill {
  height: 100%; border-radius: 99px;
  background: var(--teal); transition: width 0.6s ease;
}
.vank-visibility--fading .vank-vis-fill    { background: #d4af37; }
.vank-visibility--invisible .vank-vis-fill { background: #e06c75; }
.vank-vis-threshold {
  position: absolute; right: 0; top: -3px;
  width: 2px; height: 11px; border-radius: 1px;
  background: rgba(255,255,255,0.22);
}
.vank-vis-bar-label {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
  color: var(--fg-3); white-space: nowrap;
}
.vank-vis-hint-col {
  display: flex; align-items: center; padding: 18px 20px;
}
.vank-vis-hint {
  font-family: var(--sans); font-size: 16px; color: var(--fg-2);
  line-height: 1.6; margin: 0;
}
.vank-visibility--invisible .vank-vis-hint { color: #e06c75; }

/* ── Kontinuitäts-Kette (Zahlen & Verknüpfungen, bewusst ohne Icons) ── */
.vank-chain-card {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
  margin-bottom: 12px;
}
.vank-chain-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
}
.vank-chain-badge {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em;
  text-transform: uppercase; padding: 2px 8px;
  background: var(--surface-2); border: 1px solid var(--line-2);
  border-radius: 99px; color: var(--fg); flex: none;
}
.vank-chain-title { font-family: var(--mono); font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg); flex: 1; }
.vank-chain-count { font-family: var(--mono); font-size: 14px; color: var(--fg-2); }
.vank-chain-list { padding: 4px 18px 14px; }
.vank-chain-link { position: relative; padding: 10px 0 10px 30px; }
.vank-chain-idx { font-family: var(--mono); font-size: 13px; color: var(--fg-3); position: absolute; left: 0; top: 11px; width: 22px; }
.vank-chain-connector {
  position: absolute; left: 10px; top: 30px; bottom: -2px; width: 1px;
  background: var(--line-2);
}
.vank-chain-link-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.vank-chain-type { font-family: var(--sans); font-size: 14px; color: var(--fg); }
.vank-chain-conf {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;
  color: var(--fg-2); border: 1px solid var(--line); border-radius: 99px; padding: 1px 8px;
}
.vank-chain-conf--low { color: #d4af37; border-color: rgba(212,175,55,0.35); }
.vank-chain-ts { font-family: var(--mono); font-size: 12px; color: var(--fg-3); margin-left: auto; }
.vank-chain-hash-row { display: flex; align-items: baseline; gap: 10px; margin-top: 4px; flex-wrap: wrap; }
.vank-chain-hash { font-family: var(--mono); font-size: 12px; color: var(--fg); background: var(--surface-2); border-radius: 4px; padding: 1px 6px; }
.vank-chain-prev { font-family: var(--mono); font-size: 12px; color: var(--fg-3); }

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
