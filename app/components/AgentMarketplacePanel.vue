<template>
  <Transition name="sys-modal" appear>
    <div
      class="sys-amm-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('marketplace.aria_label')"
      @click.self="$emit('close')"
    >
      <div class="sys-amm">
        <!-- ═══════════ HEADER ═══════════ -->
        <header class="amm-head">
          <button class="amm-close" @click="$emit('close')" :aria-label="$t('common.close')">
            <span aria-hidden="true">×</span>
          </button>

          <!-- Drag handle for mobile sheet -->
          <div class="amm-handle" aria-hidden="true"></div>
        </header>

        <!-- ═══════════ STEP RAIL ═══════════ -->
        <nav class="amm-rail" :aria-label="$t('marketplace.steps_aria')">
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
              <h2 class="step-title">{{ $t('marketplace.step1_title') }} <em>{{ $t('marketplace.step1_title_em') }}</em></h2>
            </div>

            <p class="prose">{{ $t('marketplace.step1_prose') }}</p>

            <div class="mode-grid">
              <button
                class="mode-card"
                :class="{ on: !amort.enabled }"
                @click="setMode('free')"
              >
                <div class="mode-card-head">
                  <span class="mode-mark"></span>
                  <span class="mode-name">{{ $t('marketplace.mode_free') }}</span>
                </div>
                <p class="mode-desc">{{ $t('marketplace.mode_free_desc') }}</p>
              </button>

              <button
                class="mode-card"
                :class="{ on: amort.enabled }"
                @click="setMode('pay')"
              >
                <div class="mode-card-head">
                  <span class="mode-mark"></span>
                  <span class="mode-name">{{ $t('marketplace.mode_pay') }}</span>
                </div>
                <p class="mode-desc">{{ $t('marketplace.mode_pay_desc') }}</p>
                <span class="mode-tag">on-chain</span>
              </button>
            </div>

            <!-- Pay-mode form -->
            <div v-if="amort.enabled" class="pay-form">
              <div class="pay-fields">
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.field_amount') }} <span class="field-hint">{{ $t('marketplace.field_amount_hint') }}</span></label>
                  <input v-model="amort.pol_per_request" type="text" class="input mono" placeholder="0.001" />
                </div>
                <div class="field">
                  <label class="field-label field-label--toggle">
                    <span class="toggle-switch" :class="{ on: amort.dynamic_pricing }" @click="amort.dynamic_pricing = !amort.dynamic_pricing" role="switch" :aria-checked="amort.dynamic_pricing" tabindex="0" @keydown.enter.space.prevent="amort.dynamic_pricing = !amort.dynamic_pricing">
                      <span class="toggle-knob"></span>
                    </span>
                    {{ $t('marketplace.field_dynamic_pricing') }}
                    <span class="field-hint">{{ $t('marketplace.field_dynamic_pricing_hint') }}</span>
                  </label>
                </div>
                <div v-if="amort.dynamic_pricing" class="live-price-box field span-2">
                  <template v-if="livePrice?.enabled">
                    <span class="live-price-label">{{ $t('marketplace.live_price_label') }}</span>
                    <span class="live-price-value">{{ livePriceDisplay }} POL</span>
                    <span v-if="livePriceMultiplier" class="live-price-detail">{{ $t('marketplace.live_price_detail', { base: amort.pol_per_request, mult: livePriceMultiplier, anchors: livePrice.anchor_count ?? 0, age: livePrice.chain_age_days ?? 0, buyers: livePrice.buyers_30d ?? 0 }) }}</span>
                  </template>
                  <template v-else>
                    <span class="live-price-label">{{ $t('marketplace.live_price_label') }}</span>
                    <span class="live-price-pending">{{ livePrice === null ? '…' : $t('marketplace.live_price_save_first') }}</span>
                  </template>
                </div>
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.field_wallet') }}</label>
                  <input v-model="amort.wallet" type="text" class="input mono" placeholder="0xABCD…" />
                </div>
                <div class="field span-2">
                  <label class="field-label field-label--toggle">
                    <span class="toggle-switch" :class="{ on: amort.paypal_enabled }" @click="amort.paypal_enabled = !amort.paypal_enabled" role="switch" :aria-checked="amort.paypal_enabled" tabindex="0" @keydown.enter.space.prevent="amort.paypal_enabled = !amort.paypal_enabled">
                      <span class="toggle-knob"></span>
                    </span>
                    {{ $t('marketplace.field_paypal_enabled') }}
                    <span class="field-hint">{{ $t('marketplace.field_paypal_enabled_hint') }}</span>
                  </label>
                </div>
                <template v-if="amort.paypal_enabled">
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_paypal_link') }}</label>
                    <input v-model="amort.paypal_link" type="text" class="input mono" placeholder="https://paypal.me/deinname" />
                  </div>
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_paypal_email') }}</label>
                    <input v-model="amort.paypal_email" type="text" class="input mono" placeholder="du@example.com" />
                  </div>
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_price_eur') }} <span class="field-hint">{{ $t('marketplace.field_price_eur_hint') }}</span></label>
                    <input v-model="amort.price_eur" type="text" class="input mono" placeholder="12.00" />
                  </div>
                  <div class="field span-2">
                    <label class="field-label">{{ $t('marketplace.field_trader_section') }} <span class="field-hint">{{ $t('marketplace.field_trader_section_hint') }}</span></label>
                  </div>
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_trader_name') }}</label>
                    <input v-model="amort.trader_name" type="text" class="input" placeholder="Vorname Nachname / Firma" />
                  </div>
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_trader_email') }}</label>
                    <input v-model="amort.trader_email" type="text" class="input mono" placeholder="kontakt@example.com" />
                  </div>
                  <div class="field span-2">
                    <label class="field-label">{{ $t('marketplace.field_trader_address') }}</label>
                    <input v-model="amort.trader_address" type="text" class="input" placeholder="Straße Hausnr., PLZ Ort, Land" />
                  </div>
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_trader_legal_form') }}</label>
                    <input v-model="amort.trader_legal_form" type="text" class="input" placeholder="Einzelunternehmen" />
                  </div>
                  <div class="field">
                    <label class="field-label">{{ $t('marketplace.field_trader_vat_note') }}</label>
                    <input v-model="amort.trader_vat_note" type="text" class="input" placeholder="§19 UStG — keine USt." />
                  </div>
                </template>
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.field_token_validity') }} <span class="field-hint">{{ $t('marketplace.field_token_validity_hint') }}</span></label>
                  <input
                    :value="amort.token_duration_days"
                    @input="amort.token_duration_days = Math.min(30, Math.max(1, Math.floor(Number($event.target.value) || 1)))"
                    @blur="$event.target.value = amort.token_duration_days"
                    type="number" min="1" max="30" step="1" class="input" placeholder="1"
                  />
                </div>
                <div class="field span-2">
                  <label class="field-label">{{ $t('marketplace.field_tools') }} <span class="field-hint">{{ $t('marketplace.field_tools_hint') }}</span></label>
                  <div class="tools-row">
                    <input v-model="agentToolsStr" type="text" class="input mono" placeholder="soul_read, verify_human" />
                    <button class="tools-add" type="button" :class="{ on: showToolPicker }" @click.stop="showToolPicker = !showToolPicker" :aria-label="$t('marketplace.tool_select_aria')">+</button>
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
                      {{ TOOL_LABELS[tool] ?? tool }}
                    </button>
                    <button
                      v-for="tool in BETA_TOOLS"
                      :key="tool"
                      type="button"
                      class="tool-chip tool-chip--beta"
                      disabled
                      :title="`${tool} — ${$t('marketplace.tool_beta_hint')}`"
                    >
                      <span class="chip-check" style="opacity:0.4">·</span>
                      {{ tool }}
                      <span class="chip-beta">β</span>
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="amortError" class="field-error">{{ amortError }}</p>
              <p v-else-if="amortSuccess" class="field-ok">{{ $t('common.saved') }}</p>
            </div>

            <div v-else class="state-ok subtle">
              <span class="state-mark"></span>
              <div class="state-text">
                <span class="state-label">{{ modeLoading ? $t('marketplace.free_mode_saving') : $t('marketplace.free_mode_active') }}</span>
                <span class="state-value">{{ $t('marketplace.free_mode_state') }}</span>
              </div>
            </div>
          </section>

          <!-- ───── STEP 2 · IPFS REGISTRATION ───── -->
          <section v-else-if="step === 'ipfs'" class="step">
            <div class="step-head">
              <h2 class="step-title">{{ $t('marketplace.step2_title') }} <em>{{ $t('marketplace.step2_title_em') }}</em></h2>
            </div>

            <p class="prose">{{ $t('marketplace.step2_prose') }}</p>

            <div v-if="!pinataOk" class="prereq">
              <span class="prereq-mark">!</span>
              <div>
                <span class="prereq-label">{{ $t('marketplace.pinata_missing') }}</span>
              </div>
            </div>

            <div class="card">
              <div class="card-body">
                <div class="field">
                  <label class="field-label">Name</label>
                  <input v-model="preview.name" type="text" class="input" @blur="persistMetaFields()" />
                </div>
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.field_desc') }} <span class="field-hint">{{ $t('marketplace.field_desc_hint') }}</span></label>
                  <div class="translate-wrap">
                    <input v-model="preview.description" type="text" class="input" :placeholder="$t('marketplace.field_desc_placeholder')" @blur="translateField('description')" />
                    <span v-if="translating.description" class="translate-spin">⟳</span>
                  </div>
                </div>
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.field_tags') }} <span class="field-hint">{{ $t('marketplace.field_tags_hint') }}</span></label>
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
              <span class="kicker">{{ $t('marketplace.current_cid') }}</span>
              <p class="cid-value">{{ currentCid }}</p>
              <a class="cid-link" :href="`https://gateway.pinata.cloud/ipfs/${currentCid}`" target="_blank" rel="noopener">
                {{ $t('marketplace.gateway_open') }} <span class="arr">↗</span>
              </a>
            </div>

            <p v-if="registerError" class="field-error">{{ registerError }}</p>
            <p v-if="newCid" class="field-ok">{{ $t('marketplace.published_ok') }} {{ newCid.slice(0, 20) }}…</p>
          </section>

          <!-- ───── STEP 3 · MANUELLE TOKENS ───── -->
          <section v-else-if="step === 'tokens'" class="step">
            <div class="step-head">
              <h2 class="step-title">{{ $t('marketplace.step3_title') }} <em>{{ $t('marketplace.step3_title_em') }}</em></h2>
            </div>

            <p class="prose">{{ $t('marketplace.step3_prose') }}</p>

            <div class="card">
              <div class="card-body">
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.token_duration_label') }}</label>
                  <input v-model.number="manualDuration" type="number" min="1" max="30" step="1" class="input" />
                </div>
                <div class="field">
                  <label class="field-label">{{ $t('marketplace.token_note_label') }}</label>
                  <input v-model="manualNote" type="text" class="input" :placeholder="$t('marketplace.token_note_placeholder')" />
                </div>
                <div class="field span-2">
                  <label class="field-label">{{ $t('marketplace.token_reference_label') }} <span class="field-hint">{{ $t('marketplace.token_reference_hint') }}</span></label>
                  <input v-model="manualReferenceId" type="text" class="input mono" placeholder="z.B. 1581eae2-9e09-41df-a6f3-6f4e080a9833" />
                </div>
              </div>
            </div>

            <button class="btn btn-primary" style="margin: 14px 0;" :disabled="issuingToken" @click="issueManualToken">
              {{ issuingToken ? $t('marketplace.token_issuing') : $t('marketplace.token_issue_btn') }}
            </button>

            <p v-if="issueTokenError" class="field-error">{{ issueTokenError }}</p>

            <div v-if="issuedToken" class="cid">
              <span class="kicker">{{ $t('marketplace.token_issued_hint') }}</span>
              <div class="token-copy-row">
                <p class="cid-value token-copy-val">{{ issuedToken }}</p>
                <button class="btn btn-ghost" @click="copyIssuedToken">{{ tokenCopied ? $t('common.copy_done') : $t('common.copy') }}</button>
              </div>
            </div>

            <div v-if="tokenList.length" class="token-list">
              <div v-for="tk in tokenList" :key="tk.token" class="token-row">
                <div class="token-info">
                  <code class="token-frag">{{ tokenFragment(tk.token) }}</code>
                  <span class="token-method" :class="{ manual: tk.payment_method === 'manual' }">{{ tk.payment_method === 'manual' ? $t('marketplace.token_method_manual') : $t('marketplace.token_method_pol') }}</span>
                  <span class="token-from">{{ tk.from }}</span>
                  <span v-if="tk.reference_id" class="token-ref" :title="$t('marketplace.token_reference_label')">{{ tk.reference_id.slice(0, 8) }}…</span>
                  <span class="token-exp">{{ $t('marketplace.token_expires', { date: formatTokenDate(tk.expires_at) }) }}</span>
                </div>
                <button class="btn btn-ghost" @click="revokeManualToken(tk.token)">{{ $t('marketplace.token_revoke_btn') }}</button>
              </div>
            </div>
            <p v-else-if="tokensLoaded" class="prose">{{ $t('marketplace.tokens_empty') }}</p>
          </section>
        </div>

        <!-- ═══════════ FOOT ═══════════ -->
        <footer class="amm-foot">
          <div class="amm-foot-meta">
            <span class="dot" :class="overallStatus.kind"></span>
            {{ overallStatus.text }}
          </div>

          <div class="amm-foot-actions">
            <button v-if="step !== 'mode'" class="btn btn-ghost" @click="prevStep">{{ $t('marketplace.btn_back') }}</button>

            <button
              v-if="step === 'mode'"
              class="btn btn-primary"
              :disabled="!canAdvance"
              @click="primaryAction"
            >
              {{ amort.enabled ? (savingAmort ? $t('marketplace.btn_saving') : $t('marketplace.btn_save_next')) : $t('common.next') }}
            </button>

            <button
              v-else-if="step === 'ipfs'"
              class="btn btn-primary"
              :disabled="!pinataOk || registering"
              @click="register"
            >
              {{ registering ? $t('marketplace.btn_publishing') : (registered ? $t('marketplace.btn_republish') : $t('marketplace.btn_publish')) }}
            </button>
          </div>

        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  soulCert: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const { t } = useI18n()

