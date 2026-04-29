<template>
  <div
    :class="embedded
      ? 'flex flex-col'
      : 'flex-none flex flex-col gap-3 px-4 py-3 border-b border-[var(--sys-border)] bg-[var(--sys-bg-elevated)]'"
  >

    <!-- ── Status-Zeile (wird bei embedded durch LiveProfile-Header ersetzt) -->
    <template v-if="!embedded">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <span
            class="w-2 h-2 rounded-full flex-none transition-all duration-300"
            :class="isRecording ? 'bg-red-500 soul-pulse' : isPreview ? 'bg-white/50' : 'bg-[var(--sys-fg-dim)] opacity-40'"
          ></span>
          <span
            class="text-xs tracking-[0.1em] uppercase font-semibold"
            :class="isRecording ? 'text-red-400' : isPreview ? 'text-white/60' : 'text-[var(--sys-fg-dim)]'"
          >
            {{ isRecording ? (selectedMode === 'face' ? 'Mimik' : 'Ganzkörper') : isPreview ? 'Vorschau' : 'Bewegung aufnehmen' }}
          </span>
          <span v-if="isRecording || isPreview" class="text-xs font-mono text-[var(--sys-fg-dim)]">
            {{ formatDuration(duration) }}
          </span>
          <span v-if="isRecording && !isLastPrompt" class="text-xs text-[var(--sys-fg-dim)] opacity-60">
            {{ promptIndex + 1 }}/{{ currentPrompts.length }}
          </span>
        </div>
        <button
          @click="handleClose"
          class="text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] w-6 h-6 flex items-center justify-center text-xs transition"
        >✕</button>
      </div>

      <!-- Fehler (im nicht-embedded Header) -->
      <p v-if="motionError" class="text-xs text-red-400 tracking-[0.05em]">{{ motionError }}</p>
    </template>

    <!-- Fehler (im embedded-Modus mit Padding) -->
    <p v-else-if="motionError" class="text-xs text-red-400 tracking-[0.05em] px-4 pt-2">{{ motionError }}</p>

    <!-- ── MODUS-AUSWAHL (nur wenn kein initialMode gesetzt) ─────────────── -->
    <template v-if="!selectedMode && !isRecording && !isPreview">
      <div :class="embedded ? 'px-4 py-3 flex flex-col gap-3' : 'flex flex-col gap-3'">
        <div class="grid grid-cols-2 gap-2">

          <!-- Mimik & Gesicht -->
          <button
            @click="selectedMode = 'face'; handleOpenCamera()"
            class="flex flex-col items-center justify-center gap-2.5 px-3 py-5 rounded-xl border border-white/20 bg-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.14)] hover:border-white/30 active:scale-[0.97] transition-all text-center"
          >
            <svg class="w-8 h-8 text-white/75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <circle cx="12" cy="8" r="5"/>
              <path stroke-linecap="round" d="M9.5 8.5c.5.8 1.5 1.3 2.5 1.3s2-.5 2.5-1.3"/>
              <path stroke-linecap="round" d="M10 7h.01M14 7h.01"/>
              <path stroke-linecap="round" d="M3 20c0-4 4-7 9-7s9 3 9 7" opacity=".4"/>
            </svg>
          </button>

          <!-- Ganzkörper -->
          <button
            @click="selectedMode = 'body'; handleOpenCamera()"
            class="flex flex-col items-center justify-center gap-2.5 px-3 py-5 rounded-xl border border-white/20 bg-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.14)] hover:border-white/30 active:scale-[0.97] transition-all text-center"
          >
            <svg class="w-8 h-8 text-white/75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <circle cx="12" cy="4" r="2"/>
              <path stroke-linecap="round" d="M12 6v8M9 10h6M9 22l3-8 3 8"/>
              <path stroke-linecap="round" d="M7 10l-2 4M17 10l2 4" opacity=".5"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── KAMERA-INTERFACE (Modus gewählt oder Aufnahme/Preview) ────────── -->
    <template v-if="selectedMode || isRecording || isPreview">

      <!-- Wrapper: im embedded mode normales flex-col -->
      <div :class="embedded ? 'flex flex-col gap-2 px-3 pb-3' : 'flex flex-col gap-3'">

        <!-- Video-Container:
             embedded mobile  → flex-1, füllt Höhe des Fullscreen
             embedded desktop → zentriertes 200px-Panel (sm:-Klassen)
             nicht embedded   → zentriertes 200px-Panel via inline-style -->
        <div
          class="relative bg-black overflow-hidden rounded-xl"
          :class="embedded ? 'w-full' : 'flex-none mx-auto'"
          :style="embedded
            ? { aspectRatio: '3/4', maxHeight: '55dvh' }
            : { width: '200px', aspectRatio: '3/4' }"
        >

          <!-- ── PLACEHOLDER (Modus gewählt, idle) ──────────────────── -->
          <div
            v-show="!isRecording && !isPreview"
            class="absolute inset-0 flex flex-col items-center justify-end pb-4"
          >
            <!-- Kamera-Sucher: entfernt -->
            <svg
              viewBox="0 0 200 267"
              class="hidden"
              fill="none"
              stroke="white"
              stroke-linecap="round"
            >
              <template v-if="selectedMode === 'face'">
                <!-- Gesichts-Oval: leichtes elliptisches Guide -->
                <ellipse cx="100" cy="108" rx="58" ry="74" stroke-width="1" opacity="0.18" stroke-dasharray="4 5"/>
                <!-- Mittelkreuz für Ausrichtung -->
                <line x1="94" y1="108" x2="106" y2="108" stroke-width="1" opacity="0.25"/>
                <line x1="100" y1="102" x2="100" y2="114" stroke-width="1" opacity="0.25"/>
              </template>
              <template v-else>
                <!-- Viewfinder-Ecken (Ganzkörper) -->
                <path d="M 30 74 L 30 44 L 60 44" stroke-width="2" opacity="0.32"/>
                <path d="M 170 74 L 170 44 L 140 44" stroke-width="2" opacity="0.32"/>
                <path d="M 30 193 L 30 223 L 60 223" stroke-width="2" opacity="0.32"/>
                <path d="M 170 193 L 170 223 L 140 223" stroke-width="2" opacity="0.32"/>
                <!-- Mittelkreuz -->
                <line x1="93" y1="133" x2="107" y2="133" stroke-width="1" opacity="0.20"/>
                <line x1="100" y1="126" x2="100" y2="140" stroke-width="1" opacity="0.20"/>
              </template>
            </svg>
          </div>

          <!-- ── LIVE-KAMERA (Vorschau + Aufnahme) ────────────────────── -->
          <video
            ref="liveEl"
            v-show="isRecording || isPreviewing"
            autoplay
            muted
            playsinline
            class="w-full h-full object-cover"
          ></video>

          <!-- ── OVERLAYS (nur während Aufnahme) ────────────────────── -->
          <template v-if="isRecording">

            <!-- Kamera-Sucher während Aufnahme (sehr subtil) -->
            <svg
              viewBox="0 0 200 267"
              class="absolute inset-0 w-full h-full pointer-events-none"
              fill="none"
              stroke="white"
              stroke-linecap="round"
            >
              <template v-if="selectedMode === 'face'">
                <ellipse cx="100" cy="108" rx="58" ry="74" stroke-width="1" opacity="0.08" stroke-dasharray="4 5"/>
              </template>
              <template v-else>
                <path d="M 30 74 L 30 44 L 60 44" stroke-width="1.5" opacity="0.15"/>
                <path d="M 170 74 L 170 44 L 140 44" stroke-width="1.5" opacity="0.15"/>
                <path d="M 30 193 L 30 223 L 60 223" stroke-width="1.5" opacity="0.15"/>
                <path d="M 170 193 L 170 223 L 140 223" stroke-width="1.5" opacity="0.15"/>
              </template>
            </svg>

            <!-- REC + Schritt-Dots (oben) -->
            <div class="absolute top-0 left-0 right-0 flex items-center justify-between px-2 pt-2 pointer-events-none">
              <div class="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500 soul-pulse flex-none"></span>
                <span class="text-xs text-red-400 font-mono tracking-[0.08em]">REC</span>
              </div>
              <!-- Fortschritts-Punkte -->
              <div class="flex items-center gap-1">
                <span
                  v-for="(_, i) in currentPrompts"
                  :key="i"
                  class="rounded-full transition-all duration-300"
                  :class="i === promptIndex
                    ? 'w-2 h-2 bg-white'
                    : i < promptIndex
                      ? 'w-1.5 h-1.5 bg-white/50'
                      : 'w-1.5 h-1.5 bg-white/20'"
                ></span>
              </div>
            </div>

            <!-- Prompt-Overlay (unten) -->
            <div v-if="currentPrompt" class="absolute bottom-0 left-0 right-0 pointer-events-none">
              <div class="bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8 pb-3 px-3">
                <p class="text-white text-xs font-semibold leading-snug">{{ currentPrompt.text }}</p>
                <p v-if="currentPrompt.sub" class="text-white/55 text-xs mt-0.5 leading-relaxed">{{ currentPrompt.sub }}</p>
                <div class="mt-2 h-0.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-none"
                    :class="isLastPrompt ? 'bg-white/30 w-full' : 'bg-red-400'"
                    :style="isLastPrompt ? {} : { width: promptCountdown + '%' }"
                  ></div>
                </div>
              </div>
            </div>

          </template>

          <!-- ── PREVIEW VIDEO ─────────────────────────────────────── -->
          <video
            ref="previewEl"
            v-show="isPreview"
            :src="lastSample?.url ?? ''"
            controls
            playsinline
            class="w-full h-full object-cover"
          ></video>

        </div>

        <!-- ── STEUERUNG ──────────────────────────────────────────────── -->
        <div
          :class="['flex flex-wrap items-center gap-2',
            embedded ? 'pt-2 border-t border-[var(--sys-border)]' : '']"
        >

          <!-- Zurück zur Modus-Auswahl (nur wenn nicht embedded und idle) -->
          <button
            v-if="!isRecording && !isPreview && !embedded"
            @click="selectedMode = null"
            class="sys-btn sys-btn-ghost flex items-center gap-1.5"
          >
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
            </svg>
            Zurück
          </button>

          <!-- Aufnehmen (idle) – M3 FAB-style -->
          <button
            v-if="!isRecording && !isPreview"
            @click="handleStart"
            class="sys-btn sys-fab mx-auto flex items-center gap-2 transition-all border border-white/20 bg-[rgba(255,255,255,0.08)] text-white/80 hover:bg-[rgba(255,255,255,0.14)]"
          >
            <span class="w-2.5 h-2.5 rounded-full bg-white flex-none"></span>
            Aufnehmen
          </button>

          <!-- Recording: Stopp + Weiter -->
          <template v-if="isRecording">
            <button
              @click="handleStop"
              class="sys-btn flex items-center gap-2 border border-red-900/50 bg-[rgba(239,68,68,0.12)] text-red-400 hover:bg-[rgba(239,68,68,0.2)] transition-all"
              :class="isLastPrompt ? 'mx-auto' : ''"
            >
              <span class="w-2.5 h-2.5 rounded-sm bg-red-400 flex-none"></span>
              Stopp
            </button>
            <button
              v-if="!isLastPrompt"
              @click="advancePrompt"
              class="sys-btn sys-btn-ghost flex items-center gap-1.5 ml-auto"
            >
              Weiter
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
              </svg>
            </button>
          </template>

          <!-- Preview: Verwerfen + (Weiter zu Bewegung) + Speichern -->
          <template v-if="isPreview">
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

            <!-- Weiter zu Bewegung (nur im Gesicht-Modus) -->
            <button
              v-if="initialMode === 'face'"
              @click="$emit('next-mode')"
              class="sys-btn flex items-center gap-1.5 border border-white/12 bg-[rgba(255,255,255,0.04)] text-white/55 hover:bg-[rgba(255,255,255,0.08)] transition-all"
            >
              Bewegung
              <svg class="w-3 h-3 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/>
              </svg>
            </button>
            <button
              @click="handleSave"
              :disabled="isSaving || (!vaultConnected && !soulToken)"
              class="sys-btn flex items-center gap-2 transition-all disabled:opacity-30"
              :class="saved
                ? 'border border-white/15 bg-[rgba(255,255,255,0.08)] text-white/65'
                : 'border border-white/12 bg-[rgba(255,255,255,0.05)] text-white/55 hover:bg-[rgba(255,255,255,0.09)]'"
              :title="(!vaultConnected && !soulToken) ? 'Vault verbinden oder Soul laden' : ''"
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

        <!-- Vault-Hinweis -->
        <p
          v-if="isPreview && !vaultConnected"
          :class="['text-xs text-[var(--sys-amber)] tracking-[0.06em] opacity-80',
            embedded ? 'px-4 pb-3' : '']"
        >
          Vault verbinden um das Bewegungsmuster dauerhaft zu speichern.
        </p>

      </div>

    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useMotion }     from "~/composables/useMotion.js";
