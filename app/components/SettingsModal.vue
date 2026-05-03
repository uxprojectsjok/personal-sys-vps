<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        @click.self="$emit('close')"
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
      >
        <div class="relative w-full max-w-md bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--sys-border)] flex-none">
            <span class="text-sm font-semibold text-[var(--sys-fg)]">Einstellungen</span>
            <button
              @click="$emit('close')"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-white/[0.06] transition-colors"
              aria-label="Schließen"
            >
              <i class="ri-close-line ri-fw text-base" />
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-[var(--sys-border)] flex-none">
            <button
              @click="tab = 'api'"
              class="flex-1 py-3 text-xs font-medium transition-colors"
              :class="tab === 'api'
                ? 'text-[var(--sys-fg)] border-b-2 border-[var(--sys-violet)] -mb-px'
                : 'text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg-muted)]'"
            >
              <i class="ri-key-line ri-fw mr-1" />Mein API-Key
            </button>
            <button
              v-if="!isAdmin"
              @click="tab = 'connect'"
              class="flex-1 py-3 text-xs font-medium transition-colors"
              :class="tab === 'connect'
                ? 'text-[var(--sys-fg)] border-b-2 border-[var(--sys-violet)] -mb-px'
                : 'text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg-muted)]'"
            >
              <i class="ri-shield-keyhole-line ri-fw mr-1" />Admin
            </button>
            <button
              v-if="isAdmin"
              @click="tab = 'admin'"
              class="flex-1 py-3 text-xs font-medium transition-colors"
              :class="tab === 'admin'
                ? 'text-[var(--sys-fg)] border-b-2 border-[var(--sys-orange)] -mb-px'
                : 'text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg-muted)]'"
            >
              <i class="ri-server-line ri-fw mr-1" />Server-Admin
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">

            <!-- ── Tab: Mein API-Key ── -->
            <template v-if="tab === 'api'">

              <!-- Key-Status -->
              <div class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border"
                :class="{
                  'border-emerald-500/30 bg-emerald-500/[0.06]': keySource === 'soul',
                  'border-[var(--sys-border)] bg-white/[0.03]':  keySource === 'master' || keySource === 'env',
                  'border-red-500/30 bg-red-500/[0.05]':          keySource === 'none',
                }">
                <span class="w-2 h-2 rounded-full flex-none"
                  :class="{
                    'bg-emerald-400': keySource === 'soul',
                    'bg-[var(--sys-fg-dim)]': keySource === 'master' || keySource === 'env',
                    'bg-red-400': keySource === 'none',
                  }"></span>
                <div class="min-w-0">
                  <p class="text-xs font-medium"
                    :class="{
                      'text-emerald-400': keySource === 'soul',
                      'text-[var(--sys-fg-muted)]': keySource === 'master' || keySource === 'env',
                      'text-red-400': keySource === 'none',
                    }">
                    {{ keySourceLabel }}
                  </p>
                  <p v-if="keyPreview" class="text-[10px] font-mono text-[var(--sys-fg-dim)] truncate">{{ keyPreview }}</p>
                </div>
              </div>

              <!-- Anthropic Key Input -->
              <div class="space-y-1.5">
                <label class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)]">
                  Anthropic API-Key
                </label>
                <div class="relative">
                  <input
                    v-model="apiKey"
                    :type="showKey ? 'text' : 'password'"
                    class="w-full bg-white/[0.04] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-sm font-mono text-[var(--sys-fg)] focus:outline-none focus:border-[var(--sys-violet)]/50 placeholder-[var(--sys-fg-dim)] transition-colors pr-10"
                    placeholder="sk-ant-..."
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showKey = !showKey"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] transition-colors"
                    :aria-label="showKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw text-sm" />
                  </button>
                </div>
                <p class="text-[10px] text-[var(--sys-fg-dim)]">
                  Leer lassen → Server-Key (Fallback). Deinen Key bekommst du unter
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener" class="text-[var(--sys-violet)] hover:underline">console.anthropic.com</a>.
                </p>
              </div>

              <!-- Modell -->
              <div class="space-y-1.5">
                <label class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)]">Modell</label>
                <select
                  v-model="model"
                  class="w-full bg-white/[0.04] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-sm text-[var(--sys-fg)] focus:outline-none focus:border-[var(--sys-violet)]/50 transition-colors"
                >
                  <option value="">Server-Standard</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 — leistungsstark</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — ausgewogen</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — schnell</option>
                </select>
              </div>

              <!-- Aktionen -->
              <div class="flex gap-2 pt-1">
                <button
                  @click="testApiKey"
                  :disabled="testing || !apiKey"
                  class="sys-btn-outlined h-9 px-3 text-xs flex-1 disabled:opacity-40"
                >
                  <svg v-if="testing" class="w-3 h-3 animate-spin mr-1 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
                  </svg>
                  {{ testing ? 'Teste…' : 'Key testen' }}
                </button>
                <button
                  @click="saveConfig"
                  :disabled="saving"
                  class="sys-btn-filled h-9 px-4 text-xs flex-1 disabled:opacity-50"
                >
                  {{ saving ? 'Speichert…' : 'Speichern' }}
                </button>
              </div>

              <!-- Feedback -->
              <Transition name="fade-quick">
                <div v-if="feedback"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border"
                  :class="feedback.ok
                    ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                    : 'border-red-500/20 bg-red-500/[0.06] text-red-400'"
                >
                  <i :class="feedback.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="ri-fw flex-none" />
                  {{ feedback.message }}
                </div>
              </Transition>

            </template>

            <!-- ── Tab: Admin verbinden ── -->
            <template v-if="tab === 'connect' && !isAdmin">
              <p class="text-xs text-[var(--sys-fg-muted)] leading-relaxed">
                Gib den Admin-Token ein, den du beim Server-Setup erhalten hast. Er wird nur lokal im Browser gespeichert.
              </p>
              <div class="space-y-1.5">
                <label class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)]">Admin-Token</label>
                <div class="relative">
                  <input
                    v-model="connectToken"
                    :type="showConnectToken ? 'text' : 'password'"
                    class="w-full bg-white/[0.04] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-sm font-mono text-[var(--sys-fg)] focus:outline-none focus:border-[var(--sys-violet)]/50 placeholder-[var(--sys-fg-dim)] transition-colors pr-10"
                    placeholder="adm_..."
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="connectAdmin"
                  />
                  <button
                    @click="showConnectToken = !showConnectToken"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] transition-colors"
                    :aria-label="showConnectToken ? 'Token verbergen' : 'Token anzeigen'"
                  >
                    <i :class="showConnectToken ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw text-sm" />
                  </button>
                </div>
              </div>
              <button
                @click="connectAdmin"
                :disabled="connectingAdmin || !connectToken"
                class="w-full sys-btn-filled h-10 text-sm disabled:opacity-50"
              >
                {{ connectingAdmin ? 'Prüfe…' : 'Verbinden' }}
              </button>
              <Transition name="fade-quick">
                <div v-if="connectFeedback"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border"
                  :class="connectFeedback.ok
                    ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                    : 'border-red-500/20 bg-red-500/[0.06] text-red-400'"
                >
                  <i :class="connectFeedback.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="ri-fw flex-none" />
                  {{ connectFeedback.message }}
                </div>
              </Transition>
            </template>

            <!-- ── Tab: Server-Admin ── -->
            <template v-if="tab === 'admin' && isAdmin">

              <div class="px-3 py-2 rounded-lg bg-[var(--sys-orange)]/10 border border-[var(--sys-orange)]/30 text-[10px] text-[var(--sys-orange)] leading-relaxed">
                ⚠ Master-Key-Rotation betrifft diese Instanz. Grace-Period 15 min — danach sind alte Certs ungültig.
              </div>

              <!-- Neuer Soul-Master-Key -->
              <div class="space-y-1.5">
                <label class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)]">
                  Neuer Soul-Master-Key
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="newMasterKey"
                    type="text"
                    readonly
                    class="flex-1 min-w-0 bg-white/[0.04] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--sys-fg)] focus:outline-none"
                    placeholder="→ Generieren klicken"
                  />
                  <button
                    @click="generateMasterKey"
                    class="sys-btn-outlined h-9 px-3 text-xs whitespace-nowrap flex-none"
                  >
                    Generieren
                  </button>
                </div>
                <p class="text-[10px] text-[var(--sys-fg-dim)]">Format: sys_ + 256-bit zufällig. Nur im Browser generiert — verlässt dieses Gerät nie unverschlüsselt.</p>
              </div>

              <!-- Master Anthropic-Key -->
              <div class="space-y-1.5">
                <label class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)]">
                  Server Anthropic-Key (Fallback für alle)
                </label>
                <input
                  v-model="masterAnthropicKey"
                  type="password"
                  class="w-full bg-white/[0.04] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--sys-fg)] focus:outline-none focus:border-[var(--sys-violet)]/50 transition-colors"
                  placeholder="sk-ant-… (leer = unverändert)"
                  autocomplete="off"
                />
              </div>

              <!-- Grace-Period Checkliste -->
              <Transition name="fade-quick">
                <div v-if="graceUntil" class="space-y-2 px-3 py-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05]">
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-medium text-amber-400">Grace-Period aktiv</span>
                    <span class="text-[10px] font-mono text-amber-400">{{ graceCountdown }}</span>
                  </div>
                  <label class="flex items-center gap-2 text-xs text-[var(--sys-fg-muted)] cursor-pointer">
                    <input type="checkbox" v-model="checkWA" class="accent-[var(--sys-violet)]" />
                    WhatsApp-Bot soul_cert erneuern
                  </label>
                  <label class="flex items-center gap-2 text-xs text-[var(--sys-fg-muted)] cursor-pointer">
                    <input type="checkbox" v-model="checkVC" class="accent-[var(--sys-violet)]" />
                    Voice-Clone Token erneuern
                  </label>
                  <p class="text-[10px] text-[var(--sys-fg-dim)]">Bestehende Certs laufen nach Ablauf ab — User werden automatisch neu eingeloggt.</p>
                </div>
              </Transition>

              <!-- Admin-Token rotieren -->
              <div class="space-y-1.5 pt-1 border-t border-[var(--sys-border)]">
                <label class="text-[10px] font-medium tracking-widest uppercase text-[var(--sys-fg-dim)]">
                  Admin-Token rotieren
                </label>
                <p class="text-[10px] text-[var(--sys-fg-dim)]">Bei Leak: neuen Token generieren und speichern. Der alte Token wird sofort ungültig.</p>
                <div class="flex gap-2">
                  <input
                    v-model="newAdminToken"
                    type="text"
                    readonly
                    class="flex-1 min-w-0 bg-white/[0.04] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--sys-fg)] focus:outline-none"
                    placeholder="→ Generieren klicken"
                  />
                  <button
                    @click="generateAdminToken"
                    class="sys-btn-outlined h-9 px-3 text-xs whitespace-nowrap flex-none"
                  >
                    Generieren
                  </button>
                </div>
              </div>

              <!-- Rotieren-Button -->
              <button
                @click="saveMaster"
                :disabled="savingMaster || (!newMasterKey && !masterAnthropicKey && !newAdminToken)"
                class="w-full sys-btn-filled h-10 text-sm disabled:opacity-50"
                style="background: var(--sys-orange)"
              >
                {{ savingMaster ? 'Rotiert…' : 'Speichern & rotieren' }}
              </button>

              <!-- Admin-Feedback -->
              <Transition name="fade-quick">
                <div v-if="adminFeedback"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs border"
                  :class="adminFeedback.ok
                    ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                    : 'border-red-500/20 bg-red-500/[0.06] text-red-400'"
                >
                  <i :class="adminFeedback.ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'" class="ri-fw flex-none" />
                  {{ adminFeedback.message }}
                </div>
              </Transition>

            </template>

          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useSoul } from '~/composables/useSoul.js'

