<template>
  <div class="mcc" :class="hasVideo ? 'mcc--wide' : ''">

    <!-- Consent -->
    <template v-if="state === 'consent'">
      <div class="mcc-head">
        <span class="mcc-dot mcc-dot--idle"></span>
        <span class="mcc-label">{{ modeLabel }} aufnehmen</span>
      </div>
      <p class="mcc-desc">
        Kamera-Aufnahme wird lokal in deinem Vault gespeichert und verlässt dein Gerät nur wenn du es explizit freigibst.
      </p>
      <label class="mcc-check">
        <input type="checkbox" v-model="consentChecked" class="mcc-checkbox" />
        <span class="mcc-check-label">
          Ich stimme der Aufnahme meines Gesichts und meiner Bewegungsdaten zu (DSGVO Art. 7, Art. 9)
        </span>
      </label>
      <div class="mcc-actions">
        <button :disabled="!consentChecked" @click="giveConsent" class="mcc-btn mcc-btn--primary">
          Weiter →
        </button>
      </div>
    </template>

    <!-- Idle (Kamera-Vorschau lädt) -->
    <template v-else-if="state === 'idle'">
      <div class="mcc-head">
        <span class="mcc-dot mcc-dot--idle"></span>
        <span class="mcc-label">{{ modeLabel }}</span>
      </div>
      <div class="mcc-video-wrap">
        <video ref="liveEl" autoplay muted playsinline class="mcc-video"></video>
        <div v-if="!isPreviewing" class="mcc-video-placeholder">
          <span class="mcc-video-hint">Kamera startet…</span>
        </div>
      </div>
      <p v-if="motionError" class="mcc-error">{{ motionError }}</p>
      <div class="mcc-actions">
        <button @click="handleStart" class="mcc-btn mcc-btn--record" :disabled="!!motionError">
          <span class="mcc-rec-dot"></span>
          Aufnehmen
        </button>
      </div>
    </template>

    <!-- Recording -->
    <template v-else-if="state === 'recording'">
      <div class="mcc-head">
        <span class="mcc-dot mcc-dot--rec soul-pulse"></span>
        <span class="mcc-label mcc-label--rec">{{ modeLabel }}</span>
        <span class="mcc-dur">{{ formatDuration(duration) }}</span>
        <span class="mcc-steps">{{ promptIndex + 1 }}/{{ currentPrompts.length }}</span>
      </div>
      <div class="mcc-video-wrap">
        <video ref="liveEl" autoplay muted playsinline class="mcc-video"></video>
        <!-- REC badge -->
        <div class="mcc-rec-badge">
          <span class="mcc-rec-dot-sm soul-pulse"></span>
          <span>REC</span>
        </div>
        <!-- Step dots -->
        <div class="mcc-step-dots">
          <span
            v-for="(_, i) in currentPrompts" :key="i"
            class="mcc-step-dot"
            :class="i === promptIndex ? 'mcc-step-dot--active' : i < promptIndex ? 'mcc-step-dot--done' : ''"
          ></span>
        </div>
        <!-- Prompt overlay -->
        <div v-if="currentPrompt" class="mcc-prompt">
          <p class="mcc-prompt-text">{{ currentPrompt.text }}</p>
          <p v-if="currentPrompt.sub" class="mcc-prompt-sub">{{ currentPrompt.sub }}</p>
          <div class="mcc-prompt-bar">
            <div class="mcc-prompt-fill" :style="isLastPrompt ? { width: '100%' } : { width: promptCountdown + '%' }"></div>
          </div>
        </div>
      </div>
      <div class="mcc-actions">
        <button @click="handleStop" class="mcc-btn mcc-btn--stop">
          <span class="mcc-stop-sq"></span>
          Stopp
        </button>
        <button v-if="!isLastPrompt" @click="advancePrompt" class="mcc-btn mcc-btn--ghost">
          Weiter →
        </button>
      </div>
    </template>

    <!-- Preview -->
    <template v-else-if="state === 'preview'">
      <div class="mcc-head">
        <span class="mcc-dot mcc-dot--preview"></span>
        <span class="mcc-label">Vorschau</span>
        <span class="mcc-dur">{{ formatDuration(lastSample?.duration || 0) }}</span>
      </div>
      <div class="mcc-video-wrap">
        <video ref="previewEl" :src="lastSample?.url ?? ''" controls playsinline class="mcc-video"></video>
      </div>
      <div class="mcc-actions">
        <button @click="handleDiscard" class="mcc-btn mcc-btn--discard" title="Verwerfen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>
        <button
          @click="handleSave"
          :disabled="isSaving"
          class="mcc-btn"
          :class="saved ? 'mcc-btn--saved' : 'mcc-btn--save'"
        >
          <svg v-if="saved" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
          </svg>
          <svg v-else-if="isSaving" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mcc-spin">
            <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
          </svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
          </svg>
          {{ saved ? 'Gespeichert' : isSaving ? '…' : 'Speichern' }}
        </button>
      </div>
    </template>

    <!-- Saved -->
    <template v-else-if="state === 'saved'">
      <div class="mcc-head">
        <span class="mcc-dot mcc-dot--saved"></span>
        <span class="mcc-label">{{ modeLabel }}-Aufnahme gespeichert</span>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useMotion }     from '~/composables/useMotion.js'
