<template>
  <Transition name="sys-modal" appear>
    <div
      class="sys-amm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Agent Marketplace einrichten"
      @click.self="$emit('close')"
    >
      <div class="sys-amm">
        <!-- ═══════════ HEADER ═══════════ -->
        <header class="amm-head">
          <button class="amm-close" @click="$emit('close')" aria-label="Schließen">
            <span aria-hidden="true">×</span>
          </button>

          <!-- Drag handle for mobile sheet -->
          <div class="amm-handle" aria-hidden="true"></div>
        </header>

        <!-- ═══════════ STEP RAIL ═══════════ -->
        <nav class="amm-rail" aria-label="Schritte">
          <button
            v-for="(s, i) in steps"
            :key="s.id"
            class="amm-rail-item"
            :class="{ on: step === s.id, done: s.done }"
            :disabled="!s.done && step !== s.id && !canJumpTo(s.id)"
            @click="goTo(s.id)"
          >
            <span class="num">
              <span v-if="s.done" class="check">✓</span>
              <span v-else>{{ i + 1 }}</span>
            </span>
            <span class="lbl">
              <span class="t">{{ s.title }}</span>
              <span class="sub">{{ s.subtitle }}</span>
            </span>
          </button>
        </nav>

        <!-- ═══════════ BODY ═══════════ -->
        <div class="amm-body">
          <!-- ───── STEP 1 · ZUGANGSMODUS ───── -->
          <section v-if="step === 'mode'" class="step">
            <div class="step-head">
              <h2 class="step-title">Zugang <em>festlegen</em></h2>
            </div>

            <p class="prose">
              Bestimme, wie andere KI-Assistenten auf deine Soul-Daten zugreifen dürfen —
              kostenlos oder gegen eine Zahlung in POL (Kryptowährung auf Polygon).
            </p>

            <!-- ── Dein Zugangscode ── -->
            <div class="field" style="margin-bottom:24px">
              <label class="field-label">Dein Zugangscode <span class="field-hint">(als Bearer-Token im KI-Assistenten eintragen)</span></label>
              <div class="bearer-row">
                <code class="bearer-val">{{ soulBearerToken || '—' }}</code>
                <button class="bearer-copy" :class="{ copied: bearerCopied }" @click="copyBearer" :disabled="!soulBearerToken">
                  {{ bearerCopied ? '✓ Kopiert' : 'Kopieren' }}
                </button>
              </div>
            </div>

            <!-- ── Verbundene Peers ── -->
            <div class="connected-head">
              <h3 class="connected-title">Verbundene <em>Peers</em></h3>
            </div>
            <p class="prose" style="margin-bottom:16px">
              Peers haben gegenseitig kostenlosen Zugriff auf alle MCP-Tools — ohne Zahlung.
              Trage deinen Zugangscode (oben) auf dem Peer-Node ein.
              Für Cross-Domain-Nachrichten: beide Seiten müssen sich gegenseitig mit <code>https://domain</code> als Endpoint eintragen.
            </p>

            <div v-if="peers.length" class="node-list">
              <div v-for="(peer, i) in peers" :key="peer.soul_id" class="node-row">
                <div class="node-info">
                  <span v-if="peer.label" class="node-label">{{ peer.label }}</span>
                  <span class="node-url mono">{{ peer.soul_id }}</span>
                  <div class="peer-endpoint-row">
                    <input
                      :value="peer.endpoint"
                      @change="e => { peer.endpoint = e.target.value.trim().replace(/\/$/, ''); savePeersSilent() }"
                      class="input peer-endpoint-input"
                      placeholder="https://peer.domain.com"
                      title="Cross-Domain-Endpoint (leer = same-server)"
                    />
                  </div>
                </div>
                <button class="node-remove" @click="removePeer(i)" aria-label="Peer entfernen">×</button>
              </div>
            </div>
            <p v-else class="no-nodes">Noch keine Peers verbunden.</p>

            <div class="own-endpoint-row">
              <span class="oe-label">Dein Endpoint</span>
              <code class="oe-val">{{ ownOrigin }}</code>
              <button class="oe-copy" :class="{ copied: endpointCopied }" @click="copyOwnEndpoint">{{ endpointCopied ? '✓' : 'Kopieren' }}</button>
            </div>

            <div class="peer-form">
              <div class="peer-form-inputs">
                <input v-model="newPeer.soul_id" class="input mono" placeholder="Soul-ID (UUID)" @keydown.enter.prevent="addPeer" />
                <input v-model="newPeer.endpoint" class="input" placeholder="https://peer.domain.com" title="Cross-Domain-Endpoint (leer = same-server)" @keydown.enter.prevent="addPeer" />
              </div>
              <div class="peer-form-row">
                <input v-model="newPeer.label" class="input" placeholder="Name (Pflicht — z.B. Jan)" style="flex:1" @keydown.enter.prevent="addPeer" />
                <button class="btn btn-ghost" :disabled="!newPeer.soul_id.trim() || !newPeer.label.trim()" @click="addPeer">+ Hinzufügen</button>
              </div>
              <p v-if="peerError" class="field-error" style="margin-top:4px">{{ peerError }}</p>
            </div>

            <div class="section-divider"></div>

            <!-- ── Wer darf zugreifen? ── -->
            <div class="connected-head">
              <h3 class="connected-title">Wer darf <em>zugreifen?</em></h3>
            </div>
            <p class="prose" style="margin-bottom:16px">
              Lege fest, ob KI-Assistenten anderer Personen kostenlos oder gegen Bezahlung auf deine Soul zugreifen dürfen.
            </p>

            <div class="mode-grid">
              <button
                class="mode-card"
                :class="{ on: !amort.enabled }"
                @click="setMode('free')"
              >
                <div class="mode-card-head">
                  <span class="mode-mark"></span>
                  <span class="mode-name">Frei</span>
                </div>
                <p class="mode-desc">Jeder KI-Assistent kann deine Soul-Daten lesen — ohne Einschränkung.</p>
                <span class="mode-tag">empfohlen</span>
              </button>

              <button
                class="mode-card"
                :class="{ on: amort.enabled }"
                @click="setMode('pay')"
              >
                <div class="mode-card-head">
                  <span class="mode-mark"></span>
                  <span class="mode-name">Bezahlt · POL</span>
                </div>
                <p class="mode-desc">Pro Zugriff wird automatisch ein kleiner Betrag POL an dich überwiesen.</p>
                <span class="mode-tag">on-chain</span>
              </button>
            </div>

            <!-- Pay-mode form -->
            <div v-if="amort.enabled" class="pay-form">
              <div class="pay-fields">
                <div class="field">
                  <label class="field-label">Betrag pro Zugriff <span class="field-hint">(in POL)</span></label>
                  <input v-model="amort.pol_per_request" type="text" class="input mono" placeholder="0.001" />
                </div>
                <div class="field">
                  <label class="field-label">Deine Wallet-Adresse</label>
                  <input v-model="amort.wallet" type="text" class="input mono" placeholder="0xABCD…" />
                </div>
                <div class="field">
                  <label class="field-label">Token-Gültigkeit <span class="field-hint">(1–30 Tage)</span></label>
                  <input
                    :value="amort.token_duration_days"
                    @input="amort.token_duration_days = Math.min(30, Math.max(1, Math.floor(Number($event.target.value) || 1)))"
                    @blur="$event.target.value = amort.token_duration_days"
                    type="number" min="1" max="30" step="1" class="input" placeholder="1"
                  />
                </div>
                <div class="field span-2">
                  <label class="field-label">Freigegebene Agent-Tools <span class="field-hint">(nach Zahlung verfügbar)</span></label>
                  <div class="tools-row">
                    <input v-model="agentToolsStr" type="text" class="input mono" placeholder="soul_read, verify_human" />
                    <button class="tools-add" type="button" :class="{ on: showToolPicker }" @click.stop="showToolPicker = !showToolPicker" aria-label="Tool auswählen">+</button>
                  </div>
                  <div v-if="showToolPicker" class="tools-picker" @click.stop>
                    <button
                      v-for="tool in AVAILABLE_TOOLS"
                      :key="tool"
                      type="button"
                      class="tool-chip"
                      :class="{ active: amort.agent_tools.includes(tool) }"
                      :title="tool"
                      @click="toggleTool(tool)"
                    >
                      <span class="chip-check">{{ amort.agent_tools.includes(tool) ? '✓' : '+' }}</span>
                      {{ TOOL_LABELS[tool] || tool }}
                    </button>
                    <button
                      v-for="tool in BETA_TOOLS"
                      :key="tool"
                      type="button"
                      class="tool-chip tool-chip--beta"
                      disabled
                      :title="`${tool} — Beta · Selbst integrieren`"
                    >
                      <span class="chip-check" style="opacity:0.4">·</span>
                      {{ tool }}
                      <span class="chip-beta">β</span>
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="amortError" class="field-error">{{ amortError }}</p>
              <p v-else-if="amortSuccess" class="field-ok">Gespeichert ✓</p>
            </div>

            <div v-else class="state-ok subtle">
              <span class="state-mark"></span>
              <div class="state-text">
                <span class="state-label">{{ modeLoading ? 'Wird gespeichert…' : 'Frei-Modus aktiv' }}</span>
                <span class="state-value">Jeder KI-Assistent kann deine Soul-Daten kostenlos lesen.</span>
              </div>
            </div>
          </section>

          <!-- ───── STEP 2 · IPFS REGISTRATION ───── -->
          <section v-else-if="step === 'ipfs'" class="step">
            <div class="step-head">
              <h2 class="step-title">Auf IPFS <em>veröffentlichen</em></h2>
            </div>

            <p class="prose">
              Pinnt ERC-8004-Metadaten via Pinata. Deine Soul erscheint danach im Marketplace und ist
              für externe Agenten auffindbar.
            </p>

            <div v-if="!pinataOk" class="prereq">
              <span class="prereq-mark">!</span>
              <div>
                <span class="prereq-label">Pinata-JWT fehlt — bitte in den Einstellungen hinterlegen</span>
              </div>
            </div>

            <div class="card">
              <div class="card-head">
                <span class="kicker">Metadaten · editierbar</span>
              </div>
              <div class="card-body">
                <div class="field">
                  <label class="field-label">Name</label>
                  <input v-model="preview.name" type="text" class="input" @blur="persistMetaFields()" />
                </div>
                <div class="field">
                  <label class="field-label">Beschreibung <span class="field-hint">optional</span></label>
                  <div class="translate-wrap">
                    <input v-model="preview.description" type="text" class="input" placeholder="Kurze Beschreibung der Soul…" @blur="translateField('description')" />
                    <span v-if="translating.description" class="translate-spin">⟳</span>
                  </div>
                </div>
                <div class="field">
                  <label class="field-label">Discovery-Tags <span class="field-hint">Schlagwörter für soul_discover — KI und Menschen finden dich damit (Komma-getrennt)</span></label>
                  <div class="translate-wrap">
                    <input v-model="preview.tags" type="text" class="input" placeholder="Marburg, AI, Design, Musik…" @blur="translateField('tags')" />
                    <span v-if="translating.tags" class="translate-spin">⟳</span>
                  </div>
                </div>
              </div>

              <details class="readonly">
                <summary>
                  <span>Readonly · Endpoints &amp; Schema</span>
                  <span class="flow-arrow">▾</span>
                </summary>
                <dl class="readonly-list">
                  <template v-for="(val, key) in previewReadonly" :key="key">
                    <dt>{{ key }}</dt>
                    <dd>{{ typeof val === 'object' ? JSON.stringify(val) : val }}</dd>
                  </template>
                </dl>
              </details>
            </div>

            <div v-if="currentCid" class="cid">
              <span class="kicker">Aktueller CID</span>
              <p class="cid-value">{{ currentCid }}</p>
              <a class="cid-link" :href="`https://gateway.pinata.cloud/ipfs/${currentCid}`" target="_blank" rel="noopener">
                Gateway öffnen <span class="arr">↗</span>
              </a>
            </div>

            <p v-if="registerError" class="field-error">{{ registerError }}</p>
            <p v-if="newCid" class="field-ok">Veröffentlicht ✓ · CID: {{ newCid.slice(0, 20) }}…</p>
          </section>
        </div>

        <!-- ═══════════ FOOT ═══════════ -->
        <footer class="amm-foot">
          <div class="amm-foot-meta">
            <span class="dot" :class="overallStatus.kind"></span>
            {{ overallStatus.text }}
          </div>

          <div class="amm-foot-actions">
            <button v-if="step !== 'mode'" class="btn btn-ghost" @click="prevStep">← Zurück</button>

            <button
              v-if="step === 'mode'"
              class="btn btn-primary"
              :disabled="!canAdvance"
              @click="primaryAction"
            >
              {{ amort.enabled ? (savingAmort ? 'Speichern…' : 'Speichern &amp; weiter →') : 'Weiter →' }}
            </button>

            <button
              v-else
              class="btn btn-primary"
              :disabled="!pinataOk || registering"
              @click="register"
            >
              {{ registering ? 'Veröffentliche…' : (registered ? 'Erneut veröffentlichen' : 'Veröffentlichen') }}
            </button>
          </div>

        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'

