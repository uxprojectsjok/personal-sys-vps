<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <a href="#main-content" class="skip-link">{{ $t('common.skip_to_content') }}</a>
      <SysSidebar route="wallet" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :monetization-enabled="monetizationEnabled"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_network'), $t('nav.wallet')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div id="main-content" class="scroll">
          <div class="page wa-page">
            <div class="wa-head">
              <div class="wa-eyebrow">{{ $t('wallet.eyebrow') }}</div>
              <h1 class="wa-title">{{ soulMeta?.name }} <em>{{ $t('nav.wallet') }}</em></h1>
            </div>

            <!-- Wallet-Typ -->
            <div class="wa-field">
              <div class="wa-field-label">{{ $t('wallet.type_label') }}</div>
              <div class="wa-select-stack">
                <div class="wa-select-row wa-select-row--active">
                  <span>{{ $t('wallet.type_manual') }}</span>
                  <span class="wa-chevron">⌄</span>
                </div>
                <div class="wa-select-row wa-select-row--disabled">
                  <span>{{ $t('wallet.type_provider') }}</span>
                  <span class="wa-soon-tag">{{ $t('wallet.soon_tag') }}</span>
                </div>
              </div>
            </div>

            <!-- Aktiver Token -->
            <div class="wa-field">
              <div class="wa-field-label">{{ $t('wallet.token_label') }}</div>
              <p class="wa-field-desc">{{ $t('wallet.token_desc') }}</p>
              <div class="wa-chip-row">
                <button
                  v-for="sym in displayTokenSymbols" :key="sym" type="button"
                  class="wa-chip"
                  :class="{ 'wa-chip--active': selectedToken === sym }"
                  @click="selectedToken = sym"
                >{{ sym }}</button>
              </div>
            </div>

            <!-- Private Key -->
            <div class="wa-field">
              <div class="wa-field-label">{{ x402Configured ? $t('settings.x402_replace_key_label') : $t('settings.x402_key_label') }}</div>
              <p class="wa-field-desc">{{ $t('settings.x402_key_desc') }}</p>
              <div class="wa-key-row">
                <input
                  v-model="x402KeyInput"
                  type="password"
                  class="sys-input sys-input--mono wa-key-input"
                  placeholder="0x…"
                  autocomplete="off"
                />
                <button
                  class="sys-btn-ed sys-btn-ed--primary"
                  :disabled="!x402KeyInput.trim() || x402KeySaving"
                  @click="x402SaveKey"
                >{{ x402KeySaving ? $t('settings.agent_running') : $t('common.save') }}</button>
              </div>
            </div>

            <!-- Status -->
            <div class="wa-field">
              <div class="wa-field-label">{{ $t('wallet.status_label') }}</div>
              <div class="archivar-lm-block">
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('settings.x402_wallet_label') }}</span>
                  <span class="archivar-lm-val" :class="x402Configured ? 'archivar-lm-ok' : ''">
                    {{ x402Configured ? $t('settings.x402_wallet_ready') : $t('settings.x402_wallet_missing') }}
                  </span>
                </div>
                <div v-if="x402Address" class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('settings.x402_address_label') }}</span>
                  <code class="archivar-lm-val archivar-lm-dim">{{ x402Address }}</code>
                </div>
                <div v-if="activeBalance !== null" class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('settings.x402_balance_label') }}</span>
                  <span class="archivar-lm-val">{{ activeBalance }} {{ selectedToken }}<span v-if="activeBalanceUsd !== null" class="archivar-lm-dim"> · ${{ activeBalanceUsd }}</span></span>
                </div>
              </div>
            </div>

            <!-- Aktionen -->
            <div v-if="x402Configured" class="wa-field">
              <div class="wa-actions-row">
                <button class="wa-btn-ghost" :disabled="x402BalancesBusy" @click="x402GetBalances">
                  {{ x402BalancesBusy ? $t('settings.agent_running') : $t('settings.x402_balances_btn') }}
                </button>
                <button class="wa-btn-ghost" :disabled="x402PayBusy" @click="x402SendTestPayment">
                  {{ x402PayBusy ? $t('settings.agent_running') : $t('settings.x402_test_pay_btn') }}
                </button>
              </div>
              <p class="wa-hint">{{ $t('settings.x402_test_pay_hint') }}</p>

              <div v-if="x402PayResult" class="sm-infoblock" style="margin-top:8px">
                <pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-family:var(--mono);font-size:13px">{{ x402PayResult }}</pre>
              </div>
            </div>

            <!-- Feedback -->
            <Transition name="sys-modal-fade">
              <div v-if="x402Feedback" class="wa-feedback" :class="x402Feedback.ok ? 'wa-feedback--ok' : 'wa-feedback--err'">
                {{ x402Feedback.message }}
              </div>
            </Transition>

            <!-- Geplante Fähigkeiten -->
            <div class="wa-field wa-field--last">
              <div class="wa-field-label">{{ $t('wallet.roadmap_label') }}</div>
              <div class="wa-roadmap-box">
                <div v-for="item in roadmapItems" :key="item.title" class="wa-roadmap-row">
                  <div class="wa-roadmap-left">
                    <div class="wa-roadmap-title">{{ item.title }}</div>
                    <div class="wa-roadmap-desc">{{ item.desc }}</div>
                  </div>
                  <span class="wa-roadmap-tag">{{ $t('wallet.roadmap_tag') }}</span>
                </div>
              </div>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { monetizationEnabled, fetchNodeStatus } = useNodeStatus()
