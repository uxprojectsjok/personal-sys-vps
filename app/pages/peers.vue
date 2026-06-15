<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="peers" :soul-meta="soulMeta ? { ...soulMeta, maturity } : null" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Netzwerk', 'Peers']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page pr-page">

            <!-- ── Header ── -->
            <div class="pr-head">
              <div class="eyebrow">Sozial · Sphere</div>
              <h1 class="pr-title">Vertraute <em>Souls</em></h1>
              <p class="pr-lede">Direkte, verschlüsselte Verbindungen zu anderen Knoten. Erwähne sie mit @ in der Session, teile Medien oder sende an alle.</p>
            </div>

            <!-- ── Toolbar ── -->
            <div class="pr-toolbar">
              <button class="pr-add-btn" :class="{ 'pr-add-btn--open': addOpen }" @click="addOpen = !addOpen">
                <svg class="pr-tab-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                Peer hinzufügen
              </button>
            </div>

            <!-- ── Add form (inline) ── -->
            <Transition name="slide-down">
              <div v-if="addOpen" class="pr-add-form">
                <div class="pr-add-fields">
                  <div class="f-field">
                    <label class="f-label">Soul-ID</label>
                    <input
                      v-model="newSoulId"
                      type="text"
                      class="f-inp f-inp--mono"
                      placeholder="2c81aa74-0ed0-43c8-…"
                      autocomplete="off"
                      spellcheck="false"
                    />
                  </div>
                  <div class="f-field">
                    <label class="f-label">Alias</label>
                    <input
                      v-model="newAlias"
                      type="text"
                      class="f-inp"
                      placeholder="alice_abc"
                      maxlength="64"
                    />
                  </div>
                  <div class="f-field pr-field--full">
                    <label class="f-label">Domain</label>
                    <input
                      v-model="newDomain"
                      type="text"
                      class="f-inp"
                      placeholder="https://me.example.com"
                      autocomplete="off"
                    />
                  </div>
                </div>
                <p v-if="addError" class="f-error">{{ addError }}</p>
                <div class="pr-add-foot">
                  <button class="pr-btn pr-btn--ghost" @click="addOpen = false; addError = ''">Abbrechen</button>
                  <button
                    class="pr-btn pr-btn--primary"
                    :disabled="addLoading || !newSoulId.trim() || !newAlias.trim()"
                    @click="handleAdd"
                  >
                    <svg v-if="addLoading" class="spin pr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                    {{ addLoading ? 'Verbinden…' : 'Verbindung herstellen' }}
                  </button>
                </div>
              </div>
            </Transition>

            <!-- ── Incoming requests ── -->
            <div v-if="incoming.length > 0" class="pr-section">
              <div class="pr-section-label">
                <span>Eingehende Anfragen</span>
                <span class="pr-badge">{{ incoming.length }}</span>
              </div>
              <div class="pr-chips">
                <div v-for="req in incoming" :key="req.soul_id" class="pr-chip pr-chip--request" :style="`border-left: 3px solid ${peerTextColor(req.soul_id)}`">
                  <div class="pr-chip-avatar" :style="`background: ${avatarBg(req.soul_id)}`">
                    {{ (acceptAliases[req.soul_id] || req.alias || req.soul_id).charAt(0).toUpperCase() }}
                  </div>
                  <div class="pr-chip-body">
                    <input
                      v-if="acceptingId === req.soul_id"
                      :value="acceptAliases[req.soul_id]"
                      @input="acceptAliases[req.soul_id] = $event.target.value"
                      class="pr-alias-input"
                      placeholder="Name für diesen Peer"
                      @keydown.enter="confirmAccept(req)"
                      @keydown.escape="acceptingId = null"
                      ref="aliasInputEl"
                      autofocus
                    />
                    <template v-else>
                      <div class="pr-chip-alias">{{ req.alias || req.soul_id }}</div>
                    </template>
                    <div class="pr-chip-id">{{ shortId(req.soul_id) }}</div>
                    <div class="pr-chip-status">{{ (req.domain || '').replace('https://', '') }}</div>
                  </div>
                  <div class="pr-chip-actions">
                    <template v-if="acceptingId === req.soul_id">
                      <button class="pr-action pr-action--accept" @click="confirmAccept(req)" title="Bestätigen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                      </button>
                      <button class="pr-action" @click="acceptingId = null" title="Abbrechen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </template>
                    <template v-else>
                      <button class="pr-action pr-action--accept" @click="startAccept(req)" title="Annehmen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                      </button>
                      <button class="pr-action pr-action--reject" @click="handleRejectRequest(req.soul_id)" title="Ablehnen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Removed notifications ── -->
            <div v-if="removedByPeer.length > 0" class="pr-section">
              <div class="pr-section-label">Verbindungen getrennt</div>
              <div class="pr-removed-list">
                <div v-for="n in removedByPeer" :key="n.soul_id" class="pr-removed">
                  <span class="pr-removed-alias">{{ n.alias }}</span>
                  <span class="pr-removed-text">hat die Verbindung getrennt</span>
                  <span class="pr-removed-ts">{{ formatDate(n.removed_at * 1000) }}</span>
                  <button class="pr-action pr-action--dismiss" @click="handleDismiss(n.soul_id)" title="Verwerfen">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- ── Peer list ── -->
            <div class="pr-section">
              <div v-if="loading && !connections.length" class="pr-empty">
                <svg class="spin pr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                Lade Peers…
              </div>
              <div v-else-if="!connections.length" class="pr-empty">
                Noch keine verbundenen Souls. Füge deinen ersten Peer hinzu.
              </div>
              <div v-else class="pr-chips">
                <div v-for="peer in connections" :key="peer.soul_id" class="pr-chip" :style="`border-left: 3px solid ${peerTextColor(peer.soul_id)}`">
                  <div class="pr-chip-avatar" :style="`background: ${avatarBg(peer.soul_id)}`">
                    {{ peer.alias.charAt(0).toUpperCase() }}
                  </div>
                  <div class="pr-chip-body">
                    <div class="pr-chip-alias">{{ peer.alias }}</div>
                    <div class="pr-chip-id">{{ shortId(peer.soul_id) }}</div>
                    <div class="pr-chip-status">
                      <span v-if="peer.mutual" class="pr-mutual-dot" />
                      {{ peer.mutual ? 'Gegenseitig' : '⏳ Bestätigung ausstehend · ' + (peer.domain || '').replace('https://', '') }}
                    </div>
                  </div>
                  <div class="pr-chip-actions">
                    <button v-if="!peer.peer_token" class="pr-action" @click="handleRetryHandshake(peer)" title="Handshake erneut versuchen (Peer war offline)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>
                      </svg>
                    </button>
                    <button class="pr-action" @click="onNav('chat')" title="In Session erwähnen">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/>
                      </svg>
                    </button>
                    <button class="pr-action pr-action--remove" @click="handleRemove(peer.soul_id, peer.alias)" title="Verbindung trennen">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>


          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
<ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useConfirm } from '~/composables/useConfirm.js'
import { computeMaturity } from '#shared/utils/soulMaturity.js'

definePageMeta({ layout: false })

const router = useRouter()
const { hasSoul, soulMeta, soulToken, soulContent, isLoaded } = useSoul() // soulToken needed for authHeaders
const maturity = computed(() => computeMaturity(soulContent.value).score)
const { ask } = useConfirm()

// ── Shell state ───────────────────────────────────────────────────────────────
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

// ── UI state ─────────────────────────────────────────────────────────────────
const addOpen = ref(false)

// ── Data ──────────────────────────────────────────────────────────────────────
const connections   = ref([])
const acceptingId   = ref(null)       // soul_id of request being named before accepting
const acceptAliases = reactive({})    // soul_id → alias draft
const removedByPeer = ref([])
const incoming      = ref([])
const loading       = ref(false)
const addLoading    = ref(false)
const addError      = ref('')
const newSoulId     = ref('')
const newAlias      = ref('')
const newDomain     = ref('')

// ── Helpers ───────────────────────────────────────────────────────────────────
// Text colors for chat sender names (solid, good contrast on dark bg)
const PEER_COLORS = [
  '#6db89a', // sage
  '#9c7cd6', // purple
  '#d4a46a', // amber
  '#6aadd4', // sky
  '#d46a9c', // rose
  '#94cb6d', // lime
]
const AVATAR_BG_COLORS = [
  'rgba(109,184,154,0.25)', 'rgba(138,108,184,0.20)', 'rgba(184,138,108,0.20)',
  'rgba(108,160,184,0.20)', 'rgba(184,108,138,0.20)', 'rgba(154,184,109,0.20)',
]

function peerColorIndex(id) {
  let n = 0
  for (let i = 0; i < (id || '').length; i++) n = (n * 31 + id.charCodeAt(i)) & 0xffff
  return n % PEER_COLORS.length
}
function peerTextColor(id) { return PEER_COLORS[peerColorIndex(id)] }
function avatarBg(id)      { return AVATAR_BG_COLORS[peerColorIndex(id)] }

function shortId(id) {
  if (!id || id.length <= 16) return id
  return id.slice(0, 8) + '…' + id.slice(-4)
}

