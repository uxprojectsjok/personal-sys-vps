<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <a href="#main-content" class="skip-link">{{ $t('common.skip_to_content') }}</a>
      <SysSidebar route="trader" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :monetization-enabled="monetizationEnabled"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_network'), $t('trader.crumb')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div id="main-content" class="scroll">
          <div class="tr-page">

            <!-- ── Head ── -->
            <div class="tr-head">
              <div class="tr-eyebrow">{{ $t('trader.eyebrow') }}</div>
              <h1 class="tr-title">{{ soulMeta?.name }} <em>{{ $t('trader.title_em') }}</em></h1>
              <p class="tr-motto"><b>T</b>rade <b>I</b>t <b>L</b>ike <b>L</b>ightning.</p>
            </div>

            <!-- ── Portfolio ── -->
            <div class="tr-field">
              <div class="tr-field-label">{{ $t('trader.portfolio_label') }}</div>

              <div class="tr-wallet-link">
                <span class="tr-wl-left">
                  <span>{{ $t('trader.wallet_connected_prefix') }}</span>
                  <code v-if="x402Address">{{ x402Address }}</code>
                  <span v-else class="tr-wl-dim">—</span>
                  <span>· {{ $t('trader.wallet_type_manual') }}</span>
                </span>
                <NuxtLink to="/wallet" class="tr-wl-open">{{ $t('trader.open_wallet') }}</NuxtLink>
              </div>

              <div class="tr-box">
                <div v-for="b in portfolioRows" :key="b.symbol" class="tr-row">
                  <span>{{ b.symbol }}</span>
                  <span class="tr-row-val">
                    {{ formatAmount(b.amount) }}
                    <span v-if="b.usd !== null" class="tr-row-usd">${{ b.usd }}</span>
                  </span>
                </div>
                <div v-if="!portfolioRows.length" class="tr-row tr-row--empty">
                  <span>{{ $t('trader.history_empty') }}</span>
                </div>
                <div class="tr-row tr-row--total">
                  <span>{{ $t('trader.total_label') }}</span>
                  <span class="tr-total-val">${{ portfolioTotalUsd }}</span>
                </div>
              </div>
            </div>

            <!-- ── Yield ── -->
            <div class="tr-field">
              <div class="tr-field-label">{{ $t('trader.yield_label') }}</div>
              <p class="tr-field-desc">{{ $t('trader.yield_desc') }}</p>
              <p class="tr-provider-note">
                {{ $t('trader.yield_provider_note') }}
                <a :href="'https://polygonscan.com/address/' + AAVE_POOL_ADDRESS" target="_blank" rel="noopener noreferrer"><code>{{ AAVE_POOL_ADDRESS }}</code></a>
              </p>
              <div class="tr-box">
                <div v-for="p in yieldPositions" :key="p.symbol" class="tr-row">
                  <span class="tr-row-left">
                    <span>Aave · {{ p.symbol }}</span>
                    <span class="tr-row-apy">{{ p.apy }}% APY</span>
                  </span>
                  <span class="tr-row-val">{{ formatAmount(p.deposited) }} {{ p.symbol }}</span>
                </div>
                <div v-if="!yieldHasPositions" class="tr-row tr-row--empty">
                  <span>{{ $t('trader.yield_empty_title') }}</span>
                </div>
              </div>
              <div class="tr-actions-row">
                <button class="tr-btn-ghost tr-btn-ghost--accent" :disabled="yieldBusy" @click="openYieldForm('supply')">{{ $t('trader.yield_deposit_btn') }}</button>
                <button class="tr-btn-ghost tr-btn-ghost--accent" :disabled="yieldBusy" @click="openYieldForm('withdraw')">{{ $t('trader.yield_withdraw_btn') }}</button>
              </div>
              <div v-if="yieldFormMode" class="tr-bet-panel">
                <div class="tr-micro-label">{{ yieldFormMode === 'supply' ? $t('trader.yield_deposit_btn') : $t('trader.yield_withdraw_btn') }}</div>
                <div class="tr-toggle-row">
                  <button v-for="a in yieldAssetOptions" :key="a" type="button" class="tr-btn-ghost tr-btn-fill" :class="{ 'tr-btn-active': yieldFormAsset === a }" @click="yieldFormAsset = a">{{ a }}</button>
                </div>
                <div class="tr-input-row tr-input-row--field">
                  <label for="tr-yield-amount">{{ $t('trader.stake_label') }}</label>
                  <input id="tr-yield-amount" v-model="yieldFormAmount" type="text" inputmode="decimal" class="tr-stake-input" placeholder="0.00" />
                </div>
                <button class="tr-btn-primary" :disabled="yieldBusy || !yieldFormAmount.trim()" @click="submitYieldForm">
                  {{ yieldBusy ? '…' : (yieldFormMode === 'supply' ? $t('trader.yield_deposit_btn') : $t('trader.yield_withdraw_btn')) }}
                </button>
                <p v-if="yieldFormError" class="tr-error">{{ yieldFormError }}</p>
              </div>
            </div>

            <!-- ── Sicherheit ── -->
            <div class="tr-field">
              <div class="tr-field-label">{{ $t('trader.safety_label') }}</div>
              <div class="tr-box">
                <div class="tr-row">
                  <span>{{ $t('trader.daily_limit_label') }}</span>
                  <span v-if="editingLimit === false" class="tr-row-val tr-safety-clickable" @click="startEditLimit">
                    {{ formatAmount(dailyUsedUsd) }} / {{ formatAmount(dailyLimitUsd) }} USD
                  </span>
                  <span v-else class="tr-safety-edit">
                    <input v-model="dailyLimitDraft" type="text" inputmode="decimal" class="tr-stake-input" />
                    <button type="button" class="tr-btn-ghost tr-btn-sm" :disabled="safetyBusy" @click="saveDailyLimit">✓</button>
                  </span>
                </div>
                <div class="tr-row">
                  <span>{{ $t('trader.allowed_tokens_label') }}</span>
                  <span class="tr-token-chips">
                    <button v-for="sym in yieldAssetOptions" :key="sym" type="button" class="tr-chip" :class="{ 'tr-chip--on': allowedTokens.includes(sym) }" :disabled="safetyBusy" @click="toggleAllowedToken(sym)">{{ sym }}</button>
                  </span>
                </div>
                <div class="tr-row">
                  <span>{{ $t('trader.kill_switch_label') }}</span>
                  <span class="tr-kill-right">
                    <span :class="killSwitchActive ? 'tr-no' : 'tr-yes'">{{ killSwitchActive ? 'Gestoppt' : 'Aktiv' }}</span>
                    <button type="button" class="tr-btn-ghost tr-btn-sm" :class="{ 'tr-btn-ghost--accent': killSwitchActive, 'tr-btn-ghost--danger': !killSwitchActive }" :disabled="safetyBusy" @click="toggleKillSwitch">
                      {{ killSwitchActive ? 'Reaktivieren' : 'Stoppen' }}
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <!-- ── Letzte Aktionen ── -->
            <div class="tr-field tr-field--last">
              <div class="tr-field-label">{{ $t('trader.history_label') }}</div>
              <p class="tr-field-desc">{{ $t('trader.history_desc') }}</p>

              <div v-if="actions.length" class="tr-table-wrap">
                <div class="tr-table">
                  <div class="tr-table-head">
                    <span>{{ $t('trader.col_action') }}</span>
                    <span>{{ $t('trader.col_date') }}</span>
                    <span>{{ $t('trader.col_amount') }}</span>
                    <span>{{ $t('trader.col_value') }}</span>
                    <span>{{ $t('trader.col_status') }}</span>
                  </div>
                  <div v-for="a in actions" :key="a.id" class="tr-table-row">
                    <span>{{ a.action }}</span>
                    <span>{{ formatDate(a.date) }}</span>
                    <span>{{ a.amount }}</span>
                    <span class="tr-table-value">{{ a.eur }}&nbsp;€</span>
                    <span class="tr-status-ok">{{ a.status }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="tr-empty">
                <p>{{ $t('trader.history_empty') }}</p>
              </div>

              <div v-if="actions.length" class="tr-export">
                <div>
                  <div class="tr-export-title">{{ $t('trader.export_title') }}</div>
                  <div class="tr-export-sub">{{ $t('trader.export_sub') }}</div>
                </div>
                <button class="tr-btn-ghost" @click="exportCSV">{{ $t('trader.btn_export_csv') }}</button>
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
// Aave V3 Pool auf Polygon — live gegen den echten Vertrag verifiziert,
// siehe soul-mcp/lib/aave_client.mjs. Hier verlinkt, damit man den Vertrag
// selbst auf Polygonscan gegenchecken kann statt uns blind zu vertrauen.
const AAVE_POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { monetizationEnabled, fetchNodeStatus } = useNodeStatus()
onMounted(() => {
  fetchNodeStatus()
  loadWalletData()
  loadYield()
  loadHistory()
  loadSafety()
})

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', transfer:'/transfer', export:'/export', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', gatekeeper:'/gatekeeper', wallet:'/wallet', agent:'/agent', impressum:'/impressum', datenschutz:'/datenschutz', lizenz:'/lizenz', apps:'/apps', kunstwerke:'/kunstwerke' }
  if (id === 'trader') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}

