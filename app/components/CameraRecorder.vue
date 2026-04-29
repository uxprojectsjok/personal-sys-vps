<template>
  <Teleport to="body">
    <Transition name="sys-fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[300] bg-black flex flex-col"
        style="padding-top: env(safe-area-inset-top)"
      >

        <!-- ── Caption-Schritt (nach Aufnahme) ───────────────────────────── -->
        <template v-if="captionMode">
          <!-- Vorschau -->
          <div class="flex-1 relative overflow-hidden bg-black">
            <img
              v-if="captureBuffer?.type === 'photo'"
              :src="captureBuffer.url"
              class="w-full h-full object-cover"
              alt=""
            />
            <video
              v-else-if="captureBuffer?.type === 'video'"
              :src="captureBuffer.url"
              class="w-full h-full object-cover"
              muted
              playsinline
              autoplay
              loop
            ></video>
            <!-- Dimm-Overlay für Lesbarkeit -->
            <div class="absolute inset-0 bg-black/30"></div>
          </div>

          <!-- Caption-Eingabe -->
          <div
            class="flex-none px-6 py-4 bg-black/80 backdrop-blur-sm flex flex-col gap-3"
            style="padding-bottom: max(env(safe-area-inset-bottom, 0px), 1.5rem)"
          >
            <p class="text-xs text-white/40 tracking-[0.18em] uppercase text-center">
              {{ captureBuffer?.type === 'video' ? 'Was hast du gesagt?' : 'Was soll ich dazu wissen?' }}
            </p>
            <p class="text-xs text-white/25 text-center -mt-1">
              Verwende das Mikro oder tippe ein…
            </p>
            <div class="relative">
              <textarea
                ref="captionInput"
                v-model="captionText"
                placeholder="Schreib oder sprich etwas dazu…"
                class="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/30 transition-colors"
                rows="2"
                maxlength="280"
                @keydown.enter.prevent="submitCapture"
              ></textarea>
              <!-- Mic-Button (nach Aufnahme frei verfügbar) -->
              <button
                @click="startListening"
                :class="isListening ? 'text-red-400' : 'text-white/40 hover:text-white/70'"
                class="absolute right-3 bottom-3 transition-colors"
                type="button"
                :aria-label="isListening ? 'Hört zu…' : 'Sprechen'"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Zm6.5 10.5a.75.75 0 0 1 .75.75A7.25 7.25 0 0 1 12.75 19.4V22h-1.5v-2.6A7.25 7.25 0 0 1 4.75 12.25a.75.75 0 0 1 1.5 0A5.75 5.75 0 0 0 12 18a5.75 5.75 0 0 0 5.75-5.75.75.75 0 0 1 .75-.75Z"/>
                </svg>
              </button>
            </div>
            <div class="flex gap-3">
              <button
                @click="cancelCaption"
                class="flex-1 py-2.5 rounded-xl border border-white/15 text-sm text-white/50 hover:text-white hover:border-white/30 transition-all"
              >
                Verwerfen
              </button>
              <button
                @click="submitCapture"
                class="flex-1 py-2.5 rounded-xl bg-white/10 border border-white/20 text-sm text-white font-medium hover:bg-white/20 transition-all"
              >
                Senden
              </button>
            </div>
          </div>
        </template>

        <!-- ── Kamera-Ansicht ─────────────────────────────────────────────── -->
        <template v-else>
          <!-- Live-Vorschau -->
          <div class="flex-1 relative overflow-hidden bg-black">
            <video
              ref="videoEl"
              class="w-full h-full object-cover"
              :class="facingMode === 'user' ? 'scale-x-[-1]' : ''"
              playsinline
              muted
              autoplay
            ></video>

            <!-- Aufnahme-Indikator -->
            <div
              v-if="isRecording"
              class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-sm"
            >
              <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-none"></span>
              <span class="text-xs text-white font-mono tracking-widest">
                {{ formatDuration(recDuration) }}
              </span>
              <svg class="w-3 h-3 text-white/60 flex-none" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4Zm6.5 10.5a.75.75 0 0 1 .75.75A7.25 7.25 0 0 1 12.75 19.4V22h-1.5v-2.6A7.25 7.25 0 0 1 4.75 12.25a.75.75 0 0 1 1.5 0A5.75 5.75 0 0 0 12 18a5.75 5.75 0 0 0 5.75-5.75.75.75 0 0 1 .75-.75Z"/>
              </svg>
            </div>

            <!-- Ladeindikator -->
            <div
              v-if="!streamReady && !previewError"
              class="absolute inset-0 flex items-center justify-center"
            >
              <span class="text-xs text-white/50 tracking-[0.2em] uppercase animate-pulse">
                Kamera…
              </span>
            </div>

            <!-- Kamera-Fehler -->
            <div
              v-if="previewError"
              class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
            >
              <svg class="w-8 h-8 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/>
              </svg>
              <p class="text-sm text-white/50">Kamera nicht verfügbar</p>
              <button
                @click="cancel"
                class="px-4 py-1.5 rounded-full border border-white/20 text-xs text-white/60 hover:text-white hover:border-white/40 transition-all"
              >
                Schließen
              </button>
            </div>

            <!-- Ladekreis beim Halten -->
            <div
              v-if="isCharging && !isRecording && streamReady"
              class="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <svg class="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
                <circle
                  cx="48" cy="48" r="44"
                  fill="none" stroke="white" stroke-width="3" stroke-linecap="round"
                  :stroke-dasharray="276.46"
                  :stroke-dashoffset="276.46 * (1 - chargeProgress)"
                  style="transition: stroke-dashoffset 60ms linear"
                />
              </svg>
            </div>
          </div>

          <!-- Steuerungsleiste -->
          <div
            class="flex-none flex items-center justify-between px-8"
            style="padding-top: 1.5rem; padding-bottom: max(env(safe-area-inset-bottom, 0px), 2rem)"
          >
            <!-- Abbrechen -->
            <button
              @click="cancel"
              class="w-12 h-12 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Abbrechen"
            >
              <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
              </svg>
            </button>

            <!-- Auslöser -->
            <button
              class="w-20 h-20 rounded-full flex items-center justify-center select-none touch-none transition-all duration-150"
              :class="isRecording
                ? 'bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.35)]'
                : 'bg-white/10 border-4 border-white shadow-[0_0_0_0px_rgba(255,255,255,0.15)] hover:shadow-[0_0_0_4px_rgba(255,255,255,0.15)]'"
              :disabled="!streamReady && !isRecording"
              @mousedown.prevent="holdStart"
              @mouseup.prevent="holdEnd"
              @mouseleave="holdCancel"
              @touchstart.prevent="holdStart"
              @touchend.prevent="holdEnd"
              @touchcancel="holdCancel"
              aria-label="Aufnehmen"
            >
              <span v-if="isRecording" class="w-7 h-7 rounded-md bg-white"></span>
              <span v-else class="w-14 h-14 rounded-full" :class="isCharging ? 'bg-white/60' : 'bg-white'"></span>
            </button>

            <!-- Kamera-Switch / Stopp-Indikator -->
            <div class="w-12 h-12 flex flex-col items-center justify-center gap-1">
              <button
                v-if="!isRecording"
                @click="switchCamera"
                :disabled="isSwitching"
                class="w-12 h-12 flex flex-col items-center justify-center gap-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all"
                aria-label="Kamera wechseln"
              >
                <svg
                  class="w-6 h-6"
                  :class="isSwitching ? 'animate-spin' : ''"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>
                </svg>
                <span class="text-xs tracking-wide">{{ facingMode === 'user' ? 'Selfie' : 'Umgebung' }}</span>
              </button>
              <div v-else class="flex flex-col items-center justify-center gap-1 text-red-400/70">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/>
                </svg>
                <span class="text-xs tracking-wide text-white/40">Video</span>
              </div>
            </div>
          </div>

          <!-- Hinweistext -->
          <div
            v-if="streamReady && !isRecording && !isCharging"
            class="absolute text-center pointer-events-none"
            style="bottom: max(calc(env(safe-area-inset-bottom, 0px) + 104px), 120px); left: 0; right: 0"
          >
            <p class="text-xs text-white/35 tracking-[0.18em] uppercase">
              Tippen = Foto · 2 Sek. halten = Video
            </p>
          </div>
        </template>

      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from "vue";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(["captured", "cancel"]);

