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

          <!-- Step 5: Einstellungen -->
          <div v-show="currentStep === 5" class="p-5 space-y-3">
            <div class="flex items-center gap-3 px-4 py-3 rounded-none bg-[rgba(255,255,255,0.04)] border border-white/10">
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-white/75">Node-Einstellungen</p>
                <p class="text-xs text-white/40 mt-0.5">API-Keys, Admin-Token, ElevenLabs, WhatsApp</p>
              </div>
              <button
                @click="settingsLocalOpen = true"
                class="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-none bg-white/8 text-white/70 hover:text-white hover:bg-white/12 transition min-h-[32px]"
              >Öffnen</button>
            </div>
            <SettingsModal :open="settingsLocalOpen" @close="settingsLocalOpen = false" @master-rotated="settingsLocalOpen = false" />
          </div>

          <!-- Step 6: Sicherheit -->
          <div v-show="currentStep === 6" class="p-5 space-y-4">
            <!-- Cert Rotation -->
            <div>
              <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest px-1 pb-2">Soul-Cert rotieren</p>
              <button
                @click="handleRotateCert"
                :disabled="certRotateBusy"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-none transition-all duration-150 text-left disabled:opacity-50"
                style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);"
              >
                <div class="w-8 h-8 rounded-none flex items-center justify-center flex-none" style="background: rgba(249,115,22,0.10); border: 1px solid rgba(249,115,22,0.25)">
                  <svg v-if="certRotateBusy" class="w-4 h-4 animate-spin text-[#f97316]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                  <svg v-else class="w-4 h-4 text-[#f97316]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"/>
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-white/80">{{ certRotateBusy ? 'Rotiert…' : 'Soul-Cert rotieren' }}</p>
                  <p class="text-xs text-white/35 mt-0.5">Altes Cert sofort ungültig — sys.md wird automatisch heruntergeladen</p>
                </div>
              </button>
              <Transition name="cert-result">
                <div v-if="certRotationResult" class="mt-2 rounded border border-[#f97316]/30 bg-[#f97316]/[0.06] p-3 space-y-3" role="status">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-xs font-medium text-[#f97316]">
                      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                      Cert rotiert — Version {{ certRotationResult.cert_version }}
                    </div>
                    <button @click="certRotationResult = null" class="text-white/30 hover:text-white/60 transition" aria-label="Schließen">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18 18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <div class="space-y-1">
                    <p class="text-[10px] text-white/40 uppercase tracking-wider">Neuer Soul-Cert</p>
                    <div class="flex items-center gap-2 bg-black/30 rounded px-2.5 py-2">
                      <code class="flex-1 text-xs font-mono text-[#f97316] break-all select-all">{{ certRotationResult.cert }}</code>
                      <button @click="copyCertResult" class="shrink-0 w-7 h-7 flex items-center justify-center rounded transition"
                        :class="certCopied ? 'text-emerald-400' : 'text-white/40 hover:text-white/70'" aria-label="Cert kopieren">
                        <svg v-if="certCopied" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                        <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                      </button>
                    </div>
                  </div>
                  <ul class="space-y-1.5 text-xs">
                    <li class="flex items-center gap-2" :class="certRotationResult.validated ? 'text-emerald-400' : 'text-red-400'">
                      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path v-if="certRotationResult.validated" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        <path v-else stroke-linecap="round" d="M6 18 18 6M6 6l12 12"/>
                      </svg>
                      {{ certRotationResult.validated ? 'Cert auf Server validiert ✓' : 'Server-Validierung fehlgeschlagen — Seite neu laden' }}
                    </li>
                    <li class="flex items-center gap-2 text-emerald-400">
                      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                      sys.md automatisch heruntergeladen
                    </li>
                  </ul>
                  <div class="text-[11px] text-white/50 leading-relaxed border-t border-white/[0.07] pt-2.5">
                    <strong class="text-white/70">Jetzt tun:</strong> Bewahre die heruntergeladene <code class="text-white/60">sys.md</code> sicher auf — sie enthält deinen neuen Zugangsschlüssel.
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Cloud-Vault löschen -->
            <div>
              <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest px-1 pb-2">Node zurücksetzen</p>
              <button
                @click="handleDeleteVault"
                :disabled="deleteLoading"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-none transition-all duration-150 text-left disabled:opacity-50"
                style="background: rgba(239,68,68,0.03); border: 1px solid rgba(239,68,68,0.12);"
              >
                <div class="w-8 h-8 rounded-none flex items-center justify-center flex-none" style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2)">
                  <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-red-400">{{ deleteLoading ? 'Wird gelöscht…' : 'Cloud-Vault löschen' }}</p>
                  <p class="text-xs text-white/35 mt-0.5">Entfernt alle Vault-Dateien vom Server — unwiderruflich</p>
                </div>
              </button>
            </div>
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
import SettingsModal      from './SettingsModal.vue'

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
const { connections } = useVaultConnections()
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

const IconNetwork = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z' })
]) })

const IconSettings = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z' }),
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' }),
]) })

const IconSecurity = defineComponent({ render: () => h('svg', { fill:'none', viewBox:'0 0 24 24', stroke:'currentColor', 'stroke-width':'1.5' }, [
  h('path', { 'stroke-linecap':'round', 'stroke-linejoin':'round', d:'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z' }),
]) })

const steps = computed(() => [
  { label: 'Vault',    done: vaultConnected.value,         color: 'rgba(255,255,255,0.75)', icon: IconConnect  },
  { label: 'Dienste',  done: isUnlocked.value,             color: 'rgba(255,255,255,0.75)', icon: IconVault    },
  { label: 'API',      done: enabled.value,                color: 'rgba(255,255,255,0.75)', icon: IconApi      },
  { label: 'Plugins',  done: services.value.length > 0,    color: 'rgba(255,255,255,0.75)', icon: IconServices },
  { label: 'Netzwerk', done: connections.value.length > 0, color: 'rgba(255,255,255,0.75)', icon: IconNetwork  },
  { label: 'Config',   done: false,                        color: 'rgba(255,255,255,0.75)', icon: IconSettings },
  { label: 'Sicherheit', done: false,                      color: 'rgba(255,255,255,0.75)', icon: IconSecurity },
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
  if (!await ask({ title: 'Cloud-Vault löschen', message: 'Alle Vault-Dateien auf dem VPS werden unwiderruflich gelöscht. Die lokale Verbindung bleibt bestehen.', confirmText: 'Löschen', danger: true })) return
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

const { rotateCert, soulContent: composableSoulContent, clear: clearSoul } = useSoul()

const settingsLocalOpen  = ref(false)
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
    if (vaultConnected.value && composableSoulContent.value) {
      await writeFile(localSoulFileName.value, new TextEncoder().encode(composableSoulContent.value))
    }
    downloadSoulLocal()
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
