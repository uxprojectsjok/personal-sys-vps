<template>
  <div class="cc">

    <!-- Consent -->
    <template v-if="state === 'consent'">
      <div class="cc-head">
        <span class="cc-dot cc-dot--idle"></span>
        <span class="cc-label">Stimme aufnehmen</span>
      </div>
      <p class="cc-desc">
        Deine Stimmprobe wird lokal in deinem Vault gespeichert und verlässt dein Gerät nur wenn du es explizit freigibst.
      </p>
      <label class="cc-check">
        <input type="checkbox" v-model="consentChecked" class="cc-checkbox" />
        <span class="cc-check-label">
          Ich stimme der Aufnahme und ggf. Verarbeitung zur Stimmklon-Erstellung zu
          (EU AI Act Art. 50, DSGVO Art. 9)
        </span>
      </label>
      <div class="cc-actions">
        <button :disabled="!consentChecked" @click="giveConsent" class="cc-btn cc-btn--primary">
          Weiter →
        </button>
      </div>
    </template>

    <!-- Idle -->
    <template v-else-if="state === 'idle'">
      <div class="cc-head">
        <span class="cc-dot cc-dot--idle"></span>
        <span class="cc-label">Stimme</span>
      </div>
      <p class="cc-hint">Mindestens 30 Sek. frei sprechen für optimale Qualität</p>
      <p v-if="voiceError" class="cc-error">{{ voiceError }}</p>
      <div class="cc-actions">
        <button @click="handleStart" class="cc-btn cc-btn--record">
          <span class="cc-rec-dot"></span>
          Aufnehmen
        </button>
      </div>
    </template>

    <!-- Recording -->
    <template v-else-if="state === 'recording'">
      <div class="cc-head">
        <span class="cc-dot cc-dot--rec soul-pulse"></span>
        <span class="cc-label cc-label--rec">Aufnahme</span>
        <span class="cc-dur">{{ formatDuration(duration) }}</span>
      </div>
      <div class="cc-meter">
        <span
          v-for="i in 12" :key="i"
          class="cc-bar"
          :style="{ height: barHeight(i) + '%', opacity: barHeight(i) > 15 ? '0.85' : '0.2' }"
        ></span>
      </div>
      <div class="cc-countdown-row">
        <span v-if="duration < 30" class="cc-countdown">{{ Math.ceil(30 - duration) }}</span>
        <span v-else class="cc-countdown cc-countdown--done">Fertig</span>
        <div class="cc-progress">
          <div
            class="cc-progress-fill"
            :class="duration >= 30 ? 'cc-progress-fill--done' : ''"
            :style="{ width: Math.min(duration / 30 * 100, 100) + '%' }"
          ></div>
        </div>
      </div>
      <div class="cc-actions">
        <button @click="handleStop" class="cc-btn cc-btn--stop">
          <span class="cc-stop-sq"></span>
          Stopp
        </button>
      </div>
    </template>

    <!-- Preview -->
    <template v-else-if="state === 'preview'">
      <div class="cc-head">
        <span class="cc-dot cc-dot--preview"></span>
        <span class="cc-label">Vorschau</span>
        <span class="cc-dur">{{ formatDuration(lastSample?.duration || 0) }}</span>
      </div>
      <div class="cc-actions cc-actions--preview">
        <button @click="togglePlay" class="cc-btn cc-btn--ghost">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon v-if="!isPlaying" points="5 3 19 12 5 21 5 3"/>
            <g v-else>
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </g>
          </svg>
          {{ isPlaying ? 'Pause' : 'Anhören' }}
        </button>
        <button @click="handleDiscard" class="cc-btn cc-btn--discard" title="Verwerfen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>
        <button
          @click="handleSave"
          :disabled="isSaving"
          class="cc-btn"
          :class="saved ? 'cc-btn--saved' : 'cc-btn--save'"
        >
          <svg v-if="saved" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
          </svg>
          <svg v-else-if="isSaving" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-spin">
            <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
          </svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
          </svg>
          {{ saved ? 'Gespeichert' : isSaving ? '…' : 'Speichern' }}
        </button>
      </div>
      <p v-if="!vaultConnected && !soulToken" class="cc-warn">
        Vault verbinden um dauerhaft zu speichern
      </p>
      <audio ref="previewAudio" @ended="isPlaying = false" preload="auto"></audio>
    </template>

    <!-- Saved -->
    <template v-else-if="state === 'saved'">
      <div class="cc-head">
        <span class="cc-dot cc-dot--saved"></span>
        <span class="cc-label">Stimmprobe gespeichert</span>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useVoice }      from '~/composables/useVoice.js'