import { useVault }      from "~/composables/useVault.js";
import { useSoul }       from "~/composables/useSoul.js";
import { useApiContext } from "~/composables/useApiContext.js";

const props = defineProps({
  soulMeta:    { type: Object,  default: null  },
  embedded:    { type: Boolean, default: false },
  // Wenn gesetzt: Modus-Auswahl überspringen, direkt zur Kamera
  initialMode: { type: String,  default: null  }  // 'face' | 'body'
});

const emit = defineEmits(["saved", "close", "next-mode"]);

const {
  isRecording, isPreview, isPreviewing, duration,
  lastSample, motionError,
  startCameraPreview, stopCameraPreview,
  startRecording, stopRecording, discardSample,
  formatDuration, setCaptureMode
} = useMotion();

const { isConnected: vaultConnected, writeFile } = useVault();
const { soulToken } = useSoul();
const { syncFile }  = useApiContext();

// ── Prompt-Sequenzen ──────────────────────────────────────────────────────────

const PROMPTS = {
  face: [
    { text: "Neutral – Blick gerade in die Kamera",    sub: "Baseline · Augen offen, ruhiges Gesicht",    secs: 5 },
    { text: "Natürlich lächeln",                       sub: "Echtes, entspanntes Lächeln",                secs: 4 },
    { text: "Breit lachen",                            sub: "Volle Emotion – Zähne zeigen",               secs: 4 },
    { text: "Nachdenklich schauen",                    sub: "Stirn leicht runzeln, Blick leicht weg",     secs: 4 },
    { text: "Überrascht – Augen weit öffnen",          sub: "Mundwinkel nach unten, Augenbrauen hoch",    secs: 3 },
    { text: "Zustimmend nicken",                       sub: "3× langsam und bewusst nicken",              secs: 5 },
    { text: "Kopf schütteln – Nein",                   sub: "3× langsam und bewusst schütteln",           secs: 5 },
    { text: "2 Sätze über dich laut sprechen",         sub: "Natürliche Mimik beim Sprechen",             secs: 8 },
    { text: "Blick links – Mitte – rechts",            sub: "Langsam und kontrolliert",                   secs: 5 },
    { text: "Fertig – frei weitermachen oder stoppen", sub: "",                                           secs: 0 },
  ],
  body: [
    { text: "Ganzkörper ins Bild bringen",             sub: "Kopf bis Füße vollständig im Bild?",         secs: 6 },
    { text: "Neutrale Haltung – Arme locker seitlich", sub: "Entspannte Referenz-Pose",                   secs: 5 },
    { text: "5 Schritte vor und zurück gehen",         sub: "Normaler, natürlicher Gang",                 secs: 7 },
    { text: "Jemanden begrüßen – winken",              sub: "Typische Willkommensgeste",                  secs: 5 },
    { text: "Sprich und gestikuliere dabei",           sub: "2–3 Sätze frei sprechen",                   secs: 8 },
    { text: "Arme weit ausbreiten – T-Pose",           sub: "Körpermaß-Referenz für Rigging",             secs: 5 },
    { text: "Langsam 360° drehen",                     sub: "Einmal komplett rundherum",                  secs: 8 },
    { text: "Sitzhaltung einnehmen falls möglich",     sub: "Sitz-Pose – Stuhl oder Boden",               secs: 6 },
    { text: "Fertig – frei weitermachen oder stoppen", sub: "",                                           secs: 0 },
  ]
};

