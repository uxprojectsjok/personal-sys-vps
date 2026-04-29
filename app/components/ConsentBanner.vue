<template>
  <Transition name="cb-up">
    <div
      v-if="showBanner && isVisible"
      ref="dialogRef"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      class="cb-root"
    >
      <div class="cb-panel">

        <!-- Content -->
        <div class="cb-body">
          <p class="cb-kicker">Datenschutz &amp; Statistik</p>
          <p class="cb-text">
            Diese Website verwendet eine
            <strong>anonyme, cookielose Reichweitenmessung</strong>,
            um Inhalte in aggregierter Form auszuwerten. Es werden
            <strong>keine personenbezogenen Profile</strong> erstellt.
            Weitere Informationen in der
            <button @click="$emit('showPrivacy')" class="cb-link" aria-label="Datenschutzerklärung öffnen">
              Datenschutzerklärung
            </button>
            oder der
            <button @click="$emit('showPrivacyFaq')" class="cb-link" aria-label="Datenschutz kurz erklärt öffnen">
              Kurzfassung (FAQ)
            </button>.
          </p>
        </div>

        <!-- Actions -->
        <div class="cb-actions">
          <button
            ref="acceptButtonRef"
            @click="handleAccept"
            class="cb-btn cb-accept"
            aria-label="Anonyme Statistik erlauben"
          >
            Statistik erlauben
          </button>
          <button
            @click="handleDecline"
            class="cb-btn cb-decline"
            aria-label="Keine Statistik verwenden"
          >
            Ablehnen
          </button>
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
      loadPlausible();
    } else if (consent !== "denied") {
      showBanner.value = true;
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
};

const handleDecline = () => {
  localStorage.setItem(CONSENT_KEY, "denied");
  showBanner.value = false;
  emit("decline");
};

function loadPlausible() {
  if (document.getElementById("plausible-script")) return;
  const script = document.createElement("script");
  // async (NICHT defer): async-Scripts blockieren DOMContentLoaded nicht.
  // defer-Scripts würden Vue-Hydration bei Timeout bis zu 90s einfrieren.
  script.async = true;
  script.setAttribute("data-domain", "YOUR_DOMAIN");
  script.src = "https://analytics.YOUR_DOMAIN/js/script.js";
  script.id = "plausible-script";
  script.onerror = () => { script.remove(); };
  document.head.appendChild(script);
}
</script>

<style scoped>
.cb-root {
  --ink: #08070c;
  --paper: #12101a;
  --paper-2: #1a1726;
  --rule: rgba(226,220,240,0.10);
  --rule-2: rgba(226,220,240,0.20);
  --fg: #ece7f5;
  --fg-2: rgba(236,231,245,0.72);
  --fg-3: rgba(236,231,245,0.48);
  --fg-4: rgba(236,231,245,0.30);
  --accent: #8b5cf6;
  --serif: 'Noto Serif', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;
  --mono: 'Oxanium', monospace;

  position: fixed;
  z-index: 900;
  bottom: 24px;
  left: 0;
  right: 0;
  padding: 0 clamp(16px, 4vw, 48px);
  pointer-events: none;
}

.cb-panel {
  max-width: 860px;
  margin: 0 auto;
  background: var(--paper-2);
  border: 1px solid var(--rule-2);
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 18px 24px;
  pointer-events: all;
}

@media (max-width: 640px) {
  .cb-panel {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 16px;
  }
}

.cb-body {
  flex: 1;
}

.cb-kicker {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--fg-4);
  margin: 0 0 6px;
}

.cb-text {
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--fg-2);
  margin: 0;
}

.cb-text strong {
  color: var(--fg);
  font-weight: 600;
}

.cb-link {
  color: var(--accent);
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.cb-link:hover { opacity: 0.75; }

.cb-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .cb-actions {
    flex-direction: row;
  }
}

.cb-btn {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  min-height: 40px;
  padding: 0 20px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .cb-btn { flex: 1; }
}

.cb-accept {
  background: var(--accent);
  color: #fff;
  border: 1px solid var(--accent);
}
.cb-accept:hover { background: #7c3aed; border-color: #7c3aed; }
.cb-accept:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.cb-decline {
  background: transparent;
  color: var(--fg-3);
  border: 1px solid var(--rule-2);
}
.cb-decline:hover { color: var(--fg); border-color: rgba(226,220,240,0.35); }
.cb-decline:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* Transition */
.cb-up-enter-active,
.cb-up-leave-active {
  transition: transform 0.4s ease, opacity 0.4s ease;
}
.cb-up-enter-from,
.cb-up-leave-to {
  transform: translateY(32px);
  opacity: 0;
}
</style>
