<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="peers" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
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
              <button
                class="pr-tab"
                :class="{ 'pr-tab--on': addOpen }"
                @click="addOpen = !addOpen"
              >
                <svg class="pr-tab-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                Peer hinzufügen
              </button>
            </div>

            <!-- ── Add form (inline) ── -->
            <Transition name="slide-down">
              <div v-if="addOpen" class="pr-add-form">
                <div class="pr-add-fields">
                  <div class="pr-field">
                    <label class="pr-label">Soul-ID</label>
                    <input
                      v-model="newSoulId"
                      type="text"
                      class="pr-input"
                      placeholder="2c81aa74-0ed0-43c8-…"
                      autocomplete="off"
                      spellcheck="false"
                    />
                  </div>
                  <div class="pr-field">
                    <label class="pr-label">Alias</label>
                    <input
                      v-model="newAlias"
                      type="text"
                      class="pr-input"
                      placeholder="alice_abc"
                      maxlength="64"
                    />
                  </div>
                  <div class="pr-field pr-field--full">
                    <label class="pr-label">Domain <span class="pr-label-opt">(optional · für externe Peers)</span></label>
                    <input
                      v-model="newDomain"
                      type="text"
                      class="pr-input"
                      placeholder="https://alice.example.com"
                      autocomplete="off"
                    />
                  </div>
                </div>
                <p v-if="addError" class="pr-add-error">{{ addError }}</p>
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
              <div class="pr-cards">
                <div v-for="req in incoming" :key="req.soul_id" class="pr-card pr-card--request">
                  <div class="pr-card-avatar" :style="`background: ${avatarColor(req.alias)}`">
                    {{ (req.alias || req.soul_id).charAt(0).toUpperCase() }}
                  </div>
                  <div class="pr-card-body">
                    <div class="pr-card-alias">{{ req.alias || req.soul_id }}</div>
                    <div class="pr-card-id">{{ shortId(req.soul_id) }}</div>
                    <div v-if="req.domain" class="pr-card-domain">{{ req.domain.replace('https://', '') }}</div>
                  </div>
                  <div class="pr-card-actions">
                    <button class="pr-action pr-action--accept" @click="handleAcceptRequest(req)" title="Annehmen">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                      </svg>
                    </button>
                    <button class="pr-action pr-action--reject" @click="handleRejectRequest(req.soul_id)" title="Ablehnen">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                      </svg>
                    </button>
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
              <div v-else class="pr-cards">
                <div v-for="peer in connections" :key="peer.soul_id" class="pr-card">
                  <div class="pr-card-avatar" :style="`background: ${avatarColor(peer.alias)}`">
                    {{ peer.alias.charAt(0).toUpperCase() }}
                  </div>
                  <div class="pr-card-body">
                    <div class="pr-card-alias">{{ peer.alias }}</div>
                    <div class="pr-card-id">{{ shortId(peer.soul_id) }}</div>
                    <div class="pr-card-status">
                      <span v-if="peer.mutual" class="pr-mutual-dot" title="Gegenseitige Verbindung" />
                      {{ peer.domain ? peer.domain.replace('https://', '') : 'Zuletzt ' + formatDate(peer.connected_at * 1000) }}
                    </div>
                  </div>
                  <div class="pr-card-actions">
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

    <div v-else class="sys-loading">
      <span>SYS · lädt</span>
    </div>
    <ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useConfirm } from '~/composables/useConfirm.js'

definePageMeta({ layout: false })

const router = useRouter()
const { hasSoul, soulMeta, soulToken } = useSoul()
const { ask } = useConfirm()

// ── Shell state ───────────────────────────────────────────────────────────────
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

// ── UI state ─────────────────────────────────────────────────────────────────
const addOpen = ref(false)

