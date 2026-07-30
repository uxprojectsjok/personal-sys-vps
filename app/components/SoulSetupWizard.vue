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
          <svg class="w-3.5 h-3.5 transition-colors" style="color:#fff"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
          </svg>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-base font-semibold text-[var(--sys-fg)] leading-none">{{ $t('setup.title') }}</span>
          <span class="text-sm text-[var(--sys-fg-dim)] tracking-wider uppercase leading-none">
            {{ $t('setup.done_count', { done: doneCount, total: steps.length }) }}
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
        <div class="wiz-tabs-row">
          <nav class="wiz-tabs" @wheel="onTabWheel">
            <button
              v-for="(step, i) in steps"
              :key="i"
              class="wiz-tab"
              :class="{ on: currentStep === i }"
              @click="currentStep = i"
            >
              <component :is="step.icon" class="w-3.5 h-3.5" style="flex:none" />
              {{ step.label }}
              <span v-if="step.done" class="wiz-tab-dot" aria-hidden="true" />
            </button>
          </nav>
        </div>

        <!-- ── Step Content ─────────────────────────────────────────────── -->
        <div class="relative min-h-[100px]">

          <!-- Step 0: Verbinden -->
          <div v-show="currentStep === 0" class="p-5 space-y-3">

            <!-- Status -->
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm)">
              <span style="width:8px;height:8px;border-radius:50%;flex:none" :style="vaultConnected ? 'background:var(--accent)' : 'background:var(--fg-4)'"></span>
              <div class="flex-1 min-w-0">
                <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0">
                  {{ vaultConnected ? (vaultMemoryMode ? $t('setup.vault_cloud_active') : $t('setup.vault_local_connected')) : $t('setup.vault_none') }}
                </p>
                <p style="font-size:14px;color:var(--fg-3);margin:0" class="truncate">
                  {{ vaultConnected ? (vaultMemoryMode ? (vaultCloudSrc || 'in-memory') : $t('setup.vault_local_folder')) : $t('setup.vault_connect_hint') }}
                </p>
              </div>
              <button
                v-if="vaultConnected"
                @click="clearVault()"
                style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--sys-fg-dim);line-height:1;flex:none;padding:0;opacity:0.6"
                :title="$t('setup.vault_disconnect')"
              >✕</button>
            </div>

            <!-- Lokal verbinden -->
            <button
              v-if="!vaultConnected"
              @click="connectLocalVault"
              :disabled="connectingLocal"
              class="btn btn-primary w-full"
              style="height:48px; justify-content:flex-start; gap:12px; border-radius:var(--r);"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="flex:none;opacity:0.7">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/>
              </svg>
              <span style="flex:1; text-align:left">{{ connectingLocal ? $t('setup.vault_selecting') : $t('setup.vault_local_btn') }}</span>
              <span style="font-size:13px;color:var(--fg-3)">FileSystem API</span>
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

          <!-- Step 4: Einstellungen -->
          <div v-show="currentStep === 4" style="display:flex;flex-direction:column;gap:14px;padding:20px">
            <p style="font-size:15px;line-height:1.65;color:var(--fg-2);margin:0">{{ $t('setup.config_moved_desc') }}</p>
            <NuxtLink to="/settings" class="sys-btn-ed sys-btn-ed--primary" style="width:100%;justify-content:center;text-decoration:none">
              {{ $t('setup.config_moved_link') }}
            </NuxtLink>
          </div>

        </div>

        <!-- ── Navigation ───────────────────────────────────────────────── -->
        <div class="flex items-center justify-between px-5 py-4 border-t border-[var(--sys-border)]">
          <button
            v-if="currentStep > 0"
            class="btn btn-sm btn-quiet"
            @click="currentStep--"
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5"/>
            </svg>
            {{ $t('setup.back') }}
          </button>
          <div v-else />

          <!-- Step counter -->
          <span style="font-size:14px;font-family:var(--mono);color:var(--fg-3)">
            {{ currentStep + 1 }} / {{ steps.length }}
          </span>

          <button
            v-if="currentStep < steps.length - 1"
            class="btn btn-sm"
            :class="steps[currentStep].done ? 'btn-primary' : 'btn-ghost'"
            @click="currentStep++"
          >
            {{ $t('setup.next') }}
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
            </svg>
          </button>

          <button
            v-else
            class="btn btn-sm btn-primary"
            @click="modal ? $emit('close') : (open = false)"
          >
            {{ $t('setup.done') }}
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
          </button>
        </div>

      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from '../composables/useConfirm.js'
const { ask } = useConfirm();
const { t } = useI18n()
import { useColorScheme }       from '../composables/useColorScheme.js'
import { useVaultSession }     from '../composables/useVaultSession.js'
import { useApiContext }        from '../composables/useApiContext.js'
import { useVaultServices }     from '../composables/useVaultServices.js'
import { useVault }             from '../composables/useVault.js'
import VaultSessionPanel  from './VaultSessionPanel.vue'
import ApiContextPanel    from './ApiContextPanel.vue'
import VaultServicesPanel from './VaultServicesPanel.vue'

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

