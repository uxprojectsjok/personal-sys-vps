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
              <input
                v-model="x402ReferenceId"
                type="text"
                class="sys-input sys-input--mono"
                style="margin-bottom:10px"
                :placeholder="$t('settings.x402_reference_id_placeholder')"
                autocomplete="off"
                spellcheck="false"
              />
              <div class="wa-actions-row">
                <button class="wa-btn-ghost" :disabled="x402BalancesBusy" @click="x402GetBalances">
                  {{ x402BalancesBusy ? $t('settings.agent_running') : $t('settings.x402_balances_btn') }}
                </button>
                <button class="wa-btn-ghost" :disabled="x402PayBusy" @click="x402SendTestPayment">
                  {{ x402PayBusy ? $t('settings.agent_running') : $t('settings.x402_test_pay_btn') }}
                </button>
              </div>
              <p class="wa-hint">{{ $t('settings.x402_test_pay_hint') }}</p>
              <p class="wa-hint">{{ $t('settings.x402_reference_id_hint') }}</p>

              <div v-if="x402PayResult" class="sm-infoblock" style="margin-top:8px">
                <pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-family:var(--mono);font-size:13px">{{ x402PayResult }}</pre>
              </div>
            </div>

            <!-- Sicherheit (Notfall-Stopp/Tageslimit/erlaubte Token) — gilt wallet-weit,
                 Yield UND x402. trader.vue zeigt dieselben Werte nur noch read-only. -->
            <div class="wa-field">
              <div class="wa-field-label">{{ $t('trader.safety_label') }}</div>
              <div class="archivar-lm-block">
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('trader.daily_limit_label') }}</span>
                  <span v-if="editingLimit === false" class="archivar-lm-val" style="cursor:pointer" @click="startEditLimit">
                    {{ formatAmount(dailyUsedUsd) }} / {{ formatAmount(dailyLimitUsd) }} USD
                  </span>
                  <span v-else style="display:flex;align-items:center;gap:8px">
                    <input v-model="dailyLimitDraft" type="text" inputmode="decimal" class="sys-input sys-input--mono" style="width:100px;text-align:right" />
                    <button type="button" class="wa-btn-ghost wa-btn-ghost--accent" style="height:28px;padding:0 10px;font-size:12px" :disabled="safetyBusy" @click="saveDailyLimit">✓</button>
                  </span>
                </div>
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('trader.allowed_tokens_label') }}</span>
                  <span style="display:flex;gap:6px">
                    <button v-for="sym in spendableTokenOptions" :key="sym" type="button" class="wa-chip" :class="{ 'wa-chip--active': allowedTokens.includes(sym) }" :disabled="safetyBusy" @click="toggleAllowedToken(sym)">{{ sym }}</button>
                  </span>
                </div>
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('trader.kill_switch_label') }}</span>
                  <span style="display:flex;align-items:center;gap:10px">
                    <span :class="killSwitchActive ? '' : 'archivar-lm-ok'">{{ killSwitchActive ? 'Gestoppt' : 'Aktiv' }}</span>
                    <button type="button" class="wa-btn-ghost" :class="killSwitchActive ? 'wa-btn-ghost--accent' : 'wa-btn-ghost--danger'" style="height:28px;padding:0 10px;font-size:12px" :disabled="safetyBusy" @click="toggleKillSwitch">
                      {{ killSwitchActive ? 'Reaktivieren' : 'Stoppen' }}
                    </button>
                  </span>
                </div>
              </div>
              <p class="wa-hint">{{ $t('trader.wallet_safety_hint') }}</p>
            </div>

            <!-- x402 Access-Broker Token (externe Orchestrierung, z.B. n8n) -->
            <div class="wa-field">
              <div class="wa-field-label">{{ $t('wallet.x402_broker_label') }}</div>
              <p class="wa-field-desc">{{ $t('wallet.x402_broker_desc') }}</p>
              <div v-if="x402BrokerTokenOk" class="archivar-lm-block" style="margin-bottom:12px">
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('wallet.status_label') }}</span>
                  <span class="archivar-lm-val archivar-lm-ok">
                    {{ $t('wallet.x402_broker_status_active') }}<span v-if="x402BrokerExpiresLocal"> · {{ $t('wallet.x402_broker_expires', { date: x402BrokerExpiresLocal }) }}</span>
                  </span>
                </div>
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">Token</span>
                  <span style="display:flex;align-items:center;gap:8px">
                    <code class="archivar-lm-val archivar-lm-dim">{{ x402BrokerRevealed ? x402BrokerToken : '•'.repeat(16) }}</code>
                    <button type="button" class="wa-btn-ghost" style="height:26px;padding:0 10px;font-size:11px" @click="x402BrokerRevealed = !x402BrokerRevealed">
                      {{ x402BrokerRevealed ? $t('wallet.x402_broker_hide_btn') : $t('wallet.x402_broker_reveal_btn') }}
                    </button>
                    <button type="button" class="wa-btn-ghost" style="height:26px;padding:0 10px;font-size:11px" @click="x402BrokerCopy">
                      {{ x402BrokerCopied ? $t('wallet.x402_broker_copied') : $t('wallet.x402_broker_copy_btn') }}
                    </button>
                  </span>
                </div>
              </div>
              <button type="button" class="wa-btn-ghost wa-btn-ghost--accent" :disabled="x402BrokerBusy" @click="rotateX402BrokerToken">
                {{ x402BrokerBusy ? '…' : (x402BrokerTokenOk ? $t('wallet.x402_broker_renew_btn') : $t('wallet.x402_broker_create_btn')) }}
              </button>
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
      <ConfirmModal />
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
import { useConfirm } from '~/composables/useConfirm.js'
import ConfirmModal from '~/components/ConfirmModal.vue'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { monetizationEnabled, fetchNodeStatus } = useNodeStatus()
const { ask } = useConfirm()
onMounted(() => { fetchNodeStatus(); loadX402Status(); loadSafety(); loadX402BrokerStatus() })

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
const x402ReferenceId  = ref('')

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
    const referenceId = x402ReferenceId.value.trim()
    const r = await fetch('/api/x402/agent/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({
        url: `${window.location.origin}/api/soul/pay/x402`,
        method: 'POST',
        body: referenceId ? { soul_id, reference_id: referenceId } : { soul_id },
      }),
    })
    const d = await r.json().catch(() => ({}))
    x402PayResult.value = JSON.stringify(d, null, 2)
    if (r.ok && d.ok) { x402GetBalances(); loadSafety() }
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402PayBusy.value = false
}