// ═══════════ STEP MACHINE ═══════════
const step = ref('mode') // 'mode' | 'ipfs' | 'tokens'

const steps = computed(() => [
  { id: 'mode',   title: t('marketplace.step_mode_title'), subtitle: t('marketplace.step_mode_sub'), done: amortActive.value || (!amort.enabled && modeTouched.value) },
  { id: 'ipfs',   title: 'IPFS',                           subtitle: t('marketplace.step_ipfs_sub'),  done: registered.value },
  { id: 'tokens', title: t('marketplace.step_tokens_title'), subtitle: t('marketplace.step_tokens_sub'), done: tokenList.value.length > 0 },
])

function canJumpTo(_id) {
  return true
}

function goTo(id) {
  if (id === step.value || canJumpTo(id) || steps.value.find(s => s.id === id)?.done) {
    step.value = id
    if (id === 'tokens') loadTokenList()
  }
}

function prevStep() {
  const order = ['mode', 'ipfs', 'tokens']
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
  const done = steps.value.filter(s => s.id !== 'tokens' && s.done).length
  if (done === 2) return { kind: 'ok',   text: t('marketplace.status_done') }
  if (done > 0)   return { kind: 'live', text: t('marketplace.status_progress', { done }) }
  return            { kind: 'idle', text: t('marketplace.status_idle') }
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
  dynamic_pricing:      false,
  paypal_enabled:       false,
  paypal_link:          '',
  paypal_email:         '',
  price_eur:            '',
  trader_name:          '',
  trader_address:       '',
  trader_email:         '',
  trader_legal_form:    '',
  trader_vat_note:      '',
})

