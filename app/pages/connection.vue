<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="connect" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('common.network'), $t('connection.crumb')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page cn-page">

            <!-- Header -->
            <div class="cn-head">
              <div class="eyebrow">{{ $t('connection.eyebrow') }}</div>
              <h1 class="cn-title">{{ $t('connection.title_prefix') }} &amp; <em>{{ $t('connection.title_em') }}</em></h1>
              <p class="cn-lede">{{ $t('connection.lede') }}</p>
            </div>

            <!-- Pending MCP challenge banner -->
            <Transition name="slide-down">
              <div v-if="pendingChallenge" class="cn-mcp-banner">
                <div class="cn-mcp-banner-left">
                  <div class="cn-mcp-ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
                  </div>
                  <div>
                    <div class="cn-mcp-title">{{ $t('connection.verify_title') }}</div>
                    <div class="cn-mcp-sub">{{ $t('connection.verify_sub', { method: methodLabel(pendingChallenge.method) }) }}</div>
                  </div>
                </div>
                <button class="cn-mcp-btn" @click="openVerify(pendingChallenge)">{{ $t('connection.btn_verify_now') }}</button>
              </div>
            </Transition>

            <!-- Pending trust-request banner -->
            <Transition name="slide-down">
              <div v-if="pendingTrust" class="cn-mcp-banner">
                <div class="cn-mcp-banner-left">
                  <div class="cn-mcp-ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15.75a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3v3m0 12v3m9-9h-3M6 12H3m14.657-6.657-2.121 2.121M8.464 15.536l-2.121 2.121m0-11.314 2.121 2.121m8.072 8.072 2.121 2.121"/></svg>
                  </div>
                  <div>
                    <div class="cn-mcp-title">{{ $t('connection.trust_title') }}</div>
                    <div class="cn-mcp-sub">{{ $t('connection.trust_sub', { label: pendingTrust.label || $t('connection.trust_unknown') }) }}</div>
                  </div>
                </div>
                <div class="cn-mcp-actions">
                  <button class="cn-btn cn-btn--reject" :disabled="trustApproving" @click="approveTrust(false)">{{ $t('connection.btn_reject') }}</button>
                  <button class="cn-btn cn-btn--accept" :disabled="trustApproving" @click="approveTrust(true)">{{ $t('connection.btn_allow') }}</button>
                </div>
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
                  <div class="cn-action-title">{{ $t('connection.qr_action_title') }}</div>
                  <div class="cn-action-sub">{{ $t('connection.qr_action_sub') }}</div>
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
                    <div class="cn-countdown"><span class="cn-countdown-num">{{ countdown }}</span><span class="cn-countdown-label">{{ $t('connection.seconds') }}</span></div>
                    <p class="cn-hint">{{ $t('connection.qr_hint') }}</p>
                  </div>
                  <div v-else-if="qrPhase === 'probed'" class="cn-panel-body cn-approve-body">
                    <div class="cn-probe-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg></div>
                    <div class="cn-probe-title">{{ $t('connection.probe_title') }}</div>
                    <p class="cn-probe-hint">{{ $t('connection.probe_hint') }}</p>
                    <div class="cn-approve-actions"><button class="cn-btn cn-btn--reject" @click="approve(false)">{{ $t('connection.btn_reject') }}</button><button class="cn-btn cn-btn--accept" @click="approve(true)">{{ $t('connection.btn_allow') }}</button></div>
                  </div>
                  <div v-else-if="qrPhase === 'done'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
                    <div class="cn-done-title">{{ $t('connection.connected') }}</div>
                    <button class="cn-btn cn-btn--done" @click="resetQr">{{ $t('common.done') }}</button>
                  </div>
                  <div v-else-if="qrPhase === 'error'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check cn-done-check--err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></div>
                    <div class="cn-done-title">{{ qrError || $t('connection.err_generic') }}</div>
                    <button class="cn-btn cn-btn--done" @click="resetQr">{{ $t('connection.btn_retry') }}</button>
                  </div>
                </div>
                <div class="cn-panel cn-panel--stranger">
                  <div class="cn-panel-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/></svg>FREMDER · /CONNECT</div>
                  <div class="cn-panel-body cn-stranger-body">
                    <div class="cn-sys-logo">SYS<span>.</span></div>
                    <template v-if="qrPhase === 'active'"><div class="cn-stranger-hint">{{ $t('connection.waiting_scan') }}</div></template>
                    <template v-else-if="qrPhase === 'probed'"><div class="cn-stranger-ring"><svg class="spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg></div><div class="cn-stranger-hint">{{ $t('connection.waiting_confirm') }}</div></template>
                    <template v-else-if="qrPhase === 'done'">
                      <div class="cn-done-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
                      <div class="cn-done-title">{{ $t('connection.connected') }}</div>
                      <div class="cn-hello-msg">Hello from {{ soulMeta?.name || 'Soul' }}!</div>
                      <div class="cn-verified-row"><span class="cn-verified-dot" />{{ $t('connection.node_verified') }}</div>
                    </template>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Getrustete Souls verwalten -->
            <div class="cn-section-label" style="margin-top:40px">{{ $t('connection.trusted_section') }}</div>
            <div v-if="!trustedList.length" class="cn-info-card">
              <div class="cn-info-body">
                <p class="cn-info-desc">{{ $t('connection.trusted_empty') }}</p>
              </div>
            </div>
            <div v-else class="cn-trusted-list">
              <div v-for="item in trustedList" :key="item.soul_id" class="cn-trusted-row">
                <div class="cn-trusted-info">
                  <div class="cn-trusted-label">{{ item.label || $t('connection.trust_unknown') }}</div>
                  <div class="cn-trusted-id">{{ item.soul_id.slice(0, 8) }}…</div>
                </div>
                <button class="cn-btn cn-btn--reject" :disabled="revoking === item.soul_id" @click="revokeTrust(item.soul_id)">{{ $t('connection.btn_revoke') }}</button>
              </div>
            </div>

            <!-- Verifikation info -->
            <div class="cn-section-label" style="margin-top:40px">{{ $t('connection.section_verify') }}</div>
            <div class="cn-info-card">
              <div class="cn-info-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
              </div>
              <div class="cn-info-body">
                <div class="cn-info-title">{{ $t('connection.info_title') }}</div>
                <p class="cn-info-desc">{{ $t('connection.info_desc') }}</p>
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
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken } = useSoul()

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

