<template>
  <div
    :class="modal
      ? 'relative'
      : ['relative overflow-hidden rounded-2xl border transition-all duration-300',
          open ? 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)]'
               : 'border-[var(--sys-border)] bg-[var(--sys-bg-surface)]']"
  >

    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <button
      v-if="!modal"
      class="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
      @click="toggleOpen"
      :aria-expanded="open"
    >
      <div class="flex items-center gap-3">
        <!-- Animated gear icon -->
        <div class="w-7 h-7 rounded-none flex items-center justify-center transition-colors"
          style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12)">
          <svg class="w-3.5 h-3.5 transition-colors" style="color: rgba(255,255,255,0.55)"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
          </svg>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold text-[var(--sys-fg)] leading-none">Soul einrichten</span>
          <span class="text-xs text-[var(--sys-fg-dim)] tracking-wider uppercase leading-none">
            {{ doneCount }}/{{ steps.length }} abgeschlossen
          </span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <svg
          class="w-4 h-4 text-[var(--sys-fg-dim)] transition-transform duration-300"
          :class="open ? 'rotate-180' : ''"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    <!-- ── Body ────────────────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div v-if="open || modal" class="border-t border-[var(--sys-border)]">

        <!-- Step Navigator -->
        <div class="flex relative">
          <!-- Progress track -->
          <div class="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--sys-border)]" />
          <div
            class="absolute bottom-0 left-0 h-[2px] transition-all duration-500 rounded-r"
            :style="`width: ${(currentStep / (steps.length - 1)) * 100}%; background: rgba(139,92,246,0.7)`"
          />

          <button
            v-for="(step, i) in steps"
            :key="i"
            class="flex-1 flex flex-col items-center gap-2 px-2 pt-4 pb-3 transition-all duration-200 relative group"
            @click="currentStep = i"
          >
            <!-- Step icon circle -->
            <div
              class="w-8 h-8 rounded-none flex items-center justify-center transition-all duration-200 relative"
              :class="currentStep === i
                ? 'scale-110 shadow-lg'
                : 'scale-100'"
              :style="currentStep === i
                ? (isDark ? 'background: rgba(255,255,255,0.10); border: 1.5px solid rgba(255,255,255,0.35); box-shadow: 0 0 10px rgba(139,92,246,0.22)' : 'background: rgba(6,14,28,0.08); border: 1.5px solid rgba(6,14,28,0.28); box-shadow: 0 0 10px rgba(139,92,246,0.22)')
                : step.done
                  ? (isDark ? 'background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.20)' : 'background: rgba(6,14,28,0.05); border: 1.5px solid rgba(6,14,28,0.18)')
                  : (isDark ? 'background: rgba(255,255,255,0.03); border: 1.5px solid rgba(255,255,255,0.09)' : 'background: rgba(6,14,28,0.03); border: 1.5px solid rgba(6,14,28,0.09)')"
            >
              <!-- Done checkmark -->
              <svg v-if="step.done && currentStep !== i" class="w-3.5 h-3.5"
                :style="isDark ? 'color: rgba(255,255,255,0.75)' : 'color: rgba(6,14,28,0.75)'"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
              </svg>
              <!-- Step icon -->
              <component v-else :is="step.icon" class="w-3.5 h-3.5"
                :style="currentStep === i
                  ? (isDark ? 'color: rgba(255,255,255,0.90)' : 'color: rgba(6,14,28,0.90)')
                  : step.done
                    ? (isDark ? 'color: rgba(255,255,255,0.60)' : 'color: rgba(6,14,28,0.60)')
                    : (isDark ? 'color: rgba(255,255,255,0.30)' : 'color: rgba(6,14,28,0.35)')"
              />
            </div>
            <!-- Label -->
            <span
              class="text-xs font-semibold tracking-wider uppercase transition-colors leading-none"
              :style="currentStep === i
                ? (isDark ? 'color: rgba(255,255,255,0.95)' : 'color: rgba(6,14,28,0.92)')
                : step.done
                  ? (isDark ? 'color: rgba(255,255,255,0.60)' : 'color: rgba(6,14,28,0.58)')
                  : (isDark ? 'color: rgba(255,255,255,0.28)' : 'color: rgba(6,14,28,0.32)')"
            >{{ step.label }}</span>
          </button>
        </div>

        <!-- ── Step Content ─────────────────────────────────────────────── -->
        <div class="relative min-h-[100px]">

          <!-- Step 0: Verbinden -->
          <div v-show="currentStep === 0" class="p-5 space-y-3">

            <!-- Status -->
            <div class="flex items-center gap-3 px-4 py-3 rounded-none bg-[rgba(255,255,255,0.04)] border border-white/10">
              <span class="w-2 h-2 rounded-full flex-none" :style="vaultConnected ? 'background:#a78bfa' : 'background: rgba(239,68,68,0.5)'"></span>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-white/75">
                  {{ vaultConnected ? (vaultMemoryMode ? 'Cloud-Modus aktiv' : 'Lokal verbunden') : 'Kein Vault verbunden' }}
                </p>
                <p class="text-xs text-white/40 truncate">
                  {{ vaultConnected ? (vaultMemoryMode ? (vaultCloudSrc || 'in-memory') : 'Lokaler Ordner') : 'Vault über Lokal oder Cloud verbinden' }}
                </p>
              </div>
              <button
                v-if="vaultConnected"
                @click="clearVault()"
                class="text-xs text-red-400/60 hover:text-red-400 transition-colors leading-none flex-none"
                title="Vault trennen"
              >✕</button>
            </div>

            <!-- Lokal verbinden -->
            <button
              v-if="!vaultConnected"
              @click="connectLocalVault"
              :disabled="connectingLocal"
              class="w-full h-12 flex items-center gap-3 px-4 rounded-none border border-white/15 bg-[rgba(255,255,255,0.04)] text-sm text-white/80 hover:bg-[rgba(255,255,255,0.09)] hover:border-white/25 disabled:opacity-40 active:scale-[0.99] transition-all"
            >
              <svg class="w-4 h-4 flex-none text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/>
              </svg>
              <span class="flex-1 text-left">{{ connectingLocal ? 'Wählen…' : 'Lokal' }}</span>
              <span class="text-xs text-white/35">FileSystem API</span>
            </button>

          </div>

          <!-- Step 1: Vault (Session) -->
          <div v-show="currentStep === 1">
            <VaultSessionPanel headless @unlocked="$emit('unlocked')" />
          </div>

          <!-- Step 2: API -->
          <div v-show="currentStep === 2">
            <ApiContextPanel headless :soul-cert="soulCert" :soul-content="soulContent" :soul-id="soulId" />
          </div>

          <!-- Step 3: Dienste -->
          <div v-show="currentStep === 3">
            <VaultServicesPanel headless />
          </div>

          <!-- Step 4: Netzwerk -->
          <div v-show="currentStep === 4">
            <SoulNetworkPanel headless />
          </div>
        </div>

        <!-- ── Navigation ───────────────────────────────────────────────── -->
        <div class="flex items-center justify-between px-5 py-4 border-t border-[var(--sys-border)]">
          <button
            v-if="currentStep > 0"
            class="flex items-center gap-1.5 text-xs font-medium text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] transition-colors py-2 px-3 rounded-none hover:bg-[rgba(255,255,255,0.05)] min-h-[36px]"
            @click="currentStep--"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/>
            </svg>
            Zurück
          </button>
          <div v-else />

          <!-- Step counter -->
          <span class="text-xs font-mono text-[var(--sys-fg-dim)] tabular-nums">
            {{ currentStep + 1 }} / {{ steps.length }}
          </span>

          <button
            v-if="currentStep < steps.length - 1"
            class="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-none min-h-[36px] transition-all duration-150 active:scale-[0.97]"
            :class="steps[currentStep].done
              ? 'bg-[var(--sys-violet)] text-white hover:opacity-90'
              : 'bg-[rgba(128,90,213,0.12)] text-[var(--sys-fg-muted)] border border-[rgba(139,92,246,0.22)] hover:bg-[rgba(128,90,213,0.20)]'"
            @click="currentStep++"
          >
            Weiter
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
            </svg>
          </button>

          <button
            v-else
            class="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-none min-h-[36px] transition-all duration-150 active:scale-[0.97] bg-[var(--sys-violet)] text-white hover:opacity-90"
            @click="modal ? $emit('close') : (open = false)"
          >
            Fertig
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
          </button>
        </div>

      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, defineComponent, h } from 'vue'
