<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        @click.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="$emit('close')"></div>

        <div
          class="relative w-full sm:max-w-xl max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="datenschutz-title"
        >
          <!-- Header -->
          <div class="flex-none flex items-center justify-between px-5 py-4 border-b border-[var(--sys-border)]">
            <h2 id="datenschutz-title" class="text-sm font-medium text-[var(--sys-fg)] tracking-wide">Datenschutzerklärung</h2>
            <button
              @click="$emit('close')"
              class="w-11 h-11 flex items-center justify-center rounded-lg text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] hover:bg-[var(--sys-bg-overlay)] transition"
              aria-label="Schließen"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Content – Quelle: components/legal/DatenschutzContent.vue -->
          <div class="flex-1 overflow-y-auto px-5 py-5">
            <LegalDatenschutzContent />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onUnmounted, watch } from "vue";

const props = defineProps({
  isOpen: { type: Boolean, default: false }
});

const emit = defineEmits(["close"]);

function onKeydown(e) {
  if (e.key === "Escape") emit("close");
}

watch(() => props.isOpen, (val) => {
  if (val) {
    document.addEventListener("keydown", onKeydown);
    document.body.style.overflow = "hidden";
  } else {
    document.removeEventListener("keydown", onKeydown);
    document.body.style.overflow = "";
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 200ms ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
