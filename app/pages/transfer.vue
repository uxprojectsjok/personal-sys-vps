<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="transfer" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :monetization-enabled="monetizationEnabled"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Seele', 'Transfer Soul']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="tf-page">

            <div class="tf-head">
              <div class="tf-eyebrow">EIGENTUM</div>
              <h1 class="tf-title">Transfer <em>Soul</em></h1>
              <p class="tf-lede">Verkaufe das On-Chain-Eigentum dieser Soul an eine neue Wallet. Der Empfänger muss seine Wallet-Kontrolle per Signatur bestätigen und den Preis zahlen, bevor die Übertragung ausgeführt wird. Für kostenlose Übertragungen ohne Käufer-Bestätigung siehe „Direkt übertragen" unten.</p>
            </div>

            <!-- ── Status-Karte ── -->
            <div class="tf-card">
              <div class="tf-status-row">
                <span class="tf-label">Aktueller On-Chain-Eigentümer</span>
                <span class="tf-mono">{{ onChainOwner || '—' }}</span>
              </div>
              <div class="tf-status-row">
                <span class="tf-label">Deine Wallet</span>
                <template v-if="isConnected">
                  <span class="tf-mono">{{ walletAddress }} <span class="tf-net">({{ currentNetwork }})</span></span>
                  <button class="tf-btn tf-btn--primary" @click="disconnectWallet()">Wallet trennen</button>
                </template>
                <button v-else class="tf-btn tf-btn--primary" :disabled="isConnectingWallet" @click="connectWallet()">{{ isConnectingWallet ? 'Verbindung wird hergestellt…' : 'Wallet verbinden' }}</button>
              </div>
            </div>

            <p v-if="anchorError" class="tf-error">{{ anchorError }}</p>

            <!-- ── Aktive Challenge ── -->
            <div v-if="challenge" class="tf-card tf-card--challenge">
              <div class="tf-card-head">
                <span class="tf-card-title">Laufende Übertragungs-Anfrage</span>
                <span class="tf-badge" :class="`tf-badge--${challenge.status}`">{{ statusLabel(challenge.status) }}</span>
              </div>
              <div v-if="challenge.status === 'pending' || challenge.status === 'signed'" class="tf-link-row">
                <span class="tf-mono tf-link">{{ acceptUrl }}</span>
                <button class="tf-btn tf-btn--primary" @click="copyAcceptUrl">{{ copyMsg || 'Link kopieren' }}</button>
              </div>

              <div class="tf-kv"><span>Käufer-Wallet</span><span class="tf-mono">{{ challenge.buyer_wallet || 'noch nicht signiert' }}</span></div>
              <div class="tf-kv"><span>Preis</span><span>{{ challenge.price_usdc }} USDC</span></div>
              <div class="tf-kv"><span>Gültig bis</span><span>{{ formatDate(challenge.expires_at) }}</span></div>
              <div v-if="challenge.payment_tx_hash" class="tf-kv"><span>Zahlung</span><span class="tf-mono">{{ challenge.payment_tx_hash }}</span></div>

              <button
                v-if="challenge.status === 'ready'"
                class="tf-btn tf-btn--primary"
                :disabled="finalizing"
                @click="finalizeTransfer"
              >{{ finalizing ? 'Wird übertragen…' : 'Transfer jetzt ausführen' }}</button>

              <button
                v-if="challenge.status === 'pending' || challenge.status === 'signed'"
                class="tf-btn tf-btn--primary"
                @click="cancelChallenge"
              >Anfrage abbrechen</button>

              <p v-if="challenge.status === 'pending'" class="tf-hint">Warten auf Käufer-Signatur — teile den Link oben (oder lass eine KI-Agentin des Käufers ihn selbst abrufen).</p>
              <p v-if="challenge.status === 'signed'" class="tf-hint">Signatur erhalten, warte auf Zahlung.</p>
            </div>

            <!-- ── Angebot verwalten ── -->
            <div class="tf-card">
              <div class="tf-card-head">
                <span class="tf-card-title">Angebot</span>
                <span v-if="listing?.active" class="tf-badge tf-badge--ready">aktiv</span>
              </div>

              <div class="tf-field">
                <label>Preis (USDC)</label>
                <input v-model="priceUsdc" type="text" inputmode="decimal" class="tf-input" placeholder="z.B. 250.00" />
              </div>

              <div class="tf-field">
                <label>Gültigkeitsdauer der Preis-/Angebots-Challenge (Stunden)</label>
                <input v-model.number="durationHours" type="number" min="1" max="720" class="tf-input" />
              </div>

              <div class="tf-actions">
                <button class="tf-btn tf-btn--primary" :disabled="savingListing" @click="saveListing">
                  {{ savingListing ? 'Speichert…' : (listing?.active ? 'Angebot aktualisieren' : 'Angebot erstellen') }}
                </button>
                <button v-if="listing?.active" class="tf-btn tf-btn--primary" @click="disableListing">Angebot deaktivieren</button>
                <button v-if="listing?.active && !challenge" class="tf-btn tf-btn--primary" :disabled="creatingChallenge" @click="createChallengeLink">
                  {{ creatingChallenge ? 'Erstelle Link…' : 'Verkaufslink erstellen' }}
                </button>
              </div>
              <p v-if="listingMsg" class="tf-hint">{{ listingMsg }}</p>
            </div>

            <!-- ── Direkt-Transfer (ohne Angebot/Challenge) ── -->
            <div class="tf-card">
              <div class="tf-card-head"><span class="tf-card-title">Direkt übertragen</span></div>
              <p class="tf-hint">Für Fälle ohne Käufer-Bestätigung nötig — z. B. Übertragung an deine eigene zweite Wallet. Ruft transferSoul() direkt auf, ohne Signatur-Bestätigung der Zieladresse.</p>
              <div class="tf-field">
                <label>Ziel-Wallet-Adresse</label>
                <input v-model="directAddress" type="text" class="tf-input tf-mono" placeholder="0x…" />
              </div>
              <button class="tf-btn tf-btn--primary" :disabled="directTransferring || !directAddress" @click="doDirectTransfer">
                {{ directTransferring ? 'Wird übertragen…' : 'Direkt übertragen' }}
              </button>
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
  </ClientOnly>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useChainAnchor } from '~/composables/useChainAnchor.js'