const props = defineProps({ open: Boolean })
const emit  = defineEmits(['close', 'master-rotated'])

const { soulToken } = useSoul()

// ── Admin-Erkennung (nur aus localStorage — nie vom Server) ─────────────────
const ADMIN_KEY = 'sys_admin_token'
const isAdmin   = ref(false)
const adminToken = ref('')

function detectAdmin() {
  const stored = localStorage.getItem(ADMIN_KEY)
  if (stored && stored.startsWith('adm_') && stored.length === 68) {
    isAdmin.value   = true
    adminToken.value = stored
  }
}

// ── Tab ──────────────────────────────────────────────────────────────────────
const tab = ref('api')

// ── API-Key Tab State ─────────────────────────────────────────────────────────
const apiKey    = ref('')
const model     = ref('')
const showKey   = ref(false)
const saving    = ref(false)
const testing   = ref(false)
const feedback  = ref(null)
const keySource  = ref('none')   // 'soul' | 'master' | 'env' | 'none'
const keyPreview = ref('')

const keySourceLabel = computed(() => ({
  soul:   'Eigener Key aktiv',
  master: 'Server-Key aktiv',
  env:    'Env-Key aktiv',
  none:   'Kein Key konfiguriert',
}[keySource.value] || ''))

async function loadStatus() {
  try {
    const res = await fetch('/api/get-config', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (!res.ok) return
    const d = await res.json()
    keySource.value  = d.key_source || 'none'
    keyPreview.value = d.key_preview || ''
    if (d.model) model.value = d.model
  } catch {}
}

async function testApiKey() {
  if (!apiKey.value) return
  testing.value = true
  feedback.value = null
  try {
    const res = await fetch('/api/test-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${soulToken.value}`,
      },
      body: JSON.stringify({ anthropic_key: apiKey.value })
    })
    const d = await res.json().catch(() => ({}))
    feedback.value = d.ok
      ? { ok: true,  message: 'Key gültig ✓' }
      : { ok: false, message: `Fehler ${d.status || res.status} — Key ungültig oder kein Guthaben` }
  } catch {
    feedback.value = { ok: false, message: 'Netzwerkfehler beim Testen' }
  } finally {
    testing.value = false
    setTimeout(() => { feedback.value = null }, 5000)
  }
}