import { useVault }      from '~/composables/useVault.js'
import { useSoul }       from '~/composables/useSoul.js'
import { useApiContext } from '~/composables/useApiContext.js'
import { updateFrontmatterField } from '#shared/utils/soulParser.js'

const CONSENT_KEY = 'sys_biometric_consent'

const {
  isRecording, isPreview, level, duration,
  lastSample, voiceError,
  startRecording, stopRecording, discardSample,
  formatDuration, barHeight
} = useVoice()

const { isConnected: vaultConnected, writeFile, writeSoulMd } = useVault()
const { soulToken, soulMeta, soulContent, save } = useSoul()
const { syncFile } = useApiContext()

const state          = ref('consent')
const consentChecked = ref(false)
const isPlaying      = ref(false)
const isSaving       = ref(false)
const saved          = ref(false)
const previewAudio   = ref(null)

onMounted(() => {
  if (localStorage.getItem(CONSENT_KEY) === '1') state.value = 'idle'
})

onUnmounted(() => {
  if (isRecording.value) stopRecording().catch(() => {})
  stopAudio()
})

function giveConsent() {
  localStorage.setItem(CONSENT_KEY, '1')
  state.value = 'idle'
}

async function handleStart() {
  saved.value = false
  await startRecording()
  if (isRecording.value) state.value = 'recording'
}

async function handleStop() {
  await stopRecording()
  state.value = 'preview'
}

function handleDiscard() {
  stopAudio()
  discardSample()
  saved.value = false
  state.value = 'idle'
}

function togglePlay() {
  if (!previewAudio.value || !lastSample.value?.url) return
  if (isPlaying.value) {
    previewAudio.value.pause()
    isPlaying.value = false
  } else {
    previewAudio.value.src = lastSample.value.url
    previewAudio.value.load()
    previewAudio.value.play().then(() => { isPlaying.value = true }).catch(() => {})
  }
}

function stopAudio() {
  if (previewAudio.value) { previewAudio.value.pause(); previewAudio.value.src = '' }
  isPlaying.value = false
}