definePageMeta({ layout: false })

const router = useRouter()
const { soulMeta, hasSoul, soulToken, clear } = useSoul()
const {
  walletAddress, currentNetwork, isConnected, isConnectingWallet, anchorError,
  connectWallet, disconnectWallet, transferSoul,
} = useChainAnchor()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)
const monetizationEnabled = ref(true)

const onChainOwner = ref(null)
const listing      = ref(null)
const challenge     = ref(null)
const priceUsdc     = ref('')
const durationHours = ref(24)
const savingListing = ref(false)
const listingMsg    = ref('')
const finalizing    = ref(false)
const directAddress = ref('')
const directTransferring = ref(false)
const creatingChallenge = ref(false)
const copyMsg       = ref('')

const acceptUrl = computed(() => {
  if (!challenge.value || !soulMeta.value?.id || typeof window === 'undefined') return ''
  return `${window.location.origin}/accept-transfer?soul_id=${soulMeta.value.id}&challenge_id=${challenge.value.challenge_id}`
})

function statusLabel(s) {
  return { pending: 'wartet auf Signatur', signed: 'signiert, wartet auf Zahlung', ready: 'bereit zum Abschluss', completed: 'abgeschlossen', expired: 'abgelaufen', cancelled: 'abgebrochen' }[s] || s
}
function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadState() {
  if (!soulToken.value || !soulMeta.value?.id) return
  try {
    const r = await fetch(`/api/soul/transfer/listing?soul_id=${soulMeta.value.id}`, {
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    const d = await r.json()
    if (d.ok) {
      listing.value      = d.listing
      challenge.value     = d.challenge
      onChainOwner.value  = d.on_chain_owner
      if (d.listing) {
        priceUsdc.value = d.listing.price_usdc || ''
        durationHours.value = d.listing.duration_hours
      }
    }
  } catch {}
}

let pollTimer = null
onMounted(() => {
  loadState()
  pollTimer = setInterval(loadState, 8000)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

async function saveListing() {
  if (!soulToken.value || !soulMeta.value?.id) return
  savingListing.value = true
  listingMsg.value = ''
  try {
    const r = await fetch('/api/soul/transfer/listing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({
        soul_id: soulMeta.value.id,
        mode: 'sale',
        price_usdc: priceUsdc.value,
        duration_hours: durationHours.value,
      }),
    })
    const d = await r.json()
    if (r.ok && d.ok) {
      listing.value = d.listing
      listingMsg.value = 'Gespeichert.'
      setTimeout(() => { listingMsg.value = '' }, 4000)
      if (!challenge.value) await createChallengeLink()
      else await loadState()
    } else {
      listingMsg.value = d.error || 'Fehler beim Speichern.'
    }
  } catch (e) {
    listingMsg.value = e.message
  } finally {
    savingListing.value = false
  }
}

async function createChallengeLink() {
  if (!soulMeta.value?.id) return
  creatingChallenge.value = true
  try {
    const r = await fetch('/api/soul/transfer/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: soulMeta.value.id }),
    })
    const d = await r.json()
    if (r.ok && d.ok) {
      await loadState()
    } else {
      listingMsg.value = d.error || d.message || 'Fehler beim Erstellen des Links.'
    }
  } catch (e) {
    listingMsg.value = e.message
  } finally {
    creatingChallenge.value = false
  }
}

