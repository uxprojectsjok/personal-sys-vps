<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="connect" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Netzwerk', 'Verbindung']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page cn-page">

            <!-- ── Header ── -->
            <div class="cn-head">
              <div class="eyebrow">QR-CONNECT</div>
              <h1 class="cn-title">Verbindung <em>freigeben</em></h1>
              <p class="cn-lede">Teile deinen MCP-Endpoint per QR-Code. Jemand scannt, du bestätigst per Tap — und erhältst eine erste verifizierte Verbindung.</p>
            </div>

            <!-- ── Action card ── -->
            <div class="cn-action-card">
              <div class="cn-action-left">
                <div class="cn-action-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5ZM13.5 14.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125v-2.25ZM18.375 14.625c0-.621.504-1.125 1.125-1.125h.75c.621 0 1.125.504 1.125 1.125v.75c0 .621-.504 1.125-1.125 1.125h-.75a1.125 1.125 0 0 1-1.125-1.125v-.75ZM13.5 19.875c0-.621.504-1.125 1.125-1.125h.75c.621 0 1.125.504 1.125 1.125v.75c0 .621-.504 1.125-1.125 1.125h-.75a1.125 1.125 0 0 1-1.125-1.125v-.75ZM18.375 19.875c0-.621.504-1.125 1.125-1.125h.75c.621 0 1.125.504 1.125 1.125v.75c0 .621-.504 1.125-1.125 1.125h-.75a1.125 1.125 0 0 1-1.125-1.125v-.75Z"/>
                  </svg>
                </div>
                <div>
                  <div class="cn-action-title">Verbindung freigeben</div>
                  <div class="cn-action-sub">MCP-Endpoint via QR teilen</div>
                </div>
              </div>
              <button
                class="cn-action-btn"
                :class="{ 'cn-action-btn--active': phase === 'active' || phase === 'probed' }"
                :disabled="phase === 'creating' || phase === 'approving'"
                @click="phase === 'idle' ? startSession() : cancelSession()"
              >
                <svg v-if="phase === 'creating' || phase === 'approving'" class="spin cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                <svg v-else-if="phase === 'active' || phase === 'probed'" class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                <svg v-else class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/>
                </svg>
                <span>{{ actionLabel }}</span>
              </button>
            </div>

            <!-- ── Agent-Zugriff Panel ── -->
            <div class="cn-agent-section">
              <div class="cn-agent-head">
                <div>
                  <div class="eyebrow">Agent Commerce Protocol</div>
                  <h2 class="cn-agent-title">Agenten <em>Zugriff</em></h2>
                  <p class="cn-lede" style="margin-top:8px">Externe KI-Agenten können deine Soul gegen POL lesen. Jeder Zugriff wird on-chain verifiziert und hier protokolliert.</p>
                </div>
                <button class="cn-action-btn" @click="onNav('market')">
                  <svg class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                  </svg>
                  <span>Konfigurieren</span>
                </button>
              </div>

              <!-- Status + Einnahmen-Kacheln -->
              <div class="cn-agent-stats">
                <div class="cn-stat-card">
                  <div class="cn-stat-label">Status</div>
                  <div class="cn-stat-value" :class="amort.enabled ? 'cn-stat--on' : 'cn-stat--off'">
                    <span class="cn-stat-dot" />
                    {{ amort.enabled ? 'Aktiv · ' + amort.pol_per_request + ' POL' : 'Inaktiv' }}
                  </div>
                  <div v-if="amort.enabled && amort.wallet" class="cn-stat-sub">{{ amort.wallet.slice(0,6) }}…{{ amort.wallet.slice(-4) }}</div>
                </div>
                <div class="cn-stat-card">
                  <div class="cn-stat-label">Zugriffe gesamt</div>
                  <div class="cn-stat-value">{{ earnings.total_requests }}</div>
                </div>
                <div class="cn-stat-card">
                  <div class="cn-stat-label">Einnahmen</div>
                  <div class="cn-stat-value cn-stat--pol">{{ parseFloat(earnings.total_pol || 0).toFixed(4) }} POL</div>
                </div>
              </div>

              <!-- TX-Log -->
              <div v-if="earnings.entries && earnings.entries.length" class="cn-tx-log">
                <div class="cn-tx-head">
                  <span>TX-Hash</span>
                  <span>Von</span>
                  <span>Betrag</span>
                  <span>Datum</span>
                </div>
                <div v-for="e in [...earnings.entries].reverse().slice(0, 20)" :key="e.tx_hash" class="cn-tx-row">
                  <span class="cn-tx-hash">{{ e.tx_hash.slice(0, 10) }}…</span>
                  <span class="cn-tx-from">{{ e.from ? e.from.slice(0,6) + '…' + e.from.slice(-4) : '—' }}</span>
                  <span class="cn-tx-pol">{{ e.pol_amount }} POL</span>
                  <span class="cn-tx-date">{{ e.redeemed_at ? new Date(e.redeemed_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—' }}</span>
                </div>
              </div>
              <div v-else-if="amort.enabled" class="cn-tx-empty">
                Noch keine Zugriffe. Agenten können deine Soul über soul_discover finden und per soul_pay_read zugreifen.
              </div>
            </div>

            <!-- ── Dual panel (active / probed / done) ── -->
            <Transition name="slide-down">
              <div v-if="phase !== 'idle'" class="cn-dual">

                <!-- Owner panel -->
                <div class="cn-panel cn-panel--owner">
                  <div class="cn-panel-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                    DU · NODE-INHABER
                  </div>

                  <!-- QR code + countdown -->
                  <div v-if="phase === 'active'" class="cn-panel-body cn-qr-body">
                    <canvas ref="qrCanvas" class="cn-qr-canvas" />
                    <div class="cn-countdown">
                      <span class="cn-countdown-num">{{ countdown }}</span>
                      <span class="cn-countdown-label">Sekunden</span>
                    </div>
                    <p class="cn-hint">Zeige diesen QR-Code jemandem zum Scannen</p>
                  </div>

                  <!-- Pending approval -->
                  <div v-else-if="phase === 'probed'" class="cn-panel-body cn-approve-body">
                    <div class="cn-probe-ring">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                      </svg>
                    </div>
                    <div class="cn-probe-title">Jemand scannt gerade</div>
                    <p class="cn-probe-hint">Möchtest du die Verbindung freigeben?</p>
                    <div class="cn-approve-actions">
                      <button class="cn-btn cn-btn--reject" @click="approve(false)">Ablehnen</button>
                      <button class="cn-btn cn-btn--accept" @click="approve(true)">Zulassen</button>
                    </div>
                  </div>

                  <!-- Done -->
                  <div v-else-if="phase === 'done'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                    </div>
                    <div class="cn-done-title">Verbunden</div>
                    <p class="cn-done-hint">Verbindung bestätigt. Der Endpoint wurde freigegeben.</p>
                    <button class="cn-btn cn-btn--done" @click="reset">Fertig</button>
                  </div>

                  <!-- Error -->
                  <div v-else-if="phase === 'error'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check cn-done-check--err">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                    </div>
                    <div class="cn-done-title">{{ errorMsg || 'Fehler' }}</div>
                    <button class="cn-btn cn-btn--done" @click="reset">Neu versuchen</button>
                  </div>
                </div>

                <!-- Stranger panel -->
                <div class="cn-panel cn-panel--stranger">
                  <div class="cn-panel-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/></svg>
                    FREMDER · /CONNECT
                  </div>

                  <div class="cn-panel-body cn-stranger-body">
                    <div class="cn-sys-logo">SYS<span>.</span></div>

                    <template v-if="phase === 'active'">
                      <div class="cn-stranger-hint">Warte auf Scan…</div>
                    </template>

                    <template v-else-if="phase === 'probed'">
                      <div class="cn-stranger-ring">
                        <svg class="spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg>
                      </div>
                      <div class="cn-stranger-hint">Warte auf Bestätigung…</div>
                    </template>

                    <template v-else-if="phase === 'done'">
                      <div class="cn-done-check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      </div>
                      <div class="cn-done-title">Verbunden</div>
                      <div class="cn-hello-msg">Hello from {{ soulMeta?.name || 'Soul' }}!</div>
                      <div class="cn-verified-row">
                        <span class="cn-verified-dot" />
                        Node verifiziert
                      </div>
                    </template>

                    <template v-else-if="phase === 'error'">
                      <div class="cn-done-check cn-done-check--err">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </div>
                      <div class="cn-stranger-hint">Verbindung abgebrochen</div>
                    </template>
                  </div>
                </div>

              </div>
            </Transition>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>

    <div v-else class="sys-loading">
      <span>SYS · Verbindung lädt</span>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'

definePageMeta({ layout: false })

const router = useRouter()
const { hasSoul, soulMeta, soulToken } = useSoul()

const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

// ── Agent Commerce Protocol ────────────────────────────────────────────────────
const amort   = ref({ enabled: false, pol_per_request: '0.001', wallet: '' })
const earnings = ref({ total_pol: '0', total_requests: 0, entries: [] })

async function loadAgentData() {
  if (!soulToken.value) return
  const headers = { Authorization: `Bearer ${soulToken.value}` }
  const [amRes, erRes] = await Promise.all([
    fetch('/api/soul/amortization', { headers }).catch(() => null),
    fetch('/api/soul/earnings',     { headers }).catch(() => null),
  ])
  if (amRes?.ok) { const d = await amRes.json(); if (d.amortization) amort.value = d.amortization }
  if (erRes?.ok) { const d = await erRes.json(); earnings.value = d }
}


onMounted(() => { loadAgentData() })

// ── QR session state ──────────────────────────────────────────────────────────

const phase    = ref('idle')   // idle | creating | active | probed | approving | done | error
const qrCanvas = ref(null)
const countdown  = ref(120)
const errorMsg   = ref('')
const pendingToken = ref('')

let pollTimer    = null
let countdownTimer = null

const actionLabel = computed(() => {
  if (phase.value === 'idle')     return 'QR anzeigen'
  if (phase.value === 'creating') return 'Erstelle…'
  if (phase.value === 'active')   return 'Läuft…'
  if (phase.value === 'probed')   return 'Warte…'
  if (phase.value === 'approving') return 'Bestätige…'
  return 'Abbrechen'
})

function authHeaders() {
  return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' }
}

async function startSession() {
  phase.value = 'creating'
  errorMsg.value = ''
  try {
    const res = await fetch('/api/connect/create', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ soul_name: soulMeta.value?.name || 'Soul' }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Fehler beim Erstellen')

    pendingToken.value = data.token
    countdown.value    = data.expires_seconds || 120
    phase.value        = 'active'

    await nextTick()
    await drawQr(data.qr_url)
    startCountdown()
    startPolling()
  } catch (e) {
    errorMsg.value = e.message
    phase.value    = 'error'
  }
}

async function drawQr(url) {
  if (!qrCanvas.value) return
  const QRCode = (await import('qrcode')).default
  QRCode.toCanvas(qrCanvas.value, url, {
    width: 220,
    margin: 2,
    color: { dark: '#f4f1ea', light: '#1a1917' },
  })
}

function startCountdown() {
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      if (phase.value === 'active') {
        cancelSession(true)
      }
    }
  }, 1000)
}

