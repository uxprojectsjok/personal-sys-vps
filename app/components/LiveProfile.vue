<template>
  <!-- ═══════════════════════════════════════════════════════
       SYS · LiveProfile — Stimme · Gesicht · Bewegung
       Editorial design: sharp, monospace, rule-based.
       ═══════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <div class="lp-backdrop" @click.self="$emit('close')">
      <div class="lp-panel" role="dialog" aria-modal="true">

        <!-- ── Consent screen ──────────────────────────────────── -->
        <template v-if="!consentGiven">

          <div class="sys-modal-head">
            <div class="lp-head-left">
              <div class="lp-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
                </svg>
              </div>
              <div>
                <span class="sys-kicker">{{ $t('live_profile.kicker') }}</span>
                <h2 class="lp-title">{{ $t('live_profile.title_record') }}</h2>
              </div>
            </div>
            <button class="sys-modal-close" @click="$emit('close')" :aria-label="$t('common.close')">×</button>
          </div>

          <div class="lp-consent-body">
            <p class="lp-consent-desc">{{ $t('live_profile.consent_desc') }}</p>

            <label class="lp-checkbox-row">
              <div class="lp-checkbox-wrap">
                <input type="checkbox" v-model="consentChecked" class="lp-checkbox-input" />
                <div class="lp-checkbox-box" :class="{ checked: consentChecked }">
                  <svg v-if="consentChecked" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
                  </svg>
                </div>
              </div>
              <span class="lp-checkbox-label">{{ $t('live_profile.consent_checkbox') }}</span>
            </label>

            <p class="lp-dsgvo">{{ $t('live_profile.gdpr_note') }}</p>
          </div>

          <div class="sys-modal-foot">
            <div class="sys-foot-actions" style="width:100%">
              <button class="sys-btn-ed sys-btn-ed--ghost" style="flex:1" @click="$emit('close')">{{ $t('common.cancel') }}</button>
              <button class="sys-btn-ed sys-btn-ed--primary" style="flex:1" :disabled="!consentChecked" @click="confirmConsent">{{ $t('audio_capture.btn_continue') }}</button>
            </div>
          </div>

        </template>

        <!-- ── Main panel (after consent) ─────────────────────── -->
        <template v-if="consentGiven">

          <div class="sys-modal-head">
            <div class="lp-head-left">
              <div>
                <span class="sys-kicker">{{ $t('live_profile.kicker') }} · {{ carouselIndex + 1 }} / 3</span>
                <h2 class="lp-title">{{ (tm('live_profile.slide_labels') || [])[carouselIndex] }}</h2>
              </div>
            </div>
            <button class="sys-modal-close" @click="$emit('close')" :aria-label="$t('common.close')">×</button>
          </div>

          <!-- Tab bar -->
          <nav class="lp-tabs">
            <button
              class="lp-tab lp-tab--beta"
              :class="{ active: activeTab === 'stimme' }"
              @click="setCarousel(0)"
              :title="$t('live_profile.title_tab_voice')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/>
              </svg>
              {{ $t('live_profile.tab_voice') }}
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
              {{ $t('live_profile.tab_face') }}
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
              {{ $t('live_profile.tab_motion') }}
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

        </template>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import VoiceRecorder from "./VoiceRecorder.vue";
import MotionRecorder from "./MotionRecorder.vue";
const { t, tm } = useI18n();

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
/* ── Backdrop ──────────────────────────────────────────────── */
.lp-backdrop {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(4,3,8,0.80);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ── Panel ─────────────────────────────────────────────────── */
.lp-panel {
  position: relative; z-index: 1;
  width: 100%; max-width: 440px;
  max-height: 92dvh; overflow-y: auto;
  background: var(--sys-paper-2);
  border: 1px solid var(--sys-rule-strong);
  box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.08);
  display: flex; flex-direction: column;
}

/* ── Head (reuse sys-modal-head, add lp-specific layout) ───── */
.lp-head-left { display: flex; align-items: center; gap: 14px; }

.lp-icon {
  width: 32px; height: 32px; flex: none;
  border: 1px solid var(--sys-rule-strong);
  display: flex; align-items: center; justify-content: center;
  color: var(--sys-fg-dim);
}
.lp-icon svg { width: 16px; height: 16px; }

.lp-title {
  font-family: var(--sys-serif);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: -0.015em;
  color: var(--sys-fg);
  line-height: 1.1;
  margin: 4px 0 0;
}

/* ── Consent body ──────────────────────────────────────────── */
.lp-consent-body {
  padding: 24px 20px 20px;
  display: flex; flex-direction: column; gap: 20px;
  flex: 1;
}

.lp-consent-desc {
  font-family: var(--sys-serif);
  font-size: 15px;
  line-height: 1.6;
  color: var(--sys-fg-muted);
  margin: 0;
}

.lp-checkbox-row {
  display: flex; align-items: flex-start; gap: 14px; cursor: pointer;
}
.lp-checkbox-wrap { flex: none; margin-top: 2px; }
.lp-checkbox-input { position: absolute; opacity: 0; width: 0; height: 0; }
.lp-checkbox-box {
  width: 18px; height: 18px;
  border: 1px solid var(--sys-rule-strong);
  background: transparent;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s, background 0.15s;
}
.lp-checkbox-box.checked { background: var(--sys-accent-bright); border-color: var(--sys-accent-bright); }
.lp-checkbox-box svg { width: 10px; height: 10px; color: var(--sys-on-accent, #0a0810); }

.lp-checkbox-label {
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  line-height: 1.65;
  color: var(--sys-fg-muted);
}

.lp-dsgvo {
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sys-fg-muted);
  opacity: 0.7;
  line-height: 1.6;
  margin: 0;
}

/* ── Tab bar ───────────────────────────────────────────────── */
.lp-tabs {
  display: flex;
  border-bottom: 1px solid var(--sys-rule);
  flex-shrink: 0;
}
.lp-tab {
  flex: 1; min-height: 52px;
  border: 0; border-right: 1px solid var(--sys-rule);
  background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  font-family: var(--sys-mono); font-size: 12px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--sys-fg-dim);
  position: relative; transition: color 0.12s, background 0.12s;
}
.lp-tab:last-child { border-right: 0; }
.lp-tab svg { width: 16px; height: 16px; flex: none; }
.lp-tab:hover:not(.active) { color: var(--sys-fg); background: rgba(255,255,255,0.025); }
.lp-tab.active { color: var(--sys-accent-bright); }
.lp-tab--beta { opacity: 0.45; }
.lp-tab.active::after {
  content: ""; position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px;
  background: var(--sys-accent-bright);
}

/* ── Carousel ──────────────────────────────────────────────── */
.lp-carousel {
  flex: 1; overflow: hidden; position: relative; min-height: 0;
}
.lp-carousel-track {
  display: flex; height: 100%;
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
  will-change: transform;
}
.lp-slide {
  flex: none; width: 100%; height: 100%; overflow-y: auto;
}

</style>