import { useConfirm } from '../composables/useConfirm.js'
const { ask } = useConfirm();
import { useColorScheme }       from '../composables/useColorScheme.js'
import { useVaultSession }     from '../composables/useVaultSession.js'
import { useApiContext }        from '../composables/useApiContext.js'
import { useVaultServices }     from '../composables/useVaultServices.js'
import { useVaultConnections }  from '../composables/useVaultConnections.js'
import { useVault }             from '../composables/useVault.js'
import VaultSessionPanel  from './VaultSessionPanel.vue'
import ApiContextPanel    from './ApiContextPanel.vue'
import VaultServicesPanel from './VaultServicesPanel.vue'
import SoulNetworkPanel   from './SoulNetworkPanel.vue'

const props = defineProps({
  soulCert:    { type: String, default: '' },
  soulContent: { type: String, default: '' },
  soulId:      { type: String, default: '' },
  modal:       { type: Boolean, default: false },
})
const emit = defineEmits(['unlocked', 'encrypt', 'decrypt', 'close'])

const open        = ref(false)
const currentStep = ref(0)
const { isDark } = useColorScheme()
const deleteLoading = ref(false)

const { isUnlocked, vaultKey } = useVaultSession()
const { enabled, encryptData, saveContext } = useApiContext()
const { services }    = useVaultServices()
const { connections } = useVaultConnections()
const { isConnected: vaultConnected, connectVault, clearVault, memoryMode: vaultMemoryMode, cloudSource: vaultCloudSrc } = useVault()