const props = defineProps({
  soulCert: { type: String, default: '' },
})
const emit = defineEmits(['close'])

// ═══════════ STEP MACHINE ═══════════
const step = ref('mode') // 'mode' | 'ipfs'

const steps = computed(() => [
  { id: 'mode',   title: 'Zugang',   subtitle: 'Frei oder bezahlt', done: amortActive.value || (!amort.enabled && modeTouched.value) },
  { id: 'ipfs',   title: 'IPFS',     subtitle: 'Veröffentlichen',  done: registered.value },
])

function canJumpTo(_id) {
  return true
}

function goTo(id) {
  if (id === step.value || canJumpTo(id) || steps.value.find(s => s.id === id)?.done) {
    step.value = id
  }
}

function prevStep() {
  const order = ['mode', 'ipfs']
  const i = order.indexOf(step.value)
  if (i > 0) step.value = order[i - 1]
}

const canAdvance = computed(() => {
  if (step.value === 'mode') return !amort.enabled || (amort.wallet.trim() && amort.pol_per_request.trim())
  return true
})

async function primaryAction() {
  if (step.value === 'mode') {
    if (amort.enabled) {
      await saveAmort()
      if (!amortError.value) step.value = 'ipfs'
    } else {
      step.value = 'ipfs'
    }
  }
}

