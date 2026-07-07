<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="earnings" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('common.network'), $t('earnings.crumb')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="earn-page">

            <!-- ── Hero ── -->
            <div class="earn-hero">
              <div class="eyebrow">{{ $t('earnings.eyebrow') }}</div>
              <h1 class="earn-title">Agent <em>{{ $t('earnings.title_em') }}</em></h1>
              <p class="earn-sub">{{ $t('earnings.lede') }}</p>
            </div>

            <!-- ── Status-Schritt ── -->
            <div class="earn-steps">
              <div class="earn-step" :class="{ 'earn-step--on': amort.enabled, 'earn-step--off': !amort.enabled }">
                <div class="earn-step-num">
                  <svg v-if="amort.enabled" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  <span v-else>1</span>
                </div>
                <div class="earn-step-lbl">
                  <span class="earn-step-t">{{ $t('earnings.step_access') }}</span>
                  <span class="earn-step-s">{{ amort.enabled ? $t('earnings.step_access_paid', { pol: displayPrice }) : $t('earnings.step_access_free') }}</span>
                </div>
                <button class="btn btn-sm btn-ghost" @click="onNav('market')">{{ $t('earnings.btn_configure') }}</button>
              </div>
            </div>

            <!-- ── Stat-Kacheln ── -->
            <div class="earn-stats">
              <div class="earn-stat">
                <div class="earn-stat-label">{{ $t('earnings.stat_status') }}</div>
                <div class="earn-stat-value" :class="amort.enabled ? 'earn-stat--on' : 'earn-stat--off'">
                  <span class="earn-dot" />
                  {{ amort.enabled ? $t('earnings.stat_active') : $t('earnings.stat_inactive') }}
                </div>
                <div v-if="amort.enabled && amort.wallet" class="earn-stat-sub">
                  {{ amort.wallet.slice(0,6) }}…{{ amort.wallet.slice(-4) }}
                </div>
              </div>
              <div class="earn-stat">
                <div class="earn-stat-label">{{ $t('earnings.stat_price') }}</div>
                <div class="earn-stat-value">
                  {{ amort.enabled ? displayPrice + ' POL' : '—' }}
                  <span v-if="amort.dynamic_pricing" class="earn-stat-dynamic">dynamic</span>
                </div>
              </div>
              <div class="earn-stat">
                <div class="earn-stat-label">{{ $t('earnings.stat_total_requests') }}</div>
                <div class="earn-stat-value">{{ earnings.total_requests }}</div>
              </div>
              <div class="earn-stat">
                <div class="earn-stat-label">{{ $t('earnings.stat_total_earnings') }}</div>
                <div class="earn-stat-value earn-stat--pol">{{ parseFloat(earnings.total_pol || 0).toFixed(6) }} POL</div>
              </div>
            </div>

            <!-- ── Restore-Banner ── -->
            <div v-if="earnings.restored_from" class="earn-restored-banner">
              {{ $t('earnings.restored_banner_1') }} <strong>vault/context/income.md</strong> {{ $t('earnings.restored_banner_2') }}
            </div>

            <!-- ── TX-Tabelle ── -->
            <div class="earn-table-wrap">
              <div v-if="sortedEntries.length" class="earn-table">
                <div class="earn-table-head">
                  <span>{{ $t('earnings.col_tx') }}</span>
                  <span>{{ $t('earnings.col_from') }}</span>
                  <span>{{ $t('earnings.col_amount') }}</span>
                  <span>{{ $t('earnings.col_period') }}</span>
                  <span>{{ $t('earnings.col_status') }}</span>
                </div>
                <div v-for="e in sortedEntries" :key="e.tx_hash" class="earn-table-row">
                  <span class="earn-tx-hash">
                    <a :href="`https://polygonscan.com/tx/${e.tx_hash}`" target="_blank" rel="noopener" class="earn-tx-link">
                      {{ e.tx_hash.slice(0, 8) }}…{{ e.tx_hash.slice(-6) }}
                    </a>
                  </span>
                  <span class="earn-tx-from">{{ e.from ? e.from.slice(0,6) + '…' + e.from.slice(-4) : '—' }}</span>
                  <span class="earn-tx-pol">{{ e.pol_amount }} POL</span>
                  <span class="earn-tx-date">{{ formatPeriod(e.redeemed_at) }}</span>
                  <span class="earn-tx-status" :class="isActive(e) ? 'earn-status--on' : 'earn-status--off'">
                    {{ isActive(e) ? $t('earnings.status_active') : $t('earnings.status_expired') }}
                  </span>
                </div>
              </div>
              <div v-else class="earn-empty">
                <p>{{ amort.enabled ? $t('earnings.empty_enabled') : $t('earnings.empty_disabled') }}</p>
                <button v-if="!amort.enabled" class="btn btn-primary" @click="onNav('market')" style="margin-top:12px">{{ $t('earnings.btn_to_marketplace') }}</button>
              </div>
            </div>

            <!-- ── CSV-Export ── -->
            <div v-if="sortedEntries.length" class="earn-export">
              <div>
                <div class="earn-export-title">{{ $t('earnings.export_title') }}</div>
                <div class="earn-export-sub">{{ $t('earnings.export_sub') }}</div>
              </div>
              <button class="btn btn-ghost" @click="exportCSV">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 12-4-4m4 4 4-4M4 19h16"/>
                </svg>
                {{ $t('earnings.btn_export_csv') }}
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'