// ── Portfolio ────────────────────────────────────────────────────────────
// Gleiche Datenquelle wie wallet.vue: das per-Soul x402-Test-Wallet
// (soul-mcp/lib/x402_client.mjs) — dieselben echten Balances/Preise,
// keine zweite Quelle der Wahrheit für "welches Guthaben hat die Soul".
const x402Address  = ref('')
const x402Balances = ref(null) // [{ symbol, amount, coingeckoId }]
const x402Prices   = ref(null) // { [coingeckoId]: { usd } }

async function loadWalletData() {
  try {
    const h = { Authorization: `Bearer ${soulToken.value}` }
    const [statusRes, balRes] = await Promise.all([
      fetch('/api/x402/agent/status', { headers: h }).catch(() => null),
      fetch('/api/x402/agent/balances', { headers: h }).catch(() => null),
    ])
    if (statusRes?.ok) {
      const d = await statusRes.json()
      x402Address.value = d.address || ''
    }
    if (balRes?.ok) {
      const d = await balRes.json()
      if (d.ok) { x402Balances.value = d.balances; x402Prices.value = d.prices }
    }
  } catch { /* silent — Portfolio zeigt dann den leeren Zustand */ }
}

function formatAmount(amountStr) {
  const n = Number(amountStr)
  if (!isFinite(n)) return amountStr
  return n.toFixed(n >= 1 ? 4 : 6).replace(/\.?0+$/, '')
}