function startPolling() {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    if (phase.value !== 'active') { clearInterval(pollTimer); return }
    try {
      const res  = await fetch('/api/connect/pending', { headers: authHeaders() })
      const data = await res.json()
      if (data.pending && data.pending.length > 0) {
        pendingToken.value = data.pending[0].token
        clearInterval(pollTimer)
        phase.value = 'probed'
        clearInterval(countdownTimer)
      }
    } catch (_) {}
  }, 3000)
}

async function approve(accepted) {
  phase.value = 'approving'
  clearInterval(pollTimer)
  clearInterval(countdownTimer)
  try {
    const res = await fetch('/api/connect/approve', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ token: pendingToken.value, approved: accepted }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Fehler beim Bestätigen')
    phase.value = accepted ? 'done' : 'idle'
  } catch (e) {
    errorMsg.value = e.message
    phase.value    = 'error'
  }
}

function cancelSession(expired = false) {
  clearInterval(pollTimer)
  clearInterval(countdownTimer)
  if (expired) {
    errorMsg.value = 'QR-Code abgelaufen'
    phase.value    = 'error'
  } else {
    phase.value = 'idle'
  }
  pendingToken.value = ''
}

function reset() {
  cancelSession()
  phase.value = 'idle'
  errorMsg.value = ''
}

