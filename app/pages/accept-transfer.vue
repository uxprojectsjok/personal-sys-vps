<template>
  <ClientOnly>
    <div class="at-page">

      <nav class="l-nav">
        <div class="lockup">
          <NuxtLink to="/" class="nav-home"><img src="/logo-nav.png" alt="SYS. Agency" class="nav-logo-img" /></NuxtLink>
        </div>
      </nav>

      <div class="at-wrap">
        <div v-if="loading" class="at-empty">Lädt…</div>

        <div v-else-if="loadError" class="at-empty at-empty--err">{{ loadError }}</div>

        <template v-else>
          <div class="at-hero">
            <span class="at-kicker">SOUL TRANSFER</span>
            <h1 class="at-h1">Übertragung <em>bestätigen</em></h1>
            <p class="at-lede">
              „{{ soulName }}" wird dir angeboten — {{ challenge.mode === 'sale' ? `als Verkauf für ${challenge.price_usdc} USDC` : 'kostenlos' }}.
              Verbinde deine Wallet und bestätige, dass du diese Adresse kontrollierst und die Soul annehmen möchtest.
            </p>
          </div>

          <div class="at-card">
            <div class="at-kv"><span>Status</span><span class="at-badge" :class="`at-badge--${challenge.status}`">{{ statusLabel(challenge.status) }}</span></div>
            <div class="at-kv"><span>Gültig bis</span><span>{{ formatDate(challenge.expires_at) }}</span></div>
            <div v-if="challenge.mode === 'sale'" class="at-kv"><span>Preis</span><span>{{ challenge.price_usdc }} USDC</span></div>
            <div v-if="challenge.buyer_wallet" class="at-kv"><span>Deine Wallet (bestätigt)</span><span class="at-mono">{{ challenge.buyer_wallet }}</span></div>
          </div>

          <p v-if="anchorError" class="at-error">{{ anchorError }}</p>
          <p v-if="actionMsg" class="at-hint">{{ actionMsg }}</p>

          <!-- Terminal states -->
          <div v-if="challenge.status === 'expired'" class="at-card at-card--warn">Diese Anfrage ist abgelaufen. Bitte den Absender um einen neuen Link bitten.</div>
          <div v-else-if="challenge.status === 'cancelled'" class="at-card at-card--warn">Diese Anfrage wurde vom aktuellen Eigentümer zurückgezogen.</div>
          <div v-else-if="challenge.status === 'completed'" class="at-card at-card--ok">Übertragung abgeschlossen — die Soul gehört jetzt deiner Wallet.</div>

          <!-- Step 1: connect + sign -->
          <template v-else-if="challenge.status === 'pending'">
            <button v-if="!isConnected" class="at-btn at-btn--primary" @click="connectWallet()">Wallet verbinden</button>
            <template v-else>
              <p class="at-hint">Verbunden: <span class="at-mono">{{ walletAddress }}</span></p>
              <button class="at-btn at-btn--primary" :disabled="signing" @click="doSign">{{ signing ? 'Signiere…' : 'Annahme bestätigen (Signatur)' }}</button>
            </template>
          </template>

          <!-- Step 2 (sale only): pay -->
          <template v-else-if="challenge.status === 'signed'">
            <p class="at-hint">Signatur bestätigt. Jetzt {{ challenge.price_usdc }} USDC an <span class="at-mono">{{ sellerWallet }}</span> senden:</p>
            <button v-if="!isConnected" class="at-btn at-btn--primary" @click="connectWallet()">Wallet verbinden</button>
            <button v-else class="at-btn at-btn--primary" :disabled="paying" @click="doPay">{{ paying ? 'Zahlung läuft…' : `${challenge.price_usdc} USDC senden` }}</button>
          </template>

          <!-- Step 3: waiting for owner -->
          <div v-else-if="challenge.status === 'ready'" class="at-card at-card--ok">
            Bestätigt{{ challenge.mode === 'sale' ? ' und bezahlt' : '' }} — wartet jetzt auf den aktuellen Eigentümer, die Übertragung abzuschließen. Diese Seite aktualisiert sich automatisch.
          </div>
        </template>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useChainAnchor } from '~/composables/useChainAnchor.js'

definePageMeta({ layout: false })

const route = useRoute()
const soulId      = route.query.soul_id
const challengeId = route.query.challenge_id

const {
  walletAddress, isConnected, anchorError,
  connectWallet, signSimple, sendUsdcPayment,
} = useChainAnchor()

const loading    = ref(true)
const loadError  = ref('')
const challenge  = ref(null)
const soulName    = ref('')
const sellerWallet = ref(null)
const confirmationMessage = ref('')
const signing    = ref(false)
const paying     = ref(false)
const actionMsg  = ref('')

function statusLabel(s) {
  return { pending: 'wartet auf deine Signatur', signed: 'signiert, Zahlung ausstehend', ready: 'bestätigt, wartet auf Abschluss', completed: 'abgeschlossen', expired: 'abgelaufen', cancelled: 'zurückgezogen' }[s] || s
}
function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadStatus() {
  if (!soulId || !challengeId) {
    loadError.value = 'Ungültiger Link — soul_id oder challenge_id fehlt.'
    loading.value = false
    return
  }
  try {
    const r = await fetch(`/api/soul/transfer/status?soul_id=${encodeURIComponent(soulId)}&challenge_id=${encodeURIComponent(challengeId)}`)
    const d = await r.json()
    if (!r.ok || !d.ok) {
      loadError.value = d.error === 'challenge_not_found' ? 'Diese Anfrage existiert nicht (mehr).' : (d.error || 'Fehler beim Laden.')
      loading.value = false
      return
    }
    challenge.value = d.challenge
    soulName.value = d.soul_name
    sellerWallet.value = d.seller_wallet
    confirmationMessage.value = d.confirmation_message
  } catch (e) {
    loadError.value = e.message
  } finally {
    loading.value = false
  }
}

