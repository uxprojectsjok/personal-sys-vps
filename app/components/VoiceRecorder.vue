<template>
  <div
    :class="embedded
      ? 'flex flex-col gap-3 px-4 py-4'
      : 'flex-none flex flex-col gap-3 px-4 py-3 border-b border-[var(--sys-border)] bg-[var(--sys-bg-elevated)]'"
  >

    <!-- ── Status-Zeile (wird bei embedded durch LiveProfile-Header ersetzt) -->
    <div v-if="!embedded" class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span
          class="w-2 h-2 rounded-full flex-none transition-all duration-300"
          :class="isRecording ? 'bg-red-500 soul-pulse' : isPreview ? 'bg-white/80' : 'bg-[var(--sys-fg-dim)] opacity-40'"
        ></span>
        <span
          class="text-xs tracking-[0.1em] uppercase font-semibold"
          :class="isRecording ? 'text-red-400' : isPreview ? 'text-white/70' : 'text-[var(--sys-fg-dim)]'"
        >
          {{ isRecording ? 'Aufnahme' : isPreview ? 'Vorschau' : 'Stimme aufnehmen' }}
        </span>
        <span v-if="isRecording || isPreview" class="text-xs font-mono text-[var(--sys-fg-dim)]">
          {{ formatDuration(duration) }}
        </span>
      </div>
      <button
        @click="handleClose"
        class="text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] w-6 h-6 flex items-center justify-center text-xs transition"
      >✕</button>
    </div>

    <!-- ── Aufnahme-Feedback ─────────────────────────────────────────────── -->
    <div v-if="isRecording" class="flex flex-col gap-2">

      <!-- Countdown + Pegel nebeneinander -->
      <div class="flex items-center gap-4">

        <!-- Großer Countdown / "Fertig" -->
        <div class="w-14 flex-none flex flex-col items-center justify-center">
          <span
            v-if="duration < 30"
            class="text-[30px] font-mono font-bold leading-none tabular-nums"
            :class="duration >= 25 ? 'text-white/80' : 'text-red-400'"
          >{{ Math.ceil(30 - duration) }}</span>
          <span v-else class="text-sm font-bold tracking-[0.2em] uppercase text-white/80 leading-none">
            Fertig
          </span>
          <span v-if="duration < 30" class="text-xs text-[var(--sys-fg-dim)]/40 tracking-widest uppercase mt-0.5">Sek.</span>
        </div>

        <!-- Pegel-Meter -->
        <div class="flex-1 flex items-end gap-[3px] h-6">
          <span
            v-for="i in 12"
            :key="i"
            class="flex-1 rounded-sm bg-red-500 transition-all duration-75"
            :style="{ height: barHeight(i) + '%', opacity: barHeight(i) > 15 ? '0.9' : '0.2' }"
          ></span>
        </div>

      </div>

      <!-- Fortschrittsbalken (Ziel: 30 Sek.) -->
      <div class="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-1000"
          :class="duration >= 30 ? 'bg-white/70' : 'bg-red-400/60'"
          :style="{ width: Math.min(duration / 30 * 100, 100) + '%' }"
        ></div>
      </div>

    </div>

    <!-- Voice Clone Consent -->
    <label
      v-if="!isRecording && !isPreview"
      class="flex items-start gap-2.5 cursor-pointer select-none"
    >
      <input
        type="checkbox"
        v-model="consentGiven"
        class="mt-0.5 flex-none w-3.5 h-3.5 cursor-pointer accent-[#22c55e]"
      />
      <span class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">
        Ich stimme zu, dass diese Aufnahme zur Erstellung eines KI-Stimmklons verarbeitet werden darf
        (EU AI Act Art. 50, Art. 9 DSGVO). Die Verarbeitung erfolgt ausschließlich durch mich selbst.
      </span>
    </label>

    <!-- Idle-Hinweis -->
    <p
      v-if="!isRecording && !isPreview"
      class="text-center text-xs text-[var(--sys-fg-dim)]/50 tracking-[0.06em]"
    >
      Mindestens 30 Sek. frei sprechen für optimale Qualität
    </p>

    <!-- Fehler -->
    <p v-if="voiceError" class="text-xs text-red-400 tracking-[0.05em]">{{ voiceError }}</p>

    <!-- ── Aufnahme-Steuerung ────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-2">

      <!-- Record / Stop Button – M3 FAB-style (56px) -->
      <button
        v-if="!isPreview"
        @click="isRecording ? handleStop() : handleStart()"
        :disabled="!isRecording && !consentGiven"
        class="sys-btn sys-fab mx-auto flex items-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        :class="isRecording
          ? 'border border-red-900/50 bg-[rgba(239,68,68,0.12)] text-red-400 hover:bg-[rgba(239,68,68,0.2)]'
          : 'border border-white/20 bg-[rgba(255,255,255,0.08)] text-white/80 hover:bg-[rgba(255,255,255,0.14)]'"
      >
        <!-- Aufnahme-Kreis -->
        <span
          class="w-2.5 h-2.5 rounded-full flex-none transition-all"
          :class="isRecording ? 'bg-red-400 rounded-sm scale-90' : 'bg-white'"
        ></span>
        {{ isRecording ? 'Stopp' : 'Aufnehmen' }}
      </button>

      <!-- Preview-Controls -->
      <template v-if="isPreview">

        <!-- Abspielen / Pause -->
        <button
          @click="togglePreview"
          class="sys-btn sys-btn-ghost flex items-center gap-2"
        >
          <svg class="w-3.5 h-3.5 flex-none" viewBox="0 0 24 24" fill="currentColor">
            <polygon v-if="!isPlayingPreview" points="5 3 19 12 5 21 5 3"/>
            <g v-else>
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </g>
          </svg>
          {{ isPlayingPreview ? 'Pause' : 'Anhören' }}
        </button>

        <!-- Aufnahme verwerfen -->
        <button
          @click="handleDiscard"
          class="w-9 h-9 flex-none flex items-center justify-center rounded-full text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
          aria-label="Aufnahme verwerfen"
          title="Aufnahme verwerfen"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
          </svg>
        </button>

        <!-- Im Vault speichern -->
        <button
          @click="handleSave"
          :disabled="isSaving || !vaultConnected"
          class="sys-btn flex items-center gap-2 transition-all disabled:opacity-30"
          :class="saved
            ? 'border border-white/25 bg-[rgba(255,255,255,0.12)] text-white/85'
            : 'border border-white/15 bg-[rgba(255,255,255,0.06)] text-white/75 hover:bg-[rgba(255,255,255,0.11)]'"
          :title="!vaultConnected ? 'Vault verbinden zum Speichern' : ''"
        >
          <svg v-if="saved" class="w-3 h-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
          </svg>
          <svg v-else-if="isSaving" class="w-3 h-3 flex-none animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
          </svg>
          <svg v-else class="w-3 h-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          {{ saved ? 'Gespeichert' : isSaving ? '…' : 'Im Vault speichern' }}
        </button>

      </template>
    </div>

    <!-- Vault-Hinweis wenn nicht verbunden -->
    <p
      v-if="isPreview && !vaultConnected"
      class="text-xs text-white/55 tracking-[0.06em] opacity-80"
    >
      Vault verbinden um die Stimmprobe dauerhaft zu speichern.
    </p>

    <!-- Verstecktes Audio für Vorschau -->
    <audio ref="previewAudio" @ended="isPlayingPreview = false" preload="auto"></audio>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from "vue";