// ── State ─────────────────────────────────────────────────────────────────────

// initialMode überspringt die Modus-Auswahl (für embedded/LiveProfile-Modus)
const selectedMode    = ref(props.initialMode ?? null);
const promptIndex     = ref(0);
const promptCountdown = ref(100);
const liveEl          = ref(null);
const previewEl       = ref(null);
const isSaving        = ref(false);
const saved           = ref(false);

let countdownTimer = null;

// ── Computed ──────────────────────────────────────────────────────────────────

const currentPrompts = computed(() =>
  selectedMode.value ? PROMPTS[selectedMode.value] : []
);

const currentPrompt = computed(() =>
  currentPrompts.value[promptIndex.value] ?? null
);

const isLastPrompt = computed(() =>
  !currentPrompt.value ||
  currentPrompt.value.secs === 0 ||
  promptIndex.value >= currentPrompts.value.length - 1
);

// ── Prompt-Sequenz ────────────────────────────────────────────────────────────

function startPromptSequence() {
  promptIndex.value = 0;
  runPromptTimer();
}

function runPromptTimer() {
  clearTimer();
  const p = currentPrompts.value[promptIndex.value];
  if (!p || p.secs === 0) { promptCountdown.value = 0; return; }

  promptCountdown.value = 100;
  const decrement = 100 / (p.secs * 10);

  countdownTimer = setInterval(() => {
    promptCountdown.value = Math.max(0, promptCountdown.value - decrement);
    if (promptCountdown.value <= 0) advancePrompt();
  }, 100);
}

