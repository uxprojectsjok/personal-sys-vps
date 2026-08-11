<template>
  <Transition name="slide-up">
    <div
      v-if="showBanner && isVisible"
      ref="dialogRef"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      class="fixed z-[900] bottom-4 left-0 right-0 px-3 sm:px-6 lg:px-8"
    >
      <div
        class="max-w-4xl mx-auto bg-white/95 dark:bg-slate-700/80 backdrop-blur-xl rounded-xl border border-slate-300/70 dark:border-slate-500/30 shadow-xl p-4 sm:p-6 transition-colors duration-300"
      >
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <!-- Icon (dekorativ) -->
          <div class="text-3xl sm:text-4xl" aria-hidden="true">🍪</div>

          <!-- Content -->
          <div class="flex-1 space-y-2 sm:space-y-3 text-sm sm:text-base">
            <h3 id="consent-title" class="text-slate-900 dark:text-slate-50 text-base sm:text-lg font-semibold">
              Datenschutz & anonyme Statistik
            </h3>

            <p class="text-slate-700 dark:text-slate-200">
              Diese Website verwendet eine
              <strong>anonyme, cookielose Reichweitenmessung</strong>
              , um Inhalte und technische Nutzung dieser Website in aggregierter Form auszuwerten. Es werden
              <strong>keine personenbezogenen Profile</strong>
              erstellt.
            </p>

            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Weitere Informationen finden Sie in der
              <button
                @click="$emit('showPrivacy')"
                class="text-blue-600 dark:text-slate-100 underline hover:text-blue-700 dark:hover:text-white transition-colors bg-transparent border-0 p-0"
                aria-label="Datenschutzerklärung öffnen"
              >
                Datenschutzerklärung
              </button>
              oder in der
              <button
                @click="$emit('showPrivacyFaq')"
                class="ml-1 text-blue-600 dark:text-slate-100 underline hover:text-blue-700 dark:hover:text-white transition-colors bg-transparent border-0 p-0"
                aria-label="Datenschutz kurz erklärt öffnen"
              >
                Kurzfassung (FAQ)
              </button>
              .
            </p>

            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Sie können der anonymen Reichweitenmessung zustimmen oder sie ablehnen. Ihre Entscheidung wird
              ausschließlich lokal gespeichert und kann jederzeit geändert werden.
            </p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
            <button
              ref="acceptButtonRef"
              @click="handleAccept"
              class="w-full sm:w-auto px-5 py-2 rounded-lg bg-slate-800 dark:bg-slate-600/50 border border-slate-700 dark:border-slate-400/30 text-white dark:text-slate-50 hover:bg-slate-900 dark:hover:bg-slate-500/60 transition-all duration-300 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              aria-label="Anonyme Statistik erlauben"
            >
              ✓ Anonyme Statistik erlauben
            </button>

            <button
              @click="handleDecline"
              class="w-full sm:w-auto px-5 py-2 rounded-lg bg-slate-200 dark:bg-slate-600/30 border border-slate-300 dark:border-slate-500/20 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600/50 hover:text-slate-900 dark:hover:text-slate-50 transition-all duration-300 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              aria-label="Keine Statistik verwenden"
            >
              ✕ Keine Statistik
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onUnmounted } from "vue";

defineProps({
  isVisible: Boolean
});

const emit = defineEmits(["accept", "decline", "showPrivacy", "showPrivacyFaq"]);

const CONSENT_KEY = "plausible-consent";

const showBanner = ref(false);
const dialogRef = ref(null);
const acceptButtonRef = ref(null);
let lastFocusedElement = null;

/* ---------- Init ---------- */
onMounted(() => {
  if (process.client) {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === "granted") {
      loadPlausible(); // Wiederkehrende Nutzer: Script direkt laden
    } else if (consent !== "denied") {
      showBanner.value = true; // Neue Nutzer: Banner zeigen
    }
  }
});

/* ---------- Fokus & ESC ---------- */
function onKeydown(e) {
  if (e.key === "Escape") {
    handleDecline();
  }
}

watch(showBanner, async (open) => {
  if (open) {
    lastFocusedElement = document.activeElement;
    await nextTick();
    acceptButtonRef.value?.focus();
    document.addEventListener("keydown", onKeydown);
  } else {
    document.removeEventListener("keydown", onKeydown);
    lastFocusedElement?.focus();
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});

/* ---------- Actions ---------- */
const handleAccept = () => {
  localStorage.setItem(CONSENT_KEY, "granted");
  showBanner.value = false;
  emit("accept");
  loadPlausible();
  window.dispatchEvent(new CustomEvent("plausible-consent-change", { detail: "granted" }));
};

const handleDecline = () => {
  localStorage.setItem(CONSENT_KEY, "denied");
  showBanner.value = false;
  emit("decline");
  window.dispatchEvent(new CustomEvent("plausible-consent-change", { detail: "denied" }));
};

function loadPlausible() {
  if (document.getElementById("plausible-script")) return;

  const script = document.createElement("script");
  script.defer = true;
  script.setAttribute("data-domain", "uxprojects-jok.com");
  script.src = "https://analytics.uxprojects-jok.com/js/script.js";
  script.id = "plausible-script";
  document.head.appendChild(script);
}
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.5s ease;
}
.slide-up-enter-from {
  transform: translateY(100px);
  opacity: 0;
}
.slide-up-leave-to {
  transform: translateY(100px);
  opacity: 0;
}
</style>