const overallStatus = computed(() => {
  const done = steps.value.filter(s => s.done).length
  if (done === 2) return { kind: 'ok',   text: 'Marketplace · vollständig eingerichtet' }
  if (done > 0)   return { kind: 'live', text: `${done} von 2 Schritten · in Arbeit` }
  return            { kind: 'idle', text: 'Setup · noch nicht begonnen' }
})

// ═══════════ STATE ═══════════
const pinataJwt     = ref('')
const pinataPreview = ref('')
const pinataOk      = ref(false)
const savingPinata  = ref(false)
const pinataError   = ref('')

const amort = reactive({
  enabled:              false,
  pol_per_request:      '0.001',
  wallet:               '',
  agent_tools:          ['soul_read', 'verify_human', 'soul_maturity'],
  token_duration_days:  1,
})

// Unified peers: { soul_id, endpoint, label }
const peers     = ref([])
const newPeer   = reactive({ soul_id: '', endpoint: '', label: '' })
const peerError = ref('')

function buildPeers(trustedSouls, localNodes) {
  const labelMap = new Map()
  for (const n of localNodes) {
    const sid = n.soul_id || n.url?.match(/[?&]soul_id=([^&]+)/)?.[1]
    if (sid) labelMap.set(sid, n.label || '')
  }
  return trustedSouls
    .map(t => {
      if (typeof t === 'string') return { soul_id: t, endpoint: '', label: labelMap.get(t) || '' }
      if (typeof t === 'object' && t?.soul_id) return { soul_id: t.soul_id, endpoint: t.endpoint || '', label: t.label || labelMap.get(t.soul_id) || '' }
      return null
    })
    .filter(Boolean)
}

function peersToTrustedSouls(peersArr) {
  return peersArr.map(p => p.endpoint ? { soul_id: p.soul_id, endpoint: p.endpoint } : p.soul_id)
}

function addPeer() {
  peerError.value = ''
  const sid = newPeer.soul_id.trim()
  if (!/^[a-f0-9-]{36}$/i.test(sid)) return
  const label = newPeer.label.trim()
  if (!label) return
  if (peers.value.some(p => p.soul_id === sid)) { peerError.value = 'Dieser Peer ist bereits verbunden.'; return }
  if (peers.value.some(p => p.label?.toLowerCase() === label.toLowerCase())) {
    peerError.value = `Name "${label}" ist bereits vergeben — bitte eindeutigen Namen wählen.`
    return
  }
  peers.value.push({ soul_id: sid, endpoint: newPeer.endpoint.trim().replace(/\/$/, ''), label })
  newPeer.soul_id = ''
  newPeer.endpoint = ''
  newPeer.label = ''
  savePeersSilent()
}

function removePeer(i) {
  peers.value.splice(i, 1)
  savePeersSilent()
}

async function savePeersSilent() {
  if (nodesStorageKey.value) {
    const nodes = peers.value.map(p => ({
      soul_id: p.soul_id,
      url: p.endpoint ? `${p.endpoint}/mcp` : `${window.location.origin}/mcp`,
      label: p.label,
    }))
    localStorage.setItem(nodesStorageKey.value, JSON.stringify(nodes))
  }
  try {
    await fetch(`${BASE()}/api/soul/amortization`, {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({
        enabled: amort.enabled,
        pol_per_request: amort.pol_per_request,
        wallet: amort.wallet,
        agent_tools: amort.agent_tools,
        trusted_souls: peersToTrustedSouls(peers.value),
        token_duration_days: Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
      }),
    })
  } catch { /* silent */ }
}
const agentToolsStr = computed({
  get: () => amort.agent_tools.join(', '),
  set: v => { amort.agent_tools = v.split(',').map(s => s.trim()).filter(Boolean) },
})
const amortActive   = ref(false)
const savingAmort   = ref(false)
const modeLoading   = ref(false)
const modeTouched   = ref(false)
const amortError    = ref('')
const amortSuccess  = ref(false)

// ═══════════ SOUL BEARER ═══════════
const bearerCopied    = ref(false)
const soulBearerToken = computed(() => props.soulCert || '')

// ═══════════ OWN ENDPOINT ═══════════
const endpointCopied = ref(false)
const ownOrigin = typeof window !== 'undefined' ? window.location.origin : ''

async function copyOwnEndpoint() {
  try {
    await navigator.clipboard.writeText(ownOrigin)
    endpointCopied.value = true
    setTimeout(() => { endpointCopied.value = false }, 2000)
  } catch { /* ignore */ }
}

