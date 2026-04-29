<template>
  <div :class="headless ? '' : 'rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden'">
    <!-- Header -->
    <button
      v-if="!headless"
      class="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      @click="handleOpen"
      :aria-expanded="open"
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-[var(--sys-fg)]">Verbundene Dienste</span>
        <span
          v-if="services.length"
          class="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10"
        >
          {{ services.length }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="open"
          @click.stop="fetchServices()"
          :disabled="loading"
          class="w-7 h-7 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          aria-label="Dienste neu laden"
        >
          <svg class="w-3.5 h-3.5" :class="loading ? 'animate-spin' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <svg
          class="w-4 h-4 text-[var(--sys-fg-dim)] transition-transform duration-200"
          :class="open ? 'rotate-180' : ''"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- Body -->
    <Transition name="slide-up">
      <div v-if="open || headless" class="border-t border-[var(--sys-border)]">

        <!-- Erklärung -->
        <div class="px-5 pt-4 pb-3">
          <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">
            Jeder Dienst erhält einen eigenen Service-Token.
            Dieser Token kommt als <code class="text-[var(--sys-accent)] text-xs">Authorization: Bearer &lt;token&gt;</code>
            in den Webhook-Header externer Dienste.
            Zugriff nur wenn Vault-Zugang offen ist.
          </p>
        </div>

        <!-- Service-Liste -->
        <div v-if="services.length" class="divide-y divide-[var(--sys-border)]">
          <div
            v-for="svc in services"
            :key="svc.token"
            class="px-5 py-3 flex items-start justify-between gap-3"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm text-[var(--sys-fg)] truncate">{{ svc.name }}</p>
              <div class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="key in (Array.isArray(svc.permissions) ? svc.permissions : Object.keys(svc.permissions).filter(k => svc.permissions[k]))"
                  :key="key"
                  class="text-xs px-1.5 py-0.5 rounded bg-white/5 text-white/45 border border-white/8"
                >{{ allPermissions.find(o => o.value === key)?.label || key }}</span>
              </div>
              <p class="text-xs text-[var(--sys-fg-dim)] mt-1 font-mono">
                Läuft ab: {{ formatExpiry(svc.expires_at) }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2 flex-none">
              <button
                class="text-xs px-2 py-1 rounded border border-[rgba(255,255,255,0.1)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.25)] transition-colors min-h-[28px]"
                @click="tokenModal = svc"
                :aria-label="`Token von ${svc.name} anzeigen`"
              >
                Token
              </button>
              <button
                class="text-xs px-2 py-1 rounded border border-[rgba(239,68,68,0.2)] text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-colors min-h-[28px]"
                @click="handleRevoke(svc.token, svc.name)"
                :aria-label="`${svc.name} widerrufen`"
              >
                Widerrufen
              </button>
            </div>
          </div>
        </div>

        <div v-else class="px-5 py-4">
          <p class="text-xs text-[var(--sys-fg-dim)]">Noch keine verbundenen Dienste.</p>
        </div>

        <!-- Neuer Dienst -->
        <div class="px-5 pb-5 pt-4 border-t border-[var(--sys-border)] space-y-3">
          <p class="text-xs font-medium text-[var(--sys-fg-dim)]">Neuer Dienst</p>

          <input
            v-model="newName"
            type="text"
            placeholder="Name (z.B. Mein KI-Dienst)"
            class="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] rounded-none px-4 py-3 text-sm text-[var(--sys-fg)] placeholder-[var(--sys-fg-dim)] focus:outline-none focus:border-[rgba(255,255,255,0.30)] transition-colors"
            aria-label="Name des neuen Dienstes"
          />

          <!-- Permissions -->
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in allPermissions"
              :key="p.value"
              class="text-xs px-3 py-1.5 rounded-none border transition-all min-h-[32px]"
              :class="newPermissions.includes(p.value)
                ? 'border-[rgba(255,255,255,0.35)] text-white bg-[rgba(255,255,255,0.08)]'
                : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:border-[rgba(255,255,255,0.2)]'"
              @click="togglePermission(p.value)"
              :aria-pressed="newPermissions.includes(p.value)"
            >
              {{ p.label }}
            </button>
          </div>

          <!-- Ablauf -->
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="opt in expiryOptions"
              :key="opt.value"
              class="py-2 rounded-none border text-xs font-mono transition-all min-h-[32px]"
              :class="newExpiry === opt.value
                ? 'border-[rgba(255,255,255,0.35)] text-white bg-[rgba(255,255,255,0.08)]'
                : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:border-[rgba(255,255,255,0.2)]'"
              @click="newExpiry = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>

          <button
            class="w-full py-3 rounded-none text-sm font-semibold transition-all min-h-[44px] border border-[rgba(255,255,255,0.15)] text-white/80 bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.28)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!newName.trim() || addLoading"
            @click="handleAdd"
            aria-label="Dienst hinzufügen"
          >
            {{ addLoading ? 'Wird erstellt…' : '+ Dienst hinzufügen' }}
          </button>

          <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
        </div>

      </div>
    </Transition>
  </div>

  <!-- Confirm-Modal (lokal, falls kein globales ConfirmModal gemountet ist) -->
  <ConfirmModal />

  <!-- Token-Modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="tokenModal"
        class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        @click.self="tokenModal = null"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="tokenModal = null" />

        <!-- Sheet -->
        <div class="relative w-full max-w-md rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden z-10">
          <!-- Handle -->
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div class="w-8 h-1 rounded-full bg-[rgba(255,255,255,0.15)]" />
          </div>

          <div class="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-[var(--sys-fg)]">{{ tokenModal.name }}</p>
              <p class="text-xs text-[var(--sys-fg-dim)] mt-0.5">Service-Token</p>
            </div>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors flex-none"
              @click="tokenModal = null"
              aria-label="Schließen"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-5 pb-5 space-y-3">
            <!-- Token-Anzeige -->
            <div class="rounded-none bg-[rgba(255,255,255,0.03)] border border-[var(--sys-border)] px-4 py-3">
              <p class="text-xs font-mono text-[var(--sys-fg)] break-all select-all leading-relaxed">{{ tokenModal.token }}</p>
            </div>

            <!-- Verwendung -->
            <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">
              Im Dienst als Authorization-Header eintragen:
              <code class="block mt-1 text-white/70 bg-[rgba(255,255,255,0.04)] rounded px-2 py-1 break-all">Authorization: Bearer {{ tokenModal.token }}</code>
            </p>

            <!-- Verbindung testen -->
            <div class="flex gap-2">
              <button
                class="flex-1 py-2.5 rounded-none text-xs font-medium transition-all min-h-[40px] border active:scale-[0.98] disabled:opacity-40"
                :class="testResult === 'ok'
                  ? 'border-white/25 text-white/80 bg-[rgba(255,255,255,0.07)]'
                  : testResult === 'error'
                    ? 'border-[rgba(239,68,68,0.3)] text-red-400 bg-[rgba(239,68,68,0.06)]'
                    : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.04)]'"
                :disabled="testLoading"
                @click="testConnection(tokenModal.token)"
              >
                <span v-if="testLoading">Teste…</span>
                <span v-else-if="testResult === 'ok'">✓ Vault erreichbar</span>
                <span v-else-if="testResult === 'error'">✗ {{ testError }}</span>
                <span v-else>Verbindung testen</span>
              </button>

              <!-- Kopier-Button -->
              <button
                class="flex-1 py-2.5 rounded-none text-xs font-medium transition-all min-h-[40px] border active:scale-[0.98]"
                :class="copied === tokenModal.token
                  ? 'border-white/25 text-white/80 bg-[rgba(255,255,255,0.07)]'
                  : 'border-[rgba(255,255,255,0.12)] text-[var(--sys-fg)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]'"
                @click="copyToken(tokenModal.token)"
              >
                {{ copied === tokenModal.token ? '✓ Kopiert' : 'Token kopieren' }}
              </button>
            </div>

            <!-- Test-Hinweis bei Fehler -->
            <p v-if="testResult === 'error' && testError === 'Vault gesperrt'" class="text-xs text-white/55 leading-relaxed">
              Der Vault-Zugang ist auf dem Server abgelaufen. Bitte im Vault-Panel sperren und neu öffnen.
            </p>
            <p v-if="testResult === 'error' && testError.startsWith('Schlüssel falsch')" class="text-xs text-white/55 leading-relaxed">
              Der Vault wurde mit einem anderen Schlüssel geöffnet als sys.md verschlüsselt wurde. Vault sperren, mit dem originalen Schlüssel (12 Wörter) öffnen und erneut synchronisieren.
            </p>
            <p v-if="testResult === 'error' && testError.startsWith('sys.md fehlt')" class="text-xs text-white/55 leading-relaxed">
              Die sys.md wurde noch nicht auf den Server synchronisiert. Im Vault Explorer → Sync ausführen.
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useVaultServices } from '../composables/useVaultServices.js'
import { useConfirm } from '../composables/useConfirm.js'
import ConfirmModal from './ConfirmModal.vue'
const { ask } = useConfirm();

