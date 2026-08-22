<template>
  <ClientOnly>
    <div class="pay-page">

      <nav class="l-nav">
        <div class="lockup">
          <NuxtLink to="/" class="nav-home"><img src="/logo-nav.png" alt="SYS. Agency" class="nav-logo-img" /></NuxtLink>
        </div>
      </nav>

      <div class="pay-wrap">
        <div v-if="phase === 'loading'" class="pay-empty">Loading…</div>

        <div v-else-if="phase === 'preview_error'" class="pay-empty pay-empty--err">{{ previewError }}</div>

        <template v-else>
          <div class="pay-hero">
            <span class="pay-kicker">x402 PAYMENT</span>
            <h1 class="pay-h1">Pay with <em>your own wallet</em></h1>
            <p class="pay-lede">
              "{{ soulName }}" — {{ priceUsdc }} USDC per access. Connect your own wallet below and sign the
              payment yourself; nothing here uses any wallet or service belonging to the node operator.
            </p>
          </div>

          <div class="pay-card">
            <div class="pay-kv"><span>Soul</span><span>{{ soulName }}</span></div>
            <div class="pay-kv"><span>Price</span><span class="pay-mono">{{ priceUsdc }} USDC</span></div>
          </div>

          <!-- No wallet extension -->
          <div v-if="phase === 'no_provider'" class="pay-card pay-card--warn">
            No wallet extension detected. Install a browser wallet (e.g. MetaMask) and reload this page, or open
            this link inside your wallet app's built-in browser.
          </div>

          <!-- Connect -->
          <template v-else-if="phase === 'connect'">
            <button class="pay-btn pay-btn--primary" :disabled="connecting" @click="doConnect">
              {{ connecting ? 'Connecting…' : 'Connect Wallet' }}
            </button>
          </template>

          <!-- Wrong network -->
          <template v-else-if="phase === 'wrong_network'">
            <p class="pay-hint">Connected: <span class="pay-mono">{{ address }}</span> — wrong network.</p>
            <button class="pay-btn pay-btn--primary" :disabled="switchingNetwork" @click="doSwitchNetwork">
              {{ switchingNetwork ? 'Switching…' : 'Switch to Polygon' }}
            </button>
          </template>

          <!-- Ready to pay -->
          <template v-else-if="phase === 'ready'">
            <p class="pay-hint">Connected: <span class="pay-mono">{{ address }}</span></p>
            <button class="pay-btn pay-btn--primary" :disabled="paying" @click="doPay">
              {{ paying ? 'Confirm the signature request in your wallet…' : `Pay ${priceUsdc} USDC` }}
            </button>
          </template>

          <!-- Success -->
          <div v-else-if="phase === 'success'" class="pay-card pay-card--ok">
            <p class="pay-hint" style="margin-bottom:12px">Payment confirmed. Paste this access token into your chat — your AI agent can use it with <span class="pay-mono">soul_read_by_token</span>.</p>
            <div class="pay-token-row">
              <code class="pay-mono pay-token">{{ result.access_token }}</code>
              <button class="pay-btn pay-btn--ghost" @click="copyToken">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
            </div>
            <div class="pay-kv" style="margin-top:14px"><span>Transaction</span><a class="pay-mono" :href="`https://polygonscan.com/tx/${result.tx_hash}`" target="_blank" rel="noopener">{{ shortHash(result.tx_hash) }}</a></div>
            <div class="pay-kv"><span>Expires</span><span>{{ formatDate(result.expires_at) }}</span></div>
          </div>

          <!-- Error -->
          <template v-else-if="phase === 'error'">
            <div class="pay-card pay-card--warn">{{ payErrorMessage }}</div>
            <button class="pay-btn pay-btn--ghost" @click="phase = walletPhaseAfterError">Back</button>
            <details v-if="payErrorDetail" class="pay-details">
              <summary>Raw response</summary>
              <pre class="pay-mono">{{ payErrorDetail }}</pre>
            </details>
          </template>
        </template>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

definePageMeta({ layout: false })

const route = useRoute()
const soulId      = route.query.soul_id
const referenceId = route.query.reference_id || ''

const phase          = ref('loading') // loading | preview_error | no_provider | connect | wrong_network | ready | error | success
const previewError   = ref('')
const soulName       = ref('')
const priceUsdc      = ref('')
const connecting     = ref(false)
const switchingNetwork = ref(false)
const paying         = ref(false)
const address        = ref('')
const copied         = ref(false)
const result         = ref(null)
const payErrorMessage = ref('')
const payErrorDetail  = ref('')
const walletPhaseAfterError = ref('ready')

const POLYGON_CHAIN_ID = '0x89' // 137