const nodesStorageKey = computed(() => {
  const id = props.soulCert?.split('.')?.[0] || ''
  return id ? `sys.connected_nodes.${id}` : null
})

async function copyBearer() {
  if (!soulBearerToken.value) return
  try {
    await navigator.clipboard.writeText(`Bearer ${soulBearerToken.value}`)
    bearerCopied.value = true
    setTimeout(() => { bearerCopied.value = false }, 2000)
  } catch { /* ignore */ }
}

const currentCid    = ref('')
const registered    = ref(false)
const registering   = ref(false)
const registerError = ref('')
const newCid        = ref('')

const preview        = ref({ name: '', description: '', tags: '' })
const previewLoading = ref(false)

const previewReadonly = computed(() => {
  if (!preview.value) return {}
  const p = preview.value
  const out = {}
  if (p.soul_id)           out.soul_id           = p.soul_id
  if (p.mcp_endpoint)      out.mcp_endpoint      = p.mcp_endpoint
  if (p.pay_endpoint)      out.pay_endpoint      = p.pay_endpoint
  if (p.verify_endpoint)   out.verify_endpoint   = p.verify_endpoint
  if (p.amortization)      out.amortization      = p.amortization
  if (p.schema)            out.schema            = p.schema
  if (p.version)           out.version           = p.version
  if (p.maturity != null)  out.maturity          = p.maturity
  return out
})

// ═══════════ LIVE-ÜBERSETZUNG ═══════════
const translating = reactive({ description: false, tags: false })