definePageMeta({ layout: false })

const { t } = useI18n()
const router = useRouter()
const { soulMeta, hasSoul, soulToken, isLoaded } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

const amort    = ref({ enabled: false, pol_per_request: '0.001', wallet: '', token_duration_days: 1 })
const earnings = ref({ total_pol: '0', total_requests: 0, entries: [] })
const livePrice = ref(null) // pol_required from /api/soul/price wenn dynamic_pricing

const displayPrice = computed(() =>
  amort.value.dynamic_pricing && livePrice.value
    ? livePrice.value
    : amort.value.pol_per_request
)

const sortedEntries = computed(() =>
  [...(earnings.value.entries || [])].reverse()
)

onMounted(async () => {
  if (!soulToken.value) return
  const h = { Authorization: `Bearer ${soulToken.value}` }
  const [amRes, erRes] = await Promise.all([
    fetch('/api/soul/amortization', { headers: h }).catch(() => null),
    fetch('/api/soul/earnings',     { headers: h }).catch(() => null),
  ])
  if (amRes?.ok) { const d = await amRes.json(); if (d.amortization) amort.value = d.amortization }
  if (erRes?.ok) { const d = await erRes.json(); earnings.value = d }
  if (amort.value.dynamic_pricing && soulMeta.value?.id) {
    const pr = await fetch(`/api/soul/price?soul_id=${soulMeta.value.id}`).catch(() => null)
    if (pr?.ok) { const pd = await pr.json(); if (pd.pol_required) livePrice.value = pd.pol_required }
  }
})

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatPeriod(redeemedAt) {
  if (!redeemedAt) return '—'
  const days   = amort.value.token_duration_days || 1
  const from   = new Date(redeemedAt)
  const to     = new Date(from.getTime() + days * 86400 * 1000)
  const opts   = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
  return from.toLocaleString(undefined, opts) + ' – ' + to.toLocaleString(undefined, opts)
}

function isActive(entry) {
  if (!entry.redeemed_at) return false
  const days = amort.value.token_duration_days || 1
  const expiry = new Date(entry.redeemed_at).getTime() + days * 86400 * 1000
  return expiry > Date.now()
}

