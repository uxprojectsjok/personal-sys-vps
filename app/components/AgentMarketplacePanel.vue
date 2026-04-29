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
          <!-- ───── STEP 1 · PINATA ───── -->
          <section v-if="step === 'pinata'" class="step">
            <div class="step-head">
              <h2 class="step-title">Pinata <em>verbinden</em></h2>
              <a class="step-link" href="https://pinata.cloud" target="_blank" rel="noopener">
                pinata.cloud <span class="arr">↗</span>
              </a>
            </div>

            <p class="prose">
              Pinata ist ein unabhängiger IPFS-Pinning-Dienst — keine Kooperation mit SaveYourSoul.
              Andere Pinning-Dienste mit JWT-API funktionieren ebenfalls.
            </p>

            <ol class="how">
              <li><span class="n">a</span> Kostenlosen Account anlegen</li>
              <li><span class="n">b</span> API Keys / New Key (Admin)</li>
              <li><span class="n">c</span> JWT kopieren und unten einfügen</li>
            </ol>

            <div v-if="pinataOk" class="state-ok">
              <span class="state-mark">●</span>
              <div class="state-text">
                <span class="state-label">Verbunden</span>
                <span class="state-value">{{ pinataPreview }}</span>
              </div>
              <button class="state-clear" @click="clearPinata">trennen</button>
            </div>

            <div v-else class="field">
              <label class="field-label" for="pinata-jwt">JWT-Token</label>
              <input
                id="pinata-jwt"
                v-model="pinataJwt"
                type="password"
                class="input mono"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
                autocomplete="off"
                @keyup.enter="savePinata"
              />
              <p v-if="pinataError" class="field-error">{{ pinataError }}</p>
            </div>
          </section>

          <!-- ───── STEP 2 · ZUGANGSMODUS ───── -->
          <section v-else-if="step === 'mode'" class="step">
            <div class="step-head">
              <h2 class="step-title">Zugang <em>festlegen</em></h2>
            </div>

            <p class="prose">
              Bestimme, wie externe Agenten deine MCP-Tools erreichen — kostenlos oder gegen Bezahlung.
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
                <p class="mode-desc">Alle MCP-Tools ohne Zahlung nutzbar. Empfohlen für Entwicklung &amp; öffentliche Souls.</p>
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
                <p class="mode-desc">Pro MCP-Anfrage wird POL fällig. Polygon-Verifikation erforderlich.</p>
                <span class="mode-tag">on-chain</span>
              </button>
            </div>

            <!-- Pay-mode form -->
            <div v-if="amort.enabled" class="pay-form">
              <div class="pay-fields">
                <div class="field">
                  <label class="field-label">POL pro Anfrage</label>
                  <input v-model="amort.pol_per_request" type="text" class="input mono" placeholder="0.001" />
                </div>
                <div class="field">
                  <label class="field-label">Wallet · 0x…</label>
                  <input v-model="amort.wallet" type="text" class="input mono" placeholder="0xABCD…" />
                </div>
                <div class="field span-2">
                  <label class="field-label">Kostenlose Tools</label>
                  <div class="tools-row">
                    <input v-model="freeToolsStr" type="text" class="input mono" placeholder="soul_read, verify_human" />
                    <button class="tools-add" type="button" :class="{ on: showToolPicker }" @click.stop="showToolPicker = !showToolPicker" aria-label="Tool auswählen">+</button>
                  </div>
                  <div v-if="showToolPicker" class="tools-picker" @click.stop>
                    <button
                      v-for="tool in AVAILABLE_TOOLS"
                      :key="tool"
                      type="button"
                      class="tool-chip"
                      :class="{ active: amort.free_tools.includes(tool) }"
                      @click="toggleTool(tool)"
                    >
                      <span class="chip-check">{{ amort.free_tools.includes(tool) ? '✓' : '+' }}</span>
                      {{ tool }}
                    </button>
                  </div>
                </div>
              </div>

              <details class="flow">
                <summary>
                  <span class="flow-mark">⌥</span>
                  <span class="flow-label">Wie der Zahlungsfluss für Agenten aussieht</span>
                  <span class="flow-arrow">▾</span>
                </summary>
                <ol class="flow-list">
                  <li>
                    <span class="flow-i">①</span>
                    <div>
                      <h4>Soul wird entdeckt</h4>
                      <p>Agent ruft <code>soul_discover</code> → erhält Wallet-Adresse + Preis.</p>
                    </div>
                  </li>
                  <li>
                    <span class="flow-i">②</span>
                    <div>
                      <h4>POL senden</h4>
                      <p>Du sendest POL aus deinem Wallet (MetaMask, Rabby …) → erhältst <code>tx_hash</code> → fügst ihn im Agent-Chat ein.</p>
                    </div>
                  </li>
                  <li>
                    <span class="flow-i">③</span>
                    <div>
                      <h4>Agent meldet die Zahlung</h4>
                      <pre class="code">POST /api/soul/pay
{ "soul_id": "uuid",
  "tx_hash": "0x<em>a3f8…d2c1</em>" }</pre>
                    </div>
                  </li>
                  <li>
                    <span class="flow-i">④</span>
                    <div>
                      <h4>Server prüft on-chain</h4>
                      <pre class="code">{ "access_token": "<em>a3f8d2c1e4b7…</em>",
  "expires_at": "+1h" }</pre>
                    </div>
                  </li>
                  <li>
                    <span class="flow-i">⑤</span>
                    <div>
                      <h4>Agent verbindet sich</h4>
                      <pre class="code">Authorization: Bearer <em>a3f8d2c1e4b7…</em></pre>
                    </div>
                  </li>
                </ol>
              </details>

              <p v-if="amortError" class="field-error">{{ amortError }}</p>
              <p v-else-if="amortSuccess" class="field-ok">Gespeichert ✓</p>
            </div>

            <div v-else class="state-ok subtle">
              <span class="state-mark"></span>
              <div class="state-text">
                <span class="state-label">{{ modeLoading ? 'Wird gespeichert…' : 'Frei-Modus aktiv' }}</span>
                <span class="state-value">Alle MCP-Tools sind ohne Zahlung erreichbar.</span>
              </div>
            </div>
          </section>

          <!-- ───── STEP 3 · IPFS REGISTRATION ───── -->
          <section v-else-if="step === 'ipfs'" class="step">
            <div class="step-head">
              <h2 class="step-title">Auf IPFS <em>veröffentlichen</em></h2>
              <button class="step-link" :disabled="previewLoading" @click="loadPreview">
                {{ previewLoading ? 'lade…' : 'Vorschau laden' }}
              </button>
            </div>

            <p class="prose">
              Pinnt ERC-8004-Metadaten via Pinata. Deine Soul erscheint danach im Marketplace und ist
              für externe Agenten auffindbar.
            </p>

            <div v-if="!pinataOk" class="prereq">
              <span class="prereq-mark">!</span>
              <div>
                <span class="prereq-label">Pinata-JWT fehlt</span>
                <button class="prereq-back" @click="goTo('pinata')">→ zurück zu Schritt 1</button>
              </div>
            </div>

            <div v-if="preview" class="card">
              <div class="card-head">
                <span class="kicker">Metadaten · editierbar</span>
              </div>
              <div class="card-body">
                <div class="field">
                  <label class="field-label">Name</label>
                  <input v-model="preview.name" type="text" class="input" />
                </div>
                <div class="field">
                  <label class="field-label">Beschreibung <span class="field-hint">optional</span></label>
                  <input v-model="preview.description" type="text" class="input" placeholder="Kurze Beschreibung der Soul…" />
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
            <button v-if="step !== 'pinata'" class="btn btn-ghost" @click="prevStep">← Zurück</button>

            <button
              v-if="step === 'pinata'"
              class="btn btn-primary"
              :disabled="!canAdvance"
              @click="primaryAction"
            >
              {{ pinataOk ? 'Weiter →' : (savingPinata ? 'Speichern…' : 'JWT speichern') }}
            </button>

            <button
              v-else-if="step === 'mode'"
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

          <p class="amm-foot-help">
            Vollständige Anleitung →
            <NuxtLink to="/api-docs" class="link" @click="$emit('close')">API-Docs</NuxtLink>
          </p>
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
const step = ref('pinata') // 'pinata' | 'mode' | 'ipfs'