function formatDate(ms) {
  if (!ms) return '–'
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - ms
  if (diff < 60_000) return 'gerade eben'
  if (diff < 3_600_000) return `vor ${Math.floor(diff / 60_000)} Min.`
  if (diff < 86_400_000) return `vor ${Math.floor(diff / 3_600_000)} Std.`
  if (diff < 172_800_000) return 'gestern'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

function authHeaders() {
  return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' }
}

// ── API ───────────────────────────────────────────────────────────────────────
async function loadConnections() {
  loading.value = true
  try {
    const res = await fetch('/api/vault/connections', { headers: authHeaders() })
    if (!res.ok) return
    const data = await res.json()
    connections.value   = data.connections       || []
    removedByPeer.value = data.removed_by_peer   || []
    incoming.value      = data.incoming_requests || []
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

async function handleAdd() {
  addError.value = ''
  const sid    = newSoulId.value.trim()
  const alias  = newAlias.value.trim()
  const domain = newDomain.value.trim()

  if (!sid || !alias) return
  if (!domain) {
    addError.value = 'Domain erforderlich (z.B. https://me.example.com).'
    return
  }
  if (!domain.startsWith('https://')) {
    addError.value = 'Domain muss mit https:// beginnen.'
    return
  }

  addLoading.value = true
  try {
    const body = { soul_id: sid, alias, domain, permissions: ['soul'] }

    const res = await fetch('/api/vault/connections', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { addError.value = data.error || 'Fehler beim Verbinden.'; return }

    newSoulId.value = ''
    newAlias.value  = ''
    newDomain.value = ''
    addOpen.value   = false
    await loadConnections()
  } catch { addError.value = 'Netzwerkfehler.' } finally {
    addLoading.value = false
  }
}

async function handleRetryHandshake(peer) {
  try {
    const res = await fetch('/api/vault/connections/retry-handshake', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ soul_id: peer.soul_id }),
    })
    let d = {}
    try { d = await res.json() } catch { /* non-JSON error response */ }
    if (res.ok && d.ok) {
      await loadConnections()
    } else {
      alert(`Handshake fehlgeschlagen (${res.status}): ${d.error || 'Unbekannter Fehler'}`)
    }
  } catch { alert('Netzwerkfehler beim Handshake — Peer vermutlich nicht erreichbar.') }
}

async function handleRemove(soulId, alias) {
  const ok = await ask(`Verbindung mit „${alias}" wirklich trennen?`, { confirm: 'Trennen', cancel: 'Abbrechen', danger: true })
  if (!ok) return
  try {
    await fetch(`/api/vault/connections/${encodeURIComponent(soulId)}`, {
      method: 'DELETE', headers: authHeaders(),
    })
    await loadConnections()
  } catch { /* ignore */ }
}

function startAccept(req) {
  acceptAliases[req.soul_id] = req.alias && !req.alias.match(/^[0-9a-f-]{8,}$/i) ? req.alias : ''
  acceptingId.value = req.soul_id
  nextTick(() => document.querySelector('.pr-alias-input')?.focus())
}

async function confirmAccept(req) {
  const alias = (acceptAliases[req.soul_id] || '').trim() || req.alias || req.soul_id.slice(0, 16)
  acceptingId.value = null
  await handleAcceptRequest(req, alias)
}

async function handleAcceptRequest(req, aliasOverride) {
  addLoading.value = true
  try {
    const alias = aliasOverride || req.alias || req.soul_id.slice(0, 16)
    const body = { soul_id: req.soul_id, alias, domain: req.domain || window.location.origin, permissions: req.permissions || ['soul'] }
    const res = await fetch('/api/vault/connections', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
    })
    if (res.ok) await loadConnections()
  } catch { /* ignore */ } finally { addLoading.value = false }
}

async function handleRejectRequest(soulId) {
  try {
    await fetch(`/api/vault/connections/incoming/${encodeURIComponent(soulId)}`, {
      method: 'DELETE', headers: authHeaders(),
    })
    incoming.value = incoming.value.filter(r => r.soul_id !== soulId)
  } catch { /* ignore */ }
}

async function handleDismiss(soulId) {
  try {
    await fetch(`/api/vault/connections/ack/${encodeURIComponent(soulId)}`, {
      method: 'DELETE', headers: authHeaders(),
    })
    removedByPeer.value = removedByPeer.value.filter(n => n.soul_id !== soulId)
  } catch { /* ignore */ }
}

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => { loadConnections() })

