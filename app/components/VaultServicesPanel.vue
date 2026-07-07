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
        <span class="text-sm font-medium text-[var(--sys-fg)]">{{ $t('services.title') }}</span>
        <span
          v-if="services.length"
          class="text-sm font-medium px-2 py-0.5 rounded-full bg-white/5 text-white border border-white/10"
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
          :aria-label="$t('services.refresh_aria')"
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
        <div class="px-5 pt-4" style="padding-bottom:20px">
          <p style="font-size:15px;font-weight:500;line-height:1.6;color:var(--fg);margin:0">
            {{ $t('services.prose_1') }}
            <code style="color:var(--accent);font-size:13px">Authorization: Bearer &lt;token&gt;</code>
            {{ $t('services.prose_2') }}
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
                  class="text-sm px-1.5 py-0.5 rounded bg-white/5 text-white border border-white/8"
                >{{ allPermissions.find(o => o.value === key)?.label || key }}</span>
              </div>
              <p class="text-sm text-[var(--sys-fg-muted)] mt-1 font-mono">
                {{ $t('services.expires_at', { date: formatExpiry(svc.expires_at, $t('services.no_expiry')) }) }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-2 flex-none">
              <button
                class="text-sm px-2 py-1 rounded border border-[rgba(255,255,255,0.1)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.25)] transition-colors min-h-[28px]"
                @click="tokenModal = svc"
                :aria-label="$t('services.show_token_aria', { name: svc.name })"
              >
                {{ $t('services.btn_token') }}
              </button>
              <button
                class="text-sm px-2 py-1 rounded border border-[rgba(239,68,68,0.2)] text-red-400 hover:bg-[rgba(239,68,68,0.1)] transition-colors min-h-[28px]"
                @click="handleRevoke(svc.token, svc.name)"
                :aria-label="$t('services.revoke_aria', { name: svc.name })"
              >
                {{ $t('services.btn_revoke') }}
              </button>
            </div>
          </div>
        </div>

        <div v-else class="px-5 py-4">
          <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0">{{ $t('services.empty') }}</p>
        </div>

        <!-- Neuer Dienst -->
        <div class="px-5 pb-5 pt-4 border-t border-[var(--sys-border)]" style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0">{{ $t('services.new_service') }}</p>

          <input
            v-model="newName"
            type="text"
            :placeholder="$t('services.name_placeholder')"
            class="sys-input"
            style="font-size:15px"
            :aria-label="$t('services.name_aria')"
          />

          <!-- Permissions -->
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button
              v-for="p in allPermissions"
              :key="p.value"
              style="font-size:15px;font-weight:500;padding:6px 14px;border:1px solid;border-radius:var(--r-xs);transition:all .15s;min-height:34px"
              :style="newPermissions.includes(p.value)
                ? 'border-color:var(--accent);color:var(--accent);background:var(--accent-dim)'
                : 'border-color:var(--line-2);color:var(--fg)'"
              @click="togglePermission(p.value)"
              :aria-pressed="newPermissions.includes(p.value)"
            >{{ p.label }}</button>
          </div>

          <!-- Ablauf -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
            <button
              v-for="opt in expiryOptions"
              :key="opt.value"
              style="padding:8px 4px;min-height:38px;font-size:15px;font-weight:500;font-family:var(--mono);border:1px solid;border-radius:var(--r-xs);transition:all .15s"
              :style="newExpiry === opt.value
                ? 'border-color:var(--accent);color:var(--accent);background:var(--accent-dim)'
                : 'border-color:var(--line-2);color:var(--fg)'"
              @click="newExpiry = opt.value"
            >{{ opt.label }}</button>
          </div>

          <button
            class="btn btn-primary w-full"
            :disabled="!newName.trim() || addLoading"
            @click="handleAdd"
            :aria-label="$t('services.add_aria')"
          >
            {{ addLoading ? $t('services.btn_creating') : $t('services.btn_add') }}
          </button>

          <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
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
        <div class="relative w-full max-w-md overflow-hidden z-10"
          style="background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r-lg)">
          <!-- Handle mobile -->
          <div class="flex justify-center pt-3 pb-1 sm:hidden">
            <div style="width:32px;height:4px;border-radius:99px;background:var(--line-2)" />
          </div>

          <div style="padding:16px 20px 10px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div>
              <p style="font-size:14px;font-weight:500;color:var(--fg);margin:0">{{ tokenModal.name }}</p>
              <p style="font-size:13px;color:var(--fg-3);margin:2px 0 0">{{ $t('services.service_token_label') }}</p>
            </div>
            <button class="icon-btn" @click="tokenModal = null" :aria-label="$t('common.close')" style="flex:none">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:12px">
            <!-- Token-Anzeige -->
            <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px">
              <p style="font-size:14px;font-family:var(--mono);color:var(--fg);word-break:break-all;margin:0;line-height:1.6;user-select:all">{{ tokenModal.token }}</p>
            </div>

            <!-- Verwendung -->
            <p style="font-size:15px;color:var(--fg-2);line-height:1.6;margin:0">
              {{ $t('services.usage_hint') }}
              <code style="display:block;margin-top:6px;font-family:var(--mono);font-size:13px;color:var(--fg-2);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-xs);padding:8px 10px;word-break:break-all">Authorization: Bearer {{ tokenModal.token }}</code>
            </p>

            <!-- Verbindung testen + Kopieren -->
            <div style="display:flex;gap:8px">
              <button
                class="btn btn-sm"
                style="flex:1"
                :class="testResult === 'ok' ? 'btn-ghost' : testResult === 'error' ? '' : 'btn-ghost'"
                :style="testResult === 'error' ? 'border:1px solid rgba(224,108,117,0.35);color:#e06c75;background:rgba(224,108,117,0.07)' : ''"
                :disabled="testLoading"
                @click="testConnection(tokenModal.token)"
              >
                <span v-if="testLoading">{{ $t('services.btn_testing') }}</span>
                <span v-else-if="testResult === 'ok'">{{ $t('services.btn_test_ok') }}</span>
                <span v-else-if="testResult === 'error'">✗ {{ testError }}</span>
                <span v-else>{{ $t('services.btn_test') }}</span>
              </button>

              <button
                class="btn btn-sm"
                style="flex:1"
                :class="copied === tokenModal.token ? 'btn-ghost' : 'btn-primary'"
                @click="copyToken(tokenModal.token)"
              >
                {{ copied === tokenModal.token ? $t('services.btn_copied') : $t('services.btn_copy_token') }}
              </button>
            </div>

            <!-- Test-Hinweis bei Fehler -->
            <p v-if="testResult === 'error' && testErrorCode === 'vault_locked'" style="font-size:15px;color:var(--fg-3);line-height:1.6;margin:0">
              {{ $t('services.err_vault_locked_hint') }}
            </p>
            <p v-if="testResult === 'error' && testErrorCode === 'key_wrong'" class="text-sm text-white leading-relaxed">
              {{ $t('services.err_key_wrong_hint') }}
            </p>
            <p v-if="testResult === 'error' && testErrorCode === 'no_sync'" class="text-sm text-white leading-relaxed">
              {{ $t('services.err_no_sync_hint') }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultServices } from '../composables/useVaultServices.js'
import { useConfirm } from '../composables/useConfirm.js'
import ConfirmModal from './ConfirmModal.vue'
const { ask } = useConfirm()
const { t } = useI18n()

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
const testErrorCode   = ref('')     // 'vault_locked' | 'key_wrong' | 'no_sync' | ''

// Reset test state when modal opens/closes
watch(tokenModal, () => {
  testResult.value    = null
  testError.value     = ''
  testErrorCode.value = ''
})

const allPermissions = computed(() => [
  { value: 'soul',          label: 'Soul' },
  { value: 'audio',         label: 'Audio' },
  { value: 'images',        label: t('services.perm_images') },
  { value: 'video',         label: 'Video' },
  { value: 'context_files', label: t('services.perm_context') },
])

const expiryOptions = computed(() => [
  { value: null,  label: '∞' },
  { value: 30,    label: t('services.expiry_30d') },
  { value: 182,   label: t('services.expiry_6mo') },
  { value: 365,   label: t('services.expiry_1yr') },
])

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
  if (!await ask({ title: t('services.revoke_title'), message: t('services.revoke_msg', { name }), confirmText: t('services.revoke_confirm') })) return
  if (tokenModal.value?.token === token) tokenModal.value = null
  await revokeService(token)
}

async function testConnection(token) {
  testLoading.value   = true
  testResult.value    = null
  testError.value     = ''
  testErrorCode.value = ''
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
        if (body.error === 'vault_locked') {
          testErrorCode.value = 'vault_locked'
          testError.value     = t('services.err_vault_locked')
        } else if (body.error === 'decryption_failed') {
          testErrorCode.value = 'key_wrong'
          testError.value     = t('services.err_key_wrong')
        } else {
          testError.value = t('services.err_access_denied')
        }
      } else if (res.status === 404) {
        if (body.error === 'No soul content synced yet') {
          testErrorCode.value = 'no_sync'
          testError.value     = t('services.err_no_sync')
        } else {
          testError.value = t('services.err_api_not_configured')
        }
      } else if (res.status === 401) {
        testError.value = t('services.err_token_invalid')
      } else {
        testError.value = t('services.err_status', { status: res.status })
      }
    }
  } catch {
    testResult.value = 'error'
    testError.value  = t('services.err_no_connection')
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