const videoEl       = ref(null);
const captionInput  = ref(null);
const streamReady   = ref(false);
const previewError  = ref(false);
const isCharging    = ref(false);
const chargeProgress = ref(0);
const isRecording   = ref(false);
const recDuration   = ref(0);
const facingMode    = ref("user");   // "user" = Selfie, "environment" = Hauptkamera
const isSwitching   = ref(false);

// Caption-Schritt
const captionMode    = ref(false);
const captionText    = ref("");
const captureBuffer  = ref(null);
const isListening    = ref(false);

let previewStream    = null;
let mediaRecorder    = null;
let recordingChunks  = [];
let holdTimer        = null;
let chargeInterval   = null;
let durationInterval = null;
let speechRecognition = null;
let speechTranscript  = "";

const HOLD_MS = 2000;

// ── Stream-Lifecycle ──────────────────────────────────────────────────────────

watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      streamReady.value   = false;
      previewError.value  = false;
      captionMode.value   = false;
      captureBuffer.value = null;
      captionText.value   = "";
      await startPreview();
    } else {
      cleanup();
    }
  }
);

async function startPreview() {
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode.value, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (videoEl.value) {
      videoEl.value.srcObject = previewStream;
      await videoEl.value.play().catch(() => {});
    }
    streamReady.value = true;
  } catch (e) {
    console.error("[CameraRecorder] Preview:", e);
    previewError.value = true;
  }
}

