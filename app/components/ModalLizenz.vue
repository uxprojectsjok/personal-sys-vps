<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        @click.self="$emit('close')"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/80 backdrop-blur-sm"
          @click="$emit('close')"
        ></div>

        <!-- Panel -->
        <div
          class="relative w-full sm:max-w-xl max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lizenz-title"
        >
          <!-- Header -->
          <div
            class="flex-none flex items-center justify-between px-5 py-4 border-b border-[var(--sys-border)]"
          >
            <h2
              id="lizenz-title"
              class="text-sm font-medium text-[var(--sys-fg)] tracking-wide"
            >
              Lizenz & Attribution
            </h2>
            <button
              @click="$emit('close')"
              class="w-11 h-11 flex items-center justify-center rounded-lg text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] hover:bg-[var(--sys-bg-overlay)] transition"
              aria-label="Schließen"
            >
              <svg
                class="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div
            class="flex-1 overflow-y-auto px-5 py-5 space-y-5 text-sm text-[var(--sys-fg-muted)]"
          >
            <section>
              <h3
                class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3"
              >
                Invite-only · Haftungsausschluss
              </h3>
              <div
                class="p-3 rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)]"
              >
                <p class="text-[var(--sys-fg)] text-xs leading-relaxed">
                  SaveYourSoul läuft unter <strong>Realbedingungen</strong> und ist ausschließlich
                  für eingeladene Nutzer zugänglich.
                  Die Software wird ohne jegliche Gewährleistung bereitgestellt –
                  weder ausdrücklich noch stillschweigend.
                </p>
                <p class="mt-2 text-xs text-[var(--sys-fg-muted)] leading-relaxed">
                  Jede Haftung für Datenverlust, Systemausfälle, fehlerhafte Ausgaben oder
                  sonstige direkte oder indirekte Schäden ist im gesetzlich zulässigen Rahmen ausgeschlossen.
                  Die Nutzung erfolgt auf eigene Verantwortung. Eine Eignung für produktive oder
                  geschäftliche Zwecke wird nicht zugesichert.
                </p>
                <p class="mt-2 text-xs text-[var(--sys-fg-dim)] tracking-[0.06em] uppercase">
                  Status: Beta · Invite Only · Realbedingungen
                </p>
              </div>
            </section>

            <section>
              <h3
                class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3"
              >
                Eigene Inhalte
              </h3>
              <div
                class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]"
              >
                <p class="text-[var(--sys-fg)]">
                  © 2025–2026 Jan-Oliver Karo · UX-Projects
                </p>
                <p class="mt-1 text-xs">
                  Design, Konzept, Code und alle eigenen Texte sind
                  urheberrechtlich geschützt. Alle Rechte vorbehalten.
                </p>
              </div>
            </section>

            <section>
              <h3
                class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3"
              >
                Open-Source-Abhängigkeiten
              </h3>
              <div class="space-y-2">
                <div
                  class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]"
                >
                  <div>
                    <p class="text-[var(--sys-fg)]">Nuxt</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">
                      Web-Framework
                    </p>
                  </div>
                  <span
                    class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]"
                    >MIT</span
                  >
                </div>

                <div
                  class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]"
                >
                  <div>
                    <p class="text-[var(--sys-fg)]">Vue 3</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">UI-Framework</p>
                  </div>
                  <span
                    class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]"
                    >MIT</span
                  >
                </div>

                <div
                  class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]"
                >
                  <div>
                    <p class="text-[var(--sys-fg)]">Tailwind CSS v4</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">
                      Utility-CSS-Framework
                    </p>
                  </div>
                  <span
                    class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]"
                    >MIT</span
                  >
                </div>

                <div
                  class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]"
                >
                  <div>
                    <p class="text-[var(--sys-fg)]">Nitro</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">
                      Server-Engine (Nuxt)
                    </p>
                  </div>
                  <span
                    class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]"
                    >MIT</span
                  >
                </div>

                <div class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]">
                  <div>
                    <p class="text-[var(--sys-fg)]">Vite</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">Build-Tool</p>
                  </div>
                  <span class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]">MIT</span>
                </div>

                <div class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]">
                  <div>
                    <p class="text-[var(--sys-fg)]">@fontsource/noto-serif</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">Font-Distribution</p>
                  </div>
                  <span class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]">MIT</span>
                </div>

                <div class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]">
                  <div>
                    <p class="text-[var(--sys-fg)]">@fontsource/oxanium</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">Font-Distribution</p>
                  </div>
                  <span class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]">MIT</span>
                </div>

                <div class="flex items-start justify-between gap-3 py-2 border-b border-[var(--sys-border)]">
                  <div>
                    <p class="text-[var(--sys-fg)]">remixicon</p>
                    <p class="text-xs text-[var(--sys-fg-dim)]">Icon-Font</p>
                  </div>
                  <span class="flex-none text-xs px-2 py-0.5 rounded-full border border-[var(--sys-border)] text-[var(--sys-fg-dim)]">Apache 2.0</span>
                </div>
              </div>
            </section>

            <section>
              <h3 class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3">KI-Dienste (Extern)</h3>
              <div class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]">
                <p class="text-[var(--sys-fg)]">Anthropic Claude API</p>
                <p class="mt-1 text-xs">KI-Sprachmodell für Chat und Soul-Analyse. Kommerzielle Lizenz gemäß Anthropic API Terms of Service.</p>
                <a href="https://www.anthropic.com/legal/usage-policy" target="_blank" rel="noopener" class="mt-1 inline-block text-xs text-[var(--sys-accent)] hover:underline">anthropic.com/legal/usage-policy ↗</a>
              </div>
            </section>

            <section>
              <h3 class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3">Icons</h3>
              <div class="space-y-2">
                <div class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]">
                  <p class="text-[var(--sys-fg)]">Remix Icons</p>
                  <p class="mt-1 text-xs">
                    Icon-Font, lokal ausgeliefert. Apache License 2.0 · Remix Design.
                    <span class="opacity-60">remixicon.com</span>
                  </p>
                </div>
                <div class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]">
                  <p class="text-[var(--sys-fg)]">lucide-vue-next</p>
                  <p class="mt-1 text-xs">
                    SVG-Icon-Komponenten (teilweise verwendet). MIT License · Lucide Contributors.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3">Schriften</h3>
              <div class="space-y-2">
                <div class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]">
                  <p class="text-[var(--sys-fg)]">Noto Serif</p>
                  <p class="mt-1 text-xs">SIL Open Font License 1.1 · Google Fonts / Monotype. Headings.</p>
                </div>
                <div class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]">
                  <p class="text-[var(--sys-fg)]">Oxanium</p>
                  <p class="mt-1 text-xs">SIL Open Font License 1.1 · Severin Meyer. UI / Body.</p>
                </div>
                <div class="p-3 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-bg-overlay)]">
                  <p class="text-[var(--sys-fg)]">Inter</p>
                  <p class="mt-1 text-xs">SIL Open Font License 1.1 · Rasmus Andersson. Fallback.</p>
                </div>
                <p class="text-xs text-[var(--sys-fg-dim)] mt-1">Alle Schriften lokal vom eigenen Server ausgeliefert – keine externe Schriftquelle.</p>
              </div>
            </section>

            <section>
              <h3 class="text-xs uppercase tracking-[0.12em] text-[var(--sys-fg-dim)] mb-3">Hosting</h3>
              <p>IONOS SE, Elgendorfer Str. 57, 56410 Montabaur, Deutschland.</p>
            </section>

            <p class="text-xs text-[var(--sys-fg-dim)] pt-2 border-t border-[var(--sys-border)]">
              Stand: März 2026
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onUnmounted, watch } from "vue";

const props = defineProps({
  isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

function onKeydown(e) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      document.addEventListener("keydown", onKeydown);
      document.body.style.overflow = "hidden";
    } else {
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = "";
    }
  },
);

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