const props = defineProps({ headless: Boolean })

const { services, loading, error, fetchServices, addService, revokeService, formatExpiry } = useVaultServices()

const open            = ref(false)

onMounted(() => { if (props.headless) fetchServices() })
const newName         = ref('')
const newPermissions  = ref(['soul', 'context_files'])
const newExpiry       = ref(null)
const addLoading      = ref(false)
const copied          = ref(null)
const tokenModal      = ref(null)
const testLoading     = ref(false)
const testResult      = ref(null)   // null | 'ok' | 'error'
const testError       = ref('')

// Reset test state when modal opens/closes
watch(tokenModal, () => {
  testResult.value = null
  testError.value  = ''
})

const allPermissions = [
  { value: 'soul',          label: 'Soul' },
  { value: 'audio',         label: 'Audio' },
  { value: 'images',        label: 'Bilder' },
  { value: 'video',         label: 'Video' },
  { value: 'context_files', label: 'Kontext' },
]

const expiryOptions = [
  { value: null,  label: '∞' },
  { value: 30,    label: '30 T' },
  { value: 182,   label: '6 Mo' },
  { value: 365,   label: '1 Jahr' },
]

function togglePermission(p) {
  const idx = newPermissions.value.indexOf(p)
  if (idx === -1) newPermissions.value.push(p)
  else newPermissions.value.splice(idx, 1)
}

