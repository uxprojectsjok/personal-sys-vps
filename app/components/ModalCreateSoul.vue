<template>
  <Teleport to="body">
    <Transition name="modal-pop">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="$emit('cancel')"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-md"
          @click="$emit('cancel')"
        ></div>

        <!-- Card -->
        <div class="modal-card relative w-full max-w-sm rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-elevated)] shadow-2xl z-10 overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--sys-border)]">
            <div class="flex items-center gap-2.5">
              <img src="/logo_transparent.png" alt="SYS" class="w-7 h-7 object-contain" />
              <span class="text-sm font-semibold text-[var(--sys-fg)]">Create new Soul</span>
            </div>
            <button
              @click="$emit('cancel')"
              aria-label="Schließen"
              class="w-11 h-11 flex items-center justify-center rounded-lg text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[var(--sys-bg-surface)] transition-all"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="px-5 py-4 space-y-4">

            <!-- Soul-Hash (auto-generiert, nicht editierbar) -->
            <div>
              <label class="block text-xs tracking-[0.16em] text-[var(--sys-fg-dim)] uppercase mb-2">
                Soul-Hash
              </label>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-11 px-4 flex items-center rounded-xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)]">
                  <span class="font-mono text-sm font-bold tracking-[0.1em]" style="color:var(--sys-accent)">#{{ hash }}</span>
                </div>
                <button
                  @click="copyHash"
                  :aria-label="copied ? 'Kopiert' : 'Hash kopieren'"
                  class="w-11 h-11 flex-none flex items-center justify-center rounded-xl border border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.15)] transition-all"
                >
                  <svg v-if="!copied" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"/>
                  </svg>
                  <svg v-else class="w-3.5 h-3.5 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                  </svg>
                </button>
              </div>
              <p class="mt-2 text-xs text-[var(--sys-amber)] leading-relaxed">
                Notiere diesen Hash – er ist dein einziger Identifikator. Kein Name wird gespeichert.
              </p>
            </div>

            <!-- Idee -->
            <div>
              <label class="block text-xs tracking-[0.16em] text-[var(--sys-fg-dim)] uppercase mb-2">
                Idee <span class="opacity-40 normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                ref="ideaInput"
                v-model="idea"
                placeholder="Wer ist diese Seele in einem Satz?"
                maxlength="280"
                rows="3"
                class="w-full px-4 py-3 bg-transparent border border-[var(--sys-border)] rounded-xl text-sm text-[var(--sys-fg)] placeholder-[var(--sys-fg-dim)] focus:outline-none focus:border-[var(--sys-accent)] transition-colors resize-none leading-relaxed"
              ></textarea>
            </div>

            <!-- Buttons -->
            <div class="flex gap-2.5 pt-1">
              <button
                @click="$emit('cancel')"
                class="flex-1 h-11 rounded-xl border border-[var(--sys-border)] text-sm text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.15)] transition-all"
              >
                Abbrechen
              </button>
              <button
                @click="handleCreate"
                class="flex-1 h-11 rounded-xl border text-sm font-semibold text-black transition-all"
                style="background:linear-gradient(135deg,var(--sys-accent),var(--sys-indigo));border-color:transparent"
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from "vue";

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(["create", "cancel"]);

const hash     = ref("");
const idea     = ref("");
const copied   = ref(false);
const ideaInput = ref(null);

function generateHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

watch(() => props.isOpen, (val) => {
  if (val) {
    hash.value   = generateHash();
    idea.value   = "";
    copied.value = false;
    nextTick(() => ideaInput.value?.focus());
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

async function copyHash() {
  await navigator.clipboard.writeText(hash.value).catch(() => {});
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function handleCreate() {
  emit("create", { name: hash.value, idea: idea.value.trim() });
}
</script>