async function copyAcceptUrl() {
  if (!acceptUrl.value) return
  try {
    await navigator.clipboard.writeText(acceptUrl.value)
    copyMsg.value = 'Kopiert!'
    setTimeout(() => { copyMsg.value = '' }, 2000)
  } catch {}
}

async function disableListing() {
  if (!soulToken.value || !soulMeta.value?.id) return
  try {
    const r = await fetch(`/api/soul/transfer/listing?soul_id=${soulMeta.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    const d = await r.json()
    if (d.ok) listing.value = d.listing
  } catch {}
}

async function cancelChallenge() {
  if (!soulToken.value || !soulMeta.value?.id || !challenge.value) return
  try {
    await fetch('/api/soul/transfer/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ soul_id: soulMeta.value.id, challenge_id: challenge.value.challenge_id }),
    })
    await loadState()
  } catch {}
}

async function finalizeTransfer() {
  if (!challenge.value?.buyer_wallet) return
  finalizing.value = true
  try {
    if (!isConnected.value) await connectWallet()
    const txHash = await transferSoul(challenge.value.buyer_wallet)
    if (!txHash) return // anchorError zeigt den Grund
    await fetch('/api/soul/transfer/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ soul_id: soulMeta.value.id, challenge_id: challenge.value.challenge_id, transfer_tx_hash: txHash }),
    })
    await loadState()
  } finally {
    finalizing.value = false
  }
}

async function doDirectTransfer() {
  if (!directAddress.value) return
  directTransferring.value = true
  try {
    if (!isConnected.value) await connectWallet()
    const txHash = await transferSoul(directAddress.value)
    if (txHash) {
      directAddress.value = ''
      await loadState()
    }
  } finally {
    directTransferring.value = false
  }
}

function lockGate() {
  clear()
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/'
}

function onNav(id) {
  if (id === 'transfer') return
  if (id === 'chat')     { router.push('/session');    return }
  if (id === 'setup')    { router.push('/setup');  return }
  if (id === 'soul')     { router.push('/soul');       return }
  if (id === 'chronik')  { router.push('/chronicle');    return }
  if (id === 'files')    { router.push('/vault');    return }
  if (id === 'maturity') { router.push('/maturity');      return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'anchor')   { router.push('/anchor');    return }
  if (id === 'export')   { router.push('/export'); return }
  if (id === 'connect')  { router.push('/connection');   return }
  if (id === 'settings') { router.push('/settings'); return }
  if (id === 'earnings') { router.push('/earnings');    return }
  if (id === 'archivar')    { router.push('/archivar');    return }
  if (id === 'gatekeeper')  { router.push('/gatekeeper');  return }
  if (id === 'wallet')      { router.push('/wallet');      return }
  if (id === 'agent')       { router.push('/agent');       return }
  if (id === 'market')      { router.push('/marketplace'); return }
  if (id === 'impressum')   { router.push('/impressum');   return }
  if (id === 'datenschutz') { router.push('/datenschutz'); return }
  if (id === 'lizenz')      { router.push('/lizenz');      return }
  if (id === 'apps')        { router.push('/apps');        return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.tf-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px, 4vw, 42px) 88px; display: flex; flex-direction: column; gap: 20px; }

.tf-head { padding-bottom: 22px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.tf-eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; margin-bottom: 10px; }
.tf-title { font-family: var(--serif); font-size: clamp(28px, 4vw, 42px); font-weight: 400; letter-spacing: -0.03em; color: var(--fg); line-height: 1.05; margin-bottom: 12px; }
.tf-title em { font-style: italic; color: var(--accent); }
.tf-lede { font-size: 16px; line-height: 1.65; color: var(--fg); max-width: 560px; margin: 0; }

.tf-card { background: var(--surface-2); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.tf-card--challenge { border-color: var(--accent-dim); }
.tf-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tf-card-title { font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg); }

.tf-status-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tf-label { font-size: 15px; color: var(--fg); }
.tf-mono { font-family: var(--mono); font-size: 14px; color: var(--fg); word-break: break-all; }

.tf-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 15px; }
.tf-kv > span:first-child { color: var(--fg); flex: none; }
.tf-kv > span:last-child { text-align: right; min-width: 0; }

.tf-badge { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; background: var(--surface-3); color: var(--fg); opacity: 0.85; }
.tf-badge--ready { background: var(--accent-dim); color: var(--accent-bright); opacity: 1; }
.tf-badge--completed { background: var(--accent-dim); color: var(--accent-bright); opacity: 1; }
.tf-badge--pending, .tf-badge--signed { background: rgba(210,172,110,0.15); color: #d2ac6e; opacity: 1; }
.tf-badge--expired, .tf-badge--cancelled { background: rgba(223,144,144,0.15); color: var(--c-danger); opacity: 1; }

.tf-field { display: flex; flex-direction: column; gap: 6px; }
.tf-field label { font-size: 15px; color: var(--fg); }
.tf-input { width: 100%; padding: 10px 13px; background: var(--surface); border: 1px solid var(--line-2); color: var(--fg); font-family: var(--sans); font-size: 15px; border-radius: 10px; outline: none; }
.tf-input:focus { border-color: var(--accent); }

.tf-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.tf-btn { padding: 10px 18px; border-radius: 10px; font-family: var(--sans); font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
.tf-btn--primary { background: var(--accent); color: var(--on-accent); }
.tf-btn--primary:hover:not(:disabled) { background: var(--accent-bright); }
.tf-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

.tf-link-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--surface-3); border: 1px solid var(--line-2); border-radius: 10px; padding: 10px 14px; }
.tf-link { flex: 1; min-width: 0; word-break: break-all; }

.tf-hint { font-size: 15px; color: var(--fg); line-height: 1.65; margin: 0; }
.tf-hint code { font-family: var(--mono); background: var(--surface-3); padding: 1px 5px; border-radius: 4px; }
.tf-error { color: var(--c-danger); font-size: 14px; margin: -8px 0 0; }
</style>