const portfolioRows = computed(() => {
  if (!x402Balances.value) return []
  return x402Balances.value.map(b => {
    const price = x402Prices.value?.[b.coingeckoId]?.usd
    return { ...b, usd: price != null ? (Number(b.amount) * price).toFixed(2) : null }
  })
})
const portfolioTotalUsd = computed(() => {
  const sum = portfolioRows.value.reduce((acc, b) => acc + (b.usd !== null ? Number(b.usd) : 0), 0)
  return sum.toFixed(2)
})

// ── Yield (Aave) ─────────────────────────────────────────────────────────
const yieldPositions  = ref([]) // [{ symbol, deposited, apy, ... }]
const yieldFormMode   = ref(null) // 'supply' | 'withdraw' | null
const yieldFormAsset  = ref('USDC')
const yieldFormAmount = ref('')
const yieldBusy       = ref(false)
const yieldFormError  = ref('')
const yieldAssetOptions = ['USDC', 'WETH', 'USDT0']
const yieldHasPositions = computed(() => yieldPositions.value.some(p => Number(p.deposited) > 0))

async function loadYield() {
  try {
    const r = await fetch('/api/trader/yield/positions', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) yieldPositions.value = d.positions
  } catch { /* silent — Box zeigt dann den leeren Zustand */ }
}