// ── Navigation ────────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'peers')    return
  if (id === 'settings') { router.push('/einstellungen'); return }
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/einrichten');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/einnahmen');   return }
  if (id === 'maturity') { router.push('/reife');       return }
  if (id === 'health')   { router.push('/gesundheit'); return }
  if (id === 'calendar') { router.push('/kalender');    return }
  if (id === 'anchor')   { router.push('/verankern');   return }
  if (id === 'export')   { router.push('/exportieren'); return }
  if (id === 'connect')  { router.push('/verbindung');  return }
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

.pr-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px clamp(16px, 3vw, 32px) 100px;
  display: flex; flex-direction: column; gap: 0;
}

/* ── Header ── */
.pr-head { margin-bottom: 24px; }
.pr-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 40px);
  font-weight: 400; letter-spacing: -0.025em; color: var(--fg);
  line-height: 1.1; margin: 8px 0 12px;
}
.pr-title em { font-style: italic; color: var(--accent); }
.pr-lede { font-size: 15px; line-height: 1.65; color: var(--fg); margin: 0; max-width: 560px; }

/* ── Toolbar ── */
.pr-toolbar {
  display: flex; gap: 8px; margin-bottom: 24px;
}
.pr-add-btn {
  display: inline-flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 20px;
  background: var(--accent); border: 1px solid var(--accent); border-radius: var(--r-xs);
  cursor: pointer; color: var(--on-accent);
  font-family: var(--sans); font-size: 14px; font-weight: 600; letter-spacing: 0;
  transition: all 0.15s;
}
.pr-add-btn:hover { background: var(--accent-bright); border-color: var(--accent-bright); box-shadow: 0 4px 14px var(--accent-glow); }
.pr-add-btn--open { background: var(--surface-2); border-color: var(--line-2); color: var(--fg-2); box-shadow: none; }
.pr-add-btn--open:hover { background: var(--surface); color: var(--fg); }
.pr-tab-ic { width: 14px; height: 14px; flex: none; }

/* ── Add form ── */
/* ── Add form fields ── */
.f-field { display: flex; flex-direction: column; gap: 7px; }
.f-label {
  font-family: var(--sans); font-size: 13px; font-weight: 500;
  color: var(--fg); letter-spacing: 0;
}
.f-label-opt { font-weight: 400; color: var(--fg-3); font-size: 12px; }
.f-inp {
  width: 100%; padding: 10px 13px;
  background: var(--surface-3); border: 1px solid var(--line-2);
  border-radius: var(--r-xs); color: var(--fg);
  font-family: var(--sans); font-size: 14px;
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  -webkit-appearance: none;
}
.f-inp--mono { font-family: var(--mono); font-size: 13px; }
.f-inp::placeholder { color: var(--fg-3); }
.f-inp:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-dim);
}
.f-error {
  font-size: 13px; color: #e06c75;
  border-left: 2px solid #e06c75; padding-left: 10px; margin: 0;
}

.pr-add-form {
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface-2);
  padding: 20px;
  display: flex; flex-direction: column; gap: 12px;
  margin-bottom: 24px;
}
.pr-add-fields {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.pr-field--full { grid-column: 1 / -1; }
.pr-add-foot {
  display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px;
  border-top: 1px solid var(--line);
}

/* ── @alle info ── */
.pr-atall {
  display: flex; align-items: flex-start; gap: 14px;
  border: 1px solid var(--line);
  border-bottom: none;
  background: var(--surface-2);
  padding: 16px 20px;
}
.pr-atall-ic { width: 20px; height: 20px; flex: none; color: var(--accent); margin-top: 2px; }
.pr-atall-title { font-size: 14px; font-weight: 600; color: var(--fg); margin-bottom: 4px; }
.pr-atall-text { font-size: 13.5px; line-height: 1.6; color: var(--fg-2); margin: 0; }
.pr-code { font-family: var(--mono); font-size: 12px; color: var(--accent-bright); background: var(--accent-dim); padding: 1px 5px; border-radius: 2px; }

/* ── Section ── */
.pr-section { margin-bottom: 0; }
.pr-section-label {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--line); border-bottom: none;
  border-radius: var(--r) var(--r) 0 0;
  padding: 13px 20px;
  background: var(--surface);
  font-family: var(--sans); font-size: 15px; font-weight: 500;
  letter-spacing: 0; text-transform: none; color: var(--fg);
}
.pr-badge {
  background: rgba(109,184,154,0.15); border: 1px solid rgba(109,184,154,0.30);
  border-radius: 99px; color: var(--accent-bright);
  font-size: 12px; padding: 2px 9px; letter-spacing: 0.03em;
}

.pr-mutual-dot {
  width: 5px; height: 5px; border-radius: 50%; flex: none;
  background: var(--accent); box-shadow: 0 0 4px var(--accent-glow);
}

