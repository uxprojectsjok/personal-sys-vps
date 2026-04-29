// app/composables/useVoice.js
// MediaRecorder-Composable für Stimmproben-Aufnahme
// Singleton-State: bleibt über Komponenten-Mounts hinaus erhalten

import { ref } from "vue";

// Singleton-State
const isRecording  = ref(false);
const isPreview    = ref(false);
const level        = ref(0);    // 0–100, aktueller Mikrofon-Pegel
const duration     = ref(0);    // Sekunden seit Aufnahme-Start
const lastSample   = ref(null); // { blob, url, mimeType, duration, date, ts }
const voiceError   = ref(null);

// Feste Sensitivitätswerte pro Balken für natürliche Pegelanzeige
const BAR_SEEDS = [0.85, 1.20, 0.65, 1.45, 0.90, 1.30, 0.75, 1.10, 0.80, 1.35, 0.70, 1.00];

export function useVoice() {
  let mediaRecorder  = null;
  let stream         = null;
  let analyser       = null;
  let audioCtx       = null;
  let chunks         = [];
  let durationTimer  = null;
  let levelTimer     = null;
  let previewUrl     = null;

  // ── Aufnahme starten ───────────────────────────────────────────────────────

  async function startRecording() {
    voiceError.value = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Pegel-Analyse via Web Audio API
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      levelTimer = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        level.value = Math.min(100, Math.round(avg * 2.2));
      }, 50);

      // MediaRecorder: WebM/Opus > WebM > MP4 (iOS) > Systemstandard
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        MediaRecorder.isTypeSupported("audio/webm")             ? "audio/webm"             :
        MediaRecorder.isTypeSupported("audio/mp4")              ? "audio/mp4"              :
        "";
      chunks = [];
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.start(100); // 100ms-Chunks

      isRecording.value = true;
      duration.value    = 0;
      durationTimer = setInterval(() => { duration.value++; }, 1000);
    } catch (e) {
      voiceError.value =
        e.name === "NotAllowedError"  ? "Mikrofon-Zugriff verweigert." :
        e.name === "NotFoundError"    ? "Kein Mikrofon gefunden."       :
        "Mikrofon nicht verfügbar.";
    }
  }

  // ── Aufnahme stoppen ───────────────────────────────────────────────────────

  function stopRecording() {
    return new Promise(resolve => {
      if (!mediaRecorder || mediaRecorder.state === "inactive") return resolve(null);

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob     = new Blob(chunks, { type: mimeType });

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);

        lastSample.value = {
          blob,
          url:      previewUrl,
          mimeType,
          duration: duration.value,
          date:     new Date().toISOString().split("T")[0],
          ts:       new Date().toISOString()
        };
        isPreview.value = true;
        resolve(blob);
      };

      clearInterval(levelTimer);
      clearInterval(durationTimer);
      mediaRecorder.stop();
      stream?.getTracks().forEach(t => t.stop());
      audioCtx?.close().catch(() => {});
      isRecording.value = false;
      level.value       = 0;
    });
  }

  // ── Sample verwerfen ───────────────────────────────────────────────────────

  function discardSample() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl       = null;
    lastSample.value = null;
    isPreview.value  = false;
    duration.value   = 0;
  }

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────

  function formatDuration(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  /** Balkenhöhe für Pegel-Meter (0–100), Index 1–12 */
  function barHeight(i) {
    const lv = level.value;
    if (lv < 3) return 8;
    return Math.min(100, Math.max(8, lv * (BAR_SEEDS[i - 1] ?? 1)));
  }

  return {
    isRecording,
    isPreview,
    level,
    duration,
    lastSample,
    voiceError,
    startRecording,
    stopRecording,
    discardSample,
    formatDuration,
    barHeight
  };
}