// ── QR session ────────────────────────────────────────────────────────────────
const qrPhase = ref('idle'), qrCanvas = ref(null), countdown = ref(120), qrError = ref(''), pendingToken = ref('')
let pollTimer = null, countdownTimer = null
const qrActionLabel = computed(() => ({ idle: t('connection.qr_label_idle'), creating: t('connection.qr_label_creating'), active: t('connection.qr_label_active'), probed: t('connection.qr_label_probed'), approving: t('connection.qr_label_approving') }[qrPhase.value] ?? t('connection.qr_label_cancel')))
function authHeaders() { return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' } }

async function startSession() {
  qrPhase.value = 'creating'; qrError.value = ''
  try {
    const r = await fetch('/api/connect/create', { method:'POST', headers:authHeaders(), body:JSON.stringify({ soul_name: soulMeta.value?.name||'Soul' }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || t('connection.err_generic'))
    pendingToken.value = d.token; countdown.value = d.expires_seconds || 120; qrPhase.value = 'active'
    await nextTick(); await drawQr(d.qr_url); startCountdown(); startPolling()
  } catch (e) { qrError.value = e.message; qrPhase.value = 'error' }
}
async function drawQr(url) {
  if (!qrCanvas.value) return
  const Q = (await import('qrcode')).default
  Q.toCanvas(qrCanvas.value, url, { width:220, margin:2, color:{ dark:'#ececec', light:'#1a1917' } })
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
function cancelSession(expired=false) { clearInterval(pollTimer); clearInterval(countdownTimer); if(expired){qrError.value=t('connection.err_qr_expired');qrPhase.value='error'}else{qrPhase.value='idle'}; pendingToken.value='' }
function resetQr() { cancelSession(); qrPhase.value='idle'; qrError.value='' }

// ── Pending MCP challenge ─────────────────────────────────────────────────────
const pendingChallenge = ref(null)
let challengePollTimer = null
async function pollPendingChallenge() {
  try { const r = await fetch('/api/verify/pending',{headers:authHeaders()}); const d=await r.json(); pendingChallenge.value=d.pending?.length?d.pending[0]:null } catch(_){}
}
function methodLabel(m) { return { fingerprint: t('connection.method_fingerprint'), face: t('connection.method_face'), voice: t('connection.method_voice') }[m] ?? m }
function openVerify(challenge) {
  router.push(`/verify?id=${challenge.challenge_id}&m=${challenge.method}`)
}

// ── Pending trust requests (request_trust MCP-Tool) ──────────────────────────
const pendingTrust    = ref(null)
const trustApproving  = ref(false)
async function pollPendingTrust() {
  try { const r = await fetch('/api/trust/pending',{headers:authHeaders()}); const d=await r.json(); pendingTrust.value=d.pending?.length?d.pending[0]:null } catch(_){}
}
async function approveTrust(ok) {
  if (!pendingTrust.value || trustApproving.value) return
  trustApproving.value = true
  try {
    const r = await fetch('/api/trust/approve', { method:'POST', headers:authHeaders(), body:JSON.stringify({ request_id: pendingTrust.value.request_id, approved: ok }) })
    if (!r.ok) throw new Error()
    pendingTrust.value = null
    if (ok) await loadTrustedList()
  } catch (_) { /* Banner bleibt sichtbar, erneuter Versuch möglich */ }
  trustApproving.value = false
}

// ── Getrustete Souls verwalten ────────────────────────────────────────────────
const trustedList = ref([])
const revoking     = ref(null)
async function loadTrustedList() {
  try { const r = await fetch('/api/trust/list',{headers:authHeaders()}); const d = await r.json(); trustedList.value = d.trusted || [] } catch (_) {}
}
async function revokeTrust(soulId) {
  if (revoking.value) return
  revoking.value = soulId
  try {
    const r = await fetch('/api/trust/revoke', { method:'POST', headers:authHeaders(), body:JSON.stringify({ soul_id: soulId }) })
    if (r.ok) trustedList.value = trustedList.value.filter(t => t.soul_id !== soulId)
  } catch (_) { /* Eintrag bleibt sichtbar, erneuter Versuch möglich */ }
  revoking.value = null
}

// ── Web Push Subscription ─────────────────────────────────────────────────────
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const r = await fetch('/api/push/vapid-key')
    const { publicKey } = await r.json()
    if (!publicKey) return
    const stored = localStorage.getItem('sys_vapid_key')
    const existing = await reg.pushManager.getSubscription()
    if (stored === publicKey && existing) return
    if (existing) await existing.unsubscribe().catch(() => {})
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
    await saveSub(sub)
    localStorage.setItem('sys_vapid_key', publicKey)
  } catch {}
}
async function saveSub(sub) {
  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(sub.toJSON()),
    })
  } catch {}
}
async function requestAndSubscribe() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'denied') return
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
  }
  await subscribeToPush()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