async function saveConfig() {
  saving.value  = true
  feedback.value = null
  try {
    const body = { anthropic_key: apiKey.value }
    if (model.value) body.model = model.value
    const res = await fetch('/api/set-config', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization: `Bearer ${soulToken.value}`,
      },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      feedback.value = { ok: true, message: 'Gespeichert ✓' }
      await loadStatus()
      apiKey.value = ''  // Key aus dem Eingabefeld entfernen nach Speichern
    } else {
      feedback.value = { ok: false, message: d.message || d.error || `Fehler ${res.status}` }
    }
  } catch {
    feedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    saving.value = false
    setTimeout(() => { feedback.value = null }, 5000)
  }
}

// ── Connect Tab State ─────────────────────────────────────────────────────────
const connectToken      = ref('')
const showConnectToken  = ref(false)
const connectingAdmin   = ref(false)
const connectFeedback   = ref(null)

async function connectAdmin() {
  if (!connectToken.value) return
  connectingAdmin.value = true
  connectFeedback.value = null
  try {
    // Token validieren: leere set-master Anfrage (nur Auth-Check)
    const res = await fetch('/api/set-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': connectToken.value },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      localStorage.setItem(ADMIN_KEY, connectToken.value)
      connectFeedback.value = { ok: true, message: 'Admin-Zugang verbunden ✓' }
      setTimeout(() => {
        detectAdmin()
        tab.value = 'admin'
        connectToken.value = ''
        connectFeedback.value = null
      }, 800)
    } else {
      connectFeedback.value = { ok: false, message: 'Token ungültig — Zugang verweigert' }
    }
  } catch {
    connectFeedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    connectingAdmin.value = false
  }
}

