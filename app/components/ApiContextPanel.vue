<template>
  <div :class="headless ? '' : 'rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden'">

    <!-- Header -->
    <button
      v-if="!headless"
      class="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      @click="handleToggle"
      :aria-expanded="open"
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-[var(--sys-fg)]">API-Kontext</span>
        <span
          class="text-xs font-medium px-2 py-0.5 rounded-full border"
          :class="enabled
            ? 'bg-[rgba(255,255,255,0.08)] text-white/75 border-white/18'
            : 'bg-[rgba(255,255,255,0.04)] text-[var(--sys-fg-dim)] border-[var(--sys-border)]'"
        >{{ enabled ? 'aktiv' : 'inaktiv' }}</span>
      </div>
      <svg
        class="w-4 h-4 text-[var(--sys-fg-dim)] transition-transform duration-200"
        :class="open ? 'rotate-180' : ''"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Body -->
    <Transition name="slide-up">
      <div v-if="open || headless" class="px-5 pb-5 space-y-4 border-t border-[var(--sys-border)]">

        <!-- API aktivieren -->
        <label class="flex items-center gap-3 cursor-pointer group pt-4">
          <div
            class="relative w-9 h-5 rounded-full transition-colors flex-none"
            :class="enabled ? 'bg-[#22c55e]' : 'bg-[rgba(255,255,255,0.1)]'"
          >
            <div
              class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow sys-toggle-thumb"
              :class="enabled ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </div>
          <input type="checkbox" v-model="enabled" class="sr-only" @change="onToggleEnabled" />
          <span class="text-xs text-white/80 group-hover:text-white transition-colors">
            API-Zugriff aktivieren
          </span>
        </label>

        <!-- Fehler beim Toggle – immer sichtbar, auch wenn enabled=false -->
        <p v-if="saveError && !enabled" class="text-xs text-red-400">{{ saveError }}</p>

        <template v-if="enabled">

          <!-- Berechtigungen -->
          <div>
            <p class="sys-label mb-1">Freigaben</p>
            <p class="amm-prose mb-2">Gilt für Public Vault — was externe Dienste und verbundene Souls sehen dürfen.</p>
            <div class="space-y-2">
              <label
                v-for="(perm, key) in permLabels"
                :key="key"
                class="flex items-center gap-3 cursor-pointer"
              >
                <div
                  class="relative w-8 h-4 rounded-full transition-colors flex-none"
                  :class="permissions[key] ? 'bg-[#22c55e]' : 'bg-[rgba(255,255,255,0.1)]'"
                >
                  <div
                    class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow sys-toggle-thumb"
                    :class="permissions[key] ? 'translate-x-3.5' : 'translate-x-0.5'"
                  />
                </div>
                <input type="checkbox" v-model="permissions[key]" class="sr-only" />
                <span class="text-xs text-white/75">{{ perm.label }}</span>
                <span class="ml-auto text-xs text-white/50">{{ perm.hint }}</span>
              </label>
            </div>
          </div>

          <button
            @click="onSave"
            :disabled="isSaving"
            class="w-full py-2.5 rounded-none border border-[rgba(255,255,255,0.18)] text-white/75 text-xs hover:bg-[rgba(255,255,255,0.06)] hover:border-white/28 transition-all disabled:opacity-40 min-h-[40px] active:scale-[0.97]"
          >{{ isSaving ? 'Speichern …' : 'Berechtigungen speichern' }}</button>

          <p v-if="saveError" class="text-xs text-red-400">{{ saveError }}</p>
          <p v-else-if="saveSuccess" class="text-xs text-white/60">Berechtigungen gespeichert ✓</p>

        </template>

      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { useApiContext } from "~/composables/useApiContext.js";

const props = defineProps({
  soulCert:    { type: String, default: "" },
  soulContent: { type: String, default: "" },
  soulId:      { type: String, default: "" },
  headless:    { type: Boolean, default: false }
});

onMounted(() => { if (props.headless && props.soulCert) loadContext(props.soulCert) });

defineEmits(["close"]);

const {
  enabled, permissions, saveError,
  loadContext, saveContext, resetContext,
} = useApiContext();

const open        = ref(false);
const isSaving    = ref(false);
const saveSuccess = ref(false);

const permLabels = {
  soul:          { label: "Soul-Inhalt",   hint: "sys.md" },
  calendar:      { label: "Kalender",      hint: "## Kalender aus sys.md" },
  audio:         { label: "Audio-Dateien", hint: "→ MP3 (ffmpeg)" },
  video:         { label: "Video-Dateien", hint: "→ MP4 (ffmpeg)" },
  images:        { label: "Bilder",        hint: ".jpg/.png/…" },
  context_files: { label: "Text-Kontext",  hint: ".md/.txt" }
};

watch(() => props.soulCert, async (cert, oldCert) => {
  if (cert) {
    if (oldCert && oldCert !== cert) resetContext();
    await loadContext(cert);
  } else {
    resetContext();
  }
}, { immediate: true });

function handleToggle() {
  open.value = !open.value;
}

async function onToggleEnabled() {
  if (!props.soulCert) return;
  const newVal = enabled.value;
  const ok = await saveContext(props.soulCert, { enabled: newVal });
  if (!ok) {
    // Speichern fehlgeschlagen → UI-State zurücksetzen
    enabled.value = !newVal;
  }
}

async function onSave() {
  if (!props.soulCert) return;
  isSaving.value = true;
  saveSuccess.value = false;
  const ok = await saveContext(props.soulCert, {
    enabled:     enabled.value,
    permissions: { ...permissions.value }
  });
  isSaving.value = false;
  if (ok) {
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  }
}


</script>

<style scoped>
.amm-prose {
  font-family: 'Noto Serif', Georgia, serif;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(236,231,245,0.55);
  margin: 0;
}
</style>
