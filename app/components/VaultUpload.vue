<template>
  <label
    class="w-10 h-10 flex items-center justify-center rounded-lg border border-[var(--sys-border)] hover:border-[var(--sys-border-accent)] hover:bg-[var(--sys-accent-glow)] cursor-pointer transition-all duration-200"
    title="Audiodatei laden"
  >
    <svg class="w-4 h-4 text-[var(--sys-fg-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
    </svg>
    <input
      type="file"
      accept="audio/*"
      class="hidden"
      @change="handleFile"
    />
  </label>
</template>

<script setup>
const emit = defineEmits(["file-loaded"]);

function handleFile(e) {
  const file = e.target.files?.[0];
  if (file) {
    emit("file-loaded", file);
    e.target.value = "";
  }
}
</script>
