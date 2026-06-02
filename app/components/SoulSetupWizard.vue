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
            :style="`width: ${(currentStep / (steps.length - 1)) * 100}%; background: var(--sys-violet)`"
          />

          <button
            v-for="(step, i) in steps"
            :key="i"
            class="flex-1 flex flex-col items-center gap-3 px-2 pt-5 pb-4 transition-all duration-200 relative group"
            @click="currentStep = i"
          >
            <!-- Step icon circle -->
            <div
              class="w-8 h-8 flex items-center justify-center transition-all duration-200 relative"
              :class="currentStep === i ? 'scale-110' : 'scale-100'"
              :style="currentStep === i
                ? 'background:var(--surface-3);border:1.5px solid var(--line-2);border-radius:var(--r-xs)'
                : step.done
                  ? 'background:var(--surface-2);border:1.5px solid var(--line);border-radius:var(--r-xs)'
                  : 'background:var(--surface);border:1.5px solid var(--line);border-radius:var(--r-xs)'"
            >
              <!-- Done checkmark -->
              <svg v-if="step.done && currentStep !== i" class="w-3.5 h-3.5" style="color:var(--fg-2)"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
              </svg>
              <!-- Step icon -->
              <component v-else :is="step.icon" class="w-3.5 h-3.5"
                :style="currentStep === i ? 'color:var(--fg)' : step.done ? 'color:var(--fg-2)' : 'color:var(--fg-4)'"
              />
            </div>
            <!-- Label -->
            <span
              class="text-xs font-semibold tracking-wider uppercase transition-colors leading-none"
              :style="currentStep === i ? 'color:var(--fg)' : step.done ? 'color:var(--fg-2)' : 'color:var(--fg-4)'"
            >{{ step.label }}</span>
          </button>
        </div>

        <!-- ── Step Content ─────────────────────────────────────────────── -->
        <div class="relative min-h-[100px]">

          <!-- Step 0: Verbinden -->
          <div v-show="currentStep === 0" class="p-5 space-y-3">

            <!-- Status -->
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm)">
              <span style="width:8px;height:8px;border-radius:50%;flex:none" :style="vaultConnected ? 'background:var(--accent)' : 'background:var(--fg-4)'"></span>
              <div class="flex-1 min-w-0">
                <p style="font-size:13px;font-weight:500;color:var(--fg);margin:0">
                  {{ vaultConnected ? (vaultMemoryMode ? 'Cloud-Modus aktiv' : 'Lokal verbunden') : 'Kein Vault verbunden' }}
                </p>
                <p style="font-size:13px;color:var(--fg-3);margin:0" class="truncate">
                  {{ vaultConnected ? (vaultMemoryMode ? (vaultCloudSrc || 'in-memory') : 'Lokaler Ordner') : 'Vault über Lokal oder Cloud verbinden' }}
                </p>
              </div>
              <button
                v-if="vaultConnected"
                @click="clearVault()"
                style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--sys-fg-dim);line-height:1;flex:none;padding:0;opacity:0.6"
                title="Vault trennen"
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
              <span style="flex:1; text-align:left">{{ connectingLocal ? 'Wählen…' : 'Lokal' }}</span>
              <span style="font-size:11px;color:var(--fg-3)">FileSystem API</span>
            </button>

            <!-- Cloud-Vault löschen -->
            <button
              @click="handleDeleteVault"
              :disabled="deleteLoading"
              class="w-full flex items-center gap-3 px-4 py-3 transition-all duration-150 text-left disabled:opacity-50"
              style="background: rgba(224,108,117,0.07); border: 1px solid rgba(224,108,117,0.25); border-radius: var(--r);"
            >
              <div class="w-7 h-7 flex items-center justify-center flex-none" style="background: rgba(224,108,117,0.12); border: 1px solid rgba(224,108,117,0.25); border-radius: var(--r-xs);">
                <svg width="14" height="14" style="color:#e06c75" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                </svg>
              </div>
              <div class="min-w-0">
                <p class="text-xs font-medium" style="color:#e06c75">{{ deleteLoading ? 'Wird gelöscht…' : 'Cloud-Vault löschen' }}</p>
                <p class="text-xs mt-0.5" style="color:rgba(224,108,117,0.65)">Die Soul auf dem Server wird gelöscht und kann nicht wiederhergestellt werden.</p>
              </div>
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
          <div v-show="currentStep === 4" style="display:flex;flex-direction:column;gap:20px;padding:20px">

            <!-- Modell -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">Modell</label>
              <select v-model="cfgModel" class="sys-input" style="cursor:pointer;font-size:12px">
                <option value="">Server-Standard</option>
                <option value="claude-opus-4-6">Claude Opus 4.6 — leistungsstark</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — ausgewogen</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — schnell</option>
              </select>
            </div>

            <!-- Anthropic -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">
                Anthropic API-Key
                <span v-if="cfgAnthSet" style="font-size:11px;color:var(--c-ok);margin-left:8px">gespeichert</span>
              </label>
              <input v-model="cfgAnthKey" type="password" class="sys-input sys-input--mono"
                placeholder="sk-ant-…" autocomplete="off" spellcheck="false"
                :style="cfgAnthSet ? 'border-color:var(--sys-ok)' : ''" />
            </div>

            <!-- WaveSpeed -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">
                WaveSpeed API-Key
                <span v-if="cfgWaveSet" style="font-size:11px;color:var(--c-ok);margin-left:8px">gespeichert</span>
              </label>
              <input v-model="cfgWaveKey" type="password" class="sys-input sys-input--mono"
                :placeholder="cfgWaveSet ? 'Neu eingeben zum Überschreiben…' : 'WaveSpeed API-Key…'"
                autocomplete="off" spellcheck="false" @input="cfgWaveDirty = true"
                :style="cfgWaveSet ? 'border-color:var(--sys-ok)' : ''" />
            </div>

            <!-- ElevenLabs -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">
                ElevenLabs API-Key
                <span v-if="cfgLabsSet" style="font-size:11px;color:var(--c-ok);margin-left:8px">gespeichert</span>
              </label>
              <input v-model="cfgLabsKey" type="password" class="sys-input sys-input--mono"
                :placeholder="cfgLabsSet ? 'Neu eingeben zum Überschreiben…' : 'sk_…'"
                autocomplete="off" spellcheck="false" @input="cfgLabsDirty = true"
                :style="cfgLabsSet ? 'border-color:var(--sys-ok)' : ''" />
            </div>

            <!-- ElevenLabs Agent-URL -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">
                ElevenLabs Agent-URL
                <span v-if="cfgAgentSet" style="font-size:11px;color:var(--c-ok);margin-left:8px">gespeichert</span>
              </label>
              <input v-model="cfgAgentUrl" type="text" class="sys-input sys-input--mono"
                placeholder="https://elevenlabs.io/app/talk-to?agent_id=…"
                autocomplete="off" spellcheck="false"
                :style="cfgAgentSet ? 'border-color:var(--sys-ok)' : ''" />
            </div>

            <!-- Brave Search -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">
                Brave Search API-Key
                <span v-if="cfgBraveSet" style="font-size:11px;color:var(--c-ok);margin-left:8px">gespeichert</span>
              </label>
              <input v-model="cfgBraveKey" type="password" class="sys-input sys-input--mono"
                :placeholder="cfgBraveSet ? 'Neu eingeben zum Überschreiben…' : 'BSA…'"
                autocomplete="off" spellcheck="false" @input="cfgBraveDirty = true"
                :style="cfgBraveSet ? 'border-color:var(--sys-ok)' : ''" />
            </div>

            <!-- Pinata JWT -->
            <div style="display:flex;flex-direction:column;gap:12px">
              <label class="sys-field-label">
                Pinata JWT
                <span v-if="cfgPinataSet" style="font-size:11px;color:var(--c-ok);margin-left:8px">gespeichert</span>
              </label>
              <input v-model="cfgPinataJwt" type="password" class="sys-input sys-input--mono"
                :placeholder="cfgPinataSet ? 'Neu eingeben zum Überschreiben…' : 'eyJ…'"
                autocomplete="off" spellcheck="false"
                :style="cfgPinataSet ? 'border-color:var(--sys-ok)' : ''" />
              <p style="font-size:11px;color:var(--fg-3);letter-spacing:0.04em;margin:0">
                Für IPFS-Veröffentlichung und Blockchain-Anchoring.
                <a href="https://app.pinata.cloud/keys" target="_blank" rel="noopener" style="color:var(--accent-bright)">app.pinata.cloud</a>
              </p>
            </div>

            <!-- Speichern -->
            <button
              @click="saveCfgStep"
              :disabled="cfgSaving"
              class="sys-btn-ed sys-btn-ed--primary"
              style="width:100%;justify-content:center"
            >{{ cfgSaving ? 'Speichert…' : 'Speichern' }}</button>
            <p v-if="cfgFeedback" style="font-family:var(--sys-mono);font-size:10px;margin:0"
              :style="cfgFeedback.ok === true ? 'color:var(--sys-ok)' : cfgFeedback.ok === false ? 'color:var(--sys-err)' : 'color:var(--sys-fg-muted)'">
              {{ cfgFeedback.message }}
            </p>

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
            Zurück
          </button>
          <div v-else />

          <!-- Step counter -->
          <span style="font-size:12px;font-family:var(--mono);color:var(--fg-3)">
            {{ currentStep + 1 }} / {{ steps.length }}
          </span>

          <button
            v-if="currentStep < steps.length - 1"
            class="btn btn-sm"
            :class="steps[currentStep].done ? 'btn-primary' : 'btn-ghost'"
            @click="currentStep++"
          >
            Weiter
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>
            </svg>
          </button>

          <button
            v-else
            class="btn btn-sm btn-primary"
            @click="modal ? $emit('close') : (open = false)"
          >
            Fertig
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
import { ref, computed, watch, defineComponent, h } from 'vue'
import { useConfirm } from '../composables/useConfirm.js'
const { ask } = useConfirm();
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
const deleteLoading = ref(false)