import { useVault }      from '~/composables/useVault.js'
import { useSoul }       from '~/composables/useSoul.js'
import { useApiContext } from '~/composables/useApiContext.js'
import { updateFrontmatterField } from '#shared/utils/soulParser.js'

const CONSENT_KEY = 'sys_biometric_consent'

const props = defineProps({
  mode: { type: String, default: 'face' }  // 'face' | 'body'
})

const {
  isRecording, isPreview, isPreviewing, duration,
  lastSample, motionError,
  startCameraPreview, stopCameraPreview,
  startRecording, stopRecording, discardSample,
  formatDuration, setCaptureMode, reattachStream
} = useMotion()

const { isConnected: vaultConnected, writeFile, writeSoulMd } = useVault()
const { soulToken, soulMeta, soulContent, save } = useSoul()
const { syncFile } = useApiContext()

const state          = ref('consent')
const consentChecked = ref(false)
const isSaving       = ref(false)
const saved          = ref(false)
const liveEl         = ref(null)
const previewEl      = ref(null)

const promptIndex     = ref(0)
const promptCountdown = ref(100)
let countdownTimer    = null

const modeLabel  = computed(() => props.mode === 'face' ? 'Gesicht' : 'Bewegung')
const hasVideo   = computed(() => state.value === 'idle' || state.value === 'recording' || state.value === 'preview')

const PROMPTS = {
  face: [
    { text: 'Neutral – Blick gerade in die Kamera', sub: 'Baseline · Augen offen, ruhiges Gesicht', secs: 5 },
    { text: 'Natürlich lächeln', sub: 'Echtes, entspanntes Lächeln', secs: 4 },
    { text: 'Breit lachen', sub: 'Volle Emotion – Zähne zeigen', secs: 4 },
    { text: 'Nachdenklich schauen', sub: 'Stirn leicht runzeln, Blick leicht weg', secs: 4 },
    { text: 'Überrascht – Augen weit öffnen', sub: 'Mundwinkel nach unten, Augenbrauen hoch', secs: 3 },
    { text: 'Zustimmend nicken', sub: '3× langsam und bewusst nicken', secs: 5 },
    { text: 'Kopf schütteln – Nein', sub: '3× langsam und bewusst schütteln', secs: 5 },
    { text: '2 Sätze über dich laut sprechen', sub: 'Natürliche Mimik beim Sprechen', secs: 8 },
    { text: 'Fertig – frei weitermachen oder stoppen', sub: '', secs: 0 },
  ],
  body: [
    { text: 'Ganzkörper ins Bild bringen', sub: 'Kopf bis Füße vollständig im Bild?', secs: 6 },
    { text: 'Neutrale Haltung – Arme locker seitlich', sub: 'Entspannte Referenz-Pose', secs: 5 },
    { text: '5 Schritte vor und zurück gehen', sub: 'Normaler, natürlicher Gang', secs: 7 },
    { text: 'Jemanden begrüßen – winken', sub: 'Typische Willkommensgeste', secs: 5 },
    { text: 'Sprich und gestikuliere dabei', sub: '2–3 Sätze frei sprechen', secs: 8 },
    { text: 'Arme weit ausbreiten – T-Pose', sub: 'Körpermaß-Referenz für Rigging', secs: 5 },
    { text: 'Langsam 360° drehen', sub: 'Einmal komplett rundherum', secs: 8 },
    { text: 'Fertig – frei weitermachen oder stoppen', sub: '', secs: 0 },
  ]
}

