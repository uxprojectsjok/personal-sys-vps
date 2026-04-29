<template>
  <div class="flex items-center gap-3 px-4 py-3 border-b border-[var(--sys-border)] bg-[var(--sys-bg-elevated)]">
    <!-- Audiodatei laden (lokal) -->
    <VaultUpload @file-loaded="loadAudio" />

    <!-- Play/Pause -->
    <button
      @click="togglePlay"
      :disabled="!hasTrack"
      :aria-label="isPlaying ? 'Pause' : 'Abspielen'"
      class="w-11 h-11 flex items-center justify-center rounded-full border border-[var(--sys-border)] hover:border-[var(--sys-border-accent)] hover:bg-[var(--sys-accent-glow)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <!-- Play -->
      <svg v-if="!isPlaying" class="w-4 h-4 text-[var(--sys-fg)] ml-0.5" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      <!-- Pause -->
      <svg v-else class="w-4 h-4 text-[var(--sys-fg)]" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    </button>

    <!-- Track-Name -->
    <div class="flex-1 min-w-0">
      <p class="text-xs text-[var(--sys-fg-muted)] truncate">
        {{ currentTrack || "Kein Track geladen" }}
      </p>
      <!-- Progress Bar -->
      <div
        v-if="hasTrack"
        class="mt-1.5 h-0.5 bg-[var(--sys-border)] rounded-full overflow-hidden cursor-pointer"
        @click="seekTo"
      >
        <div
          class="h-full bg-[var(--sys-accent)] transition-all duration-500"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>
    </div>

    <!-- Schließen -->
    <button
      @click="$emit('close')"
      aria-label="Player schließen"
      class="w-11 h-11 flex items-center justify-center text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] transition"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- Verstecktes Audio-Element -->
    <audio
      ref="audioEl"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoaded"
    ></audio>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from "vue";
import VaultUpload from "~/components/VaultUpload.vue";
import { usePlayer } from "~/composables/usePlayer.js";
import { useVault } from "~/composables/useVault.js";

defineEmits(["close"]);

const { currentTrack, isPlaying, hasTrack, setTrack, setPlaying } = usePlayer();
const { writeFile, isConnected } = useVault();

const audioEl = ref(null);
const currentTime = ref(0);
const duration = ref(0);
let objectUrl = null;

const progressPercent = computed(() =>
  duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0
);

async function loadAudio(file) {
  if (!file) return;

  if (objectUrl) URL.revokeObjectURL(objectUrl);

  objectUrl = URL.createObjectURL(file);
  setTrack(file.name.replace(/\.[^.]+$/, "")); // Ohne Extension
  audioEl.value.src = objectUrl;
  audioEl.value.load();
  audioEl.value.play().then(() => setPlaying(true)).catch(() => setPlaying(false));

  // Automatisch in Vault speichern – damit syncAll() die Datei findet
  if (isConnected.value) {
    await writeFile("voice_samples/" + file.name, file);
  }
}

function togglePlay() {
  if (!audioEl.value?.src) return;
  if (isPlaying.value) {
    audioEl.value.pause();
    setPlaying(false);
  } else {
    audioEl.value.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }
}

function seekTo(e) {
  if (!duration.value || !audioEl.value) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  audioEl.value.currentTime = ratio * duration.value;
}

function onEnded() {
  setPlaying(false);
}

function onTimeUpdate() {
  currentTime.value = audioEl.value?.currentTime ?? 0;
}

function onLoaded() {
  duration.value = audioEl.value?.duration ?? 0;
}

onUnmounted(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
</script>