// Unified peers: { soul_id, endpoint, label } — loaded for amort saves, not displayed here
const peers = ref([])
const trustedSoulsLoaded = ref(false)

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

// Live-Preis (dynamisches Pricing)
const livePrice     = ref(null)
let livePriceTimer  = null

// Preis live aus aktuellem Formular-Basiswert × gecachtem Multiplikator berechnen
// → aktualisiert sich sofort beim Tippen, kein Speichern nötig
const livePriceDisplay = computed(() => {
  const p = livePrice.value
  if (!p?.dynamic || !p.multiplier) return p?.pol_required ?? null
  const base = parseFloat(amort.pol_per_request)
  if (!base || isNaN(base)) return p.pol_required
  const price = Math.max(base, Math.round(base * p.multiplier * 10000) / 10000)
  return price.toFixed(4)
})

const livePriceMultiplier = computed(() => {
  const p = livePrice.value
  if (!p?.dynamic || !p.multiplier) return null
  return p.multiplier + '×'
})

async function fetchLivePrice() {
  if (!amort.dynamic_pricing) { livePrice.value = null; return }
  try {
    const soul_id = props.soulCert?.split('.')?.[0]
    if (!soul_id) return
    const r = await fetch(`/api/soul/price?soul_id=${soul_id}`)
    if (r.ok) livePrice.value = await r.json()
  } catch { /* ignore */ }
}