// ── Admin Tab State ───────────────────────────────────────────────────────────
const newMasterKey      = ref('')
const masterAnthropicKey = ref('')
const newAdminToken     = ref('')
const savingMaster      = ref(false)
const adminFeedback     = ref(null)
const graceUntil        = ref(null)  // ISO-String wenn Grace-Period aktiv
const graceCountdown    = ref('')
const checkWA           = ref(false)
const checkVC           = ref(false)
let graceTimer          = null

function generateMasterKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  newMasterKey.value = `sys_${hex}`
}

function generateAdminToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  newAdminToken.value = `adm_${hex}`
}

function startGraceCountdown(isoString) {
  graceUntil.value = isoString
  checkWA.value    = false
  checkVC.value    = false
  function tick() {
    const diff = new Date(isoString) - Date.now()
    if (diff <= 0) { graceCountdown.value = 'Abgelaufen'; return }
    const m = Math.floor(diff / 60_000)
    const s = Math.floor((diff % 60_000) / 1000)
    graceCountdown.value = `${m}m ${s}s verbleibend`
    graceTimer = setTimeout(tick, 1_000)
  }
  tick()
}

async function saveMaster() {
  if (!newMasterKey.value && !masterAnthropicKey.value && !newAdminToken.value) return
  savingMaster.value  = true
  adminFeedback.value = null
  try {
    const body = {}
    if (newMasterKey.value)       body.soul_master_key  = newMasterKey.value
    if (masterAnthropicKey.value) body.anthropic_key    = masterAnthropicKey.value
    if (newAdminToken.value)      body.new_admin_token  = newAdminToken.value
    const res = await fetch('/api/set-master', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Admin-Token': adminToken.value,
      },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      const masterRotated = !!body.soul_master_key
      let msg = 'Gespeichert ✓'
      if (d.prev_valid_until) msg += ' — Grace-Period 15 min aktiv'
      if (newAdminToken.value) {
        localStorage.setItem(ADMIN_KEY, newAdminToken.value)
        adminToken.value = newAdminToken.value
        msg += ' — Admin-Token rotiert & gespeichert'
      }
      if (masterRotated) msg += ' — Cert wird erneuert…'
      adminFeedback.value = { ok: true, message: msg }
      if (d.prev_valid_until) startGraceCountdown(d.prev_valid_until)
      newMasterKey.value       = ''
      masterAnthropicKey.value = ''
      newAdminToken.value      = ''
      await loadStatus()
      // Master-Key rotiert → Cert sofort erneuern (Grace Period noch aktiv) + Parent benachrichtigen
      if (masterRotated) emit('master-rotated')
    } else {
      adminFeedback.value = { ok: false, message: d.message || d.error || `Fehler ${res.status}` }
    }
  } catch {
    adminFeedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    savingMaster.value = false
    setTimeout(() => { adminFeedback.value = null }, 6000)
  }
}

onUnmounted(() => clearTimeout(graceTimer))

// ── Beim Öffnen laden ─────────────────────────────────────────────────────────
watch(() => props.open, (val) => {
  if (val) {
    detectAdmin()
    loadStatus()
    tab.value = 'api'
  }
})
</script>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.fade-quick-enter-active, .fade-quick-leave-active { transition: opacity 0.25s ease; }
.fade-quick-enter-from, .fade-quick-leave-to { opacity: 0; }
</style>
