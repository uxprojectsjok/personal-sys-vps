// app/composables/usePlayer.js
// Singleton-State für den Media Player – alle Komponenten teilen denselben Track-Zustand.
import { ref, computed } from "vue";

// Modul-Scope Singleton
const currentTrack = ref(""); // Dateiname ohne Extension
const isPlaying = ref(false);

const hasTrack = computed(() => Boolean(currentTrack.value));

export function usePlayer() {
  function setTrack(name) {
    currentTrack.value = name;
  }

  function setPlaying(val) {
    isPlaying.value = val;
  }

  return {
    currentTrack,
    isPlaying,
    hasTrack,
    setTrack,
    setPlaying
  };
}
