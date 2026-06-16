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

            <!-- Header -->
            <div class="cn-head">
              <div class="eyebrow">VERBINDUNG</div>
              <h1 class="cn-title">Verbindung &amp; <em>Verifikation</em></h1>
              <p class="cn-lede">Teile deinen MCP-Endpoint per QR-Code. Wenn eine KI deine Identität bestätigen möchte, erscheint hier die Anfrage.</p>
            </div>

            <!-- Pending MCP challenge banner -->
            <Transition name="slide-down">
              <div v-if="pendingChallenge" class="cn-mcp-banner">
                <div class="cn-mcp-banner-left">
                  <div class="cn-mcp-ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
                  </div>
                  <div>
                    <div class="cn-mcp-title">Verifikationsanfrage offen</div>
                    <div class="cn-mcp-sub">Claude AI bittet um {{ methodLabel(pendingChallenge.method) }}</div>
                  </div>
                </div>
                <button class="cn-mcp-btn" @click="openVerify(pendingChallenge)">Jetzt verifizieren</button>
              </div>
            </Transition>

            <!-- QR-CONNECT -->
            <div class="cn-section-label">QR-CONNECT</div>
            <div class="cn-action-card">
              <div class="cn-action-left">
                <div class="cn-action-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/></svg>
                </div>
                <div>
                  <div class="cn-action-title">MCP-Endpoint freigeben</div>
                  <div class="cn-action-sub">QR scannen · Tap bestätigen · verbunden</div>
                </div>
              </div>
              <button class="cn-action-btn" :class="{ 'cn-action-btn--active': qrPhase === 'active' || qrPhase === 'probed' }" :disabled="qrPhase === 'creating' || qrPhase === 'approving'" @click="qrPhase === 'idle' ? startSession() : cancelSession()">
                <svg v-if="qrPhase === 'creating' || qrPhase === 'approving'" class="spin cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                <svg v-else-if="qrPhase === 'active' || qrPhase === 'probed'" class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                <svg v-else class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/></svg>
                <span>{{ qrActionLabel }}</span>
              </button>
            </div>

            <!-- QR Dual panel -->
            <Transition name="slide-down">
              <div v-if="qrPhase !== 'idle'" class="cn-dual">
                <div class="cn-panel cn-panel--owner">
                  <div class="cn-panel-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>DU · NODE-INHABER</div>
                  <div v-if="qrPhase === 'active'" class="cn-panel-body cn-qr-body">
                    <canvas ref="qrCanvas" class="cn-qr-canvas" />
                    <div class="cn-countdown"><span class="cn-countdown-num">{{ countdown }}</span><span class="cn-countdown-label">Sekunden</span></div>
                    <p class="cn-hint">Zeige diesen QR-Code jemandem zum Scannen</p>
                  </div>
                  <div v-else-if="qrPhase === 'probed'" class="cn-panel-body cn-approve-body">
                    <div class="cn-probe-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg></div>
                    <div class="cn-probe-title">Jemand scannt gerade</div>
                    <p class="cn-probe-hint">Möchtest du die Verbindung freigeben?</p>
                    <div class="cn-approve-actions"><button class="cn-btn cn-btn--reject" @click="approve(false)">Ablehnen</button><button class="cn-btn cn-btn--accept" @click="approve(true)">Zulassen</button></div>
                  </div>
                  <div v-else-if="qrPhase === 'done'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
                    <div class="cn-done-title">Verbunden</div>
                    <button class="cn-btn cn-btn--done" @click="resetQr">Fertig</button>
                  </div>
                  <div v-else-if="qrPhase === 'error'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check cn-done-check--err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></div>
                    <div class="cn-done-title">{{ qrError || 'Fehler' }}</div>
                    <button class="cn-btn cn-btn--done" @click="resetQr">Neu versuchen</button>
                  </div>
                </div>
                <div class="cn-panel cn-panel--stranger">
                  <div class="cn-panel-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/></svg>FREMDER · /CONNECT</div>
                  <div class="cn-panel-body cn-stranger-body">
                    <div class="cn-sys-logo">SYS<span>.</span></div>
                    <template v-if="qrPhase === 'active'"><div class="cn-stranger-hint">Warte auf Scan…</div></template>
                    <template v-else-if="qrPhase === 'probed'"><div class="cn-stranger-ring"><svg class="spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg></div><div class="cn-stranger-hint">Warte auf Bestätigung…</div></template>
                    <template v-else-if="qrPhase === 'done'">
                      <div class="cn-done-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
                      <div class="cn-done-title">Verbunden</div>
                      <div class="cn-hello-msg">Hello from {{ soulMeta?.name || 'Soul' }}!</div>
                      <div class="cn-verified-row"><span class="cn-verified-dot" />Node verifiziert</div>
                    </template>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Verifikation info -->
            <div class="cn-section-label" style="margin-top:40px">VERIFIKATION</div>
            <div class="cn-info-card">
              <div class="cn-info-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
              </div>
              <div class="cn-info-body">
                <div class="cn-info-title">Verifikation durch KI</div>
                <p class="cn-info-desc">Wenn eine KI-Anwendung deine Identität bestätigen möchte, erscheint oben eine Anfrage. Die Verifikation — per Fingerabdruck, Gesicht oder Stimme — öffnet sich dann in einem sicheren Fenster.</p>
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
import { ref, computed, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'

definePageMeta({ layout: false })
const router = useRouter()
const { hasSoul, soulMeta, soulToken } = useSoul()

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

// ── QR session ────────────────────────────────────────────────────────────────
const qrPhase = ref('idle'), qrCanvas = ref(null), countdown = ref(120), qrError = ref(''), pendingToken = ref('')
let pollTimer = null, countdownTimer = null
const qrActionLabel = computed(() => ({ idle:'QR anzeigen', creating:'Erstelle…', active:'Läuft…', probed:'Warte…', approving:'Bestätige…' }[qrPhase.value] ?? 'Abbrechen'))
function authHeaders() { return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' } }

async function startSession() {
  qrPhase.value = 'creating'; qrError.value = ''
  try {
    const r = await fetch('/api/connect/create', { method:'POST', headers:authHeaders(), body:JSON.stringify({ soul_name: soulMeta.value?.name||'Soul' }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Fehler')
    pendingToken.value = d.token; countdown.value = d.expires_seconds || 120; qrPhase.value = 'active'
    await nextTick(); await drawQr(d.qr_url); startCountdown(); startPolling()
  } catch (e) { qrError.value = e.message; qrPhase.value = 'error' }
}
async function drawQr(url) {
  if (!qrCanvas.value) return
  const Q = (await import('qrcode')).default
  Q.toCanvas(qrCanvas.value, url, { width:220, margin:2, color:{ dark:'#f4f1ea', light:'#1a1917' } })
}
function startCountdown() {
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => { countdown.value--; if (countdown.value <= 0) { clearInterval(countdownTimer); if (qrPhase.value==='active') cancelSession(true) } }, 1000)
}
function startPolling() {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    if (qrPhase.value !== 'active') { clearInterval(pollTimer); return }
    try { const r = await fetch('/api/connect/pending',{headers:authHeaders()}); const d = await r.json(); if (d.pending?.length) { pendingToken.value=d.pending[0].token; clearInterval(pollTimer); qrPhase.value='probed'; clearInterval(countdownTimer) } } catch(_){}
  }, 3000)
}
async function approve(ok) {
  qrPhase.value = 'approving'; clearInterval(pollTimer); clearInterval(countdownTimer)
  try { const r = await fetch('/api/connect/approve',{method:'POST',headers:authHeaders(),body:JSON.stringify({token:pendingToken.value,approved:ok})}); const d=await r.json(); if(!r.ok)throw new Error(d.error); qrPhase.value=ok?'done':'idle' } catch(e){qrError.value=e.message;qrPhase.value='error'}
}
function cancelSession(expired=false) { clearInterval(pollTimer); clearInterval(countdownTimer); if(expired){qrError.value='QR-Code abgelaufen';qrPhase.value='error'}else{qrPhase.value='idle'}; pendingToken.value='' }
function resetQr() { cancelSession(); qrPhase.value='idle'; qrError.value='' }

// ── Pending MCP challenge ─────────────────────────────────────────────────────
const pendingChallenge = ref(null)
let challengePollTimer = null
async function pollPendingChallenge() {
  try { const r = await fetch('/api/verify/pending',{headers:authHeaders()}); const d=await r.json(); pendingChallenge.value=d.pending?.length?d.pending[0]:null } catch(_){}
}
function methodLabel(m) { return { fingerprint:'Fingerabdruck/Face ID', face:'Gesichtserkennung', voice:'Stimm-Verifikation' }[m] ?? m }
function openVerify(challenge) {
  router.push(`/verify?id=${challenge.challenge_id}&m=${challenge.method}`)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
pollPendingChallenge()
challengePollTimer = setInterval(pollPendingChallenge, 8000)

onUnmounted(() => {
  clearInterval(pollTimer); clearInterval(countdownTimer); clearInterval(challengePollTimer)
})

// ── Navigation ────────────────────────────────────────────────────────────────
function lockGate() { document.cookie='sys_token=; Max-Age=0; path=/'; window.location.href='/gate' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/einrichten', soul:'/soul', chronik:'/chronik', files:'/dateien', maturity:'/reife', health:'/gesundheit', calendar:'/kalender', anchor:'/verankern', export:'/exportieren', peers:'/peers', market:'/marketplace', earnings:'/einnahmen', settings:'/einstellungen' }
  if (id === 'connect') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}
</script>

<style scoped>
.cn-page { max-width:860px; margin:0 auto; padding:32px clamp(16px,3vw,32px) 80px; }

/* Header */
.cn-head { padding-bottom:28px; border-bottom:1px solid var(--line); margin-bottom:32px; }
.cn-title { font-family:var(--serif); font-size:clamp(28px,4vw,42px); font-weight:400; letter-spacing:-0.03em; color:var(--fg); line-height:1.05; margin:8px 0 12px; }
.cn-title em { font-style:italic; color:var(--accent); }
.cn-lede { font-size:15px; line-height:1.65; color:var(--fg); max-width:560px; margin:0; }

/* Section label */
.cn-section-label { font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--fg); margin-bottom:12px; }

/* MCP Banner */
.cn-mcp-banner { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; margin-bottom:24px; border:1px solid rgba(109,184,154,0.35); border-radius:var(--r); background:var(--accent-dim); }
.cn-mcp-banner-left { display:flex; align-items:center; gap:12px; min-width:0; }
.cn-mcp-ic { width:40px; height:40px; flex:none; border-radius:var(--r-xs); background:rgba(109,184,154,0.2); display:flex; align-items:center; justify-content:center; color:var(--accent); }
.cn-mcp-ic svg { width:20px; height:20px; }
.cn-mcp-title { font-family:var(--sans); font-size:14px; font-weight:600; color:var(--fg); }
.cn-mcp-sub   { font-family:var(--mono); font-size:11px; color:var(--fg); margin-top:2px; }
.cn-mcp-btn { height:38px; padding:0 16px; flex:none; background:var(--accent); border:none; border-radius:var(--r-xs); font-family:var(--sans); font-size:13px; font-weight:600; color:var(--on-accent); cursor:pointer; transition:background 0.15s; }
.cn-mcp-btn:hover { background:var(--accent-bright); }

/* QR Action card */
.cn-action-card { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 22px; margin-bottom:32px; border:1px solid var(--line); border-radius:var(--r); background:var(--surface); }
.cn-action-left { display:flex; align-items:center; gap:16px; min-width:0; }
.cn-action-ic { width:48px; height:48px; flex:none; border-radius:var(--r-xs); background:var(--accent-dim); border:1px solid rgba(109,184,154,0.25); display:flex; align-items:center; justify-content:center; color:var(--accent); }
.cn-action-ic svg { width:22px; height:22px; }
.cn-action-title { font-family:var(--sans); font-size:15px; font-weight:600; color:var(--fg); }
.cn-action-sub   { font-family:var(--mono); font-size:12px; color:var(--fg); margin-top:2px; }
.cn-action-btn { display:inline-flex; align-items:center; gap:8px; flex:none; height:40px; padding:0 18px; border:1px solid rgba(109,184,154,0.40); border-radius:var(--r-xs); background:var(--accent-dim); cursor:pointer; font-family:var(--sans); font-size:14px; font-weight:500; color:var(--accent-bright); transition:all 0.15s; }
.cn-action-btn:hover:not(:disabled) { background:rgba(109,184,154,0.18); color:var(--fg); }
.cn-action-btn:disabled { opacity:0.4; cursor:not-allowed; }
.cn-action-btn--active { background:var(--surface-2); border-color:var(--line-2); color:var(--fg-3); }
.cn-btn-ic { width:16px; height:16px; flex:none; }

/* QR Dual panel */
.cn-dual { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid var(--line); border-radius:var(--r); overflow:hidden; margin-bottom:40px; }
.cn-panel { display:flex; flex-direction:column; min-height:300px; }
.cn-panel--owner   { border-right:1px solid var(--line); background:var(--surface); }
.cn-panel--stranger { background:var(--surface-2); }
.cn-panel-label { display:flex; align-items:center; gap:8px; padding:12px 20px; border-bottom:1px solid var(--line); font-family:var(--mono); font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--fg); }
.cn-label-ic { width:14px; height:14px; flex:none; }
.cn-panel-body { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px 24px; gap:14px; text-align:center; }
.cn-qr-canvas { image-rendering:pixelated; border-radius:4px; }
.cn-countdown { display:flex; flex-direction:column; align-items:center; gap:2px; }
.cn-countdown-num   { font-family:var(--mono); font-size:28px; color:var(--fg); line-height:1; }
.cn-countdown-label { font-family:var(--mono); font-size:11px; color:var(--fg-4); letter-spacing:0.1em; }
.cn-hint { font-family:var(--mono); font-size:12px; color:var(--fg-3); margin:0; }
.cn-probe-ring { width:52px; height:52px; border-radius:50%; border:2px solid rgba(138,208,179,0.35); display:flex; align-items:center; justify-content:center; color:var(--accent-bright); animation:probe-pulse 1.8s ease-in-out infinite; }
.cn-probe-ring svg { width:22px; height:22px; }
@keyframes probe-pulse { 0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)} }
.cn-probe-title { font-family:var(--serif); font-size:20px; font-weight:400; color:var(--fg); }
.cn-probe-hint  { font-family:var(--mono); font-size:12px; color:var(--fg-3); margin:0; }
.cn-approve-actions { display:flex; gap:10px; }
.cn-btn { height:40px; padding:0 20px; font-family:var(--sans); font-size:14px; font-weight:500; border-radius:var(--r-xs); cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px; }
.cn-btn--reject { background:transparent; border:1px solid var(--line-2); color:var(--fg-2); }
.cn-btn--reject:hover { color:#e06c75; border-color:rgba(224,108,117,0.35); }
.cn-btn--accept { background:var(--accent); border:1px solid var(--accent); color:var(--on-accent); font-weight:600; }
.cn-btn--accept:hover { background:var(--accent-bright); border-color:var(--accent-bright); }
.cn-btn--done { background:var(--surface-3); border:1px solid var(--line-2); color:var(--fg); font-weight:500; padding:0 40px; height:44px; }
.cn-btn--done:hover { background:var(--surface-2); }
.cn-done-check { width:52px; height:52px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; color:var(--on-accent); }
.cn-done-check--err { background:rgba(224,108,117,0.15); border:1px solid rgba(224,108,117,0.35); color:#e06c75; }
.cn-done-check svg { width:22px; height:22px; }
.cn-done-title { font-family:var(--serif); font-size:22px; font-weight:400; color:var(--fg); }
.cn-stranger-body { background:rgba(0,0,0,0.12); }
.cn-sys-logo { font-family:var(--sans); font-size:22px; font-weight:700; color:var(--fg); letter-spacing:-0.04em; }
.cn-sys-logo span { color:var(--accent); }
.cn-stranger-hint { font-family:var(--mono); font-size:13px; color:var(--fg-3); }
.cn-stranger-ring { width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
.cn-stranger-ring svg { width:40px; height:40px; color:var(--fg-4); }
.cn-hello-msg { font-family:var(--serif); font-style:italic; font-size:18px; color:var(--accent); }
.cn-verified-row { display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:12px; color:var(--fg-3); }
.cn-verified-dot { width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 4px var(--accent-glow); flex:none; }

/* Verifikation info card */
.cn-info-card { display:flex; align-items:flex-start; gap:16px; padding:20px 22px; border:1px solid var(--line); border-radius:var(--r); background:var(--surface); }
.cn-info-ic { width:40px; height:40px; flex:none; border-radius:var(--r-xs); background:var(--accent-dim); border:1px solid rgba(109,184,154,0.2); display:flex; align-items:center; justify-content:center; color:var(--accent); margin-top:2px; }
.cn-info-ic svg { width:20px; height:20px; }
.cn-info-body { flex:1; min-width:0; }
.cn-info-title { font-family:var(--sans); font-size:15px; font-weight:600; color:var(--fg); margin-bottom:6px; }
.cn-info-desc { font-family:var(--sans); font-size:15px; color:var(--fg); line-height:1.7; margin:0; }

/* Animations */
.spin { animation:cn-spin 1s linear infinite; }
@keyframes cn-spin { to{transform:rotate(360deg)} }
.spin-slow { animation:cn-spin 3s linear infinite; }
.slide-down-enter-active, .slide-down-leave-active { transition:all 0.25s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity:0; transform:translateY(-8px); }

/* Mobile */
@media (max-width:860px) { .cn-dual{grid-template-columns:1fr} .cn-panel--owner{border-right:none;border-bottom:1px solid var(--line)} .cn-mcp-banner{flex-direction:column;align-items:flex-start} }
@media (max-width:600px) { .cn-action-card{flex-direction:column;align-items:flex-start} }
</style>