async function persistMetaFields() {
  if (!props.soulCert) return
  try {
    await fetch('/api/soul/amortization', {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({
        enabled:             amort.enabled,
        pol_per_request:     amort.pol_per_request,
        wallet:              amort.wallet,
        agent_tools:         amort.agent_tools,
        trusted_souls:       peersToTrustedSouls(peers.value),
        token_duration_days: Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
        name:                preview.value.name || '',
        description:         preview.value.description || '',
        tags:                (preview.value.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      }),
    })
  } catch { /* silent */ }
}

async function translateField(field) {
  const text = field === 'tags' ? preview.value.tags : preview.value.description
  if (!text || !text.trim() || !props.soulCert) return
  translating[field] = true
  try {
    const r = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.soulCert}` },
      body: JSON.stringify({ text: text.trim(), type: field }),
    })
    if (r.ok) {
      const d = await r.json()
      if (d.translated && d.translated !== text.trim()) {
        if (field === 'tags') preview.value.tags = d.translated
        else preview.value.description = d.translated
      }
    }
    await persistMetaFields()
  } catch { /* silent */ } finally {
    translating[field] = false
  }
}

// ═══════════ TOOL PICKER ═══════════
const showToolPicker = ref(false)

// soul_discover ist immer verfügbar (kein Auth nötig) → nicht konfigurierbar
// Nur Tools die registerPaidTools() tatsächlich registriert
const AVAILABLE_TOOLS = [
  'audio_get', 'audio_list',
  'calendar_read',
  'context_get', 'context_list',
  'health_check_payed',
  'image_get', 'image_list',
  'profile_get',
  'shop_write_read',
  'soul_maturity', 'soul_read', 'soul_skills',
  'verify_human',
  'video_get', 'video_list',
]

const TOOL_LABELS = {
  audio_get:          'Audio abrufen',
  audio_list:         'Audio auflisten',
  calendar_read:      'Kalender lesen',
  context_get:        'Kontext lesen',
  context_list:       'Kontext auflisten',
  health_check_payed: 'Gesundheit',
  image_get:          'Bild abrufen',
  image_list:         'Bilder auflisten',
  profile_get:        'Profil abrufen',
  shop_write_read:    'Shopping',
  soul_maturity:      'Reifegrad',
  soul_read:          'Soul lesen',
  soul_skills:        'Skills',
  verify_human:       'Menschlichkeit',
  video_get:          'Video abrufen',
  video_list:         'Videos auflisten',
}

// Beta tools — sichtbar aber nicht interaktiv (developer opt-in)
const BETA_TOOLS = ['elevenlabs_agent_update']

function toggleTool(name) {
  const idx = amort.agent_tools.indexOf(name)
  if (idx === -1) amort.agent_tools.push(name)
  else amort.agent_tools.splice(idx, 1)
}

watch(step, (newStep) => {
  showToolPicker.value = false
  if (newStep === 'ipfs') loadPreview()
})

const BASE = () => ''
function authHeader() {
  return { 'Authorization': `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' }
}

// ═══════════ LOAD ═══════════
onMounted(async () => {
  if (!props.soulCert) return
  await Promise.all([loadPinata(), loadAmort()])
  if (!amortActive.value && !modeTouched.value) step.value = 'mode'
  else if (!registered.value) step.value = 'ipfs'
  if (step.value === 'ipfs') loadPreview()
})

async function loadPinata() {
  try {
    const r = await fetch(`${BASE()}/api/soul/pinata-config`, { headers: authHeader() })
    if (!r.ok) return
    const d = await r.json()
    pinataOk.value      = d.configured
    pinataPreview.value = d.preview || ''
  } catch { /* ignore */ }
}

async function loadAmort() {
  try {
    const r = await fetch(`${BASE()}/api/soul/amortization`, { headers: authHeader() })
    if (!r.ok) return
    const d = await r.json()
    const a = d.amortization || {}
    amort.enabled         = a.enabled         ?? false
    amort.pol_per_request = a.pol_per_request ?? '0.001'
    amort.wallet          = a.wallet          ?? ''
    amort.agent_tools          = Array.isArray(a.agent_tools) ? a.agent_tools : (Array.isArray(a.free_tools) ? a.free_tools : ['soul_read', 'verify_human', 'soul_maturity'])
    amort.token_duration_days  = Math.min(30, Math.max(1, parseInt(a.token_duration_days) || 1))
    const rawTrustedSouls = Array.isArray(a.trusted_souls)
      ? a.trusted_souls.filter(t => typeof t === 'string' || (typeof t === 'object' && t?.soul_id))
      : []
    let localNodes = []
    if (nodesStorageKey.value) {
      try { localNodes = JSON.parse(localStorage.getItem(nodesStorageKey.value) || '[]') } catch { /* ignore */ }
    }
    peers.value           = buildPeers(rawTrustedSouls, localNodes)
    amortActive.value     = amort.enabled
    if (a.enabled !== undefined) modeTouched.value = true
    currentCid.value      = a.agent_registry_cid || ''
    registered.value      = !!currentCid.value
  } catch { /* ignore */ }
}

// ═══════════ ACTIONS ═══════════
async function savePinata() {
  pinataError.value = ''
  savingPinata.value = true
  try {
    const r = await fetch(`${BASE()}/api/soul/pinata-config`, {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({ jwt: pinataJwt.value.trim() }),
    })
    const d = await r.json()
    if (!r.ok) { pinataError.value = d.error || 'Fehler beim Speichern'; return }
    pinataJwt.value = ''
    await loadPinata()
  } catch (e) {
    pinataError.value = e.message
  } finally {
    savingPinata.value = false
  }
}

async function clearPinata() {
  pinataError.value = ''
  try {
    await fetch(`${BASE()}/api/soul/pinata-config`, { method: 'DELETE', headers: authHeader() })
    pinataOk.value      = false
    pinataPreview.value = ''
  } catch { /* ignore */ }
}

async function setMode(mode) {
  amortError.value = ''
  modeTouched.value = true
  const enabling = (mode === 'pay')
  amort.enabled = enabling

  if (!enabling) {
    modeLoading.value = true
    try {
      const r = await fetch(`${BASE()}/api/soul/amortization`, {
        method: 'PUT',
        headers: authHeader(),
        body: JSON.stringify({
          enabled:              false,
          pol_per_request:      amort.pol_per_request,
          wallet:               amort.wallet,
          agent_tools:          amort.agent_tools,
          trusted_souls:        peersToTrustedSouls(peers.value),
          token_duration_days:  Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        amortError.value = d.error || d.message || 'Fehler beim Speichern'
        amort.enabled = true
        return
      }
      amortActive.value = false
    } catch (e) {
      amortError.value = e.message
      amort.enabled = true
    } finally {
      modeLoading.value = false
    }
  }
}

async function saveAmort() {
  amortError.value   = ''
  amortSuccess.value = false
  savingAmort.value  = true
  try {
    const r = await fetch(`${BASE()}/api/soul/amortization`, {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({
        enabled:              amort.enabled,
        pol_per_request:      amort.pol_per_request,
        wallet:               amort.wallet,
        agent_tools:          amort.agent_tools,
        trusted_souls:        peersToTrustedSouls(peers.value),
        token_duration_days:  Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
      }),
    })
    const d = await r.json()
    if (!r.ok) { amortError.value = d.error || d.message || 'Fehler beim Speichern'; return }
    amortActive.value  = amort.enabled
    amortSuccess.value = true
    setTimeout(() => { amortSuccess.value = false }, 3000)
  } catch (e) {
    amortError.value = e.message
  } finally {
    savingAmort.value = false
  }
}

async function loadPreview() {
  previewLoading.value = true
  try {
    const r = await fetch(`${BASE()}/api/soul/register-preview`, { headers: authHeader() })
    if (!r.ok) return
    const d = await r.json()
    if (d.preview) preview.value = {
      ...d.preview,
      description: d.preview.description || '',
      tags: Array.isArray(d.preview.tags) ? d.preview.tags.join(', ') : (d.preview.tags || ''),
    }
  } catch { /* ignore */ } finally {
    previewLoading.value = false
  }
}

async function register() {
  registerError.value = ''
  newCid.value        = ''
  registering.value   = true
  try {
    const body = {}
    if (preview.value?.name)        body.name_override = preview.value.name
    if (preview.value?.description) body.description   = preview.value.description
    const tagsArr = (preview.value?.tags || '').split(',').map(t => t.trim()).filter(Boolean)
    if (tagsArr.length)             body.tags          = tagsArr

    const r = await fetch(`${BASE()}/api/soul/register`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (!r.ok) {
      const detail = typeof d.detail === 'string' ? ` — ${d.detail.slice(0, 120)}` : (d.detail?.message ? ` — ${d.detail.message}` : '')
      registerError.value = (d.error || d.message || 'Registrierung fehlgeschlagen') + detail
      return
    }
    newCid.value     = d.cid || ''
    currentCid.value = d.cid || ''
    registered.value = true
    await loadPreview()
  } catch (e) {
    registerError.value = e.message
  } finally {
    registering.value = false
  }
}
</script>

<style scoped>
/* ═══════════════ SYS · violet editorial system ═══════════════ */
.sys-amm-overlay {
  --ink:#08070c; --paper:#12101a; --paper-2:#1a1726; --paper-3:#0d0b14;
  --rule:rgba(226,220,240,0.10); --rule-2:rgba(226,220,240,0.20);
  --fg:#ece7f5; --fg-2:rgba(236,231,245,0.88); --fg-3:rgba(236,231,245,0.70); --fg-4:rgba(236,231,245,0.55);
  --accent:#8b5cf6; --accent-2:rgba(139,92,246,0.14); --accent-bright:#a78bfa; --accent-deep:#6d28d9; --on-accent:#0a0810;
  --ok:#b8dcc4; --warn:#a78bfa; --err:#f0a3a3;
  --serif:'Noto Serif', Georgia, serif;
  --sans:'Inter', system-ui, -apple-system, sans-serif;
  --mono:'JetBrains Mono', ui-monospace, monospace;

  position: fixed; inset: 0; z-index: 50;
  background: rgba(7,6,11,0.78); backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--sans); color: var(--fg);
  padding: 24px;
}

.sys-amm {
  width: 100%; max-width: 720px;
  max-height: 92dvh;
  background: var(--paper);
  border: 1px solid var(--rule-2);
  border-radius: 16px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
  box-shadow: 0 60px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.06);
}

/* ─── HEAD ─── */
.amm-head { position: relative; display: flex; align-items: center; justify-content: flex-end; padding: 8px 12px; min-height: 44px; border-bottom: 0; background: var(--paper-3); }
.amm-handle { display: none; }
.amm-close { position: static; width: 36px; height: 36px; border: 1px solid var(--rule-2); background: transparent; color: var(--fg-3); cursor: pointer; font-size: 22px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; flex: none; }
.amm-close:hover { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }

.kicker { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--accent); width: fit-content; }

.display { font-family: var(--serif); font-weight: 400; font-size: clamp(28px, 4vw, 40px); line-height: 0.98; letter-spacing: -0.025em; margin: 0 0 16px; color: var(--fg); text-wrap: balance; }
.display em { font-style: italic; color: var(--accent); }

.lede { font-family: var(--serif); font-size: 15px; line-height: 1.55; color: var(--fg-2); margin: 0; max-width: 60ch; }
.lede code { font-family: var(--mono); font-size: 12px; color: var(--accent-bright); background: var(--accent-2); padding: 2px 6px; border: 1px solid rgba(139,92,246,0.2); }

/* ─── STEP RAIL ─── */
.amm-rail { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--rule); background: var(--paper-3); }
.amm-rail-item { display: flex; align-items: center; gap: 14px; padding: 16px 20px; background: transparent; border: 0; border-right: 1px solid var(--rule); cursor: pointer; text-align: left; color: var(--fg-3); transition: all 0.15s; font-family: inherit; }
.amm-rail-item:last-child { border-right: 0; }
.amm-rail-item:disabled { cursor: not-allowed; opacity: 0.4; }
.amm-rail-item:not(:disabled):hover { color: var(--fg); background: rgba(255,255,255,0.02); }
.amm-rail-item.on { color: var(--fg); background: var(--paper); }
.amm-rail-item.on .num { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.amm-rail-item.done .num { color: var(--ok); border-color: rgba(184,220,196,0.4); }
.amm-rail-item.done.on .num { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
.amm-rail-item .num { width: 32px; height: 32px; border: 1px solid var(--rule-2); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 13px; flex: none; transition: all 0.15s; }
.amm-rail-item .check { font-family: var(--serif); font-size: 16px; line-height: 1; }
.amm-rail-item .lbl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.amm-rail-item .t { font-family: var(--serif); font-size: 16px; letter-spacing: -0.01em; }
.amm-rail-item .sub { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-4); }
.amm-rail-item.on .sub { color: var(--accent); }

/* ─── BODY ─── */
.amm-body { overflow-y: auto; padding: 36px 40px; min-height: 0; }
.step { animation: fade-in 0.22s ease; }
@keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.step-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); flex-wrap: wrap; }
.step-n { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; color: var(--accent); text-transform: uppercase; }
.step-title { font-family: var(--serif); font-weight: 400; font-size: clamp(22px, 3vw, 28px); letter-spacing: -0.02em; margin: 0; color: var(--fg); flex: 1; min-width: 0; }
.step-title em { font-style: italic; color: var(--accent); }
.step-link { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); background: transparent; border: 0; cursor: pointer; padding: 6px 0; border-bottom: 1px solid var(--rule-2); transition: all 0.15s; text-decoration: none; }
.step-link:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.step-link .arr { font-family: var(--serif); margin-left: 4px; }

