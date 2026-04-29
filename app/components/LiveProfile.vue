<template>
  <!-- ═══════════════════════════════════════════════════════
       SYS · LiveProfile — Stimme · Gesicht · Bewegung
       Editorial design: sharp, monospace, rule-based.
       ═══════════════════════════════════════════════════════ -->
  <div class="lp-backdrop" @click.self="$emit('close')">
    <div class="lp-panel" role="dialog" aria-modal="true">

      <!-- ── Consent screen ──────────────────────────────────── -->
      <template v-if="!consentGiven">

        <header class="lp-head">
          <div class="lp-head-left">
            <div class="lp-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
              </svg>
            </div>
            <div>
              <div class="lp-kicker">Profil · Biometrie</div>
              <h2 class="lp-title">Profil-Daten aufzeichnen</h2>
            </div>
          </div>
          <button class="lp-close" @click="$emit('close')" aria-label="Schließen">✕</button>
        </header>

        <div class="lp-consent-body">
          <p class="lp-consent-desc">
            Stimme, Gesicht und Bewegung werden in deinem lokalen Vault gespeichert und können
            auf Wunsch mit deiner digitalen Soul verknüpft werden.
            Die Daten verlassen dein Gerät nur, wenn du es explizit freigibst.
          </p>

          <label class="lp-checkbox-row">
            <div class="lp-checkbox-wrap">
              <input type="checkbox" v-model="consentChecked" class="lp-checkbox-input" />
              <div class="lp-checkbox-box" :class="{ checked: consentChecked }">
                <svg v-if="consentChecked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                </svg>
              </div>
            </div>
            <span class="lp-checkbox-label">
              Ich stimme der Aufzeichnung meiner Stimme, meines Gesichts und meiner Bewegungsdaten zu
              und bin mir bewusst, dass diese ausschließlich in meinem lokalen Vault gespeichert werden.
            </span>
          </label>

          <p class="lp-dsgvo">DSGVO Art. 7 – jederzeit widerrufbar durch Schließen dieses Panels</p>
        </div>

        <div class="lp-consent-actions">
          <button class="lp-btn ghost" @click="$emit('close')">Abbrechen</button>
          <button class="lp-btn primary" :disabled="!consentChecked" @click="confirmConsent">Weiter →</button>
        </div>

      </template>

      <!-- ── Main panel (after consent) ─────────────────────── -->
      <template v-if="consentGiven">

        <!-- Header -->
        <header class="lp-head">
          <div class="lp-head-left">
            <div>
              <div class="lp-kicker">Profil · {{ carouselIndex + 1 }} / 3</div>
              <h2 class="lp-title">{{ ['Stimme', 'Gesicht', 'Bewegung'][carouselIndex] }}</h2>
            </div>
          </div>
          <button class="lp-close" @click="$emit('close')" aria-label="Schließen">✕</button>
        </header>

        <!-- Tab bar -->
        <nav class="lp-tabs">
          <button
            class="lp-tab"
            :class="{ active: activeTab === 'stimme' }"
            @click="setCarousel(0)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/>
            </svg>
            Stimme
          </button>
          <button
            class="lp-tab"
            :class="{ active: activeTab === 'gesicht' }"
            @click="setCarousel(1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <circle cx="12" cy="8" r="5"/>
              <path stroke-linecap="round" d="M9.5 8.5c.5.8 1.5 1.3 2.5 1.3s2-.5 2.5-1.3"/>
              <path stroke-linecap="round" d="M10 7h.01M14 7h.01"/>
            </svg>
            Gesicht
          </button>
          <button
            class="lp-tab"
            :class="{ active: activeTab === 'bewegung' }"
            @click="setCarousel(2)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <circle cx="12" cy="4" r="2"/>
              <path stroke-linecap="round" d="M12 6v8M9 10h6M9 22l3-8 3 8"/>
              <path stroke-linecap="round" d="M7 10l-2 4M17 10l2 4" opacity=".5"/>
            </svg>
            Bewegung
          </button>
        </nav>

        <!-- Carousel -->
        <div class="lp-carousel">
          <div
            class="lp-carousel-track"
            :style="{ transform: `translateX(-${carouselIndex * 100}%)` }"
          >
            <div class="lp-slide">
              <VoiceRecorder
                :soul-meta="soulMeta" :embedded="true"
                @saved="$emit('voice-saved', $event)" @close="$emit('close')"
              />
            </div>
            <div class="lp-slide">
              <MotionRecorder
                :soul-meta="soulMeta" :embedded="true" initial-mode="face"
                @saved="$emit('motion-saved', $event)" @close="$emit('close')"
                @next-mode="activeTab = 'bewegung'; setCarousel(2)"
              />
            </div>
            <div class="lp-slide">
              <MotionRecorder
                :soul-meta="soulMeta" :embedded="true" initial-mode="body"
                @saved="$emit('motion-saved', $event)" @close="$emit('close')"
              />
            </div>
          </div>
        </div>

        <!-- Dots -->
        <div class="lp-dots">
          <button
            v-for="(_, i) in 3" :key="i"
            class="lp-dot" :class="{ active: carouselIndex === i }"
            @click="setCarousel(i)" :aria-label="`Slide ${i + 1}`"
          />
        </div>

      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import VoiceRecorder from "./VoiceRecorder.vue";