const currentPrompts = computed(() => PROMPTS[props.mode] || [])
const currentPrompt  = computed(() => currentPrompts.value[promptIndex.value] ?? null)
const isLastPrompt   = computed(() =>
  !currentPrompt.value || currentPrompt.value.secs === 0 ||
  promptIndex.value >= currentPrompts.value.length - 1
)

onMounted(async () => {
  if (isRecording.value) { await stopRecording(liveEl.value).catch(() => {}); discardSample(liveEl.value) }
  if (isPreview.value)   { discardSample(liveEl.value) }
  if (localStorage.getItem(CONSENT_KEY) === '1') {
    state.value = 'idle'
    setCaptureMode(props.mode)
    await nextTick()
    await startCameraPreview(liveEl.value)
  }
})

onUnmounted(() => {
  clearTimer()
  if (isRecording.value) stopRecording(liveEl.value).catch(() => {})
  else if (isPreviewing.value) stopCameraPreview(liveEl.value)
})

async function giveConsent() {
  localStorage.setItem(CONSENT_KEY, '1')
  state.value = 'idle'
  setCaptureMode(props.mode)
  await nextTick()
  await startCameraPreview(liveEl.value)
}

async function handleStart() {
  saved.value = false
  promptIndex.value = 0
  setCaptureMode(props.mode)
  await startRecording(liveEl.value)
  if (isRecording.value) {
    state.value = 'recording'
    await nextTick()
    reattachStream(liveEl.value)
    runPromptTimer()
  }
}

async function handleStop() {
  clearTimer()
  await stopRecording(liveEl.value)
  state.value = 'preview'
}

async function handleDiscard() {
  if (previewEl.value) { previewEl.value.pause(); previewEl.value.src = '' }
  discardSample(liveEl.value)
  saved.value = false
  state.value = 'idle'
  await nextTick()
  await startCameraPreview(liveEl.value)
}

function runPromptTimer() {
  clearTimer()
  const p = currentPrompts.value[promptIndex.value]
  if (!p || p.secs === 0) { promptCountdown.value = 0; return }
  promptCountdown.value = 100
  const dec = 100 / (p.secs * 10)
  countdownTimer = setInterval(() => {
    promptCountdown.value = Math.max(0, promptCountdown.value - dec)
    if (promptCountdown.value <= 0) advancePrompt()
  }, 100)
}

function advancePrompt() {
  clearTimer()
  if (promptIndex.value < currentPrompts.value.length - 1) {
    promptIndex.value++
    runPromptTimer()
  }
}

function clearTimer() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

async function handleSave() {
  if (!lastSample.value || isSaving.value) return
  isSaving.value = true
  try {
    const { blob, mimeType, width, height, fps, duration: dur, date, ts, mode } = lastSample.value
    const ext      = mimeType?.includes('webm') ? 'webm' : 'mp4'
    const speakerId = soulMeta.value?.id?.slice(0, 8) || 'user'
    const filename  = `motion_${mode ?? props.mode}_${speakerId}_${date}.${ext}`

    if (vaultConnected.value) {
      await writeFile(`motion_samples/${filename}`, blob)
      const profile = {
        $schema: 'saveyoursoul/motion-profile/1.0', schema_version: '1.0',
        subject: { id: speakerId, display_name: soulMeta.value?.name || 'Unbekannt' },
        samples: [{ file: filename, format: mimeType || 'video/webm', capture_mode: mode ?? props.mode, width, height, fps: Math.round(fps), duration_seconds: dur, content: mode === 'face' ? 'facial_expression_sequence' : 'full_body_movement_sequence', recorded: ts }],
        intended_use: ['motion_synthesis', 'gesture_recognition', 'humanoid_robotics', 'avatar_animation'],
        compatible_with: ['MediaPipe', 'OpenPose', 'MoveNet', 'HumanML3D', 'MDM'],
        created: date, updated: date
      }
      await writeFile('motion_samples/motion_profile.json', new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }))
    } else if (soulToken.value) {
      await syncFile(soulToken.value, 'video', filename, blob)
    }

    if (soulContent.value) {
      soulContent.value = updateFrontmatterField(soulContent.value, 'motion_profile', 'motion_samples/motion_profile.json')
      save()
      if (vaultConnected.value) await writeSoulMd(soulContent.value, 'sys')
    }

    saved.value = true
    setTimeout(() => { state.value = 'saved' }, 1200)
  } catch (e) {
    console.error('[MotionCaptureCard] save error:', e)
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.mcc {
  background: rgba(255,255,255,0.04);
  border-radius: 14px 14px 14px 4px;
  border-left: 2px solid rgba(139,92,246,0.45);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 280px;
}
.mcc--wide { max-width: 320px; }

.mcc-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mcc-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex: none;
}
.mcc-dot--idle    { background: rgba(255,255,255,0.25); }
.mcc-dot--rec     { background: #ef4444; }
.mcc-dot--preview { background: rgba(255,255,255,0.6); }
.mcc-dot--saved   { background: #22c55e; }

.mcc-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-2);
}
.mcc-label--rec { color: #f87171; }
.mcc-dur {
  font-family: var(--mono);
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  margin-left: auto;
}
.mcc-steps {
  font-family: var(--mono);
  font-size: 10px;
  color: rgba(255,255,255,0.25);
}

.mcc-desc {
  font-family: var(--serif);
  font-size: 13px;
  line-height: 1.55;
  color: var(--fg-3);
  margin: 0;
}
.mcc-error {
  font-family: var(--mono);
  font-size: 11px;
  color: #f87171;
  margin: 0;
}

.mcc-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.mcc-checkbox {
  margin-top: 2px;
  flex: none;
  width: 14px; height: 14px;
  accent-color: var(--sys-accent);
  cursor: pointer;
}
.mcc-check-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  line-height: 1.6;
  color: var(--fg-3);
}