onMounted(() => { fetchNodeStatus(); loadX402Status() })

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', transfer:'/transfer', export:'/export', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', gatekeeper:'/gatekeeper', agent:'/agent', impressum:'/impressum', datenschutz:'/datenschutz', lizenz:'/lizenz', apps:'/apps' }
  if (id === 'wallet') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}

// ── Aktiver Token ────────────────────────────────────────────────────────────
// Wählt aus, welches der geladenen Guthaben im Status-Block hervorgehoben
// wird. Symbole kommen NICHT aus einer festen Liste hier, sondern live vom
// jeweiligen Vertrag (x402_client.mjs liest symbol() live statt es fest zu
// hinterlegen — der historische PoS-USDT-Vertrag berichtet inzwischen z.B.
// "USDT0" statt "USDT", ein echtes Rebranding, live geprüft). Vor dem ersten
// Laden zeigt die Chip-Reihe eine bekannte Erwartung, damit sie nicht leer
// ist — sobald echte Daten da sind, übernehmen die.
const KNOWN_TOKEN_SYMBOLS = ['POL', 'USDC', 'WETH', 'USDT0']
const selectedToken = ref('USDC')
const displayTokenSymbols = computed(() => x402Balances.value?.length ? x402Balances.value.map(b => b.symbol) : KNOWN_TOKEN_SYMBOLS)

const roadmapItems = computed(() => [
  { title: t('wallet.roadmap_trading_title'), desc: t('wallet.roadmap_trading_desc') },
  { title: t('wallet.roadmap_multichain_title'), desc: t('wallet.roadmap_multichain_desc') },
  { title: t('wallet.roadmap_limitorders_title'), desc: t('wallet.roadmap_limitorders_desc') },
])

// ── x402 Test-Wallet (per Soul, siehe soul-mcp/lib/x402_agent_wallet.mjs) ──────
// Operator/Soul kann eine kleine Test-Wallet hinterlegen (privater Key, nie
// der Haupt-Wallet), um den eigenen x402-Verkaufsweg (POST /api/soul/pay/x402)
// zu testen — soul-mcp verschlüsselt den Key at rest und signiert Zahlungen
// direkt mit @x402/evm + viem, keine Third-Party-Pairing-Dance nötig.
const x402Configured   = ref(false)
const x402Address      = ref('')
const x402Balances     = ref(null) // [{ symbol, amount, coingeckoId, address? }]
const x402Prices       = ref(null) // { [coingeckoId]: { usd } }, siehe getPrices() in x402_client.mjs
const x402KeyInput     = ref('')
const x402KeySaving    = ref(false)
const x402BalancesBusy = ref(false)
const x402PayBusy      = ref(false)
const x402PayResult    = ref('')
const x402Feedback     = ref(null)

