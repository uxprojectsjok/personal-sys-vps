<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="earnings" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Netzwerk', 'Einnahmen']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="earn-page">

            <!-- ── Hero ── -->
            <div class="earn-hero">
              <div class="eyebrow">Agent Commerce Protocol</div>
              <h1 class="earn-title">Agent <em>Einnahmen</em></h1>
              <p class="earn-sub">Jeder Zugriff externer KI-Agenten auf deine Soul wird on-chain verifiziert. Hier siehst du alle Transaktionen, Einnahmen und den Status deiner Freigabe.</p>
            </div>

            <!-- ── Status-Schritt ── -->
            <div class="earn-steps">
              <div class="earn-step" :class="{ 'earn-step--on': amort.enabled, 'earn-step--off': !amort.enabled }">
                <div class="earn-step-num">
                  <svg v-if="amort.enabled" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  <span v-else>1</span>
                </div>
                <div class="earn-step-lbl">
                  <span class="earn-step-t">Zugang</span>
                  <span class="earn-step-s">{{ amort.enabled ? 'Bezahlt · ' + amort.pol_per_request + ' POL' : 'Frei oder bezahlt' }}</span>
                </div>
                <button class="btn btn-sm btn-ghost" @click="onNav('market')">Konfigurieren</button>
              </div>
            </div>

            <!-- ── Stat-Kacheln ── -->
            <div class="earn-stats">
              <div class="earn-stat">
                <div class="earn-stat-label">Status</div>
                <div class="earn-stat-value" :class="amort.enabled ? 'earn-stat--on' : 'earn-stat--off'">
                  <span class="earn-dot" />
                  {{ amort.enabled ? 'Aktiv' : 'Inaktiv' }}
                </div>
                <div v-if="amort.enabled && amort.wallet" class="earn-stat-sub">
                  {{ amort.wallet.slice(0,6) }}…{{ amort.wallet.slice(-4) }}
                </div>
              </div>
              <div class="earn-stat">
                <div class="earn-stat-label">Preis pro Zugriff</div>
                <div class="earn-stat-value">{{ amort.enabled ? amort.pol_per_request + ' POL' : '—' }}</div>
              </div>
              <div class="earn-stat">
                <div class="earn-stat-label">Zugriffe gesamt</div>
                <div class="earn-stat-value">{{ earnings.total_requests }}</div>
              </div>
              <div class="earn-stat">
                <div class="earn-stat-label">Einnahmen gesamt</div>
                <div class="earn-stat-value earn-stat--pol">{{ parseFloat(earnings.total_pol || 0).toFixed(6) }} POL</div>
              </div>
            </div>

            <!-- ── TX-Tabelle ── -->
            <div class="earn-table-wrap">
              <div v-if="sortedEntries.length" class="earn-table">
                <div class="earn-table-head">
                  <span>TX-Hash</span>
                  <span>Von (Wallet)</span>
                  <span>Betrag</span>
                  <span>Zeitraum</span>
                  <span>Status</span>
                </div>
                <div v-for="e in sortedEntries" :key="e.tx_hash" class="earn-table-row">
                  <span class="earn-tx-hash">
                    <a :href="`https://polygonscan.com/tx/${e.tx_hash}`" target="_blank" rel="noopener" class="earn-tx-link">
                      {{ e.tx_hash.slice(0, 8) }}…{{ e.tx_hash.slice(-6) }}
                    </a>
                  </span>
                  <span class="earn-tx-from">{{ e.from ? e.from.slice(0,6) + '…' + e.from.slice(-4) : '—' }}</span>
                  <span class="earn-tx-pol">{{ e.pol_amount }} POL</span>
                  <span class="earn-tx-date">{{ formatDate(e.redeemed_at) }}</span>
                  <span class="earn-tx-status" :class="isActive(e) ? 'earn-status--on' : 'earn-status--off'">
                    {{ isActive(e) ? '● Aktiv' : '○ Abgelaufen' }}
                  </span>
                </div>
              </div>
              <div v-else class="earn-empty">
                <p>{{ amort.enabled ? 'Noch keine Zugriffe. Agenten finden deine Soul über soul_discover und greifen per soul_pay_read zu.' : 'Agent-Zugriff ist noch nicht aktiviert. Konfiguriere deinen Zugang im Marketplace.' }}</p>
                <button v-if="!amort.enabled" class="btn btn-primary" @click="onNav('market')" style="margin-top:12px">Zum Marketplace</button>
              </div>
            </div>

            <!-- ── CSV-Export ── -->
            <div v-if="sortedEntries.length" class="earn-export">
              <div>
                <div class="earn-export-title">Steuer-Export</div>
                <div class="earn-export-sub">Alle Einnahmen als CSV — enthält TX-Hash, Wallet, POL-Betrag, Datum. Geeignet für die Steuererklärung.</div>
              </div>
              <button class="btn btn-ghost" @click="exportCSV">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 12-4-4m4 4 4-4M4 19h16"/>
                </svg>
                CSV exportieren
              </button>
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Einnahmen lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'