.prose { font-family: var(--serif); font-size: 15px; line-height: 1.6; color: var(--fg-2); margin: 0 0 24px; max-width: 60ch; text-wrap: pretty; }

.how { list-style: none; padding: 0; margin: 0 0 24px; display: flex; flex-direction: column; }
.how li { display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--rule); font-family: var(--serif); font-size: 15px; color: var(--fg-2); align-items: baseline; white-space: nowrap; }
.how li:last-child { border-bottom: 0; }
.how .n { font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; color: var(--accent); text-transform: uppercase; }
.how em { color: var(--fg); font-style: normal; font-weight: 500; }

.state-ok { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 16px 20px; border: 1px solid rgba(184,220,196,0.25); background: rgba(184,220,196,0.04); }
.state-ok.subtle { border-color: var(--rule-2); background: var(--paper-2); }
.state-mark { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 12px rgba(184,220,196,0.6); }
.state-ok.subtle .state-mark { background: var(--accent); box-shadow: 0 0 12px rgba(139,92,246,0.5); }
.state-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.state-label { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ok); }
.state-ok.subtle .state-label { color: var(--accent-bright); }
.state-value { font-family: var(--mono); font-size: 12px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state-clear { font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; background: transparent; border: 0; color: var(--fg-3); cursor: pointer; padding: 6px 0; border-bottom: 1px solid var(--rule); transition: color 0.15s; }
.state-clear:hover { color: var(--err); border-color: rgba(240,163,163,0.3); }

.field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.field.span-2 { grid-column: 1 / -1; }
.field-label { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
.field-hint { color: var(--fg-2); text-transform: none; letter-spacing: 0.04em; margin-left: 6px; font-size: 12px; }
.field-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.field-label-row .field-label { margin-bottom: 0; }
.field-hint-btn { font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); background: none; border: 1px solid var(--accent); padding: 2px 7px; cursor: pointer; opacity: 0.8; transition: opacity 0.15s; }
.field-hint-btn:hover { opacity: 1; }
.input { width: 100%; padding: 12px 14px; background: var(--paper-2); border: 1px solid var(--rule-2); color: var(--fg); font-family: var(--sans); font-size: 14px; outline: 0; transition: all 0.15s; }
.input.mono { font-family: var(--mono); font-size: 12px; letter-spacing: 0.02em; }
.input:focus { border-color: var(--accent); background: var(--paper); box-shadow: 0 0 0 3px var(--accent-2); }
.input::placeholder { color: var(--fg-4); }
.field-error { font-family: var(--mono); font-size: 12px; color: var(--err); margin: 0; padding-left: 12px; border-left: 2px solid var(--err); }
.field-ok { font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--ok); margin: 0; }

.mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.mode-card { text-align: left; background: var(--paper-2); border: 1px solid var(--rule-2); padding: 22px; cursor: pointer; transition: all 0.15s; position: relative; font-family: inherit; color: inherit; display: flex; flex-direction: column; gap: 12px; min-height: 140px; }
.mode-card:hover { border-color: var(--rule-2); background: var(--paper); }
.mode-card.on { border-color: var(--accent); background: linear-gradient(135deg, rgba(139,92,246,0.08), transparent 60%); }
.mode-card-head { display: flex; align-items: center; gap: 12px; }
.mode-mark { width: 18px; height: 18px; border: 1px solid var(--rule-2); border-radius: 50%; flex: none; transition: all 0.15s; position: relative; }
.mode-card.on .mode-mark { border-color: var(--accent); background: var(--accent); }
.mode-card.on .mode-mark::after { content: ""; position: absolute; inset: 4px; background: var(--paper); border-radius: 50%; }
.mode-name { font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em; color: var(--fg); }
.mode-desc { font-family: var(--serif); font-size: 14px; line-height: 1.5; color: var(--fg-2); margin: 0; flex: 1; }
.mode-tag { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-4); align-self: flex-start; padding: 3px 8px; border: 1px solid var(--rule); }
.mode-card.on .mode-tag { color: var(--accent-bright); border-color: rgba(139,92,246,0.4); background: var(--accent-2); }

