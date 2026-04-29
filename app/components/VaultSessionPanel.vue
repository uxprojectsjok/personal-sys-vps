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
        <span
          class="w-2 h-2 rounded-full flex-none"
          :class="isUnlocked ? 'bg-[var(--sys-accent)]' : 'bg-[rgba(255,255,255,0.2)]'"
        />
        <span class="text-sm font-medium text-[var(--sys-fg)]">Vault-Zugang</span>
        <span
          v-if="isUnlocked"
          class="text-xs tracking-widest font-mono px-2 py-0.5 rounded-full border"
          :class="vaultKey ? 'bg-[rgba(255,255,255,0.07)] text-white/75 border-[rgba(255,255,255,0.18)]' : 'bg-[rgba(255,255,255,0.07)] text-white/75 border-[rgba(255,255,255,0.18)]'"
        >
          {{ vaultKey ? '🔐 ' : '' }}OFFEN · {{ timeRemaining }}
        </span>
        <span
          v-else
          class="text-xs tracking-widest font-mono px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)] text-[var(--sys-fg-dim)]"
        >
          GESPERRT
        </span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Refresh-Button (nur wenn offen) -->
        <button
          v-if="open"
          @click.stop="handleRefresh"
          :disabled="loading"
          class="w-7 h-7 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          aria-label="Status aktualisieren"
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
      <div v-if="open || headless" class="px-5 pb-5 space-y-4 border-t border-[var(--sys-border)]">
        <p class="amm-prose pt-4">
          Zeitfenster für externe Dienste. Nur wenn der Vault <strong style="color:rgba(236,231,245,0.95)">offen</strong> ist,
          können verbundene Dienste auf deine Soul-Daten zugreifen. Du bestimmst die Dauer.
        </p>

        <!-- Bereits entsperrt (oder Sperrvorgang läuft) -->
        <div v-if="isUnlocked || locking" class="space-y-3">
          <div
            class="rounded-none px-4 py-3 flex items-center justify-between border"
            :class="vaultKey
              ? 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.15)]'
              : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.12)]'"
          >
            <div>
              <p class="text-xs font-medium text-white/75">
                {{ locking ? 'Wird gesperrt…' : 'Vault offen' }}{{ !locking && vaultKey ? ' · verschlüsselt' : '' }}
              </p>
              <p v-if="!locking && !isUnlimited && expiresAt" class="text-xs text-[var(--sys-fg-dim)] mt-0.5">
                Läuft ab: {{ formatTs(expiresAt) }}
              </p>
              <p v-else-if="!locking && isUnlimited" class="text-xs text-[var(--sys-fg-dim)] mt-0.5">Kein Ablauf</p>
            </div>
            <button
              class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-none border border-[rgba(239,68,68,0.3)] text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-colors min-h-[36px]"
              :disabled="locking"
              @click="handleLock"
              aria-label="Vault sperren"
            >
              <svg v-if="locking" class="w-3 h-3 animate-spin flex-none" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {{ locking ? 'Gesperrt…' : 'Sperren' }}
            </button>
          </div>
        </div>

        <!-- Gesperrt → Entsperren -->
        <div v-else class="space-y-3">
          <p class="text-xs text-[var(--sys-fg-dim)]">Zeitfenster wählen:</p>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="opt in durationOptions"
              :key="opt.value"
              class="py-2 rounded-none border text-xs font-mono transition-all min-h-[36px]"
              :class="selectedDuration === opt.value
                ? 'border-white/35 text-white bg-[rgba(255,255,255,0.08)]'
                : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:border-[rgba(255,255,255,0.2)]'"
              @click="selectedDuration = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>

          <div v-if="selectedDuration === 'unlimited'" class="rounded-none bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] px-3 py-2">
            <p class="text-xs text-white/55">
              Unbegrenzt: Vault bleibt bis zum manuellen Sperren offen.
            </p>
          </div>

          <!-- Verschlüsselung -->
          <div class="space-y-2">
            <p class="text-xs text-[var(--sys-fg-dim)]">
              Verschlüsselung
              <span v-if="savedMethod()" class="text-white/50"> · zuletzt: {{ savedMethod() === 'mnemonic' ? '12 Wörter' : 'Passkey' }}</span>
              <span v-else class="text-white/35"> · immer dieselbe Methode wählen</span>
            </p>
            <div class="grid grid-cols-2 gap-1.5">
              <button
                v-for="opt in [{ value: 'passkey', label: '🔑 Passkey' }, { value: 'mnemonic', label: '📝 12 Wörter' }]"
                :key="opt.value"
                type="button"
                class="py-2 rounded-none border text-xs transition-all min-h-[36px]"
                :class="encryptMode === opt.value
                  ? 'border-white/35 text-white bg-[rgba(255,255,255,0.08)]'
                  : 'border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:border-[rgba(255,255,255,0.2)]'"
                @click="encryptMode = opt.value"
              >{{ opt.label }}</button>
            </div>

            <!-- Methodenwechsel-Warnung -->
            <Transition name="slide-up">
              <div v-if="methodWarning" class="rounded-none bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.25)] px-3 py-2">
                <p class="text-xs text-yellow-300/80 leading-relaxed">{{ methodWarning }}</p>
              </div>
            </Transition>

            <!-- Passkey Info -->
            <Transition name="slide-up">
              <div v-if="encryptMode === 'passkey'" class="rounded-none bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.12)] px-3 py-2 space-y-1">
                <p class="text-xs text-white/65">
                  {{ hasPasskey ? 'Biometrische Bestätigung beim Öffnen erforderlich.' : 'Neuen Passkey erstellen (einmalig).' }}
                </p>
                <p class="text-xs text-[var(--sys-fg-dim)]">
                  Face ID · Touch ID · Windows Hello · Smartphone-Displaysperre
                </p>
                <p v-if="passkeyError" class="text-xs text-red-400">{{ passkeyError }}</p>
              </div>
            </Transition>

            <!-- 12 Wörter -->
            <Transition name="slide-up">
              <div v-if="encryptMode === 'mnemonic'" class="space-y-2">
                <textarea
                  v-model="mnemonicInput"
                  placeholder="12 Schlüsselwörter, getrennt durch Leerzeichen"
                  class="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] rounded-none px-3 py-2 text-xs text-[var(--sys-fg)] placeholder:text-[var(--sys-fg-dim)] resize-none focus:outline-none focus:border-[rgba(255,255,255,0.3)] transition-colors"
                  rows="2"
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                />
                <p v-if="mnemonicInput.trim() && mnemonicWordCount !== 12" class="text-xs text-white/55">
                  {{ mnemonicWordCount }} / 12 Wörter
                </p>
              </div>
            </Transition>
          </div>

          <button
            class="w-full py-3 rounded-none text-sm font-semibold transition-all min-h-[44px]"
            :class="loading || passkeyLoading
              ? 'bg-[rgba(255,255,255,0.05)] text-[var(--sys-fg-dim)] cursor-not-allowed'
              : 'sys-cta-primary text-black active:scale-[0.98]'"
            :disabled="loading || passkeyLoading || (encryptMode === 'mnemonic' && mnemonicWordCount !== 12 && mnemonicInput.trim() !== '')"
            @click="handleUnlock"
            aria-label="Vault entsperren"
          >
            {{ passkeyLoading ? 'Warte auf Passkey…' : loading ? 'Wird entsperrt…' : 'Vault entsperren' }}
          </button>

          <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useVaultSession } from '../composables/useVaultSession.js'
