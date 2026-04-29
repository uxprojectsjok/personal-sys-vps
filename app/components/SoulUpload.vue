<template>
  <div>
    <label
      class="flex items-center justify-between gap-4 h-14 px-5 rounded-xl border cursor-pointer transition-all duration-200 w-full"
      :class="dragActive
        ? 'border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.06)]'
        : 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.20)]'"
      @dragenter.prevent="dragActive = true"
      @dragleave.prevent="dragActive = false"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <span class="text-sm font-semibold transition-colors duration-200"
        :class="dragActive ? 'text-white/90' : 'text-white/75'">
        sys.md laden
      </span>

      <svg
        class="w-4 h-4 flex-none transition-colors duration-200"
        :class="dragActive ? 'text-[var(--sys-accent)]' : 'text-[var(--sys-fg-dim)]'"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>

      <input
        ref="fileInput"
        type="file"
        accept=".md,text/markdown,text/plain"
        class="hidden"
        @change="handleFileInput"
      />
    </label>

    <p v-if="errorMsg" class="mt-2 text-xs tracking-[0.1em] text-red-400 uppercase px-1">
      {{ errorMsg }}
    </p>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { validateSoul } from "#shared/utils/soulParser.js";

const emit = defineEmits(["uploaded"]);

const fileInput = ref(null);
const dragActive = ref(false);
const errorMsg = ref("");

async function readFile(file) {
  errorMsg.value = "";

  if (!file) return;
  if (!file.name.endsWith(".md") && file.type !== "text/markdown" && file.type !== "text/plain") {
    errorMsg.value = "Bitte eine .md Datei hochladen.";
    return;
  }

  try {
    const text = await file.text();
    const { valid, error } = validateSoul(text);

    if (!valid) {
      errorMsg.value = error || "Keine gültige sys.md Datei.";
      return;
    }

    emit("uploaded", text);
  } catch (e) {
    errorMsg.value = "Fehler beim Lesen der Datei.";
    console.error("[SoulUpload]", e);
  }
}

function handleFileInput(e) {
  const file = e.target.files?.[0];
  if (file) readFile(file);
  // Input zurücksetzen damit dieselbe Datei erneut hochgeladen werden kann
  e.target.value = "";
}

function handleDrop(e) {
  dragActive.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) readFile(file);
}
</script>