.pay-form { padding-top: 8px; }
.pay-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }

.translate-wrap { position: relative; display: flex; align-items: center; }
.translate-wrap .input { flex: 1; padding-right: 28px; }
.translate-spin { position: absolute; right: 8px; color: var(--fg-2); font-size: 14px; animation: spin 0.8s linear infinite; pointer-events: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.tools-row { display: flex; gap: 8px; align-items: stretch; position: relative; }
.tools-row .input { flex: 1; }
.tools-add { width: 44px; flex: none; border: 1px solid var(--rule-2); background: var(--paper-2); color: var(--fg-3); font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; }
.tools-add:hover, .tools-add.on { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }

.tools-picker { position: static; margin-top: 8px; background: var(--paper-2); border: 1px solid var(--rule-2); padding: 10px; display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow-y: auto; }
.tool-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid var(--rule-2); background: var(--paper-3); color: var(--fg-3); font-family: var(--mono); font-size: 12px; letter-spacing: 0.04em; cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.tool-chip:hover { color: var(--fg); border-color: var(--rule-2); background: var(--paper); }
.tool-chip.active { color: var(--ok); border-color: rgba(184,220,196,0.35); background: rgba(184,220,196,0.06); }
.tool-chip--beta { opacity: 0.35; cursor: not-allowed; }
.tool-chip--beta:hover { color: var(--fg-3); border-color: var(--rule-2); background: var(--paper-3); }
.chip-beta { font-size: 12px; color: var(--accent); opacity: 0.7; margin-left: 2px; }
.chip-check { font-family: var(--serif); font-size: 12px; width: 12px; text-align: center; }

.flow, .readonly { border: 1px solid var(--rule); background: var(--paper-2); margin-top: 16px; }
.flow summary, .readonly summary { display: flex; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg-2); list-style: none; user-select: none; }
.flow summary::-webkit-details-marker, .readonly summary::-webkit-details-marker { display: none; }
.flow summary:hover, .readonly summary:hover { color: var(--fg); }
.flow-mark { color: var(--accent); font-family: var(--serif); font-size: 14px; }
.flow-label { flex: 1; }
.flow-arrow { color: var(--fg-3); transition: transform 0.2s; }
.flow[open] .flow-arrow, .readonly[open] .flow-arrow { transform: rotate(180deg); color: var(--accent); }

.flow-list { list-style: none; padding: 0 18px 18px; margin: 0; display: flex; flex-direction: column; gap: 18px; border-top: 1px solid var(--rule); padding-top: 18px; }
.flow-list li { display: grid; grid-template-columns: 28px 1fr; gap: 14px; }
.flow-i { font-family: var(--serif); font-size: 18px; color: var(--accent); line-height: 1.2; }
.flow-list h4 { font-family: var(--serif); font-weight: 400; font-size: 16px; letter-spacing: -0.01em; margin: 0 0 6px; color: var(--fg); }
.flow-list p { font-family: var(--serif); font-size: 14px; line-height: 1.5; color: var(--fg-2); margin: 0; }
.flow-list code { font-family: var(--mono); font-size: 12px; color: var(--accent-bright); background: rgba(139,92,246,0.08); padding: 1px 5px; }
.code { font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--fg-2); background: var(--paper-3); padding: 12px 14px; border: 1px solid var(--rule); margin: 8px 0 0; white-space: pre-wrap; word-break: break-all; }
.code em { color: var(--accent-bright); font-style: normal; }

.readonly-list { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; padding: 18px; margin: 0; border-top: 1px solid var(--rule); }
.readonly-list dt { font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; color: var(--fg-3); }
.readonly-list dd { font-family: var(--mono); font-size: 12px; color: var(--fg-2); margin: 0; word-break: break-all; }

.prereq { display: grid; grid-template-columns: 32px 1fr; gap: 14px; align-items: center; padding: 14px 18px; border: 1px solid rgba(167,139,250,0.3); background: rgba(167,139,250,0.05); margin-bottom: 24px; }
.prereq-mark { width: 28px; height: 28px; border: 1px solid var(--accent); display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 16px; color: var(--accent); }
.prereq-label { display: block; font-family: var(--serif); font-size: 15px; color: var(--fg); }
.prereq-back { background: transparent; border: 0; font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); cursor: pointer; padding: 0; margin-top: 4px; }
.prereq-back:hover { color: var(--accent-bright); }

.card { border: 1px solid var(--rule-2); background: var(--paper-2); margin-bottom: 16px; }
.card-head { padding: 14px 20px; border-bottom: 1px solid var(--rule); }
.card-head .kicker { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; color: var(--fg-3); }
.card-body { padding: 20px; }

.cid { padding: 18px 20px; border: 1px solid rgba(139,92,246,0.25); background: var(--accent-2); margin-bottom: 16px; }
.cid .kicker { margin-bottom: 8px; padding-bottom: 0; border: 0; color: var(--accent-bright); }
.cid-value { font-family: var(--mono); font-size: 12px; color: var(--fg); margin: 0 0 10px; word-break: break-all; line-height: 1.5; }
.cid-link { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; border-bottom: 1px solid var(--rule-2); padding-bottom: 2px; transition: all 0.15s; }
.cid-link:hover { color: var(--accent); border-color: var(--accent); }
.arr { font-family: var(--serif); }

/* ─── FOOT ─── */
.amm-foot { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 20px 32px; border-top: 1px solid var(--rule); background: var(--paper-3); align-items: center; }
.amm-foot-meta { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); display: flex; align-items: center; gap: 10px; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.dot.idle { background: var(--fg-4); }
.dot.live { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
.dot.ok   { background: var(--ok); box-shadow: 0 0 10px rgba(184,220,196,0.5); }
.amm-foot-actions { display: flex; gap: 12px; align-items: center; }

.btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; font-family: var(--sans); font-size: 13px; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; border: 1px solid transparent; background: transparent; color: inherit; transition: all 0.15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-bright); border-color: var(--accent-bright); box-shadow: 0 8px 24px rgba(139,92,246,0.35); }
.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-ghost { border-color: var(--rule-2); color: var(--fg-2); }
.btn-ghost:hover { color: var(--fg); border-color: var(--accent); }