pollPendingChallenge()
pollPendingTrust()
loadTrustedList()
challengePollTimer = setInterval(() => { pollPendingChallenge(); pollPendingTrust() }, 8000)
if (import.meta.client) requestAndSubscribe()

onUnmounted(() => {
  clearInterval(pollTimer); clearInterval(countdownTimer); clearInterval(challengePollTimer)
})

// ── Navigation ────────────────────────────────────────────────────────────────
function lockGate() { document.cookie='sys_token=; Max-Age=0; path=/'; window.location.href='/gate' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', calendar:'/calendar', anchor:'/anchor', export:'/export', peers:'/peers', market:'/marketplace', earnings:'/earnings', settings:'/settings' }
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
.cn-mcp-actions { display:flex; gap:10px; flex:none; }

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
.cn-action-btn--active { background:var(--surface-2); border-color:var(--line-2); color:var(--fg-2); }
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
.cn-countdown-label { font-family:var(--mono); font-size:12px; color:var(--fg-2); letter-spacing:0.1em; }
.cn-hint { font-family:var(--mono); font-size:12px; color:var(--fg-2); margin:0; }
.cn-probe-ring { width:52px; height:52px; border-radius:50%; border:2px solid rgba(138,208,179,0.35); display:flex; align-items:center; justify-content:center; color:var(--accent-bright); animation:probe-pulse 1.8s ease-in-out infinite; }
.cn-probe-ring svg { width:22px; height:22px; }
@keyframes probe-pulse { 0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)} }
.cn-probe-title { font-family:var(--serif); font-size:20px; font-weight:400; color:var(--fg); }
.cn-probe-hint  { font-family:var(--mono); font-size:12px; color:var(--fg-2); margin:0; }
.cn-approve-actions { display:flex; gap:10px; }
.cn-btn { height:40px; padding:0 20px; font-family:var(--sans); font-size:14px; font-weight:500; border-radius:var(--r-xs); cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px; }
.cn-btn:disabled { opacity:0.4; cursor:not-allowed; }
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
.cn-stranger-hint { font-family:var(--mono); font-size:13px; color:var(--fg); }
.cn-stranger-ring { width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
.cn-stranger-ring svg { width:40px; height:40px; color:var(--fg-3); }
.cn-hello-msg { font-family:var(--serif); font-style:italic; font-size:18px; color:var(--accent); }
.cn-verified-row { display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:12px; color:var(--fg-2); }
.cn-verified-dot { width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 4px var(--accent-glow); flex:none; }

/* Getrustete Souls verwalten */
.cn-trusted-list { display:flex; flex-direction:column; gap:1px; border:1px solid var(--line); border-radius:var(--r); overflow:hidden; margin-bottom:32px; }
.cn-trusted-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; background:var(--surface); }
.cn-trusted-row + .cn-trusted-row { border-top:1px solid var(--line); }
.cn-trusted-info { min-width:0; }
.cn-trusted-label { font-family:var(--sans); font-size:14px; font-weight:600; color:var(--fg); }
.cn-trusted-id { font-family:var(--mono); font-size:12px; color:var(--fg-2); margin-top:2px; }

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