onUnmounted(() => {
  clearInterval(pollTimer)
  clearInterval(countdownTimer)
})

// ── Navigation ────────────────────────────────────────────────────────────────

function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'connect')  return
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

.cn-page {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 80px;
}

/* ── Agent-Zugriff ── */
.cn-agent-section {
  margin-top: 48px;
  border-top: 1px solid var(--line);
  padding-top: 32px;
  display: flex; flex-direction: column; gap: 20px;
}
.cn-agent-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.cn-agent-title {
  font-family: var(--serif); font-size: clamp(22px, 3vw, 30px);
  font-weight: 400; letter-spacing: -0.025em; color: var(--fg); margin: 6px 0 0;
}
.cn-agent-title em { font-style: italic; color: var(--accent); }

.cn-agent-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
.cn-stat-card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: 16px 18px;
  display: flex; flex-direction: column; gap: 6px;
}
.cn-stat-label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-3);
}
.cn-stat-value {
  font-family: var(--serif); font-size: 20px; font-weight: 400;
  color: var(--fg); letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px;
}
.cn-stat--on { color: var(--accent); }
.cn-stat--pol { color: var(--accent-bright); }
.cn-stat--off { color: var(--fg-3); font-size: 15px; font-family: var(--sans); }
.cn-stat-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: currentColor;
}
.cn-stat-sub { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }

/* TX Log */
.cn-tx-log {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
  overflow: hidden;
}
.cn-tx-head {
  display: grid; grid-template-columns: 2fr 2fr 1.2fr 2fr;
  padding: 10px 16px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3);
  border-bottom: 1px solid var(--line); background: var(--surface-2);
}
.cn-tx-row {
  display: grid; grid-template-columns: 2fr 2fr 1.2fr 2fr;
  padding: 11px 16px; border-bottom: 1px solid var(--line);
  font-size: 13px; color: var(--fg-2);
  transition: background 0.12s;
}
.cn-tx-row:last-child { border-bottom: none; }
.cn-tx-row:hover { background: var(--surface-2); }
.cn-tx-hash { font-family: var(--mono); color: var(--accent); }
.cn-tx-from { font-family: var(--mono); color: var(--fg-3); }
.cn-tx-pol  { font-family: var(--mono); color: var(--accent-bright); font-weight: 600; }
.cn-tx-date { font-family: var(--mono); color: var(--fg-3); }
.cn-tx-empty {
  font-size: 13px; color: var(--fg-3); line-height: 1.6;
  padding: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r);
}

@media (max-width: 600px) {
  .cn-agent-stats { grid-template-columns: 1fr 1fr; }
  .cn-tx-head, .cn-tx-row { grid-template-columns: 2fr 1fr 2fr; }
  .cn-tx-from { display: none; }
}

/* ── Header ── */
.cn-head { padding-bottom: 28px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.cn-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 42px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin: 8px 0 12px;
}
.cn-title em { font-style: italic; color: var(--accent); }
.cn-lede { font-size: 15px; line-height: 1.65; color: var(--fg); max-width: 560px; margin: 0; }

/* ── Action card ── */
.cn-action-card {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 18px 22px;
  border: 1px solid var(--line); border-radius: var(--r);
  background: var(--surface);
  margin-bottom: 32px;
}
.cn-action-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
.cn-action-ic {
  width: 48px; height: 48px; flex: none; border-radius: var(--r-xs);
  background: var(--accent-dim); border: 1px solid rgba(109,184,154,0.25);
  display: flex; align-items: center; justify-content: center; color: var(--accent);
}
.cn-action-ic svg { width: 22px; height: 22px; }
.cn-action-title { font-family: var(--sans); font-size: 15px; font-weight: 600; color: var(--fg); }
.cn-action-sub   { font-family: var(--mono); font-size: 12px; color: var(--fg-3); margin-top: 2px; }
.cn-action-btn {
  display: inline-flex; align-items: center; gap: 8px; flex: none;
  height: 40px; padding: 0 18px;
  border: 1px solid rgba(109,184,154,0.40); border-radius: var(--r-xs);
  background: var(--accent-dim); cursor: pointer;
  font-family: var(--sans); font-size: 14px; font-weight: 500; color: var(--accent-bright);
  transition: all 0.15s;
}
.cn-action-btn:hover:not(:disabled) { background: rgba(109,184,154,0.18); color: var(--fg); }
.cn-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cn-action-btn--active { background: var(--surface-2); border-color: var(--line-2); color: var(--fg-3); }
.cn-btn-ic { width: 16px; height: 16px; flex: none; }

/* ── Dual panel ── */
.cn-dual {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  border: 1px solid var(--line); border-radius: var(--r); overflow: hidden;
}
.cn-panel { display: flex; flex-direction: column; min-height: 360px; }
.cn-panel--owner   { border-right: 1px solid var(--line); background: var(--surface); }
.cn-panel--stranger { background: var(--surface-2); }