import { useVoice }      from "~/composables/useVoice.js";
import { useVault }      from "~/composables/useVault.js";
import { useSoul }       from "~/composables/useSoul.js";
import { useApiContext } from "~/composables/useApiContext.js";

const props = defineProps({
  soulMeta:  { type: Object,  default: null },
  embedded:  { type: Boolean, default: false }
});

const emit = defineEmits(["saved", "close"]);

const {
  isRecording, isPreview, level, duration,
  lastSample, voiceError,
  startRecording, stopRecording, discardSample,
  formatDuration, barHeight
} = useVoice();

const { isConnected: vaultConnected, writeFile } = useVault();
const { soulToken } = useSoul();
const { syncFile }  = useApiContext();

const isPlayingPreview = ref(false);
const isSaving         = ref(false);
const saved            = ref(false);
const previewAudio     = ref(null);
const consentGiven     = ref(false);

// ── Aufnahme ──────────────────────────────────────────────────────────────────

async function handleStart() {
  saved.value = false;
  await startRecording();
}

async function handleStop() {
  await stopRecording();
}

function handleDiscard() {
  stopPreviewAudio();
  discardSample();
  saved.value = false;
}

// ── Vorschau-Wiedergabe ───────────────────────────────────────────────────────

function togglePreview() {
  if (!previewAudio.value || !lastSample.value?.url) return;
  if (isPlayingPreview.value) {
    previewAudio.value.pause();
    isPlayingPreview.value = false;
  } else {
    previewAudio.value.src = lastSample.value.url;
    previewAudio.value.load();
    previewAudio.value.play().then(() => {
      isPlayingPreview.value = true;
    }).catch(() => {
      isPlayingPreview.value = false;
    });
    return;
  }
}