watch(() => amort.dynamic_pricing, (val) => {
  if (val) fetchLivePrice()
  else livePrice.value = null
})

onUnmounted(() => { if (livePriceTimer) clearInterval(livePriceTimer) })

const nodesStorageKey = computed(() => {
  const id = props.soulCert?.split('.')?.[0] || ''
  return id ? `sys.connected_nodes.${id}` : null
})

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
        ...(trustedSoulsLoaded.value ? { trusted_souls: peersToTrustedSouls(peers.value) } : {}),
        token_duration_days: Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
        dynamic_pricing:     amort.dynamic_pricing,
        paypal_enabled:      amort.paypal_enabled,
        paypal_link:         amort.paypal_link,
        paypal_email:        amort.paypal_email,
        price_eur:           amort.price_eur,
        trader_name:         amort.trader_name,
        trader_address:      amort.trader_address,
        trader_email:        amort.trader_email,
        trader_legal_form:   amort.trader_legal_form,
        trader_vat_note:     amort.trader_vat_note,
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

const TOOL_LABELS = computed(() => ({
  audio_get:          t('marketplace.tool_audio_get'),
  audio_list:         t('marketplace.tool_audio_list'),
  calendar_read:      t('marketplace.tool_calendar_read'),
  context_get:        t('marketplace.tool_context_get'),
  context_list:       t('marketplace.tool_context_list'),
  health_check_payed: t('marketplace.tool_health_check'),
  image_get:          t('marketplace.tool_image_get'),
  image_list:         t('marketplace.tool_image_list'),
  profile_get:        t('marketplace.tool_profile_get'),
  shop_write_read:    t('marketplace.tool_shop'),
  soul_maturity:      t('marketplace.tool_soul_maturity'),
  soul_read:          t('marketplace.tool_soul_read'),
  soul_skills:        t('marketplace.tool_soul_skills'),
  verify_human:       t('marketplace.tool_verify_human'),
  video_get:          t('marketplace.tool_video_get'),
  video_list:         t('marketplace.tool_video_list'),
}))

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
  if (newStep !== 'tokens') issuedToken.value = ''
})

const BASE = () => ''
function authHeader() {
  return { 'Authorization': `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' }
}

// ═══════════ STEP 3 · MANUELLE ZUGANGS-TOKENS (Nicht-Krypto-Käufer) ═══════════
const manualDuration    = ref(1)
const manualNote        = ref('')
const manualReferenceId = ref('')
const issuingToken    = ref(false)
const issueTokenError = ref('')
const issuedToken     = ref('')
const tokenCopied     = ref(false)
const tokenList       = ref([])
const tokensLoaded    = ref(false)

function formatTokenDate(iso) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function tokenFragment(token) {
  if (!token || token.length < 14) return token || ''
  return `${token.slice(0, 8)}…${token.slice(-6)}`
}

async function loadTokenList() {
  try {
    const r = await fetch(`${BASE()}/api/soul/tokens`, { headers: authHeader() })
    const d = await r.json()
    tokenList.value = d.tokens || []
  } catch { /* ignore */ }
  tokensLoaded.value = true
}

async function issueManualToken() {
  issueTokenError.value = ''
  issuedToken.value     = ''
  issuingToken.value    = true
  try {
    const days = Math.min(30, Math.max(1, Math.floor(Number(manualDuration.value) || 1)))
    const r = await fetch(`${BASE()}/api/soul/pay/manual`, {
      method: 'POST',
      headers: authHeader(),
      body: JSON.stringify({ token_duration_days: days, note: manualNote.value, reference_id: manualReferenceId.value.trim() }),
    })
    const d = await r.json()
    if (!r.ok || !d.ok) throw new Error(d.message || d.error || 'Fehler beim Ausstellen')
    issuedToken.value      = d.access_token
    manualNote.value       = ''
    manualReferenceId.value = ''
    await loadTokenList()
  } catch (e) {
    issueTokenError.value = e.message
  }
  issuingToken.value = false
}

async function copyIssuedToken() {
  if (!issuedToken.value) return
  await navigator.clipboard.writeText(issuedToken.value).catch(() => {})
  tokenCopied.value = true
  setTimeout(() => { tokenCopied.value = false; issuedToken.value = '' }, 1500)
}

async function revokeManualToken(token) {
  try {
    const r = await fetch(`${BASE()}/api/soul/tokens?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: authHeader(),
    })
    if (r.ok) tokenList.value = tokenList.value.filter(t => t.token !== token)
  } catch { /* ignore */ }
}