.cn-panel-label {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px; border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg);
}
.cn-label-ic { width: 14px; height: 14px; flex: none; }

/* ── Panel body ── */
.cn-panel-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 32px 24px; gap: 16px; text-align: center;
}

/* QR */
.cn-qr-canvas { image-rendering: pixelated; border-radius: 4px; }
.cn-countdown { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cn-countdown-num   { font-family: var(--mono); font-size: 28px; color: var(--fg); line-height: 1; }
.cn-countdown-label { font-family: var(--mono); font-size: 11px; color: var(--fg-4); letter-spacing: 0.1em; }
.cn-hint { font-family: var(--mono); font-size: 12px; color: var(--fg-3); margin: 0; }

/* Probe pending */
.cn-probe-ring {
  width: 56px; height: 56px; border-radius: 50%;
  border: 2px solid rgba(138,208,179,0.35);
  display: flex; align-items: center; justify-content: center;
  color: var(--accent-bright);
  animation: probe-pulse 1.8s ease-in-out infinite;
}
.cn-probe-ring svg { width: 24px; height: 24px; }
@keyframes probe-pulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
.cn-probe-title { font-family: var(--serif); font-size: 20px; font-weight: 400; color: var(--fg); }
.cn-probe-hint  { font-family: var(--mono); font-size: 12px; color: var(--fg-3); margin: 0; }

.cn-approve-actions { display: flex; gap: 10px; margin-top: 4px; }
.cn-btn {
  height: 40px; padding: 0 20px;
  font-family: var(--sans); font-size: 14px; font-weight: 500;
  border-radius: var(--r-xs); cursor: pointer; transition: all 0.15s;
  display: inline-flex; align-items: center; gap: 6px;
}
.cn-btn--reject {
  background: transparent; border: 1px solid var(--line-2); color: var(--fg-2);
}
.cn-btn--reject:hover { color: #e06c75; border-color: rgba(224,108,117,0.35); }
.cn-btn--accept {
  background: var(--accent); border: 1px solid var(--accent); color: var(--on-accent); font-weight: 600;
}
.cn-btn--accept:hover { background: var(--accent-bright); border-color: var(--accent-bright); }
.cn-btn--done {
  background: var(--surface-3); border: 1px solid var(--line-2); color: var(--fg); font-weight: 500;
  padding: 0 40px; height: 44px; margin-top: 4px;
}
.cn-btn--done:hover { background: var(--surface-2); border-color: var(--fg-4); }

/* Done state */
.cn-done-check {
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--accent); border: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--on-accent);
}
.cn-done-check--err { background: rgba(224,108,117,0.15); border: 1px solid rgba(224,108,117,0.35); color: #e06c75; }
.cn-done-check svg { width: 24px; height: 24px; }
.cn-done-title { font-family: var(--serif); font-size: 22px; font-weight: 400; color: var(--fg); }
.cn-done-hint  { font-family: var(--mono); font-size: 12px; color: var(--fg-2); margin: 0; max-width: 200px; }

/* Stranger panel */
.cn-stranger-body { background: rgba(0,0,0,0.12); }
.cn-sys-logo {
  font-family: var(--sans); font-size: 22px; font-weight: 700; color: var(--fg);
  letter-spacing: -0.04em; margin-bottom: 8px;
}
.cn-sys-logo span { color: var(--accent); }
.cn-stranger-hint { font-family: var(--mono); font-size: 13px; color: var(--fg-3); }
.cn-stranger-ring { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
.cn-stranger-ring svg { width: 40px; height: 40px; color: var(--fg-4); }

.cn-hello-msg {
  font-family: var(--serif); font-style: italic;
  font-size: 20px; color: var(--accent); margin-top: 4px;
}
.cn-verified-row {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
}
.cn-verified-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 4px var(--accent-glow); flex: none;
}

/* ── Animations ── */
.spin { animation: cn-spin 1s linear infinite; }
@keyframes cn-spin { to { transform: rotate(360deg); } }
.spin-slow { animation: cn-spin 3s linear infinite; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.25s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-8px); }

/* ── Mobile ── */
@media (max-width: 900px) {
  .cn-dual { grid-template-columns: 1fr; }
  .cn-panel--owner { border-right: none; border-bottom: 1px solid var(--line); }
}
</style>
