<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        role="dialog"
        :aria-modal="true"
        :aria-labelledby="title ? 'modal-title' : undefined"
        class="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 pb-safe"
        @click.self="$emit('cancel')"
        @keydown.esc="$emit('cancel')"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden="true"></div>

        <!-- Panel -->
        <Transition name="slide-up">
          <div
            v-if="open"
            ref="panelEl"
            class="relative w-full max-w-sm bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] rounded-2xl p-6 shadow-2xl"
            @keydown.tab="trapFocus"
          >
            <h3
              v-if="title"
              id="modal-title"
              class="text-base font-medium mb-3 tracking-wide text-[var(--sys-fg)]"
            >
              {{ title }}
            </h3>

            <div class="font-content text-sm text-[var(--sys-fg-muted)] mb-6 leading-relaxed">
              <slot />
            </div>

            <div class="flex gap-3">
              <button
                v-if="!hideCancel"
                @click="$emit('cancel')"
                class="flex-1 py-3 rounded-xl border border-[var(--sys-border)] text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.15)] transition text-sm min-h-[48px]"
              >
                {{ cancelText }}
              </button>
              <button
                @click="$emit('confirm')"
                :class="danger
                ? 'bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.25)] text-red-300 hover:bg-[rgba(239,68,68,0.2)] hover:border-[rgba(239,68,68,0.4)]'
                : 'bg-[rgba(232,80,0,0.10)] border-[rgba(232,80,0,0.30)] text-[var(--sys-orange)] hover:bg-[rgba(232,80,0,0.18)] hover:border-[rgba(232,80,0,0.45)]'"
              class="flex-1 py-3 rounded-xl border transition text-sm min-h-[48px]"
              >
                {{ confirmText }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";

const props = defineProps({
  open:        { type: Boolean, default: false },
  title:       { type: String,  default: "" },
  confirmText: { type: String,  default: "Bestätigen" },
  cancelText:  { type: String,  default: "Abbrechen" },
  hideCancel:  { type: Boolean, default: false },
  danger:      { type: Boolean, default: true },
});

defineEmits(["confirm", "cancel"]);

const panelEl   = ref(null);
let previousFocus = null;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

watch(() => props.open, async (val) => {
  if (val) {
    previousFocus = document.activeElement;
    await nextTick();
    panelEl.value?.querySelector(FOCUSABLE)?.focus();
  } else {
    previousFocus?.focus();
  }
});

function trapFocus(e) {
  const focusable = Array.from(panelEl.value?.querySelectorAll(FOCUSABLE) ?? []);
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
</script>