// ── Sicherheit (Notfall-Stopp/Tageslimit/erlaubte Token) ────────────────────
// Verschoben von trader.vue hierher (2026-08-27): das Limit gilt jetzt
// wallet-weit — Yield-Aktionen UND x402-Zahlungen (siehe
// soul-mcp/lib/trader_config.mjs::assertActionAllowed, jetzt auch von
// /internal/x402-agent/pay aufgerufen) —, nicht mehr nur Trader-spezifisch.
// Durchgesetzt wird das serverseitig VOR jeder geldbewegenden Aktion; hier
// nur Anzeige/Verwaltung. trader.vue zeigt dieselben Werte nur noch
// read-only, mit einem Link hierher zum Ändern. Endpoints bleiben
// /api/trader/safety* — reiner UI-Umzug, kein Backend-Rename.
const killSwitchActive = ref(false)
const dailyLimitUsd    = ref(50)
const dailyUsedUsd     = ref(0)
const allowedTokens    = ref([])
const safetyBusy       = ref(false)
const editingLimit     = ref(false)
const dailyLimitDraft  = ref('')
// Dieselbe Liste wie die Token-Chips oben (KNOWN_TOKEN_SYMBOLS) — inkl. POL,
// nicht nur die Aave-Yield-Assets aus trader.vue (dort weiterhin
// yieldAssetOptions ohne POL, weil POL kein Yield-Asset ist).
const spendableTokenOptions = KNOWN_TOKEN_SYMBOLS

async function loadSafety() {
  try {
    const r = await fetch('/api/trader/safety', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      killSwitchActive.value = d.killSwitchActive
      dailyLimitUsd.value    = d.dailyLimitUsd
      dailyUsedUsd.value     = d.dailyUsedUsd
      allowedTokens.value    = d.allowedTokens
    }
  } catch { /* silent */ }
}