function stopPreview() {
  if (previewStream) {
    previewStream.getTracks().forEach((t) => t.stop());
    previewStream = null;
  }
  if (videoEl.value) videoEl.value.srcObject = null;
  streamReady.value = false;
}

async function switchCamera() {
  if (isRecording.value || isSwitching.value) return;
  isSwitching.value = true;
  stopPreview();
  facingMode.value = facingMode.value === "user" ? "environment" : "user";
  await startPreview();
  isSwitching.value = false;
}

function cleanup() {
  clearTimeout(holdTimer);
  clearInterval(chargeInterval);
  clearInterval(durationInterval);
  isCharging.value = false;
  chargeProgress.value = 0;
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch {}
    speechRecognition = null;
  }
  if (isRecording.value && mediaRecorder?.state !== "inactive") {
    mediaRecorder?.stop();
  }
  isRecording.value   = false;
  captionMode.value   = false;
  captureBuffer.value = null;
  stopPreview();
}

// ── Foto-Aufnahme ─────────────────────────────────────────────────────────────

async function takePhoto() {
  if (!previewStream || !videoEl.value) return null;
  const video  = videoEl.value;
  const canvas = document.createElement("canvas");
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  // Frontkamera: Spiegelung im Canvas rückgängig machen (Preview ist gespiegelt via CSS)
  if (facingMode.value === "user") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  const blob   = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  const url    = URL.createObjectURL(blob);
  const base64 = await blobToBase64(blob);
  return { type: "photo", blob, url, base64, frameBase64: base64, mimeType: "image/jpeg" };
}

// ── Video-Aufnahme ────────────────────────────────────────────────────────────

async function startVideoRecording() {
  stopPreview();
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode.value, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
  } catch {
    previewStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode.value },
      audio: false,
    });
  }

  if (videoEl.value) {
    videoEl.value.srcObject = previewStream;
    await videoEl.value.play().catch(() => {});
  }

  recordingChunks = [];
  const mime = bestMime();
  mediaRecorder = new MediaRecorder(previewStream, mime ? { mimeType: mime } : {});
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunks.push(e.data); };
  mediaRecorder.start(200);
  isRecording.value = true;
  recDuration.value = 0;
  durationInterval = setInterval(() => { recDuration.value++; }, 1000);
}