function openYieldForm(mode) {
  yieldFormMode.value  = yieldFormMode.value === mode ? null : mode
  yieldFormError.value = ''
  yieldFormAmount.value = ''
}

async function submitYieldForm() {
  yieldBusy.value = true
  yieldFormError.value = ''
  try {
    const endpoint = yieldFormMode.value === 'supply' ? '/api/trader/yield/supply' : '/api/trader/yield/withdraw'
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ symbol: yieldFormAsset.value, amount: yieldFormAmount.value.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      yieldFormMode.value = null
      yieldFormAmount.value = ''
      await Promise.all([loadYield(), loadHistory(), loadWalletData(), loadSafety()])
    } else {
      yieldFormError.value = d.message || d.error || `Error ${r.status}`
    }
  } catch (e) {
    yieldFormError.value = e.message
  }
  yieldBusy.value = false
}

// ── Sicherheit (Notfall-Stopp/Tageslimit/erlaubte Token) ────────────────
// Durchgesetzt wird das serverseitig VOR jeder Yield-Aktion (siehe
// soul-mcp/lib/trader_config.mjs) — hier nur Anzeige/Verwaltung.
const killSwitchActive = ref(false)
const dailyLimitUsd    = ref(50)
const dailyUsedUsd     = ref(0)
const allowedTokens    = ref([])
const safetyBusy       = ref(false)
const editingLimit     = ref(false)
const dailyLimitDraft  = ref('')

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

// ── Letzte Aktionen ──────────────────────────────────────────────────────
// Reale Historie aus soul-mcp/lib/trader_history.mjs — jede erfolgreiche
// Yield-/Wette-Aktion schreibt dort einen Eintrag inkl. USD-Wert zum
// Zeitpunkt der Aktion (siehe server.mjs usdValueAtNow()).
const actions = ref([])