function shortHash(h) {
  if (!h) return '—'
  return `${h.slice(0, 10)}…${h.slice(-6)}`
}
function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// server error code -> plain-language message (soul_pay_x402.lua + /internal/verify-x402)
const ERROR_MESSAGES = {
  payment_not_required: 'This soul has not enabled paid access.',
  x402_not_configured: 'This soul has no USDC price configured yet — ask the owner to enable it.',
  private_node: 'This node does not accept paying buyers right now.',
  reference_id_required: 'Consent required first. Go back to your AI agent and have it complete accept_digital_content_terms for this soul, then reopen this link with the reference_id it returns.',
  consent_not_found: 'Consent required first. Go back to your AI agent and have it complete accept_digital_content_terms for this soul, then reopen this link with the reference_id it returns.',
  payment_already_used: 'This payment proof was already redeemed. If you already have an access token from this attempt, use that instead.',
  wrong_network: 'Payment could not be verified: wrong network.',
  wrong_asset: 'Payment could not be verified: wrong asset.',
  wrong_recipient: 'Payment could not be verified: wrong recipient.',
  insufficient_amount: 'Payment could not be verified: amount too low.',
  malformed_payment_header: 'Payment could not be verified: malformed payment header.',
  missing_accepted_requirements: 'Payment could not be verified: missing payment requirements.',
  verify_failed: 'Payment could not be verified.',
  facilitator_unreachable: 'Payment network temporarily unreachable — please try again in a minute.',
}

function showError(errCode, message, detail, backTo) {
  payErrorMessage.value = ERROR_MESSAGES[errCode] || message || 'Payment failed.'
  payErrorDetail.value = detail ? JSON.stringify(detail, null, 2) : ''
  walletPhaseAfterError.value = backTo || 'ready'
  phase.value = 'error'
}

const PREVIEW_ERROR_MESSAGES = {
  soul_not_found: 'Soul not found — check the soul_id in your link.',
  soul_private: 'This soul is private.',
  soul_id_required: 'Invalid link — soul_id is missing.',
  api_context_corrupt: 'This soul could not be loaded right now — try again shortly.',
}

async function loadPreview() {
  if (!soulId) {
    previewError.value = 'Invalid link — soul_id is missing.'
    phase.value = 'preview_error'
    return
  }
  try {
    const r = await fetch(`/api/soul/preview?soul_id=${encodeURIComponent(soulId)}`)
    const d = await r.json()
    if (!r.ok) {
      previewError.value = PREVIEW_ERROR_MESSAGES[d.error] || d.message || 'Could not load this soul.'
      phase.value = 'preview_error'
      return
    }
    if (d.enabled === false) {
      previewError.value = 'This soul has not enabled paid access.'
      phase.value = 'preview_error'
      return
    }
    // soul_preview.lua's response has no soul-name field — the short id
    // fragment is the only stable, always-available label here.
    soulName.value = `${soulId.slice(0, 8)}…`
    priceUsdc.value = d.usdc_required || d.base_price || '?'
    detectWallet()
  } catch (e) {
    previewError.value = e.message
    phase.value = 'preview_error'
  }
}

function detectWallet() {
  if (typeof window === 'undefined' || typeof window.ethereum === 'undefined') {
    phase.value = 'no_provider'
    return
  }
  phase.value = 'connect'
}

async function checkNetwork() {
  const chainId = await window.ethereum.request({ method: 'eth_chainId' })
  return chainId === POLYGON_CHAIN_ID
}

async function doConnect() {
  connecting.value = true
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    address.value = accounts[0]
    phase.value = (await checkNetwork()) ? 'ready' : 'wrong_network'
  } catch (e) {
    if (e.code === 4001) {
      showError(null, 'Cancelled — you rejected the connection request in your wallet.', null, 'connect')
    } else {
      showError(null, e.message, null, 'connect')
    }
  } finally {
    connecting.value = false
  }
}

async function doSwitchNetwork() {
  switchingNetwork.value = true
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID }],
    })
    phase.value = (await checkNetwork()) ? 'ready' : 'wrong_network'
  } catch (e) {
    if (e.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: POLYGON_CHAIN_ID,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-bor-rpc.publicnode.com'],
            blockExplorerUrls: ['https://polygonscan.com'],
          }],
        })
        phase.value = (await checkNetwork()) ? 'ready' : 'wrong_network'
      } catch (addErr) {
        showError(null, 'Cancelled — you rejected adding the Polygon network in your wallet.', null, 'wrong_network')
      }
    } else if (e.code === 4001) {
      showError(null, 'Cancelled — you rejected the network switch in your wallet.', null, 'wrong_network')
    } else {
      showError(null, e.message, null, 'wrong_network')
    }
  } finally {
    switchingNetwork.value = false
  }
}

function onChainChanged() {
  checkNetwork().then(ok => { if (phase.value === 'wrong_network' || phase.value === 'ready') phase.value = ok ? 'ready' : 'wrong_network' })
}