async function handleOpen() {
  open.value = !open.value
  if (open.value) await fetchServices()
}

async function handleAdd() {
  if (!newName.value.trim()) return
  addLoading.value = true
  const name = newName.value.trim()
  const perms = [...newPermissions.value]
  const data = await addService(name, perms, newExpiry.value)
  addLoading.value = false
  if (data?.ok) {
    newName.value = ''
    newPermissions.value = ['soul', 'context_files']
    newExpiry.value = null
    // Liste neu laden damit der neue Dienst erscheint
    await fetchServices()
    // Modal auf den echten Eintrag setzen (oder Fallback)
    const created = services.value.find(s => s.token === data.token)
    tokenModal.value = created ?? { name, token: data.token, permissions: perms, expires_at: null }
  }
}

async function handleRevoke(token, name) {
  if (!await ask({ title: 'Dienst widerrufen', message: `„${name}" wirklich widerrufen? Der Token wird sofort ungültig.`, confirmText: 'Widerrufen' })) return
  if (tokenModal.value?.token === token) tokenModal.value = null
  await revokeService(token)
}

async function testConnection(token) {
  testLoading.value = true
  testResult.value  = null
  testError.value   = ''
  try {
    const res = await fetch('/api/soul', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      testResult.value = 'ok'
    } else {
      const body = await res.json().catch(() => ({}))
      testResult.value = 'error'
      if (res.status === 403) {
        if (body.error === 'vault_locked') testError.value = 'Vault gesperrt'
        else if (body.error === 'decryption_failed') testError.value = 'Schlüssel falsch – Vault neu öffnen + Sync'
        else testError.value = 'Zugriff verweigert (403)'
      } else if (res.status === 404) {
        if (body.error === 'No soul content synced yet') testError.value = 'sys.md fehlt – bitte Sync ausführen'
        else testError.value = 'API nicht konfiguriert (404)'
      } else if (res.status === 401) {
        testError.value = 'Token ungültig (401)'
      } else {
        testError.value = `Fehler ${res.status}`
      }
    }
  } catch {
    testResult.value = 'error'
    testError.value  = 'Keine Verbindung zum Server'
  } finally {
    testLoading.value = false
  }
}

async function copyToken(token) {
  if (!token) return
  // Modern clipboard API (HTTPS + user gesture)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(token)
      copied.value = token
      setTimeout(() => { copied.value = null }, 2000)
      return
    } catch { /* weiter zum Fallback */ }
  }
  // Fallback: sichtbares Input-Element, select + execCommand
  const input = document.createElement('input')
  input.value = token
  input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none'
  document.body.appendChild(input)
  input.focus()
  input.select()
  input.setSelectionRange(0, 99999)
  try {
    document.execCommand('copy')
    copied.value = token
    setTimeout(() => { copied.value = null }, 2000)
  } catch { /* ignorieren */ }
  document.body.removeChild(input)
}
</script>