function formatAmount(amountStr) {
  const n = Number(amountStr)
  if (!isFinite(n)) return amountStr
  return n.toFixed(n >= 1 ? 4 : 6).replace(/\.?0+$/, '')
}

const activeBalanceEntry = computed(() => x402Balances.value?.find(b => b.symbol === selectedToken.value) || null)
const activeBalance = computed(() => activeBalanceEntry.value ? formatAmount(activeBalanceEntry.value.amount) : null)
const activeBalanceUsd = computed(() => {
  const entry = activeBalanceEntry.value
  const price = entry && x402Prices.value?.[entry.coingeckoId]?.usd
  return price != null ? (Number(entry.amount) * price).toFixed(2) : null
})

function x402ShowFeedback(ok, message) {
  x402Feedback.value = { ok, message }
  setTimeout(() => { x402Feedback.value = null }, 5000)
}

async function loadX402Status() {
  try {
    const r = await fetch('/api/x402/agent/status', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      x402Configured.value = !!d.configured
      x402Address.value    = d.address || ''
    }
  } catch { /* silent */ }
}

async function x402SaveKey() {
  x402KeySaving.value = true
  x402Feedback.value  = null
  try {
    const r = await fetch('/api/x402/agent/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ private_key: x402KeyInput.value.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      x402Configured.value = true
      x402Address.value    = d.address
      x402KeyInput.value   = ''
      x402ShowFeedback(true, t('settings.x402_key_saved') + ' ✓')
    } else {
      x402ShowFeedback(false, d.message || d.error || `Error ${r.status}`)
    }
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402KeySaving.value = false
}

async function x402GetBalances() {
  x402BalancesBusy.value = true
  try {
    const r = await fetch('/api/x402/agent/balances', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      x402Balances.value = d.balances
      x402Prices.value   = d.prices
    } else {
      x402ShowFeedback(false, d.error || `Error ${r.status}`)
    }
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402BalancesBusy.value = false
}

async function x402SendTestPayment() {
  x402PayBusy.value   = true
  x402PayResult.value = ''
  x402Feedback.value  = null
  try {
    const soul_id = soulToken.value?.split('.')?.[0]
    const r = await fetch('/api/x402/agent/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({
        url: `${window.location.origin}/api/soul/pay/x402`,
        method: 'POST',
        body: { soul_id },
      }),
    })
    const d = await r.json().catch(() => ({}))
    x402PayResult.value = JSON.stringify(d, null, 2)
    if (r.ok && d.ok) x402GetBalances()
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402PayBusy.value = false
}
</script>

<style scoped>
.wa-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.wa-head { padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.wa-eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.wa-title {
  font-family: var(--serif); font-size: clamp(32px, 5vw, 48px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05;
}
.wa-title em { font-style: italic; color: var(--accent); }

.wa-field { margin-bottom: 28px; }
.wa-field--last { margin-bottom: 0; }
.wa-field-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg); margin-bottom: 10px;
}
.wa-field-desc { font-size: 15px; line-height: 1.65; color: var(--fg); max-width: 640px; margin: 0 0 12px; }

/* Wallet-Typ */
.wa-select-stack { display: flex; flex-direction: column; gap: 8px; max-width: 420px; }
.wa-select-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border: 1px solid var(--line-2); border-radius: var(--r-xs);
  font-family: var(--sans); font-size: 15px; color: var(--fg);
}
.wa-select-row--active { border-color: var(--accent); }
.wa-select-row--disabled { opacity: 0.5; }
.wa-chevron { color: var(--fg); font-size: 14px; }
.wa-soon-tag {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line-2); color: var(--fg);
}