async function loadHistory() {
  try {
    const r = await fetch('/api/trader/history', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) actions.value = d.history
  } catch { /* silent */ }
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function exportCSV() {
  const rows = [[t('trader.col_action'), t('trader.col_date'), t('trader.col_amount'), t('trader.col_value'), t('trader.col_status')]]
  for (const a of actions.value) rows.push([a.action, a.date, a.amount, a.eur, a.status])
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `sys-trader-${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
</script>

<style scoped>
/* Eigene, kontraststarke Rahmenfarbe statt var(--line)/var(--line-2):
   beide liegen im Dark-Theme bei rgba(236,236,236,0.07/0.12) auf
   #000000-Grund — das misst 1.1:1 bzw. 1.2:1, weit unter den 3:1, die
   WCAG 2.2 SC 1.4.11 für UI-Komponenten-Ränder verlangt (am Penpot-Mockup
   exakt so geprüft und gefixt). Nicht in sys-v2.css selbst behoben --
   das ist eine app-weit geteilte Datei, ein Fix dort bräuchte eigenes
   Testen gegen jeden bestehenden Verbraucher. Seiten-lokaler Token place-
   scoped wie schon bei .wa-btn-ghost auf wallet.vue. */
.tr-page {
  --tr-line: rgba(236,236,236,0.45);
}
:root[data-theme="light"] .tr-page {
  --tr-line: rgba(20,18,14,0.5);
}

.tr-page { max-width: 860px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; display: flex; flex-direction: column; gap: 32px; }

/* ── Head ── */
.tr-head { padding-bottom: 24px; border-bottom: 1px solid var(--tr-line); }
.tr-eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; margin-bottom: 10px; }
.tr-title { font-family: var(--serif); font-size: clamp(28px, 4vw, 42px); font-weight: 400; letter-spacing: -0.03em; color: var(--fg); margin: 0 0 12px; }
.tr-title em { font-style: italic; color: var(--accent); }
.tr-motto { font-family: var(--serif); font-style: italic; font-size: 17px; color: var(--accent); opacity: 0.85; margin: 0; }
.tr-motto b { font-weight: 700; }

/* ── Field shell ── */
.tr-field { display: flex; flex-direction: column; gap: 10px; }
.tr-field--last { margin-bottom: 0; }
.tr-field-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg); font-weight: 600; }
.tr-field-desc { font-size: 15px; line-height: 1.65; color: var(--fg); max-width: 640px; margin: 0; }
.tr-provider-note { font-size: 13px; color: var(--fg); margin: 0; }
.tr-provider-note a { color: var(--accent); text-decoration: none; }
.tr-provider-note a:hover { text-decoration: underline; }
.tr-provider-note code { font-family: var(--mono); font-size: 12px; }

/* ── Wallet-Link Banner ── */
.tr-wallet-link {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 12px; border-radius: var(--r-xs); background: rgba(236,236,236,0.03);
  font-size: 13px; flex-wrap: wrap;
}
.tr-wl-left { display: flex; align-items: center; gap: 6px; color: var(--fg); flex-wrap: wrap; }
.tr-wl-left code { font-family: var(--mono); color: var(--fg); }
.tr-wl-dim { color: var(--fg); }
.tr-wl-open {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 6px 4px; color: var(--accent); font-weight: 600; text-decoration: none;
}
.tr-wl-open:hover { color: var(--accent-bright); text-decoration: underline; }

/* ── Box / Row (Portfolio) ── */
.tr-box { border: 1px solid var(--tr-line); border-radius: var(--r-xs); overflow: hidden; }
.tr-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; font-size: 14px; color: var(--fg); border-bottom: 1px solid var(--tr-line); }
.tr-row:last-child { border-bottom: none; }
.tr-row-val { font-family: var(--mono); }
.tr-row-usd { color: var(--fg); font-size: 13px; margin-left: 8px; }
.tr-row--empty { color: var(--fg); font-size: 14px; justify-content: center; }
.tr-row--total { background: rgba(109,184,154,0.06); font-weight: 600; }
.tr-total-val { font-family: var(--mono); color: var(--accent); font-size: 15px; }
.tr-row-left { display: flex; flex-direction: column; gap: 2px; }
.tr-row-apy { font-size: 12px; color: var(--accent); }
.tr-yes { color: var(--accent); font-weight: 600; }
.tr-no { color: var(--sys-err, #E06C75); font-weight: 600; }

/* ── Empty-State-Notiz (Yield) ── */
.tr-empty-note { padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.tr-empty-title { font-size: 14px; font-weight: 600; color: var(--fg); }
.tr-empty-desc { font-size: 13px; color: var(--fg); line-height: 1.55; }

/* ── Buttons ── */
.tr-actions-row { display: flex; gap: 8px; flex-wrap: wrap; }
.tr-btn-ghost {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 18px; border-radius: var(--r-xs);
  font-family: var(--sans); font-size: 13px; font-weight: 600;
  cursor: pointer; border: 1px solid var(--tr-line); background: transparent; color: var(--fg);
  transition: all 0.15s;
}
.tr-btn-ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.tr-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.tr-btn-ghost--accent { border-color: var(--accent); color: var(--accent); }
.tr-btn-ghost--accent:hover:not(:disabled) { background: rgba(109,184,154,0.10); }
.tr-btn-ghost--danger { border-color: var(--sys-err, #E06C75); color: var(--sys-err, #E06C75); }
.tr-btn-ghost--danger:hover:not(:disabled) { background: rgba(224,108,117,0.10); border-color: var(--sys-err, #E06C75); color: var(--sys-err, #E06C75); }
.tr-btn-fill { flex: 1; }
.tr-btn-primary {
  width: 100%; height: 46px; border-radius: var(--r-xs); border: none;
  background: var(--accent); color: var(--on-accent);
  font-family: var(--sans); font-size: 14px; font-weight: 600; cursor: pointer;
}
.tr-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Bet-Panel ── */
.tr-bet-panel { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tr-line); border-radius: var(--r-xs); background: rgba(236,236,236,0.02); }
.tr-micro-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg); }
.tr-input-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px; border-radius: var(--r-xs); background: rgba(236,236,236,0.04);
  font-size: 13px; color: var(--fg);
}
.tr-input-row label { color: var(--fg); }
.tr-toggle-row { display: flex; gap: 8px; }
.tr-stake-input {
  width: 100px; text-align: right; background: none; border: none; color: var(--fg);
  font-family: var(--mono); font-size: 13px; padding: 0;
}
.tr-stake-input:disabled { opacity: 0.7; cursor: not-allowed; }
.tr-btn-active { border-color: var(--accent); color: var(--accent); background: rgba(109,184,154,0.10); }
.tr-error { font-size: 12px; color: var(--sys-err, #E06C75); line-height: 1.5; margin: 0; }

/* ── Sicherheit ── */
.tr-safety-clickable { cursor: pointer; font-family: var(--mono); }
.tr-safety-clickable:hover { color: var(--accent); }
.tr-safety-edit { display: flex; align-items: center; gap: 8px; }
.tr-btn-sm { height: 28px; padding: 0 10px; font-size: 12px; }
.tr-token-chips { display: flex; gap: 6px; }
.tr-chip {
  padding: 4px 12px; border-radius: 999px; border: 1px solid var(--tr-line);
  background: transparent; color: var(--fg); font-family: var(--sans); font-size: 12px;
  font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.tr-chip:disabled { cursor: not-allowed; opacity: 0.6; }
.tr-chip--on { background: rgba(109,184,154,0.10); border-color: var(--accent); color: var(--accent); }
.tr-kill-right { display: flex; align-items: center; gap: 10px; }

/* ── Tabelle (Letzte Aktionen), Muster analog earnings.vue ── */
.tr-table-wrap { overflow-x: auto; }
.tr-table { border: 1px solid var(--tr-line); border-radius: var(--r-xs); overflow: hidden; min-width: 640px; }
.tr-table-head, .tr-table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 12px; padding: 10px 14px; }
.tr-table-head { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg); background: rgba(236,236,236,0.04); border-bottom: 1px solid var(--tr-line); }
.tr-table-row { font-size: 13px; color: var(--fg); border-bottom: 1px solid var(--tr-line); }
.tr-table-row:last-child { border-bottom: none; }
.tr-table-value { color: var(--fg); }
.tr-status-ok { color: var(--accent); }

.tr-empty { padding: 24px; border: 1px solid var(--tr-line); border-radius: var(--r-xs); font-size: 15px; color: var(--fg); text-align: center; }

/* ── CSV Export ── */
.tr-export { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; border: 1px solid var(--tr-line); border-radius: var(--r-xs); flex-wrap: wrap; }
.tr-export-title { font-size: 15px; font-weight: 600; color: var(--fg); margin-bottom: 3px; }
.tr-export-sub { font-size: 13px; color: var(--fg); }

@media (max-width: 640px) {
  .tr-table-head, .tr-table-row { grid-template-columns: 1.5fr 1fr 1fr; }
  .tr-table-head span:nth-child(3), .tr-table-head span:nth-child(4),
  .tr-table-row span:nth-child(3), .tr-table-row span:nth-child(4) { display: none; }
}
</style>