/* ── Actions ── */
.pr-action {
  width: 32px; height: 32px; border-radius: var(--r-xs);
  border: 1px solid transparent; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-2); transition: all 0.12s;
}
.pr-action svg { width: 14px; height: 14px; }
.pr-action:hover { background: var(--surface-2); border-color: var(--line); color: var(--fg); }
.pr-action--accept:hover { background: var(--accent-dim); border-color: rgba(109,184,154,0.35); color: var(--accent-bright); }
.pr-action--reject:hover, .pr-action--remove:hover { background: rgba(224,108,117,0.08); border-color: rgba(224,108,117,0.25); color: #e06c75; }
.pr-action--dismiss:hover { background: var(--surface-2); color: var(--fg-3); }
.pr-alias-input {
  flex: 1; min-width: 0; height: 28px; padding: 0 8px;
  background: var(--surface); border: 1px solid var(--accent-dim);
  border-radius: var(--r-xs); color: var(--fg); font-size: 13px;
  outline: none;
}
.pr-alias-input:focus { border-color: var(--accent-bright); }

/* ── Removed list ── */
.pr-removed-list {
  border: 1px solid var(--line); border-top: none;
  background: var(--surface);
  border-radius: 0 0 var(--r) var(--r);
}
.pr-removed {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 20px; border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 14px; color: var(--fg-2);
}
.pr-removed:last-child { border-bottom: none; }
.pr-removed-alias { color: var(--fg); font-weight: 600; }
.pr-removed-text { flex: 1; }
.pr-removed-ts { color: var(--fg-3); font-size: 13px; }

/* ── Empty ── */
.pr-empty {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--line); border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  padding: 32px 20px;
  font-family: var(--mono); font-size: 14px; color: var(--fg-2);
  background: var(--surface);
}

/* ── Buttons ── */
.pr-btn {
  height: 38px; padding: 0 16px;
  font-family: var(--sans); font-size: 14px; letter-spacing: 0;
  cursor: pointer; border-radius: var(--r-xs);
  display: inline-flex; align-items: center; gap: 6px;
  transition: all 0.15s;
}
.pr-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.pr-btn--primary { background: var(--accent); border: 1px solid var(--accent); color: var(--on-accent); font-weight: 600; }
.pr-btn--primary:hover:not(:disabled) { background: var(--accent-bright); border-color: var(--accent-bright); box-shadow: 0 4px 14px var(--accent-glow); }
.pr-btn--ghost { background: transparent; border: 1px solid var(--line-2); color: var(--fg-2); }
.pr-btn--ghost:hover { color: var(--fg); background: var(--surface); }

/* ── Shared ── */
.pr-ic { width: 14px; height: 14px; flex: none; }
.spin { animation: pr-spin 1s linear infinite; }
@keyframes pr-spin { to { transform: rotate(360deg); } }

.slide-down-enter-active, .slide-down-leave-active { transition: all 0.2s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Chips grid ── */
.pr-chips {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  border: 1px solid var(--line);
  border-radius: 0 0 var(--r) var(--r);
  overflow: hidden;
  gap: 1px;
  background: var(--line); /* gap wird zur Trennlinie */
}

.pr-chip {
  display: flex; align-items: center; gap: 14px;
  padding: 18px 18px;
  background: var(--surface);
  transition: background 0.12s;
}
.pr-chip:hover     { background: var(--surface-2); }
.pr-chip--request  { background: rgba(109,184,154,0.03); }

.pr-chip-avatar {
  width: 42px; height: 42px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--serif); font-size: 18px; font-weight: 600;
  color: rgba(244,241,234,0.90);
}
.pr-chip-body { flex: 1; min-width: 0; }
.pr-chip-alias {
  font-family: var(--sans); font-size: 16px; font-weight: 600; color: var(--fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-chip-id {
  font-family: var(--mono); font-size: 13px; color: var(--fg-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px;
}
.pr-chip-status {
  display: flex; align-items: center; gap: 5px;
  font-family: var(--mono); font-size: 13px; color: var(--fg-2); margin-top: 3px;
}
.pr-chip-actions { display: flex; align-items: center; gap: 2px; flex: none; }

@media (max-width: 900px) {
  .pr-chips { grid-template-columns: 1fr; }
  .pr-chip  { border-right: none; }
  .pr-chip:nth-last-child(-n+2) { border-bottom: 1px solid var(--line); }
  .pr-chip:last-child { border-bottom: none; }
  .pr-add-fields { grid-template-columns: 1fr; }
  .pr-page { padding: 20px 16px 100px; }
  .pr-add-btn { width: 100%; justify-content: center; }
}
</style>