// ═══════════ LOAD ═══════════
onMounted(async () => {
  if (!props.soulCert) return
  await Promise.all([loadPinata(), loadAmort(), loadTokenList()])
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
    amort.dynamic_pricing      = a.dynamic_pricing ?? false
    amort.paypal_enabled       = a.paypal_enabled ?? false
    amort.paypal_link          = a.paypal_link ?? ''
    amort.paypal_email         = a.paypal_email ?? ''
    amort.price_eur            = a.price_eur ?? ''
    amort.trader_name          = a.trader_name ?? ''
    amort.trader_address       = a.trader_address ?? ''
    amort.trader_email         = a.trader_email ?? ''
    amort.trader_legal_form    = a.trader_legal_form ?? ''
    amort.trader_vat_note      = a.trader_vat_note ?? ''
    if (amort.dynamic_pricing) fetchLivePrice()
    const rawTrustedSouls = Array.isArray(a.trusted_souls)
      ? a.trusted_souls.filter(t => typeof t === 'string' || (typeof t === 'object' && t?.soul_id))
      : []
    let localNodes = []
    if (nodesStorageKey.value) {
      try { localNodes = JSON.parse(localStorage.getItem(nodesStorageKey.value) || '[]') } catch { /* ignore */ }
    }
    peers.value           = buildPeers(rawTrustedSouls, localNodes)
    trustedSoulsLoaded.value = true
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
          ...(trustedSoulsLoaded.value ? { trusted_souls: peersToTrustedSouls(peers.value) } : {}),
          token_duration_days:  Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
          dynamic_pricing:      amort.dynamic_pricing,
          paypal_enabled:       amort.paypal_enabled,
          paypal_link:          amort.paypal_link,
          paypal_email:         amort.paypal_email,
          price_eur:            amort.price_eur,
          trader_name:          amort.trader_name,
          trader_address:       amort.trader_address,
          trader_email:         amort.trader_email,
          trader_legal_form:    amort.trader_legal_form,
          trader_vat_note:      amort.trader_vat_note,
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
        ...(trustedSoulsLoaded.value ? { trusted_souls: peersToTrustedSouls(peers.value) } : {}),
        token_duration_days:  Math.min(30, Math.max(1, parseInt(amort.token_duration_days) || 1)),
        dynamic_pricing:      amort.dynamic_pricing,
        paypal_enabled:       amort.paypal_enabled,
        paypal_link:          amort.paypal_link,
        paypal_email:         amort.paypal_email,
        price_eur:            amort.price_eur,
        trader_name:          amort.trader_name,
        trader_address:       amort.trader_address,
        trader_email:         amort.trader_email,
        trader_legal_form:    amort.trader_legal_form,
        trader_vat_note:      amort.trader_vat_note,
      }),
    })
    const d = await r.json()
    if (!r.ok) { amortError.value = d.error || d.message || 'Fehler beim Speichern'; return }
    amortActive.value  = amort.enabled
    amortSuccess.value = true
    setTimeout(() => { amortSuccess.value = false }, 3000)
    if (amort.dynamic_pricing) fetchLivePrice()
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
  --ink:#08070c; --paper:#171717; --paper-2:#1a1726; --paper-3:#0d0b14;
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

.kicker { font-family: var(--sans); font-size: 16px; font-weight: 600; letter-spacing: 0; text-transform: none; color: var(--fg); display: block; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--rule-2); width: 100%; }

.display { font-family: var(--serif); font-weight: 400; font-size: clamp(28px, 4vw, 40px); line-height: 0.98; letter-spacing: -0.025em; margin: 0 0 16px; color: var(--fg); text-wrap: balance; }
.display em { font-style: italic; color: var(--accent); }

.lede { font-family: var(--serif); font-size: 17px; line-height: 1.55; color: var(--fg-2); margin: 0; max-width: 60ch; }
.lede code { font-family: var(--mono); font-size: 14px; color: var(--accent-bright); background: var(--accent-2); padding: 2px 6px; border: 1px solid rgba(139,92,246,0.2); }

/* ─── STEP RAIL ─── */
.amm-rail { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--rule); background: var(--paper-3); }
.amm-rail-item { display: flex; align-items: center; gap: 14px; padding: 16px 20px; background: transparent; border: 0; border-right: 1px solid var(--rule); cursor: pointer; text-align: left; color: var(--fg-2); transition: all 0.15s; font-family: inherit; }
.amm-rail-item:last-child { border-right: 0; }
.amm-rail-item:disabled { cursor: not-allowed; opacity: 0.4; }
.amm-rail-item:not(:disabled):hover { color: var(--fg); background: rgba(255,255,255,0.02); }
.amm-rail-item.on { color: var(--fg); background: var(--paper); }
.amm-rail-item.on .num { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.amm-rail-item.done .num { color: var(--ok); border-color: rgba(184,220,196,0.4); }
.amm-rail-item.done.on .num { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
.amm-rail-item .num { width: 32px; height: 32px; border: 1px solid var(--rule-2); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-size: 15px; flex: none; transition: all 0.15s; }
.amm-rail-item .check { font-family: var(--serif); font-size: 16px; line-height: 1; }
.amm-rail-item .lbl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.amm-rail-item .t { font-family: var(--serif); font-size: 16px; letter-spacing: -0.01em; }
.amm-rail-item .sub { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }
.amm-rail-item.on .sub { color: var(--accent); }

/* ─── BODY ─── */
.amm-body { overflow-y: auto; padding: 36px 40px; min-height: 0; }
.step { animation: fade-in 0.22s ease; }
@keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.step-head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); flex-wrap: wrap; }
.step-n { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; color: var(--accent); text-transform: uppercase; }
.step-title { font-family: var(--serif); font-weight: 400; font-size: clamp(22px, 3vw, 28px); letter-spacing: -0.02em; margin: 0; color: var(--fg); flex: 1; min-width: 0; }
.step-title em { font-style: italic; color: var(--accent); }
.step-link { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); background: transparent; border: 0; cursor: pointer; padding: 6px 0; border-bottom: 1px solid var(--rule-2); transition: all 0.15s; text-decoration: none; }
.step-link:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.step-link .arr { font-family: var(--serif); margin-left: 4px; }