let pollTimer = null
onMounted(() => {
  loadStatus()
  pollTimer = setInterval(loadStatus, 6000)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

async function doSign() {
  signing.value = true
  actionMsg.value = ''
  try {
    const { signature, address } = await signSimple(confirmationMessage.value)
    const r = await fetch('/api/soul/transfer/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: soulId, challenge_id: challengeId, wallet: address, signature }),
    })
    const d = await r.json()
    if (r.ok && d.ok) {
      challenge.value = d.challenge
    } else {
      actionMsg.value = d.error || 'Signatur konnte nicht bestätigt werden.'
    }
  } catch (e) {
    actionMsg.value = e.message
  } finally {
    signing.value = false
  }
}

async function doPay() {
  if (!sellerWallet.value || !challenge.value?.price_usdc) return
  paying.value = true
  actionMsg.value = ''
  try {
    const txHash = await sendUsdcPayment(sellerWallet.value, challenge.value.price_usdc)
    if (!txHash) return // anchorError zeigt den Grund
    actionMsg.value = 'Zahlung gesendet, warte auf Bestätigung…'
    const r = await fetch('/api/soul/transfer/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: soulId, challenge_id: challengeId, tx_hash: txHash }),
    })
    const d = await r.json()
    if (r.ok && d.ok) {
      challenge.value = d.challenge
      actionMsg.value = ''
    } else {
      actionMsg.value = d.error || 'Zahlung konnte nicht verifiziert werden.'
    }
  } catch (e) {
    actionMsg.value = e.message
  } finally {
    paying.value = false
  }
}
</script>

<style scoped>
.at-page {
  --bg: #0f0f0f; --surface-2: #171717; --line: rgba(255,255,255,0.07); --line-2: rgba(255,255,255,0.11);
  --teal: #6db89a; --teal-bright: #8ad0b3;
  --fg: #f0f0f0; --fg-2: rgba(240,240,240,0.78); --fg-dim: rgba(240,240,240,0.52);
  --serif: 'Noto Serif', Georgia, serif; --sans: 'Inter', system-ui, sans-serif; --mono: 'JetBrains Mono', 'Oxanium', ui-monospace, monospace;
  min-height: 100vh; background: var(--bg); color: var(--fg); font-family: var(--sans);
}
.l-nav { display: flex; align-items: center; padding: 0 clamp(20px,4vw,52px); height: 64px; border-bottom: 1px solid var(--line); }
.nav-home { display: flex; text-decoration: none; }
.nav-logo-img { display: block; height: clamp(28px,4vw,36px); width: auto; }

.at-wrap { max-width: 560px; margin: 0 auto; padding: clamp(32px,5vw,56px) clamp(20px,4vw,52px) 80px; display: flex; flex-direction: column; gap: 20px; }
.at-empty { padding: 60px 0; text-align: center; color: var(--fg-dim); font-family: var(--mono); font-size: 14px; }
.at-empty--err { color: #e06c75; }

.at-hero { padding-bottom: 24px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.at-kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--teal); display: block; margin-bottom: 14px; }
.at-h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(28px,4.5vw,42px); line-height: 1.1; letter-spacing: -0.03em; color: #fff; margin: 0 0 16px; }
.at-h1 em { font-style: italic; color: var(--teal); }
.at-lede { font-size: 16px; line-height: 1.65; color: var(--fg); margin: 0; }

.at-card { border: 1px solid var(--line); background: var(--surface-2); border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.at-card--warn { border-color: rgba(223,144,144,0.35); color: #e06c75; }
.at-card--ok { border-color: rgba(109,184,154,0.35); color: var(--teal-bright); }

.at-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 15px; }
.at-kv > span:first-child { color: var(--fg); flex: none; }
.at-kv > span:last-child { text-align: right; min-width: 0; }
.at-mono { font-family: var(--mono); font-size: 14px; color: var(--fg); word-break: break-all; }

.at-badge { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,0.06); }
.at-badge--ready, .at-badge--completed { background: rgba(109,184,154,0.15); color: var(--teal-bright); }
.at-badge--pending, .at-badge--signed { background: rgba(210,172,110,0.15); color: #d2ac6e; }
.at-badge--expired, .at-badge--cancelled { background: rgba(223,144,144,0.15); color: #e06c75; }

.at-btn { padding: 12px 20px; border-radius: 10px; font-family: var(--sans); font-size: 15px; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
.at-btn--primary { background: var(--teal); color: #0c1410; }
.at-btn--primary:hover:not(:disabled) { background: var(--teal-bright); }
.at-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }

.at-hint { font-size: 15px; color: var(--fg); line-height: 1.65; margin: 0; }
.at-error { color: #e06c75; font-size: 14px; margin: 0; }
</style>