async function toggleKillSwitch() {
  safetyBusy.value = true
  try {
    const r = await fetch('/api/trader/safety/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ active: !killSwitchActive.value }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) killSwitchActive.value = d.killSwitchActive
  } catch { /* silent */ }
  safetyBusy.value = false
}

function startEditLimit() {
  dailyLimitDraft.value = String(dailyLimitUsd.value)
  editingLimit.value = true
}

async function saveDailyLimit() {
  safetyBusy.value = true
  try {
    const r = await fetch('/api/trader/safety/daily-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ limitUsd: dailyLimitDraft.value.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) dailyLimitUsd.value = d.dailyLimitUsd
  } catch { /* silent */ }
  editingLimit.value = false
  safetyBusy.value = false
}

async function toggleAllowedToken(symbol) {
  safetyBusy.value = true
  const nowAllowed = !allowedTokens.value.includes(symbol)
  try {
    const r = await fetch('/api/trader/safety/allowed-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ symbol, allowed: nowAllowed }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) allowedTokens.value = d.allowedTokens
  } catch { /* silent */ }
  safetyBusy.value = false
}

// ── x402 Access-Broker Token (für externe Orchestrierung, z.B. n8n) ─────────
// Fester Name statt Freitext im generischen "New service"-Formular (Setup) —
// ein Tippfehler dort (z.B. andere Groß-/Kleinschreibung) hätte den Token
// wirkungslos gemacht, ohne dass das irgendwo auffällt. Analog zu Agent
// Runner (agent.vue) — anders als der aber: der rohe Tokenwert wird hier
// bewusst angezeigt (maskiert, mit Reveal/Copy), weil er manuell in eine
// externe Integration (n8n) kopiert werden muss, statt nur node-intern via
// config.json verwendet zu werden. GET /api/vault/services liefert den
// Klartext-Token ohnehin schon immer mit (derselbe Wert ist der Map-Key in
// authorized_services.json) — ihn hier zu verstecken wäre Security-Theater.
const x402BrokerTokenOk    = ref(false)
const x402BrokerToken      = ref('')
const x402BrokerExpiresAt  = ref(null)
const x402BrokerRevealed   = ref(false)
const x402BrokerBusy       = ref(false)
const x402BrokerCopied     = ref(false)

const x402BrokerExpiresLocal = computed(() => {
  const ts = x402BrokerExpiresAt.value
  if (!ts) return ''
  const d = new Date(ts * 1000)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
})

async function loadX402BrokerStatus() {
  try {
    const r = await fetch('/api/vault/services', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const d = await r.json().catch(() => ({}))
    if (r.ok) {
      const svc = (d.services || []).find(s => s.name === 'x402-Zahlung')
      x402BrokerTokenOk.value   = !!svc
      x402BrokerToken.value     = svc?.token || ''
      x402BrokerExpiresAt.value = svc?.expires_at ?? null
    }
  } catch { /* silent */ }
}

async function rotateX402BrokerToken() {
  if (x402BrokerTokenOk.value) {
    const confirmed = await ask({
      title: t('wallet.x402_broker_rotate_confirm_title'),
      message: t('wallet.x402_broker_rotate_confirm_msg'),
      confirmText: t('wallet.x402_broker_rotate_confirm_btn'),
    })
    if (!confirmed) return
  }
  x402BrokerBusy.value = true
  try {
    const r = await fetch('/api/vault/services/x402-broker/rotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      x402BrokerRevealed.value = true
      await loadX402BrokerStatus()
    }
  } catch { /* silent */ }
  x402BrokerBusy.value = false
}

async function x402BrokerCopy() {
  try {
    await navigator.clipboard.writeText(x402BrokerToken.value)
    x402BrokerCopied.value = true
    setTimeout(() => { x402BrokerCopied.value = false }, 2000)
  } catch { /* Clipboard-API evtl. nicht verfügbar (kein HTTPS/kein Fokus) */ }
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

/* Sys-grün: Balance-abfragen/Test-Zahlung sind die "aktiven" Aktionen dieser
   Seite -- Rahmen+Text schon im Ruhezustand in Akzentgrün, nicht erst bei
   Hover, damit sie sich von reinen Navigations-Ghost-Buttons abheben. */
.wa-btn-ghost--accent { border-color: var(--accent); color: var(--accent); }
.wa-btn-ghost--accent:hover:not(:disabled) { background: rgba(109,184,154,0.10); }
.wa-btn-ghost--danger { border-color: var(--sys-err, #E06C75); color: var(--sys-err, #E06C75); }
.wa-btn-ghost--danger:hover:not(:disabled) { background: rgba(224,108,117,0.10); }

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