async function handleSave() {
  if (!lastSample.value || isSaving.value) return
  isSaving.value = true
  try {
    const { blob, mimeType, duration: dur, date, ts } = lastSample.value
    const ext      = mimeType?.includes('webm') ? 'webm' : mimeType?.includes('mp4') ? 'm4a' : 'webm'
    const speakerId = soulMeta.value?.id?.slice(0, 8) || 'user'
    const filename  = `voice_${speakerId}_${date}.${ext}`

    if (vaultConnected.value) {
      await writeFile(`voice_samples/${filename}`, blob)
      const profile = {
        $schema: 'saveyoursoul/voice-profile/1.0', schema_version: '1.0',
        speaker: { id: speakerId, display_name: soulMeta.value?.name || 'Unbekannt', language: 'de-DE' },
        samples: [{ file: filename, format: mimeType || 'webm/opus', sample_rate: 48000, channels: 1, duration_seconds: dur, quality: 'clean', content: 'conversational_speech', recorded: ts }],
        intended_use: ['tts_cloning', 'voice_synthesis', 'humanoid_robotics'],
        compatible_with: ['ElevenLabs', 'XTTS-v2', 'OpenVoice2', 'Coqui-TTS', 'RVC'],
        created: date, updated: date
      }
      await writeFile('voice_samples/voice_profile.json', new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }))
    } else if (soulToken.value) {
      await syncFile(soulToken.value, 'audio', filename, blob)
    }

    if (soulContent.value) {
      soulContent.value = updateFrontmatterField(soulContent.value, 'voice_profile', 'voice_samples/voice_profile.json')
      save()
      if (vaultConnected.value) await writeSoulMd(soulContent.value, 'sys')
    }

    saved.value = true
    stopAudio()
    setTimeout(() => { state.value = 'saved' }, 1200)
  } catch (e) {
    console.error('[AudioCaptureCard] save error:', e)
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.cc {
  background: rgba(255,255,255,0.04);
  border-radius: 14px 14px 14px 4px;
  border-left: 2px solid rgba(139,92,246,0.45);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 280px;
}

.cc-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cc-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-none;
}
.cc-dot--idle    { background: rgba(255,255,255,0.25); }
.cc-dot--rec     { background: #ef4444; }
.cc-dot--preview { background: rgba(255,255,255,0.6); }
.cc-dot--saved   { background: #22c55e; }

.cc-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-2);
}
.cc-label--rec { color: #f87171; }
.cc-dur {
  font-family: var(--mono);
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  margin-left: auto;
}

.cc-desc {
  font-family: var(--serif);
  font-size: 13px;
  line-height: 1.55;
  color: var(--fg-3);
  margin: 0;
}

.cc-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.cc-checkbox {
  margin-top: 2px;
  flex: none;
  width: 14px; height: 14px;
  accent-color: var(--sys-accent);
  cursor: pointer;
}
.cc-check-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  line-height: 1.6;
  color: var(--fg-3);
}

.cc-hint {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.3);
  margin: 0;
  text-align: center;
}
.cc-warn {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(255,200,60,0.7);
  margin: 0;
}
.cc-error {
  font-family: var(--mono);
  font-size: 11px;
  color: #f87171;
  margin: 0;
}

/* Meter */
.cc-meter {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 24px;
}
.cc-bar {
  flex: 1;
  border-radius: 2px;
  background: #ef4444;
  transition: height 75ms;
  min-height: 2px;
}

/* Countdown */
.cc-countdown-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cc-countdown {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 700;
  color: #f87171;
  line-height: 1;
  min-width: 28px;
  text-align: center;
}
.cc-countdown--done {
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.6);
}
.cc-progress {
  flex: 1;
  height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.cc-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: rgba(239,68,68,0.6);
  transition: width 1s linear;
}
.cc-progress-fill--done { background: rgba(255,255,255,0.4); }

/* Actions */
.cc-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cc-actions--preview {
  flex-wrap: wrap;
}

.cc-btn {
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
.cc-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); }
.cc-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.cc-btn--primary {
  background: var(--sys-accent);
  border-color: var(--sys-accent);
  color: #fff;
}
.cc-btn--primary:hover:not(:disabled) { background: #7c3aed; }

.cc-btn--record {
  margin: 0 auto;
}
.cc-rec-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #fff;
  flex: none;
}

.cc-btn--stop {
  margin: 0 auto;
  border-color: rgba(239,68,68,0.4);
  background: rgba(239,68,68,0.1);
  color: #f87171;
}
.cc-btn--stop:hover { background: rgba(239,68,68,0.18) !important; }
.cc-stop-sq {
  width: 8px; height: 8px;
  border-radius: 2px;
  background: #f87171;
  flex: none;
}

.cc-btn--ghost {
  flex: 1;
}
.cc-btn--discard {
  padding: 6px 8px;
  border-color: rgba(239,68,68,0.25);
  color: rgba(239,68,68,0.6);
}
.cc-btn--discard:hover { color: #f87171 !important; background: rgba(239,68,68,0.1) !important; }

.cc-btn--save { flex: 1; }
.cc-btn--saved {
  border-color: rgba(34,197,94,0.3);
  background: rgba(34,197,94,0.08);
  color: #86efac;
  flex: 1;
}

@keyframes spin { to { transform: rotate(360deg); } }
.cc-spin { animation: spin 0.8s linear infinite; }
</style>