async function doPay() {
  paying.value = true
  try {
    const { createWalletClient, custom } = await import('viem')
    const { polygon } = await import('viem/chains')
    const { x402Client } = await import('@x402/core/client')
    const { registerExactEvmScheme } = await import('@x402/evm/exact/client')
    const { wrapFetchWithPayment } = await import('@x402/fetch')

    const walletClient = createWalletClient({ chain: polygon, transport: custom(window.ethereum) })
    const signer = {
      address: address.value,
      signTypedData: (msg) => walletClient.signTypedData({ account: address.value, ...msg }),
    }

    const client = new x402Client()
    registerExactEvmScheme(client, { signer, schemeOptions: { rpcUrl: 'https://polygon-bor-rpc.publicnode.com' } })
    // wrapFetchWithPayment wants the raw x402Client — see soul-mcp/lib/x402_client.mjs's
    // payX402() comment for the double-wrap trap that silently skips signing entirely.
    const fetchWithPay = wrapFetchWithPayment(fetch, client)

    const body = { soul_id: soulId, ...(referenceId ? { reference_id: referenceId } : {}) }
    const response = await fetchWithPay('/api/soul/pay/x402', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await response.json().catch(() => ({}))

    if (response.ok && d.ok) {
      result.value = d
      phase.value = 'success'
    } else {
      showError(d.error, d.message, d.detail, 'ready')
    }
  } catch (e) {
    if (e.code === 4001) {
      showError(null, 'Cancelled — you rejected the signature request in your wallet.', null, 'ready')
    } else {
      showError(null, e.message, null, 'ready')
    }
  } finally {
    paying.value = false
  }
}

function copyToken() {
  if (!result.value?.access_token) return
  navigator.clipboard.writeText(result.value.access_token).catch(() => {})
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

onMounted(() => {
  loadPreview()
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on?.('chainChanged', onChainChanged)
  }
})
onUnmounted(() => {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.removeListener?.('chainChanged', onChainChanged)
  }
})
</script>

<style scoped>
.pay-page {
  --bg: inherit; --surface-2: inherit; --line: inherit; --line-2: inherit;
  --teal: var(--accent); --teal-bright: var(--accent-bright);
  min-height: 100vh; background: var(--bg); color: var(--fg); font-family: var(--sans);
}
.l-nav { display: flex; align-items: center; padding: 0 clamp(20px,4vw,52px); height: 64px; border-bottom: 1px solid var(--line); }
.nav-home { display: flex; text-decoration: none; }
.nav-logo-img { display: block; height: clamp(28px,4vw,36px); width: auto; }

.pay-wrap { max-width: 560px; margin: 0 auto; padding: clamp(32px,5vw,56px) clamp(20px,4vw,52px) 80px; display: flex; flex-direction: column; gap: 20px; }
.pay-empty { padding: 60px 0; text-align: center; color: var(--fg); font-family: var(--mono); font-size: 14px; }
.pay-empty--err { color: #e06c75; }

.pay-hero { padding-bottom: 24px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.pay-kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--teal); display: block; margin-bottom: 14px; }
.pay-h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(28px,4.5vw,42px); line-height: 1.1; letter-spacing: -0.03em; color: var(--fg); margin: 0 0 16px; }
.pay-h1 em { font-style: italic; color: var(--teal); }
.pay-lede { font-size: 16px; line-height: 1.65; color: var(--fg); margin: 0; }

.pay-card { border: 1px solid var(--line); background: var(--surface-2); border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.pay-card--warn { border-color: rgba(223,144,144,0.35); color: #e06c75; }
.pay-card--ok { border-color: rgba(109,184,154,0.35); }

.pay-kv { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 15px; }
.pay-kv > span:first-child, .pay-kv > a:first-child { color: var(--fg); flex: none; }
.pay-kv > span:last-child, .pay-kv > a:last-child { text-align: right; min-width: 0; }
.pay-mono { font-family: var(--mono); font-size: 14px; color: var(--fg); word-break: break-all; }
a.pay-mono { color: var(--teal-bright); text-decoration: none; }
a.pay-mono:hover { text-decoration: underline; }

.pay-btn { padding: 12px 20px; border-radius: 10px; font-family: var(--sans); font-size: 15px; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
.pay-btn--primary { background: var(--teal); color: #0c1410; }
.pay-btn--primary:hover:not(:disabled) { background: var(--teal-bright); }
.pay-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.pay-btn--ghost { background: transparent; border-color: var(--line-2); color: var(--fg); align-self: flex-start; }
.pay-btn--ghost:hover { border-color: var(--teal); color: var(--teal-bright); }

.pay-hint { font-size: 15px; color: var(--fg); line-height: 1.65; margin: 0; }

.pay-token-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pay-token { flex: 1; min-width: 0; padding: 8px 12px; background: rgba(255,255,255,0.04); border-radius: 8px; }

.pay-details { font-size: 13px; color: var(--fg); }
.pay-details summary { cursor: pointer; }
.pay-details pre { white-space: pre-wrap; word-break: break-all; margin: 8px 0 0; }
</style>