import { useSoulPasskey } from '../composables/useSoulPasskey.js'
import { useSoul } from '../composables/useSoul.js'

const props = defineProps({ headless: Boolean })
const emit  = defineEmits(['unlocked'])

onMounted(() => { if (props.headless) fetchStatus() })

const { isUnlocked, expiresAt, isUnlimited, loading, error, vaultKey, timeRemaining, fetchStatus, unlock, lock } = useVaultSession()
const { hasPasskey, isAuthenticating, passkeyError, authenticatePasskey, registerPasskey, deriveVaultKeyHex } = useSoulPasskey()
const { soulToken } = useSoul()

const open             = ref(false)
const selectedDuration = ref('1d')
const mnemonicInput    = ref('')
const showMnemonic     = ref(false)
const encryptMode      = ref('mnemonic')   // 'passkey' | 'mnemonic'
const passkeyLoading   = ref(false)
const locking          = ref(false)
const methodWarning    = ref('')       // Warnung bei Methodenwechsel

const durationOptions = [
  { value: '1h',        label: '1 Std' },
  { value: '12h',       label: '12 Std' },
  { value: '1d',        label: '1 Tag' },
  { value: '30d',       label: '30 T' },
  { value: '182d',      label: '6 Mo' },
  { value: '365d',      label: '1 Jahr' },
  { value: 'unlimited', label: '∞' },
]

// ── Schlüsselmethode pro Soul speichern / laden ───────────────────────────
function _methodKey() {
  const soulId = soulToken.value?.split('.')?.[0]
  return soulId ? `sys_vault_method_${soulId}` : null
}

function savedMethod() {
  const k = _methodKey()
  return k ? (localStorage.getItem(k) || null) : null
}

function saveMethod(mode) {
  const k = _methodKey()
  if (k && mode !== 'none') localStorage.setItem(k, mode)
}

// Beim Öffnen: vorherige Methode pre-selektieren
watch(open, (isOpen) => {
  if (!isOpen) return
  const prev = savedMethod()
  if (prev) encryptMode.value = prev
})

// Beim Wechsel: Warnung wenn abweichend von gespeicherter Methode
watch(encryptMode, (mode) => {
  const prev = savedMethod()
  methodWarning.value = ''
  if (!prev || mode === prev) return
  const labels = { mnemonic: '12 Wörter', passkey: 'Passkey' }
  methodWarning.value = `Dein Vault wurde bisher mit „${labels[prev] || prev}" geöffnet. Bei Methodenwechsel müssen alle Dateien neu verschlüsselt werden.`
})

const mnemonicWordCount = computed(() =>
  mnemonicInput.value.trim() ? mnemonicInput.value.trim().split(/\s+/).length : 0
)

function formatTs(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

async function handleOpen() {
  open.value = !open.value
  if (open.value) await fetchStatus()
}

async function handleRefresh() {
  await fetchStatus()
}

async function handleUnlock() {
  if (encryptMode.value === 'passkey') {
    passkeyLoading.value = true
    try {
      const prf = hasPasskey.value ? await authenticatePasskey() : await registerPasskey()
      if (!prf) return
      const hexKey = await deriveVaultKeyHex(prf)
      await unlock(selectedDuration.value, '', hexKey)
    } finally {
      passkeyLoading.value = false
    }
  } else {
    await unlock(selectedDuration.value, encryptMode.value === 'mnemonic' ? mnemonicInput.value.trim() : '')
  }
  if (isUnlocked.value) {
    saveMethod(encryptMode.value)
    emit('unlocked')
  }
}

async function handleLock() {
  locking.value = true
  try {
    await lock()
  } finally {
    locking.value = false
  }
}
</script>

<style scoped>
.amm-prose {
  font-family: 'Noto Serif', Georgia, serif;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(236,231,245,0.60);
  margin: 0;
}
/* Override global sys-cta-primary border-radius */
button { border-radius: 0 !important; }
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