/* Video */
.mcc-video-wrap {
  position: relative;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  aspect-ratio: 3/4;
  max-height: 240px;
}
.mcc-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mcc-video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mcc-video-hint {
  font-family: var(--mono);
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  letter-spacing: 0.08em;
}

/* REC badge */
.mcc-rec-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(4px);
  border-radius: 100px;
  padding: 3px 7px;
}
.mcc-rec-dot-sm {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #ef4444;
  flex: none;
}
.mcc-rec-badge span:last-child {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: #f87171;
}

/* Step dots */
.mcc-step-dots {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 3px;
}
.mcc-step-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  transition: background 0.2s;
}
.mcc-step-dot--active { background: #fff; }
.mcc-step-dot--done   { background: rgba(255,255,255,0.5); }

/* Prompt overlay */
.mcc-prompt {
  position: absolute;
  bottom: 0;
  left: 0; right: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
  padding: 24px 10px 10px;
  pointer-events: none;
}
.mcc-prompt-text {
  font-family: var(--sans, sans-serif);
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 3px;
  line-height: 1.35;
}
.mcc-prompt-sub {
  font-family: var(--mono);
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  margin: 0 0 6px;
}
.mcc-prompt-bar {
  height: 2px;
  background: rgba(255,255,255,0.15);
  border-radius: 1px;
  overflow: hidden;
}
.mcc-prompt-fill {
  height: 100%;
  background: #ef4444;
  border-radius: 1px;
  transition: none;
}

/* Actions */
.mcc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mcc-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.mcc-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); }
.mcc-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.mcc-btn--primary {
  background: var(--sys-accent);
  border-color: var(--sys-accent);
  color: #fff;
}
.mcc-btn--primary:hover:not(:disabled) { background: #7c3aed; }

.mcc-btn--record { margin: 0 auto; }
.mcc-rec-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #fff;
  flex: none;
}

.mcc-btn--stop {
  margin: 0 auto;
  border-color: rgba(239,68,68,0.4);
  background: rgba(239,68,68,0.1);
  color: #f87171;
}
.mcc-btn--stop:hover:not(:disabled) { background: rgba(239,68,68,0.18) !important; }
.mcc-stop-sq {
  width: 8px; height: 8px;
  border-radius: 2px;
  background: #f87171;
  flex: none;
}

.mcc-btn--ghost { flex: 1; }

.mcc-btn--discard {
  padding: 6px 8px;
  border-color: rgba(239,68,68,0.25);
  color: rgba(239,68,68,0.6);
}
.mcc-btn--discard:hover:not(:disabled) { color: #f87171 !important; background: rgba(239,68,68,0.1) !important; }

.mcc-btn--save { flex: 1; }
.mcc-btn--saved {
  border-color: rgba(34,197,94,0.3);
  background: rgba(34,197,94,0.08);
  color: #86efac;
  flex: 1;
}

@keyframes spin { to { transform: rotate(360deg); } }
.mcc-spin { animation: spin 0.8s linear infinite; }
</style>
