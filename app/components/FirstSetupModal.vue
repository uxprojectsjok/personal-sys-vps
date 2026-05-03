<template>
  <div
    v-if="token"
    class="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="first-setup-title"
  >
    <div class="relative w-full max-w-lg bg-[var(--sys-bg-elevated)] border border-amber-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--sys-border)]">
        <i class="ri-shield-keyhole-line text-2xl text-amber-400"></i>
        <h2 id="first-setup-title" class="text-lg font-bold text-amber-300">
          Erste Instanz — Admin-Token sichern
        </h2>
      </div>

      <!-- Body -->
      <div class="px-6 py-5 flex flex-col gap-4">
        <p class="text-[var(--sys-fg-muted)] text-sm leading-relaxed">
          Diese Instanz wurde gerade initialisiert. Dein Admin-Token wurde automatisch generiert.<br>
          <strong class="text-[var(--sys-fg)]">Er wird nur dieses eine Mal angezeigt</strong> — ohne ihn kannst du keine Schlüssel rotieren oder die Instanz administrieren.
        </p>

        <!-- Token display -->
        <div class="bg-[var(--sys-bg)] border border-amber-500/30 rounded-xl p-4 flex flex-col gap-3">
          <label class="text-xs text-[var(--sys-fg-dim)] uppercase tracking-wider">Admin-Token</label>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-amber-300 text-sm font-mono break-all select-all">{{ token }}</code>
            <button
              @click="copyToken"
              :class="copied ? 'text-green-400' : 'text-[var(--sys-fg-muted)] hover:text-amber-300'"
              class="shrink-0 p-2 rounded-lg transition-colors"
              aria-label="Token kopieren"
            >
              <i :class="copied ? 'ri-check-line' : 'ri-clipboard-line'" class="text-xl"></i>
            </button>
          </div>
        </div>

        <div class="shad-alert-destructive text-sm">
          <i class="ri-error-warning-line mr-2"></i>
          Speichere diesen Token jetzt in einem Passwort-Manager. Er wird nicht erneut angezeigt und ist nicht wiederherstellbar.
        </div>

        <!-- Confirmation -->
        <label class="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" v-model="confirmed" class="w-4 h-4 accent-amber-400" />
          <span class="text-sm text-[var(--sys-fg-muted)]">
            Ich habe den Token sicher gespeichert.
          </span>
        </label>
      </div>

      <!-- Footer -->
      <div class="px-6 pb-6">
        <button
          @click="dismiss"
          :disabled="!confirmed"
          class="w-full sys-btn-filled disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Weiter zur Instanz
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  token: { type: String, default: null },
});
const emit = defineEmits(["dismiss"]);

const copied    = ref(false);
const confirmed = ref(false);

async function copyToken() {
  if (!props.token) return;
  try {
    await navigator.clipboard.writeText(props.token);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // ignore
  }
}

function dismiss() {
  if (!confirmed.value) return;
  emit("dismiss");
}
</script>