const steps = computed(() => [
  { id: 'pinata', title: 'Pinata',   subtitle: 'IPFS-Pinning', done: pinataOk.value },
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
  const order = ['pinata', 'mode', 'ipfs']
  const i = order.indexOf(step.value)
  if (i > 0) step.value = order[i - 1]
}

const canAdvance = computed(() => {
  if (step.value === 'pinata') return pinataOk.value || !!pinataJwt.value.trim()
  if (step.value === 'mode')   return !amort.enabled || (amort.wallet.trim() && amort.pol_per_request.trim())
  return true
})

async function primaryAction() {
  if (step.value === 'pinata') {
    if (pinataOk.value) { step.value = 'mode'; return }
    await savePinata()
    if (pinataOk.value) step.value = 'mode'
  } else if (step.value === 'mode') {
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
  if (done === 3) return { kind: 'ok',   text: 'Marketplace · vollständig eingerichtet' }
  if (done > 0)   return { kind: 'live', text: `${done} von 3 Schritten · in Arbeit` }
  return            { kind: 'idle', text: 'Setup · noch nicht begonnen' }
})

// ═══════════ STATE ═══════════
const pinataJwt     = ref('')
const pinataPreview = ref('')
const pinataOk      = ref(false)
const savingPinata  = ref(false)
const pinataError   = ref('')

const amort = reactive({
  enabled:         false,
  pol_per_request: '0.001',
  wallet:          '',
  free_tools:      ['soul_read', 'verify_human', 'soul_maturity'],
})
const freeToolsStr = computed({
  get: () => amort.free_tools.join(', '),
  set: v => { amort.free_tools = v.split(',').map(s => s.trim()).filter(Boolean) },
})
const amortActive   = ref(false)
const savingAmort   = ref(false)
const modeLoading   = ref(false)
const modeTouched   = ref(false)
const amortError    = ref('')
const amortSuccess  = ref(false)

const currentCid    = ref('')
const registered    = ref(false)
const registering   = ref(false)
const registerError = ref('')
const newCid        = ref('')

const preview        = ref(null)
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

// ═══════════ TOOL PICKER ═══════════
const showToolPicker = ref(false)

const AVAILABLE_TOOLS = [
  'audio_get', 'audio_list', 'beme_chat', 'calendar_read',
  'context_get', 'context_list', 'elevenlabs_agent_update',
  'image_get', 'image_list', 'network_list', 'network_peer_get',
  'profile_get', 'profile_save', 'soul_cloud_push', 'soul_discover',
  'soul_earnings', 'soul_maturity', 'soul_read', 'soul_skills',
  'soul_write', 'vault_manifest', 'verify_human', 'video_get', 'video_list',
]

function toggleTool(name) {
  const idx = amort.free_tools.indexOf(name)
  if (idx === -1) amort.free_tools.push(name)
  else amort.free_tools.splice(idx, 1)
}

watch(step, () => { showToolPicker.value = false })

const BASE = () => ''
function authHeader() {
  return { 'Authorization': `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' }
}

// ═══════════ LOAD ═══════════
onMounted(async () => {
  if (!props.soulCert) return
  await Promise.all([loadPinata(), loadAmort()])
  if (!pinataOk.value)               step.value = 'pinata'
  else if (!amortActive.value && !modeTouched.value) step.value = 'mode'
  else if (!registered.value)        step.value = 'ipfs'
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
    amort.free_tools      = Array.isArray(a.free_tools) ? a.free_tools : ['soul_read', 'verify_human', 'soul_maturity']
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
          enabled:         false,
          pol_per_request: amort.pol_per_request,
          wallet:          amort.wallet,
          free_tools:      amort.free_tools,
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
        enabled:         amort.enabled,
        pol_per_request: amort.pol_per_request,
        wallet:          amort.wallet,
        free_tools:      amort.free_tools,
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
    if (d.preview) preview.value = { ...d.preview, description: d.preview.description || '' }
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

    const r = await fetch(`${BASE()}/api/soul/register`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (!r.ok) { registerError.value = d.error || d.message || 'Registrierung fehlgeschlagen'; return }
    newCid.value     = d.cid || ''
    currentCid.value = d.cid || ''
    registered.value = true
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
  --fg:#ece7f5; --fg-2:rgba(236,231,245,0.72); --fg-3:rgba(236,231,245,0.48); --fg-4:rgba(236,231,245,0.30);
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

.kicker { font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--accent); width: fit-content; }

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
.amm-rail-item .sub { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-4); }
.amm-rail-item.on .sub { color: var(--accent); }

/* ─── BODY ─── */
.amm-body { overflow-y: auto; padding: 36px 40px; min-height: 0; }
.step { animation: fade-in 0.22s ease; }
@keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.step-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); flex-wrap: wrap; }
.step-n { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; color: var(--accent); text-transform: uppercase; }
.step-title { font-family: var(--serif); font-weight: 400; font-size: clamp(22px, 3vw, 28px); letter-spacing: -0.02em; margin: 0; color: var(--fg); flex: 1; min-width: 0; }
.step-title em { font-style: italic; color: var(--accent); }
.step-link { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); background: transparent; border: 0; cursor: pointer; padding: 6px 0; border-bottom: 1px solid var(--rule-2); transition: all 0.15s; text-decoration: none; }
.step-link:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.step-link .arr { font-family: var(--serif); margin-left: 4px; }

.prose { font-family: var(--serif); font-size: 15px; line-height: 1.6; color: var(--fg-2); margin: 0 0 24px; max-width: 60ch; text-wrap: pretty; }

.how { list-style: none; padding: 0; margin: 0 0 24px; display: flex; flex-direction: column; }
.how li { display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--rule); font-family: var(--serif); font-size: 15px; color: var(--fg-2); align-items: baseline; white-space: nowrap; }
.how li:last-child { border-bottom: 0; }
.how .n { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; }
.how em { color: var(--fg); font-style: normal; font-weight: 500; }

.state-ok { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 16px 20px; border: 1px solid rgba(184,220,196,0.25); background: rgba(184,220,196,0.04); }
.state-ok.subtle { border-color: var(--rule-2); background: var(--paper-2); }
.state-mark { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 12px rgba(184,220,196,0.6); }
.state-ok.subtle .state-mark { background: var(--accent); box-shadow: 0 0 12px rgba(139,92,246,0.5); }
.state-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.state-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ok); }
.state-ok.subtle .state-label { color: var(--accent-bright); }
.state-value { font-family: var(--mono); font-size: 12px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state-clear { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; background: transparent; border: 0; color: var(--fg-3); cursor: pointer; padding: 6px 0; border-bottom: 1px solid var(--rule); transition: color 0.15s; }
.state-clear:hover { color: var(--err); border-color: rgba(240,163,163,0.3); }

.field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.field.span-2 { grid-column: 1 / -1; }
.field-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); }
.field-hint { color: var(--fg-4); text-transform: none; letter-spacing: 0.05em; margin-left: 6px; }
.input { width: 100%; padding: 12px 14px; background: var(--paper-2); border: 1px solid var(--rule-2); color: var(--fg); font-family: var(--sans); font-size: 14px; outline: 0; transition: all 0.15s; }
.input.mono { font-family: var(--mono); font-size: 12px; letter-spacing: 0.02em; }
.input:focus { border-color: var(--accent); background: var(--paper); box-shadow: 0 0 0 3px var(--accent-2); }
.input::placeholder { color: var(--fg-4); }
.field-error { font-family: var(--mono); font-size: 11px; color: var(--err); margin: 0; padding-left: 12px; border-left: 2px solid var(--err); }
.field-ok { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ok); margin: 0; }

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
.mode-tag { font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); align-self: flex-start; padding: 3px 8px; border: 1px solid var(--rule); }
.mode-card.on .mode-tag { color: var(--accent-bright); border-color: rgba(139,92,246,0.4); background: var(--accent-2); }

.pay-form { padding-top: 8px; }
.pay-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }

.tools-row { display: flex; gap: 8px; align-items: stretch; position: relative; }
.tools-row .input { flex: 1; }
.tools-add { width: 44px; flex: none; border: 1px solid var(--rule-2); background: var(--paper-2); color: var(--fg-3); font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; }
.tools-add:hover, .tools-add.on { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }

.tools-picker { position: static; margin-top: 8px; background: var(--paper-2); border: 1px solid var(--rule-2); padding: 10px; display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow-y: auto; }
.tool-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid var(--rule-2); background: var(--paper-3); color: var(--fg-3); font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.tool-chip:hover { color: var(--fg); border-color: var(--rule-2); background: var(--paper); }
.tool-chip.active { color: var(--ok); border-color: rgba(184,220,196,0.35); background: rgba(184,220,196,0.06); }
.chip-check { font-family: var(--serif); font-size: 12px; width: 12px; text-align: center; }

.flow, .readonly { border: 1px solid var(--rule); background: var(--paper-2); margin-top: 16px; }
.flow summary, .readonly summary { display: flex; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-2); list-style: none; user-select: none; }
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
.flow-list code { font-family: var(--mono); font-size: 11px; color: var(--accent-bright); background: rgba(139,92,246,0.08); padding: 1px 5px; }
.code { font-family: var(--mono); font-size: 11px; line-height: 1.6; color: var(--fg-2); background: var(--paper-3); padding: 12px 14px; border: 1px solid var(--rule); margin: 8px 0 0; white-space: pre-wrap; word-break: break-all; }
.code em { color: var(--accent-bright); font-style: normal; }

.readonly-list { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; padding: 18px; margin: 0; border-top: 1px solid var(--rule); }
.readonly-list dt { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--fg-3); }
.readonly-list dd { font-family: var(--mono); font-size: 11px; color: var(--fg-2); margin: 0; word-break: break-all; }

.prereq { display: grid; grid-template-columns: 32px 1fr; gap: 14px; align-items: center; padding: 14px 18px; border: 1px solid rgba(167,139,250,0.3); background: rgba(167,139,250,0.05); margin-bottom: 24px; }
.prereq-mark { width: 28px; height: 28px; border: 1px solid var(--accent); display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 16px; color: var(--accent); }
.prereq-label { display: block; font-family: var(--serif); font-size: 15px; color: var(--fg); }
.prereq-back { background: transparent; border: 0; font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); cursor: pointer; padding: 0; margin-top: 4px; }
.prereq-back:hover { color: var(--accent-bright); }

.card { border: 1px solid var(--rule-2); background: var(--paper-2); margin-bottom: 16px; }
.card-head { padding: 14px 20px; border-bottom: 1px solid var(--rule); }
.card-head .kicker { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; color: var(--fg-3); }
.card-body { padding: 20px; }

.cid { padding: 18px 20px; border: 1px solid rgba(139,92,246,0.25); background: var(--accent-2); margin-bottom: 16px; }
.cid .kicker { margin-bottom: 8px; padding-bottom: 0; border: 0; color: var(--accent-bright); }
.cid-value { font-family: var(--mono); font-size: 12px; color: var(--fg); margin: 0 0 10px; word-break: break-all; line-height: 1.5; }
.cid-link { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; border-bottom: 1px solid var(--rule-2); padding-bottom: 2px; transition: all 0.15s; }
.cid-link:hover { color: var(--accent); border-color: var(--accent); }
.arr { font-family: var(--serif); }

/* ─── FOOT ─── */
.amm-foot { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 20px 32px; border-top: 1px solid var(--rule); background: var(--paper-3); align-items: center; }
.amm-foot-meta { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); display: flex; align-items: center; gap: 10px; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.dot.idle { background: var(--fg-4); }
.dot.live { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
.dot.ok   { background: var(--ok); box-shadow: 0 0 10px rgba(184,220,196,0.5); }
.amm-foot-actions { display: flex; gap: 12px; align-items: center; }
.amm-foot-help { grid-column: 1 / -1; margin: 0; font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-4); border-top: 1px dashed var(--rule); padding-top: 14px; }
.amm-foot-help .link { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent); padding-bottom: 1px; }
.amm-foot-help .link:hover { color: var(--accent-bright); }

.btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; font-family: var(--sans); font-size: 13px; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; border: 1px solid transparent; background: transparent; color: inherit; transition: all 0.15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { background: var(--accent-bright); border-color: var(--accent-bright); box-shadow: 0 8px 24px rgba(139,92,246,0.35); }
.btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-ghost { border-color: var(--rule-2); color: var(--fg-2); }
.btn-ghost:hover { color: var(--fg); border-color: var(--accent); }

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
  .amm-rail-item .num { width: 24px; height: 24px; font-size: 11px; flex: none; }
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
  .amm-foot-help { display: none; }
}
</style>