async function stopVideoRecording() {
  clearInterval(durationInterval);
  const transcript = speechTranscript.trim();
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch {}
    speechRecognition = null;
  }
  if (!mediaRecorder || mediaRecorder.state === "inactive") return null;

  await new Promise((r) => { mediaRecorder.onstop = r; mediaRecorder.stop(); });

  const mimeType    = mediaRecorder.mimeType || "video/webm";
  const blob        = new Blob(recordingChunks, { type: mimeType });
  const url         = URL.createObjectURL(blob);
  const base64      = await blobToBase64(blob);
  const frameBase64 = await extractFrame(blob);

  stopPreview();
  isRecording.value = false;

  return { type: "video", blob, url, base64, frameBase64, mimeType, transcript };
}

// ── Caption-Schritt ───────────────────────────────────────────────────────────

async function enterCaptionMode(capture) {
  captureBuffer.value = capture;
  captionText.value   = capture.transcript ?? "";
  captionMode.value   = true;
  await nextTick();
  captionInput.value?.focus();
}

function submitCapture() {
  if (!captureBuffer.value) return;
  const final = {
    ...captureBuffer.value,
    caption: captionText.value.trim(),
  };
  captionMode.value   = false;
  captureBuffer.value = null;
  captionText.value   = "";
  emit("captured", final);
}

function startListening() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  try {
    if (speechRecognition) { try { speechRecognition.stop(); } catch {} }
    speechRecognition = new SpeechRec();
    speechRecognition.continuous     = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = navigator.language || "de-DE";
    speechRecognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join(" ");
      captionText.value = (captionText.value + " " + t).trim();
    };
    speechRecognition.onerror = () => { isListening.value = false; };
    speechRecognition.onend   = () => { isListening.value = false; };
    speechRecognition.start();
    isListening.value = true;
  } catch { isListening.value = false; }
}

function cancelCaption() {
  captionMode.value   = false;
  captureBuffer.value = null;
  captionText.value   = "";
  startPreview();
}

// ── Hold-Logik ────────────────────────────────────────────────────────────────

function holdStart() {
  if (previewError.value || !streamReady.value) return;
  if (isRecording.value) return;
  isCharging.value = true;
  chargeProgress.value = 0;
  const t0 = Date.now();
  chargeInterval = setInterval(() => {
    chargeProgress.value = Math.min((Date.now() - t0) / HOLD_MS, 1);
  }, 50);
  holdTimer = setTimeout(async () => {
    clearInterval(chargeInterval);
    isCharging.value = false;
    await startVideoRecording();
  }, HOLD_MS);
}

async function holdEnd() {
  if (isRecording.value) {
    const capture = await stopVideoRecording();
    if (capture) await enterCaptionMode(capture);
    return;
  }
  clearTimeout(holdTimer);
  clearInterval(chargeInterval);
  if (isCharging.value) {
    isCharging.value = false;
    chargeProgress.value = 0;
    const capture = await takePhoto();
    if (capture) await enterCaptionMode(capture);
  }
}

function holdCancel() {
  clearTimeout(holdTimer);
  clearInterval(chargeInterval);
  isCharging.value = false;
  chargeProgress.value = 0;
}

function cancel() {
  holdCancel();
  if (isRecording.value && mediaRecorder?.state !== "inactive") mediaRecorder?.stop();
  emit("cancel");
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function bestMime() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

function extractFrame(videoBlob) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url   = URL.createObjectURL(videoBlob);
    video.src = url; video.muted = true; video.playsInline = true; video.currentTime = 0.1;
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 360;
      canvas.getContext("2d").drawImage(video, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => blobToBase64(b).then(resolve).catch(() => resolve(null)), "image/jpeg", 0.82);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.load();
  });
}

function formatDuration(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

onUnmounted(() => { cleanup(); });
</script>