// ── Data ──────────────────────────────────────────────────────────────────────
const connections   = ref([])
const removedByPeer = ref([])
const incoming      = ref([])
const loading       = ref(false)
const addLoading    = ref(false)
const addError      = ref('')
const newSoulId     = ref('')
const newAlias      = ref('')
const newDomain     = ref('')

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'rgba(109,184,154,0.55)', 'rgba(138,108,184,0.45)', 'rgba(184,138,108,0.45)',
  'rgba(108,160,184,0.45)', 'rgba(184,108,138,0.45)', 'rgba(154,184,109,0.45)',
]
function avatarColor(alias) {
  let n = 0
  for (let i = 0; i < (alias || '').length; i++) n = (n * 31 + alias.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

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
  if (domain && !domain.startsWith('https://')) {
    addError.value = 'Domain muss mit https:// beginnen.'
    return
  }

  addLoading.value = true
  try {
    const body = { soul_id: sid, alias, permissions: ['soul'] }
    if (domain) body.domain = domain

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

async function handleAcceptRequest(req) {
  addLoading.value = true
  try {
    const body = { soul_id: req.soul_id, alias: req.alias || req.soul_id.slice(0, 16), permissions: req.permissions || ['soul'] }
    if (req.domain) body.domain = req.domain
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
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/einrichten');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronik');     return }
  if (id === 'files')    { router.push('/dateien');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'maturity') { router.push('/reife');       return }
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
.pr-lede { font-size: 15px; line-height: 1.65; color: var(--fg-2); margin: 0; max-width: 560px; }

/* ── Toolbar ── */
.pr-toolbar {
  display: flex; gap: 8px; margin-bottom: 0;
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: var(--r) var(--r) 0 0;
  background: var(--surface);
  padding: 12px 16px;
}
.pr-tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 14px;
  border: 1px solid var(--line-2); border-radius: var(--r-xs);
  background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg-3); transition: all 0.15s;
}
.pr-tab:hover { color: var(--fg); border-color: var(--line-2); background: var(--surface-2); }
.pr-tab--on { background: var(--accent-dim); border-color: rgba(109,184,154,0.40); color: var(--accent-bright); }
.pr-tab-ic { width: 14px; height: 14px; flex: none; }

/* ── Add form ── */
.pr-add-form {
  border: 1px solid var(--line);
  border-bottom: none;
  background: var(--surface-2);
  padding: 20px;
  display: flex; flex-direction: column; gap: 12px;
}
.pr-add-fields {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.pr-field { display: flex; flex-direction: column; gap: 5px; }
.pr-field--full { grid-column: 1 / -1; }
.pr-label {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg-2);
}
.pr-label-opt { text-transform: none; letter-spacing: 0; font-family: inherit; color: var(--fg-4); font-size: 11px; }
.pr-input {
  background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--r-xs);
  color: var(--fg); font-family: var(--mono); font-size: 13px;
  padding: 8px 12px; outline: none; transition: border-color 0.15s;
}
.pr-input:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-glow); }
.pr-input::placeholder { color: var(--fg-4); }
.pr-add-error { font-family: var(--mono); font-size: 12px; color: #e06c75; margin: 0; }
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
  border-top: none;
  padding: 10px 20px;
  background: var(--surface);
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--fg-3);
}
.pr-section:first-child .pr-section-label { border-top: 1px solid var(--line); }
.pr-badge {
  background: rgba(109,184,154,0.15); border: 1px solid rgba(109,184,154,0.30);
  border-radius: 99px; color: var(--accent-bright);
  font-size: 10px; padding: 1px 7px; letter-spacing: 0.06em;
}

/* ── Cards ── */
.pr-cards {
  display: grid; grid-template-columns: 1fr 1fr;
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  overflow: hidden;
  background: var(--surface);
}
.pr-section:first-child .pr-cards {
  border-radius: var(--r);
  border-top: 1px solid var(--line);
}

.pr-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 20px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  transition: background 0.12s;
}
.pr-card:nth-child(2n) { border-right: none; }
.pr-card:nth-last-child(-n+2) { border-bottom: none; }
.pr-card:hover { background: var(--surface-2); }
.pr-card--request { background: rgba(109,184,154,0.03); }

.pr-card-avatar {
  width: 40px; height: 40px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--serif); font-size: 17px; font-weight: 600; color: rgba(244,241,234,0.90);
}

.pr-card-body { flex: 1; min-width: 0; }
.pr-card-alias {
  font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-card-id {
  font-family: var(--mono); font-size: 11px; color: var(--fg-4);
  letter-spacing: 0.06em; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-card-domain {
  font-family: var(--mono); font-size: 11px; color: var(--fg-4);
  margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-card-status {
  display: flex; align-items: center; gap: 5px;
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
  margin-top: 3px;
}
.pr-mutual-dot {
  width: 5px; height: 5px; border-radius: 50%; flex: none;
  background: var(--accent); box-shadow: 0 0 4px var(--accent-glow);
}

/* ── Actions ── */
.pr-card-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.pr-action {
  width: 32px; height: 32px; border-radius: var(--r-xs);
  border: 1px solid transparent; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-3); transition: all 0.12s;
}
.pr-action svg { width: 14px; height: 14px; }
.pr-action:hover { background: var(--surface-2); border-color: var(--line); color: var(--fg); }
.pr-action--accept:hover { background: var(--accent-dim); border-color: rgba(109,184,154,0.35); color: var(--accent-bright); }
.pr-action--reject:hover, .pr-action--remove:hover { background: rgba(224,108,117,0.08); border-color: rgba(224,108,117,0.25); color: #e06c75; }
.pr-action--dismiss:hover { background: var(--surface-2); color: var(--fg-3); }

/* ── Removed list ── */
.pr-removed-list {
  border: 1px solid var(--line); border-top: none;
  background: var(--surface);
  border-radius: 0 0 var(--r) var(--r);
}
.pr-removed {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 20px; border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 12px; color: var(--fg-3);
}
.pr-removed:last-child { border-bottom: none; }
.pr-removed-alias { color: var(--fg-2); font-weight: 600; }
.pr-removed-text { flex: 1; }
.pr-removed-ts { color: var(--fg-4); font-size: 11px; }

/* ── Empty ── */
.pr-empty {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--line); border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  padding: 32px 20px;
  font-family: var(--mono); font-size: 12.5px; color: var(--fg-3);
  background: var(--surface);
}

/* ── Buttons ── */
.pr-btn {
  height: 36px; padding: 0 16px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em;
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

@media (max-width: 900px) {
  .pr-cards { grid-template-columns: 1fr; }
  .pr-card { border-right: none; }
  .pr-card:nth-last-child(-n+2) { border-bottom: 1px solid var(--line); }
  .pr-card:last-child { border-bottom: none; }
  .pr-add-fields { grid-template-columns: 1fr; }
  .pr-page { padding: 20px 16px 100px; }
  .pr-toolbar { padding: 10px 12px; }
  .pr-tab { width: 100%; justify-content: center; }
}
</style>
