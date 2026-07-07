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
        <span class="text-sm font-medium text-[var(--sys-fg)]">{{ $t('vault_session.title') }}</span>
        <span
          v-if="isUnlocked"
          class="text-sm tracking-widest font-mono px-2 py-0.5 rounded-full border"
          :class="vaultKey ? 'bg-[rgba(255,255,255,0.07)] text-white border-[rgba(255,255,255,0.18)]' : 'bg-[rgba(255,255,255,0.07)] text-white border-[rgba(255,255,255,0.18)]'"
        >
          {{ vaultKey ? '🔐 ' : '' }}{{ $t('vault_session.open_status', { time: timeRemaining }) }}
        </span>
        <span
          v-else
          class="text-sm tracking-widest font-mono px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.05)] text-[var(--sys-fg-dim)]"
        >
          {{ $t('vault_session.locked') }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Refresh-Button (nur wenn offen) -->
        <button
          v-if="open"
          @click.stop="handleRefresh"
          :disabled="loading"
          class="w-7 h-7 flex items-center justify-center rounded-none text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          :aria-label="$t('vault_session.refresh_aria')"
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
        <p class="amm-prose pt-4">{{ $t('vault_session.prose') }}</p>

        <!-- Bereits entsperrt (oder Sperrvorgang läuft) -->
        <div v-if="isUnlocked || locking">
          <div style="background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r-sm);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
              <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0">
                {{ locking ? $t('vault_session.locking') : $t('vault_session.vault_open') }}{{ !locking && vaultKey ? $t('vault_session.encrypted_suffix') : '' }}
              </p>
              <p v-if="!locking && !isUnlimited && expiresAt" style="font-size:14px;color:var(--fg-3);margin:3px 0 0">
                {{ $t('vault_session.expires_at', { date: formatTs(expiresAt) }) }}
              </p>
              <p v-else-if="!locking && isUnlimited" style="font-size:14px;color:var(--fg-3);margin:3px 0 0">{{ $t('vault_session.no_expiry') }}</p>
            </div>
            <button class="btn btn-sm btn-ghost" :disabled="locking" @click="handleLock" :aria-label="$t('vault_session.lock_aria')">
              <svg v-if="locking" width="12" height="12" class="animate-spin" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity:.25"/>
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style="opacity:.75"/>
              </svg>
              {{ locking ? $t('vault_session.locking_btn') : $t('vault_session.lock_btn') }}
            </button>
          </div>
        </div>

        <!-- Gesperrt → Entsperren -->
        <div v-else class="space-y-3">
          <p style="font-size:14px;color:var(--fg-2)">{{ $t('vault_session.choose_window') }}</p>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="opt in durationOptions"
              :key="opt.value"
              style="padding:8px 4px;min-height:38px;font-size:14px;font-family:var(--mono);border-radius:var(--r-xs);border:1px solid;transition:all .15s"
              :style="selectedDuration === opt.value
                ? 'border-color:var(--accent);color:var(--accent);background:var(--accent-dim);font-weight:600'
                : 'border-color:var(--line-2);color:var(--fg-2)'"
              @click="selectedDuration = opt.value"
            >{{ opt.label }}</button>
          </div>

          <div v-if="selectedDuration === 'unlimited'" style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-xs);padding:8px 12px">
            <p style="font-size:15px;color:var(--fg-3);margin:0">{{ $t('vault_session.unlimited_info') }}</p>
          </div>

          <!-- Verschlüsselung -->
          <div class="space-y-2">
            <p style="font-size:15px;color:var(--fg-2);margin:0">
              {{ $t('vault_session.encryption') }}
              <span style="color:var(--fg-3)" v-if="savedMethod()">{{ $t('vault_session.last_used') }}{{ savedMethod() === 'mnemonic' ? $t('vault_session.method_label_mnemonic') : $t('vault_session.method_label_passkey') }}</span>
              <span style="color:var(--fg-4)" v-else>{{ $t('vault_session.method_hint') }}</span>
            </p>
            <div class="grid grid-cols-2 gap-1.5">
              <button
                v-for="opt in [{ value: 'passkey', label: $t('vault_session.method_passkey') }, { value: 'mnemonic', label: $t('vault_session.method_mnemonic') }]"
                :key="opt.value"
                type="button"
                style="padding:8px 4px;min-height:38px;font-size:15px;border-radius:var(--r-xs);border:1px solid;transition:all .15s"
                :style="encryptMode === opt.value
                  ? 'border-color:var(--accent);color:var(--accent);background:var(--accent-dim);font-weight:600'
                  : 'border-color:var(--line-2);color:var(--fg-2)'"
                @click="encryptMode = opt.value"
              >{{ opt.label }}</button>
            </div>

            <!-- Methodenwechsel-Warnung -->
            <Transition name="slide-up">
              <div v-if="methodWarning" class="rounded-none bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.25)] px-3 py-2">
                <p class="text-sm text-yellow-300/80 leading-relaxed">{{ methodWarning }}</p>
              </div>
            </Transition>

            <!-- Passkey Info -->
            <Transition name="slide-up">
              <div v-if="encryptMode === 'passkey'" style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-xs);padding:10px 12px;display:flex;flex-direction:column;gap:4px">
                <p style="font-size:15px;color:var(--fg-2);margin:0">{{ hasPasskey ? $t('vault_session.passkey_confirm') : $t('vault_session.passkey_create') }}</p>
                <p style="font-size:14px;color:var(--fg-3);margin:0">{{ $t('vault_session.biometric_methods') }}</p>
                <p v-if="passkeyError" style="font-size:14px;color:var(--c-danger,#e06c75);margin:0">{{ passkeyError }}</p>
              </div>
            </Transition>

            <!-- 12 Wörter -->
            <Transition name="slide-up">
              <div v-if="encryptMode === 'mnemonic'" class="space-y-2">
                <textarea
                  v-model="mnemonicInput"
                  :placeholder="$t('vault_session.mnemonic_placeholder')"
                  class="w-full bg-[rgba(255,255,255,0.04)] border border-[var(--sys-border)] rounded-none px-3 py-2 text-sm text-[var(--sys-fg)] placeholder:text-[var(--sys-fg-muted)] resize-none focus:outline-none focus:border-[rgba(255,255,255,0.3)] transition-colors"
                  rows="2"
                  autocomplete="off"
                  autocorrect="off"
                  spellcheck="false"
                />
                <p v-if="mnemonicInput.trim() && mnemonicWordCount !== 12" class="text-sm text-white">
                  {{ $t('vault_session.word_count', { n: mnemonicWordCount }) }}
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
            :aria-label="$t('vault_session.unlock_aria')"
          >
            {{ passkeyLoading ? $t('vault_session.awaiting_passkey') : loading ? $t('vault_session.unlocking') : $t('vault_session.unlock_btn') }}
          </button>

          <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultSession } from '../composables/useVaultSession.js'
import { useSoulPasskey } from '../composables/useSoulPasskey.js'
import { useSoul } from '../composables/useSoul.js'

const props = defineProps({ headless: Boolean })
const emit  = defineEmits(['unlocked'])

const { t } = useI18n()

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

const durationOptions = computed(() => [
  { value: '1h',        label: t('vault_session.window_1h') },
  { value: '12h',       label: t('vault_session.window_12h') },
  { value: '1d',        label: t('vault_session.window_1d') },
  { value: '30d',       label: t('vault_session.window_30d') },
  { value: '182d',      label: t('vault_session.window_6mo') },
  { value: '365d',      label: t('vault_session.window_1yr') },
  { value: 'unlimited', label: t('vault_session.window_unlimited') },
])

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
  const labelMap = { mnemonic: t('vault_session.method_label_mnemonic'), passkey: t('vault_session.method_label_passkey') }
  methodWarning.value = t('vault_session.method_warning', { method: labelMap[prev] || prev })
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
  font-family: var(--sans);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--fg);
  margin: 0 0 20px;
}
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