function stopPreviewAudio() {
  if (previewAudio.value) {
    previewAudio.value.pause();
    previewAudio.value.src = "";
  }
  isPlayingPreview.value = false;
}

// ── Speichern im Vault ────────────────────────────────────────────────────────

async function handleSave() {
  if (!lastSample.value || isSaving.value) return;
  isSaving.value = true;
  try {
    const { blob, mimeType, duration: dur, date, ts } = lastSample.value;

    // Dateiname + Pfad
    const ext       = mimeType?.includes("webm") ? "webm" : mimeType?.includes("mp4") ? "m4a" : "webm";
    const speakerId = props.soulMeta?.id?.slice(0, 8) || "user";
    const filename  = `voice_${speakerId}_${date}.${ext}`;
    const subpath   = `voice_samples/${filename}`;

    if (vaultConnected.value) {
      // Desktop: in Vault schreiben, syncAll() macht Upload separat
      await writeFile(subpath, blob);

    // 2) voice_profile.json schreiben
    const profile = {
      $schema:        "saveyoursoul/voice-profile/1.0",
      schema_version: "1.0",
      speaker: {
        id:           props.soulMeta?.id?.slice(0, 8) || "user",
        display_name: props.soulMeta?.name || "Unbekannt",
        language:     "de-DE"
      },
      samples: [{
        file:             filename,
        format:           mimeType || "webm/opus",
        sample_rate:      48000,
        channels:         1,
        duration_seconds: dur,
        quality:          "clean",
        content:          "conversational_speech",
        recorded:         ts
      }],
      intended_use:    ["tts_cloning", "voice_synthesis", "humanoid_robotics"],
      compatible_with: ["ElevenLabs", "XTTS-v2", "OpenVoice2", "Coqui-TTS", "RVC"],
      created: date,
      updated: date
    };

      await writeFile(
        "voice_samples/voice_profile.json",
        new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" })
      );
    } else if (soulToken.value) {
      // Mobile / kein Vault: direkt zum VPS hochladen
      await syncFile(soulToken.value, "audio", filename, blob);
    }

    saved.value = true;
    emit("saved", filename);
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (e) {
    console.error("[VoiceRecorder] save error:", e);
  } finally {
    isSaving.value = false;
  }
}

// ── Schließen ─────────────────────────────────────────────────────────────────

function handleClose() {
  if (isRecording.value) stopRecording().then(() => discardSample());
  stopPreviewAudio();
  emit("close");
}

onUnmounted(() => {
  if (isRecording.value) stopRecording().catch(() => {});
  stopPreviewAudio();
});
</script>