import MotionRecorder from "./MotionRecorder.vue";

defineProps({
  soulMeta: { type: Object, default: null }
});

defineEmits(["close", "voice-saved", "motion-saved"]);

const activeTab     = ref("stimme"); // 'stimme' | 'gesicht' | 'bewegung'
const consentGiven   = ref(false);
const consentChecked = ref(false);

// Carousel UI-State (pure display, no logic change)
const carouselIndex = ref(0);
const TAB_TO_INDEX = { stimme: 0, gesicht: 1, bewegung: 2 };
const INDEX_TO_TAB = ["stimme", "gesicht", "bewegung"];
function setCarousel(i) {
  carouselIndex.value = i;
  activeTab.value = INDEX_TO_TAB[i];
}

function confirmConsent() {
  if (consentChecked.value) {
    consentGiven.value = true;
  }
}

// Kamera-Modus → Mobile-Fullscreen aktiv (nur wenn Consent gegeben)
const isCameraMode = computed(() => consentGiven.value && activeTab.value !== "stimme");
</script>

<style scoped>
/* ── Design tokens ─────────────────────────────────────── */
.lp-backdrop {
  --rule:   rgba(226,220,240,0.10);
  --rule-2: rgba(226,220,240,0.20);
  --fg:     #ece7f5;
  --fg-2:   rgba(236,231,245,0.72);
  --fg-3:   rgba(236,231,245,0.48);
  --fg-4:   rgba(236,231,245,0.30);
  --accent: #8b5cf6;
  --accent-bright: #a78bfa;
  --accent-dim:    rgba(139,92,246,0.12);
  --on-accent: #0a0810;
  --paper-2: #1a1726;
  --paper-3: #0d0b14;
  --serif: 'Noto Serif', Georgia, serif;
  --mono:  'JetBrains Mono', ui-monospace, monospace;

  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(4,3,8,0.80);
  backdrop-filter: blur(8px);
}

/* ── Panel ─────────────────────────────────────────────── */
.lp-panel {
  position: relative; z-index: 1;
  width: 100%; max-width: 440px;
  max-height: 92dvh; overflow-y: auto;
  background: var(--paper-2);
  border: 1px solid var(--rule-2);
  box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.08);
  display: flex; flex-direction: column;
}