/* ─── VERBUNDENE NODES ─── */
.connected-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--rule); }
.connected-head { margin-bottom: 12px; }
.connected-title { font-family: var(--serif); font-weight: 400; font-size: clamp(20px, 2.5vw, 24px); letter-spacing: -0.02em; margin: 0; color: var(--fg); }
.connected-title em { font-style: italic; color: var(--accent); }

.bearer-row { display: flex; align-items: stretch; gap: 8px; }
.bearer-val { flex: 1; min-width: 0; padding: 10px 14px; background: var(--paper-3); border: 1px solid var(--rule-2); font-family: var(--mono); font-size: 12px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; line-height: 1.4; }
.bearer-copy { flex: none; padding: 0 14px; border: 1px solid var(--rule-2); background: var(--paper-2); color: var(--fg-3); font-family: var(--mono); font-size: 12px; letter-spacing: 0.10em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.bearer-copy:hover:not(:disabled) { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }
.bearer-copy.copied { color: var(--ok); border-color: rgba(184,220,196,0.35); background: rgba(184,220,196,0.06); }
.bearer-copy:disabled { opacity: 0.35; cursor: not-allowed; }

.node-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.node-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--paper-2); border: 1px solid var(--rule-2); }
.node-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.node-label { font-family: var(--sans); font-size: 12px; font-weight: 600; color: var(--fg); }
.node-url { font-family: var(--mono); font-size: 12px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-remove { flex: none; width: 28px; height: 28px; border: 1px solid var(--rule-2); background: transparent; color: var(--fg-4); font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; }
.node-remove:hover { color: var(--err); border-color: rgba(240,163,163,0.3); background: rgba(240,163,163,0.04); }

.no-nodes { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; color: var(--fg-3); text-align: center; padding: 14px 0; border: 1px dashed var(--rule-2); margin-bottom: 16px; }

.add-node-form { margin-top: 8px; }
.add-node-row { display: flex; gap: 8px; align-items: stretch; }
.add-node-row .input { min-width: 0; }

.sys-modal-enter-active, .sys-modal-leave-active { transition: opacity 0.2s; }
.sys-modal-enter-active .sys-amm, .sys-modal-leave-active .sys-amm { transition: transform 0.25s ease, opacity 0.2s; }
.sys-modal-enter-from { opacity: 0; }
.sys-modal-enter-from .sys-amm { transform: translateY(20px) scale(0.98); opacity: 0; }
.sys-modal-leave-to { opacity: 0; }
.sys-modal-leave-to .sys-amm { transform: translateY(20px) scale(0.98); opacity: 0; }

@media (max-width: 720px) {
  .amm-head { padding: 6px 10px; min-height: 40px; }
  .amm-rail-item { padding: 14px 16px; gap: 10px; }
  .amm-rail-item .num { width: 28px; height: 28px; font-size: 12px; }
  .amm-rail-item .t { font-size: 14px; }
  .amm-body { padding: 28px 24px; }
  .pay-fields, .mode-grid { grid-template-columns: 1fr; }
  .readonly-list { grid-template-columns: 1fr; gap: 4px 0; }
  .readonly-list dt { color: var(--accent-bright); margin-top: 8px; }
  .amm-foot { padding: 16px 24px; }
}

@media (max-width: 639px) {
  .sys-amm-overlay { align-items: center; padding: 12px; }
  .sys-amm { max-width: none; width: 100%; max-height: calc(100dvh - 24px); border-radius: 16px; }
  .amm-head { padding: 6px 8px; min-height: 40px; }
  .amm-handle { display: none; }
  .amm-close { width: 32px; height: 32px; font-size: 18px; }
  .amm-handle { display: block; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 36px; height: 4px; background: var(--rule-2); border-radius: 2px; }
  .amm-close { top: 14px; right: 12px; width: 32px; height: 32px; font-size: 18px; }
  .display { font-size: 24px; }
  .lede { font-size: 14px; }
  .kicker { margin-bottom: 12px; }

  .amm-rail { grid-template-columns: repeat(3, 1fr); }
  .amm-rail-item { padding: 10px 10px; gap: 8px; border-right: 1px solid var(--rule); border-bottom: 0; justify-content: center; }
  .amm-rail-item:last-child { border-right: 0; }
  .amm-rail-item .num { width: 24px; height: 24px; font-size: 12px; flex: none; }
  .amm-rail-item .sub { display: none; }
  .amm-rail-item .t { font-size: 13px; }

  .amm-body { padding: 24px 20px; }
  .step-head { gap: 10px; margin-bottom: 12px; padding-bottom: 12px; }
  .step-title { font-size: 22px; }
  .prose { font-size: 14px; margin-bottom: 18px; }
  .mode-card { padding: 18px; min-height: auto; }
  .mode-name { font-size: 18px; }
  .mode-desc { font-size: 13px; }

  .amm-foot { grid-template-columns: 1fr; padding: 14px 20px 20px; gap: 12px; }
  .amm-foot-meta { order: -1; }
  .amm-foot-actions { width: 100%; }
  .amm-foot-actions .btn { flex: 1; justify-content: center; }
}

.peer-form { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.peer-form-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.peer-form-row { display: flex; gap: 8px; align-items: stretch; }
.peer-sep { color: var(--fg-4); margin: 0 2px; }
.peer-endpoint-row { margin-top: 4px; }
.peer-endpoint-input { font-size: 12px; padding: 3px 7px; height: auto; width: 100%; box-sizing: border-box; }
.section-divider { height: 1px; background: var(--rule); margin: 24px 0; }

@media (max-width: 639px) {
  .peer-form-inputs { grid-template-columns: 1fr; }
}

.own-endpoint-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-bottom: 12px;
  background: var(--paper-3); border: 1px solid var(--rule-2);
}
.oe-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--fg-4); flex-shrink: 0;
}
.oe-val {
  font-family: var(--mono); font-size: 12px; color: var(--accent-bright);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.oe-copy {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  background: transparent; border: 1px solid var(--rule-2); color: var(--fg-3);
  cursor: pointer; padding: 2px 8px; flex-shrink: 0; transition: all 0.15s;
}
.oe-copy:hover { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }
.oe-copy.copied { color: var(--ok); border-color: rgba(184,220,196,0.35); }
</style>