function advancePrompt() {
  clearTimer();
  if (promptIndex.value < currentPrompts.value.length - 1) {
    promptIndex.value++;
    runPromptTimer();
  }
}

function clearTimer() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

// ── Aufnahme ──────────────────────────────────────────────────────────────────

async function handleStart() {
  saved.value = false;
  setCaptureMode(selectedMode.value);
  await startRecording(liveEl.value);
  if (isRecording.value) startPromptSequence();
}

async function handleOpenCamera() {
  setCaptureMode(selectedMode.value);
  await startCameraPreview(liveEl.value);
}

async function handleStop() {
  clearTimer();
  await stopRecording(liveEl.value);
}

function handleDiscard() {
  if (previewEl.value) { previewEl.value.pause(); previewEl.value.src = ""; }
  discardSample(liveEl.value);
  saved.value = false;
}

// ── Speichern ─────────────────────────────────────────────────────────────────

async function handleSave() {
  if (!lastSample.value || isSaving.value) return;
  isSaving.value = true;
  try {
    const { blob, mimeType, width, height, fps, duration: dur, date, ts, mode } = lastSample.value;

    const ext       = mimeType?.includes("webm") ? "webm" : "mp4";
    const speakerId = props.soulMeta?.id?.slice(0, 8) || "user";
    const filename  = `motion_${mode ?? "body"}_${speakerId}_${date}.${ext}`;

    if (vaultConnected.value) {
      await writeFile(`motion_samples/${filename}`, blob);

    const profile = {
      $schema:        "saveyoursoul/motion-profile/1.0",
      schema_version: "1.0",
      subject: {
        id:           props.soulMeta?.id?.slice(0, 8) || "user",
        display_name: props.soulMeta?.name || "Unbekannt"
      },
      samples: [{
        file:             filename,
        format:           mimeType || "video/webm",
        capture_mode:     mode ?? "body",
        width,
        height,
        fps:              Math.round(fps),
        duration_seconds: dur,
        content:          mode === "face" ? "facial_expression_sequence" : "full_body_movement_sequence",
        recorded:         ts
      }],
      intended_use:    ["motion_synthesis", "gesture_recognition", "humanoid_robotics", "avatar_animation"],
      compatible_with: ["MediaPipe", "OpenPose", "MoveNet", "HumanML3D", "MDM"],
      created: date,
      updated: date
    };

      await writeFile(
        "motion_samples/motion_profile.json",
        new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" })
      );
    } else if (soulToken.value) {
      // Mobile / kein Vault: direkt zum VPS hochladen
      await syncFile(soulToken.value, "video", filename, blob);
    }

    saved.value = true;
    emit("saved", filename);
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (e) {
    console.error("[MotionRecorder] save error:", e);
  } finally {
    isSaving.value = false;
  }
}

// ── Schließen ─────────────────────────────────────────────────────────────────

function handleClose() {
  clearTimer();
  if (isRecording.value) stopRecording(liveEl.value).then(() => discardSample(liveEl.value));
  else if (isPreviewing.value) stopCameraPreview(liveEl.value);
  if (previewEl.value) { previewEl.value.pause(); previewEl.value.src = ""; }
  emit("close");
}

onMounted(async () => {
  // useMotion ist ein Singleton – Reset beim Mount wenn noch alter State hängt
  if (props.embedded && (isPreview.value || isRecording.value)) {
    if (isRecording.value) stopRecording(liveEl.value).catch(() => {});
    discardSample(liveEl.value);
  }
  // Kamera sofort öffnen wenn Modus bereits gesetzt (initialMode)
  if (selectedMode.value && !isPreviewing.value && !isRecording.value) {
    await handleOpenCamera();
  }
});

onUnmounted(() => {
  clearTimer();
  if (isRecording.value) stopRecording(liveEl.value).catch(() => {});
  else if (isPreviewing.value) stopCameraPreview(liveEl.value);
});
</script>