// Vertical mouse wheel -> horizontal scroll for the overflowing tab bar
// (no visible scrollbar, so without this desktop mouse users can't reach
// tabs past the fold — no drag/touch, no horizontal wheel on most mice).
function onTabWheel(e) {
  const el = e.currentTarget
  if (el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

const { isUnlocked, vaultKey } = useVaultSession()
const { enabled, encryptData, saveContext } = useApiContext()
const { services }    = useVaultServices()
const { isConnected: vaultConnected, connectVault, clearVault, memoryMode: vaultMemoryMode, cloudSource: vaultCloudSrc, writeFile, allFiles } = useVault()

const connectingLocal = ref(false)

async function connectLocalVault() {
  if (!props.soulId) return
  const ok = await ask({
    title:       t('setup.connect_vault_title'),
    message:     t('setup.connect_vault_msg'),
    confirmText: t('setup.connect_vault_confirm'),
    cancelText:  t('common.cancel'),
    danger:      false,
  })
  if (!ok) return
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


const IconSettings = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z' }),
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' }),
]) })


// Labels waren gegenüber dem tatsächlichen Tab-Inhalt verschoben: Index 0 zeigt
// nur die Ordner/Cloud-Speicherort-Verbindung (kein Verschlüsselungs-Schlüssel),
// hieß aber "Vault" — der eigentliche Schlüssel-Schritt (VaultSessionPanel,
// Passkey/12-Wort-Bundle) lag unter "Dienste", und die echten Service-Tokens
// (VaultServicesPanel) unter "Plugins". Labels jetzt an den tatsächlichen
// Inhalt jedes Tabs angepasst, done-Flags unverändert (waren schon korrekt
// verdrahtet).
const steps = computed(() => [
  { label: t('setup.step_connect'),  done: vaultConnected.value,         color: 'rgba(255,255,255,0.75)', icon: IconConnect  },
  { label: t('setup.step_vault'),    done: isUnlocked.value,             color: 'rgba(255,255,255,0.75)', icon: IconVault    },
  { label: t('setup.step_api'),      done: enabled.value,                color: 'rgba(255,255,255,0.75)', icon: IconApi      },
  { label: t('setup.step_services'), done: services.value.length > 0,    color: 'rgba(255,255,255,0.75)', icon: IconServices },
  { label: t('setup.step_config'),   done: false,                        color: 'rgba(255,255,255,0.75)', icon: IconSettings },
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

const { rotateCert, soulContent: composableSoulContent, clear: clearSoul, pushToServer, exportAsBlob, soulToken } = useSoul()

const certRotateBusy     = ref(false)
const certRotationResult = ref(null)
const certCopied         = ref(false)

const localSoulFileName = computed(() => {
  const soulFile = allFiles.value.find(f => f.kind === 'soul')
  return soulFile ? soulFile.name : 'sys.md'
})

function downloadSoulLocal() {
  const content = composableSoulContent.value
  if (!content) return
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: localSoulFileName.value })
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

async function copyCertResult() {
  if (!certRotationResult.value?.cert) return
  try {
    await navigator.clipboard.writeText(certRotationResult.value.cert)
    certCopied.value = true
    setTimeout(() => { certCopied.value = false }, 2000)
  } catch {}
}

async function handleRotateCert() {
  if (certRotateBusy.value) return
  certRotateBusy.value = true
  certRotationResult.value = null
  try {
    const result = await rotateCert()
    if (!result) { alert('Cert-Rotation fehlgeschlagen'); return }
    // Vault-Datei + Server + lokaler Download — alle drei aktualisieren
    if (vaultConnected.value && composableSoulContent.value) {
      await writeFile(localSoulFileName.value, new TextEncoder().encode(composableSoulContent.value))
    }
    await pushToServer()
    await exportAsBlob()
    let validated = false
    try {
      const soulId = props.soulCert?.split('.')?.[0] ?? ''
      const vRes = await fetch('/api/validate', { headers: { Authorization: `Bearer ${soulId}.${result.cert}` } })
      validated = vRes.ok
    } catch {}
    certRotationResult.value = { ...result, validated }
  } finally { certRotateBusy.value = false }
}
</script>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(-6px); }
.cert-result-enter-active, .cert-result-leave-active { transition: opacity 0.25s, transform 0.25s; }
.cert-result-enter-from, .cert-result-leave-to { opacity: 0; transform: translateY(-4px); }
.wiz-tabs-row { padding: 16px 20px 0; }
.wiz-tabs { display: flex; border: 1px solid var(--line); border-radius: var(--r-xs); overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: thin; width: fit-content; max-width: 100%; }
.wiz-tab { display: flex; align-items: center; gap: 6px; padding: 7px 16px; font-family: var(--sans); font-size: 16px; color: var(--fg-2); background: transparent; border: none; border-right: 1px solid var(--line); cursor: pointer; transition: all 0.15s; white-space: nowrap; flex: none; box-shadow: inset 0 -2px 0 0 transparent; }
.wiz-tab:last-child { border-right: none; }
.wiz-tab.on { background: var(--surface); color: var(--fg); box-shadow: inset 0 -2px 0 0 var(--accent); }
.wiz-tab:hover:not(.on) { color: var(--fg); background: rgba(255,255,255,0.03); }
.wiz-tab-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex: none; }
</style>