.prose { font-family: var(--serif); font-size: 17px; line-height: 1.65; color: var(--fg); margin: 0 0 24px; max-width: 60ch; text-wrap: pretty; }

.how { list-style: none; padding: 0; margin: 0 0 24px; display: flex; flex-direction: column; }
.how li { display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--rule); font-family: var(--serif); font-size: 17px; color: var(--fg-2); align-items: baseline; white-space: nowrap; }
.how li:last-child { border-bottom: 0; }
.how .n { font-family: var(--mono); font-size: 14px; letter-spacing: 0.10em; color: var(--accent); text-transform: uppercase; }
.how em { color: var(--fg); font-style: normal; font-weight: 500; }

.state-ok { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 16px 20px; border: 1px solid rgba(184,220,196,0.25); background: rgba(184,220,196,0.04); }
.state-ok.subtle { border-color: var(--rule-2); background: var(--paper-2); }
.state-mark { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 12px rgba(184,220,196,0.6); }
.state-ok.subtle .state-mark { background: var(--accent); box-shadow: 0 0 12px rgba(139,92,246,0.5); }
.state-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.state-label { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ok); }
.state-ok.subtle .state-label { color: var(--accent-bright); }
.state-value { font-family: var(--mono); font-size: 14px; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state-clear { font-family: var(--mono); font-size: 14px; letter-spacing: 0.10em; text-transform: uppercase; background: transparent; border: 0; color: var(--fg-3); cursor: pointer; padding: 6px 0; border-bottom: 1px solid var(--rule); transition: color 0.15s; }
.state-clear:hover { color: var(--err); border-color: rgba(240,163,163,0.3); }

.field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.field.span-2 { grid-column: 1 / -1; }
.field-label { font-family: var(--sans); font-size: 16px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--fg); }
.field-label--toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 10px 0; }
.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; background: var(--line-2); border-radius: 10px; transition: background 0.2s; cursor: pointer; flex-shrink: 0; }
.toggle-switch.on { background: var(--accent); }
.toggle-knob { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; background: #fff; border-radius: 50%; transition: transform 0.2s; }
.toggle-switch.on .toggle-knob { transform: translateX(16px); }
.live-price-box { display:flex; align-items:center; gap:8px; padding:8px 12px; background:rgba(109,184,154,0.07); border:1px solid rgba(109,184,154,0.2); border-radius:var(--r-xs); font-family:var(--mono); font-size:15px; }
.live-price-pending { color:var(--fg-3); font-size:14px; }
.live-price-label { color:var(--fg-2); }
.live-price-value { color:#6db89a; font-weight:600; }
.live-price-detail { color:var(--fg-3); font-size:13px; }
.field-hint { font-family: var(--mono); font-size: 14px; color: var(--fg-2); text-transform: none; letter-spacing: 0.03em; margin-left: 6px; }
.field-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.field-label-row .field-label { margin-bottom: 0; }
.field-hint-btn { font-family: var(--mono); font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); background: none; border: 1px solid var(--accent); padding: 2px 7px; cursor: pointer; opacity: 0.8; transition: opacity 0.15s; }
.field-hint-btn:hover { opacity: 1; }
.input { width: 100%; padding: 10px 13px; background: var(--surface-2); border: 1px solid var(--line-2); color: var(--fg); font-family: var(--sans); font-size: 16px; outline: 0; transition: border-color 0.15s, box-shadow 0.15s; border-radius: var(--r-xs); -webkit-appearance: none; appearance: none; }
.input.mono { font-family: var(--mono); font-size: 16px; letter-spacing: 0.01em; }
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.input::placeholder { color: var(--fg-3); }
.field-error { font-family: var(--mono); font-size: 14px; color: #e06c75; margin: 0; padding-left: 12px; border-left: 2px solid #e06c75; }
.field-ok { font-family: var(--mono); font-size: 14px; letter-spacing: 0; text-transform: none; color: var(--accent); margin: 0; }

.mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.mode-card { text-align: left; background: var(--paper-2); border: 1px solid var(--rule-2); padding: 22px; cursor: pointer; transition: all 0.15s; position: relative; font-family: inherit; color: inherit; display: flex; flex-direction: column; gap: 12px; min-height: 140px; }
.mode-card:hover { border-color: var(--rule-2); background: var(--paper); }
.mode-card.on { border-color: var(--accent); background: linear-gradient(135deg, rgba(139,92,246,0.08), transparent 60%); }
.mode-card-head { display: flex; align-items: center; gap: 12px; }
.mode-mark { width: 18px; height: 18px; border: 1px solid var(--rule-2); border-radius: 50%; flex: none; transition: all 0.15s; position: relative; }
.mode-card.on .mode-mark { border-color: var(--accent); background: var(--accent); }
.mode-card.on .mode-mark::after { content: ""; position: absolute; inset: 4px; background: var(--paper); border-radius: 50%; }
.mode-name { font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em; color: var(--fg); }
.mode-desc { font-family: var(--serif); font-size: 17px; line-height: 1.55; color: var(--fg); margin: 0; flex: 1; }
.mode-tag { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); align-self: flex-start; padding: 3px 8px; border: 1px solid var(--rule-2); }
.mode-card.on .mode-tag { color: var(--accent-bright); border-color: rgba(139,92,246,0.4); background: var(--accent-2); }

.pay-form { padding-top: 8px; }
.pay-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }

.translate-wrap { position: relative; display: flex; align-items: center; }
.translate-wrap .input { flex: 1; padding-right: 28px; }
.translate-spin { position: absolute; right: 8px; color: var(--fg-2); font-size: 16px; animation: spin 0.8s linear infinite; pointer-events: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.tools-row { display: flex; gap: 8px; align-items: stretch; position: relative; }
.tools-row .input { flex: 1; }
.tools-add { width: 44px; flex: none; border: 1px solid var(--rule-2); background: var(--paper-2); color: var(--fg-3); font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; }
.tools-add:hover, .tools-add.on { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }

.tools-picker { position: static; margin-top: 8px; background: var(--paper-2); border: 1px solid var(--rule-2); padding: 10px; display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow-y: auto; }
.tool-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid var(--rule-2); background: var(--paper-3); color: var(--fg-3); font-family: var(--mono); font-size: 14px; letter-spacing: 0.04em; cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.tool-chip:hover { color: var(--fg); border-color: var(--rule-2); background: var(--paper); }
.tool-chip.active { color: var(--ok); border-color: rgba(184,220,196,0.35); background: rgba(184,220,196,0.06); }
.tool-chip--beta { opacity: 0.35; cursor: not-allowed; }
.tool-chip--beta:hover { color: var(--fg-3); border-color: var(--rule-2); background: var(--paper-3); }
.chip-beta { font-size: 14px; color: var(--accent); opacity: 0.7; margin-left: 2px; }
.chip-check { font-family: var(--serif); font-size: 14px; width: 12px; text-align: center; }

.flow, .readonly { border: 1px solid var(--rule); background: var(--paper-2); margin-top: 16px; }
.flow summary, .readonly summary { display: flex; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; font-family: var(--mono); font-size: 14px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg-2); list-style: none; user-select: none; }
.flow summary::-webkit-details-marker, .readonly summary::-webkit-details-marker { display: none; }
.flow summary:hover, .readonly summary:hover { color: var(--fg); }
.flow-mark { color: var(--accent); font-family: var(--serif); font-size: 16px; }
.flow-label { flex: 1; }
.flow-arrow { color: var(--fg-3); transition: transform 0.2s; }
.flow[open] .flow-arrow, .readonly[open] .flow-arrow { transform: rotate(180deg); color: var(--accent); }

.flow-list { list-style: none; padding: 0 18px 18px; margin: 0; display: flex; flex-direction: column; gap: 18px; border-top: 1px solid var(--rule); padding-top: 18px; }
.flow-list li { display: grid; grid-template-columns: 28px 1fr; gap: 14px; }
.flow-i { font-family: var(--serif); font-size: 18px; color: var(--accent); line-height: 1.2; }
.flow-list h4 { font-family: var(--serif); font-weight: 400; font-size: 16px; letter-spacing: -0.01em; margin: 0 0 6px; color: var(--fg); }
.flow-list p { font-family: var(--serif); font-size: 16px; line-height: 1.5; color: var(--fg-2); margin: 0; }
.flow-list code { font-family: var(--mono); font-size: 14px; color: var(--accent-bright); background: rgba(139,92,246,0.08); padding: 1px 5px; }
.code { font-family: var(--mono); font-size: 14px; line-height: 1.6; color: var(--fg-2); background: var(--paper-3); padding: 12px 14px; border: 1px solid var(--rule); margin: 8px 0 0; white-space: pre-wrap; word-break: break-all; }
.code em { color: var(--accent-bright); font-style: normal; }

.readonly-list { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; padding: 18px; margin: 0; border-top: 1px solid var(--rule); }
.readonly-list dt { font-family: var(--mono); font-size: 14px; letter-spacing: 0.1em; color: var(--fg-2); }
.readonly-list dd { font-family: var(--mono); font-size: 14px; color: var(--fg); margin: 0; word-break: break-all; }

.prereq { display: grid; grid-template-columns: 32px 1fr; gap: 14px; align-items: center; padding: 14px 18px; border: 1px solid rgba(167,139,250,0.3); background: rgba(167,139,250,0.05); margin-bottom: 24px; }
.prereq-mark { width: 28px; height: 28px; border: 1px solid var(--accent); display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 16px; color: var(--accent); }
.prereq-label { display: block; font-family: var(--serif); font-size: 17px; color: var(--fg); }
.prereq-back { background: transparent; border: 0; font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); cursor: pointer; padding: 0; margin-top: 4px; }
.prereq-back:hover { color: var(--accent-bright); }

.card { border: 1px solid var(--rule-2); background: var(--paper-2); margin-bottom: 16px; }
.card-head { padding: 14px 20px; border-bottom: 1px solid var(--rule); }
.card-head .kicker { margin-bottom: 0; padding-bottom: 0; border-bottom: 0; color: var(--fg-2); }
.card-body { padding: 20px; }