const connectingLocal = ref(false)

async function connectLocalVault() {
  if (!props.soulId) return
  connectingLocal.value = true
  await connectVault(props.soulId)
  connectingLocal.value = false
}

// Inline-SVG Icon Komponenten
const IconConnect = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776' })
]) })

const IconVault = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z' })
]) })

const IconApi = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z' })
]) })

const IconServices = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244' })
]) })

const IconNetwork = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' })
]) })

const steps = computed(() => [
  { label: 'Vault',    done: vaultConnected.value, color: 'rgba(255,255,255,0.75)', icon: IconConnect  },
  { label: 'Dienste',  done: isUnlocked.value,             color: 'rgba(255,255,255,0.75)', icon: IconVault    },
  { label: 'API',      done: enabled.value,                color: 'rgba(255,255,255,0.75)', icon: IconApi      },
  { label: 'Plugins',  done: services.value.length > 0,    color: 'rgba(255,255,255,0.75)', icon: IconServices },
  { label: 'Netzwerk', done: connections.value.length > 0, color: 'rgba(255,255,255,0.75)', icon: IconNetwork  },
])

const stepColor  = computed(() => 'rgba(255,255,255,0.75)')
const doneCount  = computed(() => steps.value.filter(s => s.done).length)

function toggleOpen() { open.value = !open.value }

// ── API-Export ──────────────────────────────────────────────────────────────
const apiExportLoading  = ref(false)

async function onDownloadApiExport() {
  if (!props.soulContent || !props.soulCert) return
  if (!vaultKey.value || vaultKey.value === '__encrypted__') return
  apiExportLoading.value = true
  try {
    const buf  = await encryptData(vaultKey.value, new TextEncoder().encode(props.soulContent))
    const url  = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }))
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'soul_api.enc' })
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) { console.error('[API-Export]', e) }
  finally { apiExportLoading.value = false }
}

async function handleDeleteVault() {
  if (!await ask({ title: 'Vault-Dateien löschen', message: 'Alle Vault-Dateien auf dem VPS löschen? Die lokale Verbindung bleibt bestehen.', confirmText: 'Löschen' })) return
  deleteLoading.value = true
  try {
    const res = await fetch('/api/vault', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${props.soulCert}` }
    })
    if (!res.ok) throw new Error(await res.text())
  } catch (e) {
    alert('Fehler beim Löschen: ' + e.message)
  } finally {
    deleteLoading.value = false
  }
}
</script>