/* ── Header ────────────────────────────────────────────── */
.lp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--rule);
  flex-shrink: 0;
}
.lp-head-left { display: flex; align-items: center; gap: 14px; }
.lp-icon {
  width: 36px; height: 36px; flex: none;
  border: 1px solid var(--rule-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-3);
}
.lp-icon svg { width: 16px; height: 16px; }
.lp-kicker { font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin-bottom: 3px; }
.lp-title  { font-family: var(--serif); font-size: 18px; font-weight: 400; letter-spacing: -0.015em; color: var(--fg); line-height: 1.1; }
.lp-close  {
  width: 32px; height: 32px; flex: none;
  border: 1px solid var(--rule); background: transparent; cursor: pointer;
  color: var(--fg-3); font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.12s, border-color 0.12s;
}
.lp-close:hover { color: var(--fg); border-color: var(--rule-2); }

/* ── Consent body ──────────────────────────────────────── */
.lp-consent-body {
  padding: 24px 20px 20px;
  display: flex; flex-direction: column; gap: 20px;
  flex: 1;
}
.lp-consent-desc {
  font-family: var(--serif); font-size: 15px; line-height: 1.6;
  color: var(--fg-2);
}
.lp-checkbox-row {
  display: flex; align-items: flex-start; gap: 14px; cursor: pointer;
}
.lp-checkbox-wrap { flex: none; margin-top: 2px; }
.lp-checkbox-input { position: absolute; opacity: 0; width: 0; height: 0; }
.lp-checkbox-box {
  width: 18px; height: 18px;
  border: 1px solid var(--rule-2);
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s, background 0.15s;
}
.lp-checkbox-box.checked { background: var(--accent); border-color: var(--accent); }
.lp-checkbox-box svg { width: 10px; height: 10px; color: var(--on-accent); }
.lp-checkbox-label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em;
  line-height: 1.65; color: var(--fg-3);
}
.lp-dsgvo {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--fg-4); line-height: 1.6;
}

/* ── Consent actions ───────────────────────────────────── */
.lp-consent-actions {
  display: flex;
  border-top: 1px solid var(--rule);
  flex-shrink: 0;
}
.lp-btn {
  flex: 1; min-height: 52px;
  border: 0; background: transparent; cursor: pointer;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em;
  text-transform: uppercase; transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.lp-btn.ghost {
  color: var(--fg-3); border-right: 1px solid var(--rule);
}
.lp-btn.ghost:hover { color: var(--fg); background: rgba(255,255,255,0.025); }
.lp-btn.primary {
  color: var(--fg); background: rgba(139,92,246,0.10);
  border-left: 1px solid rgba(139,92,246,0.25);
}
.lp-btn.primary:hover:not(:disabled) { background: var(--accent); color: var(--on-accent); }
.lp-btn.primary:disabled { opacity: 0.25; cursor: not-allowed; }

/* ── Tab bar ───────────────────────────────────────────── */
.lp-tabs {
  display: flex;
  border-bottom: 1px solid var(--rule);
  flex-shrink: 0;
}
.lp-tab {
  flex: 1; min-height: 52px;
  border: 0; border-right: 1px solid var(--rule);
  background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--fg-3);
  position: relative; transition: color 0.12s, background 0.12s;
}
.lp-tab:last-child { border-right: 0; }
.lp-tab svg { width: 16px; height: 16px; flex: none; }
.lp-tab:hover:not(.active) { color: var(--fg); background: rgba(255,255,255,0.025); }
.lp-tab.active { color: var(--accent); }
.lp-tab.active::after {
  content: ""; position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px;
  background: var(--accent);
}

/* ── Carousel ──────────────────────────────────────────── */
.lp-carousel {
  flex: 1; overflow: hidden; position: relative;
  min-height: 0;
}
.lp-carousel-track {
  display: flex; height: 100%;
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
  will-change: transform;
}
.lp-slide {
  flex: none; width: 100%; height: 100%; overflow-y: auto;
}

/* ── Dots ──────────────────────────────────────────────── */
.lp-dots {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 0;
  border-top: 1px solid var(--rule);
  flex-shrink: 0;
}
.lp-dot {
  width: 6px; height: 6px;
  border: 1px solid var(--rule-2); background: transparent; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  padding: 0;
}
.lp-dot.active { background: var(--accent); border-color: var(--accent); }
</style>