.cid { padding: 18px 20px; border: 1px solid rgba(139,92,246,0.25); background: var(--accent-2); margin-bottom: 16px; }
.cid .kicker { margin-bottom: 8px; padding-bottom: 0; border: 0; color: var(--accent-bright); }
.cid-value { font-family: var(--mono); font-size: 14px; color: var(--fg); margin: 0 0 10px; word-break: break-all; line-height: 1.5; }
.cid-link { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); text-decoration: none; border-bottom: 1px solid var(--rule-2); padding-bottom: 2px; transition: all 0.15s; }
.cid-link:hover { color: var(--accent); border-color: var(--accent); }
.arr { font-family: var(--serif); }

/* Token-Tab */
.token-copy-row { display: flex; align-items: center; gap: 10px; }
.token-copy-val { flex: 1; margin: 0; }
.token-list { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--rule-2); margin-top: 4px; }
.token-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; background: var(--paper-2); }
.token-row + .token-row { border-top: 1px solid var(--rule-2); }
.token-info { display: flex; align-items: center; gap: 12px; min-width: 0; flex-wrap: wrap; }
.token-frag { font-family: var(--mono); font-size: 14px; color: var(--fg-3); background: var(--paper-3); padding: 3px 7px; border-radius: 4px; }
.token-method { font-family: var(--mono); font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: var(--paper-3); color: var(--fg-2); }
.token-method.manual { background: var(--accent-2); color: var(--accent-bright); }
.token-from { font-size: 15px; color: var(--fg); }
.token-ref { font-family: var(--mono); font-size: 13px; color: var(--fg-3); cursor: help; }
.token-exp { font-family: var(--mono); font-size: 14px; color: var(--fg-3); }

/* ─── FOOT ─── */
.amm-foot { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 20px 32px; border-top: 1px solid var(--rule); background: var(--paper-3); align-items: center; }
.amm-foot-meta { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); display: flex; align-items: center; gap: 10px; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.dot.idle { background: var(--fg-4); }
.dot.live { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
.dot.ok   { background: var(--ok); box-shadow: 0 0 10px rgba(184,220,196,0.5); }
.amm-foot-actions { display: flex; gap: 12px; align-items: center; }

.btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; font-family: var(--sans); font-size: 15px; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; border: 1px solid transparent; background: transparent; color: inherit; transition: all 0.15s; white-space: nowrap; }
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
.bearer-val { flex: 1; min-width: 0; padding: 10px 14px; background: var(--paper-3); border: 1px solid var(--rule-2); font-family: var(--mono); font-size: 14px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; line-height: 1.4; }
.bearer-copy { flex: none; padding: 0 14px; border: 1px solid var(--rule-2); background: var(--paper-2); color: var(--fg-3); font-family: var(--mono); font-size: 14px; letter-spacing: 0.10em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.bearer-copy:hover:not(:disabled) { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }
.bearer-copy.copied { color: var(--ok); border-color: rgba(184,220,196,0.35); background: rgba(184,220,196,0.06); }
.bearer-copy:disabled { opacity: 0.35; cursor: not-allowed; }

.node-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.node-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--paper-2); border: 1px solid var(--rule-2); }
.node-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.node-label { font-family: var(--sans); font-size: 14px; font-weight: 600; color: var(--fg); }
.node-url { font-family: var(--mono); font-size: 14px; color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-remove { flex: none; width: 28px; height: 28px; border: 1px solid var(--rule-2); background: transparent; color: var(--fg-4); font-size: 18px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; padding: 0; }
.node-remove:hover { color: var(--err); border-color: rgba(240,163,163,0.3); background: rgba(240,163,163,0.04); }

.no-nodes { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; color: var(--fg-3); text-align: center; padding: 14px 0; border: 1px dashed var(--rule-2); margin-bottom: 16px; }

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
  .amm-rail-item .num { width: 28px; height: 28px; font-size: 14px; }
  .amm-rail-item .t { font-size: 16px; }
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
  .lede { font-size: 16px; }
  .kicker { margin-bottom: 12px; }

  .amm-rail { grid-template-columns: repeat(3, 1fr); }
  .amm-rail-item { padding: 10px 10px; gap: 8px; border-right: 1px solid var(--rule); border-bottom: 0; justify-content: center; }
  .amm-rail-item:last-child { border-right: 0; }
  .amm-rail-item .num { width: 24px; height: 24px; font-size: 14px; flex: none; }
  .amm-rail-item .sub { display: none; }
  .amm-rail-item .t { font-size: 15px; }

  .amm-body { padding: 24px 20px; }
  .step-head { gap: 10px; margin-bottom: 12px; padding-bottom: 12px; }
  .step-title { font-size: 22px; }
  .prose { font-size: 16px; margin-bottom: 18px; }
  .mode-card { padding: 18px; min-height: auto; }
  .mode-name { font-size: 18px; }
  .mode-desc { font-size: 15px; }

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
.peer-endpoint-input { font-size: 14px; padding: 3px 7px; height: auto; width: 100%; box-sizing: border-box; }
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
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.10em;
  text-transform: uppercase; color: var(--fg-4); flex-shrink: 0;
}
.oe-val {
  font-family: var(--mono); font-size: 14px; color: var(--accent-bright);
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.oe-copy {
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
  background: transparent; border: 1px solid var(--rule-2); color: var(--fg-3);
  cursor: pointer; padding: 2px 8px; flex-shrink: 0; transition: all 0.15s;
}
.oe-copy:hover { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }
.oe-copy.copied { color: var(--ok); border-color: rgba(184,220,196,0.35); }
</style>