/* Aktiver Token */
.wa-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.wa-chip {
  padding: 7px 16px; border-radius: 999px; border: 1px solid var(--line-2);
  background: transparent; color: var(--fg); font-family: var(--sans); font-size: 14px;
  font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.wa-chip:hover { border-color: var(--accent); }
.wa-chip--active { background: rgba(109,184,154,0.10); border-color: var(--accent); color: var(--accent); }

/* Private Key */
.wa-key-row { display: flex; gap: 8px; }
.wa-key-input { flex: 1; }

/* Aktionen */
.wa-actions-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.wa-hint { font-size: 15px; line-height: 1.65; color: var(--fg); margin: 0; }

/* Eigene Ghost-Button-Variante statt .sys-btn-ed--ghost: dessen Rahmenfarbe
   (--sys-rule-strong, aus sys-editorial.css) ist fest auf einen hellen,
   für dunklen Hintergrund gedachten Ton codiert und passt sich nicht ans
   Seiten-Theme an — im Hell-Modus dadurch praktisch unsichtbar (kein Rahmen,
   kein erkennbarer Button mehr). Live geprüft (Playwright-Screenshot beider
   Themes) vor diesem Fix. Nutzt stattdessen dieselben theme-reaktiven Tokens
   wie der Rest dieser Seite (var(--line-2)/var(--fg)/var(--accent)).
   Nicht in sys-editorial.css selbst gefixt — das ist eine app-weit geteilte
   Datei für "alle upgraded modals"; ein Fix dort bräuchte eigenes Testen
   gegen jeden bestehenden Verbraucher, außerhalb des Umfangs dieser Seite. */
.wa-btn-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 20px; border-radius: var(--r-xs);
  font-family: var(--sans); font-size: 13px; font-weight: 600; letter-spacing: 0.02em;
  cursor: pointer; border: 1px solid var(--line-2); background: transparent; color: var(--fg);
  transition: all 0.15s;
}
.wa-btn-ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.wa-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

.wa-feedback {
  margin-top: 10px; padding: 10px 14px; border-left: 2px solid;
  font-family: var(--mono); font-size: 13px;
}
.wa-feedback--ok  { border-color: var(--sys-ok); color: var(--sys-ok); background: rgba(184,220,196,0.06); }
.wa-feedback--err { border-color: var(--sys-err); color: var(--sys-err); background: rgba(240,163,163,0.06); }

/* Geplante Fähigkeiten */
.wa-roadmap-box { border: 1px solid var(--line); border-radius: var(--r-xs); overflow: hidden; }
.wa-roadmap-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 16px; border-bottom: 1px solid var(--line);
}
.wa-roadmap-row:last-child { border-bottom: none; }
.wa-roadmap-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wa-roadmap-title { font-family: var(--sans); font-size: 15px; font-weight: 500; color: var(--fg); }
.wa-roadmap-desc { font-family: var(--sans); font-size: 13px; color: var(--fg); line-height: 1.5; }
.wa-roadmap-tag {
  flex: none; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line-2); color: var(--fg);
}

.archivar-lm-block { border: 1px solid var(--sys-rule); border-radius: var(--r-xs); overflow: hidden; }
.archivar-lm-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--sys-rule); font-family: var(--mono); font-size: 14px; }
.archivar-lm-row:last-child { border-bottom: none; }
.archivar-lm-key  { color: var(--fg); letter-spacing: 0.06em; text-transform: uppercase; font-size: 11px; }
.archivar-lm-val  { color: var(--fg); letter-spacing: 0.04em; }
.archivar-lm-ok   { color: var(--sys-ok); }
.archivar-lm-dim  { color: var(--fg); }

@media (max-width: 640px) {
  .wa-roadmap-row { flex-wrap: wrap; }
}
</style>