definePageMeta({ layout: false })

const router = useRouter()
const { soulMeta, hasSoul, soulToken } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

const amort    = ref({ enabled: false, pol_per_request: '0.001', wallet: '', token_duration_days: 1 })
const earnings = ref({ total_pol: '0', total_requests: 0, entries: [] })

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
})

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function isActive(entry) {
  if (!entry.redeemed_at) return false
  const days = amort.value.token_duration_days || 1
  const expiry = new Date(entry.redeemed_at).getTime() + days * 86400 * 1000
  return expiry > Date.now()
}

function exportCSV() {
  const rows = [['TX-Hash', 'Von (Wallet)', 'POL-Betrag', 'Datum (UTC)', 'Status']]
  for (const e of earnings.value.entries || []) {
    rows.push([
      e.tx_hash,
      e.from || '',
      e.pol_amount || '',
      e.redeemed_at || '',
      isActive(e) ? 'Aktiv' : 'Abgelaufen',
    ])
  }
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `sys-einnahmen-${new Date().toISOString().slice(0,10)}.csv`
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
  if (id === 'setup')    { router.push('/einrichten');   return }
  if (id === 'soul')     { router.push('/soul');         return }
  if (id === 'chronik')  { router.push('/chronik');      return }
  if (id === 'files')    { router.push('/dateien');      return }
  if (id === 'maturity') { router.push('/reife');        return }
  if (id === 'calendar') { router.push('/kalender');     return }
  if (id === 'anchor')   { router.push('/verankern');    return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'peers')    { router.push('/peers');        return }
  if (id === 'connect')  { router.push('/verbindung');   return }
  if (id === 'market')   { router.push('/marketplace'); return }
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

.earn-page {
  max-width: 900px; margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
  display: flex; flex-direction: column; gap: 32px;
}

/* ── Hero ── */
.earn-hero { padding-bottom: 24px; border-bottom: 1px solid var(--line); }
.earn-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg); margin: 8px 0 12px;
}
.earn-title em { font-style: italic; color: var(--accent); }
.earn-sub { font-size: 15px; line-height: 1.65; color: var(--fg); margin: 0; max-width: 560px; }

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
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
}
.earn-step--on .earn-step-num { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.earn-step-lbl { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.earn-step-t { font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg); }
.earn-step-s { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }
.earn-step--on .earn-step-s { color: var(--accent); }

/* ── Stats ── */
.earn-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.earn-stat {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: 16px 18px;
  display: flex; flex-direction: column; gap: 6px;
}
.earn-stat-label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-3);
}
.earn-stat-value {
  font-family: var(--serif); font-size: 20px; font-weight: 400;
  color: var(--fg); letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px;
}
.earn-stat--on  { color: var(--accent); }
.earn-stat--off { color: var(--fg-3); font-size: 15px; font-family: var(--sans); }
.earn-stat--pol { color: var(--accent-bright); }
.earn-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: currentColor; }
.earn-stat-sub { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }

/* ── Table ── */
.earn-table-wrap { }
.earn-table { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; }
.earn-table-head {
  display: grid; grid-template-columns: 2fr 2fr 1.2fr 2fr 1.4fr;
  padding: 10px 18px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3);
  border-bottom: 1px solid var(--line); background: var(--surface-2);
}
.earn-table-row {
  display: grid; grid-template-columns: 2fr 2fr 1.2fr 2fr 1.4fr;
  padding: 12px 18px; border-bottom: 1px solid var(--line);
  font-size: 13px; color: var(--fg-2); align-items: center;
  transition: background 0.12s;
}
.earn-table-row:last-child { border-bottom: none; }
.earn-table-row:hover { background: var(--surface-2); }
.earn-tx-hash { font-family: var(--mono); }
.earn-tx-link { color: var(--accent); text-decoration: none; }
.earn-tx-link:hover { color: var(--accent-bright); text-decoration: underline; }
.earn-tx-from { font-family: var(--mono); color: var(--fg-3); }
.earn-tx-pol  { font-family: var(--mono); color: var(--accent-bright); font-weight: 600; }
.earn-tx-date { font-family: var(--mono); color: var(--fg-3); }
.earn-tx-status { font-family: var(--mono); font-size: 12px; }
.earn-status--on  { color: var(--accent); }
.earn-status--off { color: var(--fg-4); }

.earn-empty {
  padding: 32px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
  font-size: 15px; color: var(--fg-2); line-height: 1.65;
}

/* ── CSV Export ── */
.earn-export {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 20px 24px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); flex-wrap: wrap;
}
.earn-export-title { font-size: 15px; font-weight: 500; color: var(--fg); margin-bottom: 4px; }
.earn-export-sub { font-size: 13px; color: var(--fg-2); line-height: 1.5; max-width: 500px; }

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