const { isUnlocked, vaultKey } = useVaultSession()
const { enabled, encryptData, saveContext, resetContext } = useApiContext()
const { services }    = useVaultServices()
const { isConnected: vaultConnected, connectVault, clearVault, memoryMode: vaultMemoryMode, cloudSource: vaultCloudSrc, writeFile, allFiles } = useVault()

const connectingLocal = ref(false)

async function connectLocalVault() {
  if (!props.soulId) return
  const ok = await ask({
    title:       'Lokalen Vault verbinden',
    message:     'Der Browser erhält dauerhaften Lese- und Schreibzugriff auf den gewählten Ordner. Du kannst die Verbindung jederzeit trennen.',
    confirmText: 'Ordner wählen',
    cancelText:  'Abbrechen',
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


const steps = computed(() => [
  { label: 'Vault',    done: vaultConnected.value,         color: 'rgba(255,255,255,0.75)', icon: IconConnect  },
  { label: 'Dienste',  done: isUnlocked.value,             color: 'rgba(255,255,255,0.75)', icon: IconVault    },
  { label: 'API',      done: enabled.value,                color: 'rgba(255,255,255,0.75)', icon: IconApi      },
  { label: 'Plugins',  done: services.value.length > 0,    color: 'rgba(255,255,255,0.75)', icon: IconServices },
  { label: 'Config',   done: false,                        color: 'rgba(255,255,255,0.75)', icon: IconSettings },
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
  if (!await ask({ title: 'Cloud-Vault löschen', message: 'Die Soul auf dem Server wird gelöscht und kann nicht wiederhergestellt werden. Die lokale Vault-Verbindung wird ebenfalls getrennt.', confirmText: 'Löschen', danger: true })) return
  deleteLoading.value = true
  try {
    const res = await fetch('/api/vault', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${props.soulCert}` }
    })
    if (!res.ok) throw new Error(await res.text())
    resetContext()
    clearSoul()
    document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
    window.location.href = '/'
  } catch (e) {
    alert('Fehler beim Löschen: ' + e.message)
  } finally {
    deleteLoading.value = false
  }
}

const { rotateCert, soulContent: composableSoulContent, clear: clearSoul, pushToServer, exportAsBlob, soulToken } = useSoul()

// ── Step 5: Config ─────────────────────────────────────────────────────────────
const cfgModel     = ref('')
const cfgAnthKey   = ref('')
const cfgAnthSet   = ref(false)
const cfgWaveKey   = ref('')
const cfgWaveSet   = ref(false)
const cfgWaveDirty = ref(false)
const cfgLabsKey   = ref('')
const cfgLabsSet   = ref(false)
const cfgLabsDirty = ref(false)
const cfgBraveKey  = ref('')
const cfgBraveSet  = ref(false)
const cfgBraveDirty = ref(false)
const cfgPinataJwt  = ref('')
const cfgPinataSet  = ref(false)
const cfgAgentUrl   = ref('')
const cfgAgentSet   = ref(false)
const cfgSaving     = ref(false)
const cfgFeedback  = ref(null)

async function loadCfgStep() {
  if (!soulToken.value) return
  try {
    const res = await fetch('/api/get-config', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (!res.ok) return
    const data = await res.json()
    cfgModel.value   = data.model || ''
    cfgAnthSet.value = data.has_own_key || data.key_source === 'master'
    cfgWaveSet.value  = !!data.wavespeed_key_set
    cfgLabsSet.value  = !!data.elevenlabs_key_set
    cfgBraveSet.value = !!data.brave_key_set
    cfgAgentUrl.value = data.elevenlabs_agent_url || ''
    cfgAgentSet.value = !!data.elevenlabs_agent_url
  } catch {}
  try {
    const pr = await fetch('/api/soul/pinata-config', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (pr.ok) { const pd = await pr.json(); cfgPinataSet.value = pd.configured }
  } catch {}
}

async function saveCfgStep() {
  if (cfgSaving.value) return
  cfgSaving.value   = true
  cfgFeedback.value = null
  try {
    const sanitizeKey = k => (k || '').replace(/[^\x20-\xFF]/g, '').trim()
    const body = {}
    if (cfgModel.value)   body.model         = cfgModel.value
    if (cfgAnthKey.value) body.anthropic_key  = sanitizeKey(cfgAnthKey.value)
    if (cfgWaveKey.value)  body.wavespeed_key  = sanitizeKey(cfgWaveKey.value)
    if (cfgLabsKey.value)  body.elevenlabs_key = sanitizeKey(cfgLabsKey.value)
    if (cfgBraveKey.value) body.brave_key      = sanitizeKey(cfgBraveKey.value)
    if (cfgAgentUrl.value !== undefined) body.elevenlabs_agent_url = cfgAgentUrl.value.trim()
    const res = await fetch('/api/set-config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body:    JSON.stringify(body)
    })
    if (!res.ok) { cfgFeedback.value = { ok: false, message: 'Fehler beim Speichern' }; return }

    if (cfgAnthKey.value) { cfgAnthSet.value = true; cfgAnthKey.value = '' }
    if (cfgWaveKey.value) { cfgWaveSet.value = true; cfgWaveKey.value = ''; cfgWaveDirty.value = false }
    if (cfgLabsKey.value)  { cfgLabsSet.value = true;  cfgLabsKey.value = '';  cfgLabsDirty.value = false }
    if (cfgBraveKey.value) { cfgBraveSet.value = true; cfgBraveKey.value = ''; cfgBraveDirty.value = false }
    cfgAgentSet.value = !!cfgAgentUrl.value.trim()
    if (cfgPinataJwt.value) {
      try {
        const pr = await fetch('/api/soul/pinata-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
          body: JSON.stringify({ jwt: cfgPinataJwt.value.trim() })
        })
        if (pr.ok) { cfgPinataSet.value = true; cfgPinataJwt.value = '' }
      } catch {}
    }

    // Anthropic-Verbindung testen (immer wenn Key vorhanden)
    if (cfgAnthSet.value) {
      cfgFeedback.value = { ok: null, message: 'Verbindung wird geprüft…' }
      try {
        const tr = await fetch('/api/test-key', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
          body:    JSON.stringify({ use_stored: true, key_type: 'anthropic' })
        })
        const td = await tr.json()
        if (td.ok) {
          cfgFeedback.value = { ok: true, message: 'Gespeichert · Verbindung OK ✓' }
        } else if (td.status === 0 || td.error === 'no_stored_key') {
          cfgFeedback.value = { ok: null, message: 'Gespeichert · Server-Verbindungstest fehlgeschlagen — Key kann trotzdem gültig sein' }
        } else {
          cfgFeedback.value = { ok: false, message: `Gespeichert, aber Anthropic antwortet ${td.status} — Key prüfen` }
        }
      } catch {
        cfgFeedback.value = { ok: true, message: 'Gespeichert · Verbindungstest nicht möglich' }
      }
    } else {
      cfgFeedback.value = { ok: true, message: 'Konfiguration gespeichert ✓' }
    }
    setTimeout(() => { cfgFeedback.value = null }, 5000)
  } catch (e) {
    cfgFeedback.value = { ok: false, message: 'Netzwerkfehler: ' + e.message }
  } finally {
    cfgSaving.value = false
  }
}

watch(currentStep, (step) => {
  if (step === 4) loadCfgStep()
})

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
</style>