function exportCSV() {
  const rows = [[t('earnings.col_tx'), t('earnings.col_from'), t('earnings.csv_pol'), t('earnings.csv_valid_from'), t('earnings.csv_valid_to'), t('earnings.col_status')]]
  for (const e of earnings.value.entries || []) {
    const days   = amort.value.token_duration_days || 1
    const from   = e.redeemed_at || ''
    const to     = from ? new Date(new Date(from).getTime() + days * 86400 * 1000).toISOString() : ''
    rows.push([
      e.tx_hash,
      e.from || '',
      e.pol_amount || '',
      from,
      to,
      isActive(e) ? t('earnings.csv_status_active') : t('earnings.csv_status_expired'),
    ])
  }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `sys-earnings-${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'earnings')  return
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/setup');   return }
  if (id === 'soul')     { router.push('/soul');         return }
  if (id === 'chronik')  { router.push('/chronicle');      return }
  if (id === 'files')    { router.push('/vault');      return }
  if (id === 'maturity') { router.push('/maturity');        return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'calendar') { router.push('/calendar');     return }
  if (id === 'anchor')   { router.push('/anchor');    return }
  if (id === 'export')   { router.push('/export'); return }
  if (id === 'peers')    { router.push('/peers');        return }
  if (id === 'connect')  { router.push('/connection');   return }
  if (id === 'market')   { router.push('/marketplace'); return }
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

.earn-page {
  max-width: 900px; margin: 0 auto;
  padding: 36px clamp(22px, 4vw, 42px) 88px;
  display: flex; flex-direction: column; gap: 32px;
}

/* ── Hero ── */
.earn-hero { padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.earn-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg); margin: 8px 0 12px;
}
.earn-title em { font-style: italic; color: var(--accent); }
.earn-sub { font-size: 17px; line-height: 1.65; color: var(--fg); margin: 0; max-width: 560px; }

/* ── Step ── */
.earn-steps { display: flex; flex-direction: column; gap: 8px; }
.earn-step {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; border-radius: var(--r);
  border: 1px solid var(--line); background: var(--surface);
}
.earn-step--on  { border-color: rgba(109,184,154,0.35); background: rgba(109,184,154,0.06); }
.earn-step--off { opacity: 0.7; }
.earn-step-num {
  width: 24px; height: 24px; border-radius: 50%; flex: none;
  border: 1.5px solid var(--line-2); display: grid; place-items: center;
  font-family: var(--mono); font-size: 14px; color: var(--fg-2);
}
.earn-step--on .earn-step-num { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.earn-step-lbl { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.earn-step-t { font-family: var(--mono); font-size: 15px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg); }
.earn-step-s { font-family: var(--mono); font-size: 14px; color: var(--fg-2); }
.earn-step--on .earn-step-s { color: var(--accent); }

/* ── Stats ── */
.earn-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.earn-stat {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: 16px 18px;
  display: flex; flex-direction: column; gap: 6px;
}
.earn-stat-label {
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--fg-2);
}
.earn-stat-value {
  font-family: var(--serif); font-size: 20px; font-weight: 400;
  color: var(--fg); letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px;
}
.earn-stat--on  { color: var(--accent); }
.earn-stat--off { color: var(--fg); font-size: 17px; font-family: var(--sans); }
.earn-stat--pol { color: var(--accent-bright); }
.earn-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: currentColor; }
.earn-stat-sub { font-family: var(--mono); font-size: 14px; color: var(--fg-2); }
.earn-stat-dynamic { font-size: 12px; font-family: var(--mono); color: var(--fg-2); background: var(--bg-2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: middle; }

/* ── Table ── */
.earn-table-wrap { }
.earn-table { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
.earn-table-head {
  display: grid; grid-template-columns: 2fr 2fr 1.2fr 2fr 1.4fr;
  padding: 10px 18px;
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-2);
  border-bottom: 1px solid var(--line); background: var(--surface-2);
}
.earn-table-row {
  display: grid; grid-template-columns: 2fr 2fr 1.2fr 2fr 1.4fr;
  padding: 12px 18px; border-bottom: 1px solid var(--line);
  font-size: 15px; color: var(--fg); align-items: center;
  transition: background 0.12s;
}
.earn-table-row:last-child { border-bottom: none; }
.earn-table-row:hover { background: var(--surface-2); }
.earn-tx-hash { font-family: var(--mono); }
.earn-tx-link { color: var(--accent); text-decoration: none; }
.earn-tx-link:hover { color: var(--accent-bright); text-decoration: underline; }
.earn-tx-from { font-family: var(--mono); color: var(--fg-2); }
.earn-tx-pol  { font-family: var(--mono); color: var(--accent-bright); font-weight: 600; }
.earn-tx-date { font-family: var(--mono); color: var(--fg-2); }
.earn-tx-status { font-family: var(--mono); font-size: 14px; }
.earn-status--on  { color: var(--accent); }
.earn-status--off { color: var(--fg-3); }

.earn-empty {
  padding: 32px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
  font-size: 17px; color: var(--fg); line-height: 1.65;
}

/* ── Restore Banner ── */
.earn-restored-banner {
  padding: 10px 16px; background: rgba(109,184,154,0.10); border: 1px solid rgba(109,184,154,0.25);
  border-radius: var(--r); font-size: 15px; color: var(--fg); margin-bottom: 4px;
}

/* ── CSV Export ── */
.earn-export {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 20px 24px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); flex-wrap: wrap;
}
.earn-export-title { font-size: 17px; font-weight: 500; color: var(--fg); margin-bottom: 4px; }
.earn-export-sub { font-size: 15px; color: var(--fg); line-height: 1.5; max-width: 500px; }

@media (max-width: 720px) {
  .earn-stats { grid-template-columns: 1fr 1fr; }
  .earn-table-head, .earn-table-row { grid-template-columns: 2fr 1.2fr 1.4fr 1.4fr; }
  .earn-tx-from { display: none; }
}
@media (max-width: 480px) {
  .earn-stats { grid-template-columns: 1fr 1fr; }
  .earn-table-head, .earn-table-row { grid-template-columns: 2fr 1fr 1.2fr; }
  .earn-tx-from, .earn-tx-date { display: none; }
}
</style>
