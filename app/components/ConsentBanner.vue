<template>
  <Transition name="cb-up">
    <div
      v-if="showBanner"
      ref="dialogRef"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      class="cb-root"
    >
      <div class="cb-panel">

        <div class="cb-body">
          <p class="cb-kicker">{{ t('consentBanner.kicker') }}</p>
          <p class="cb-text" v-html="t('consentBanner.text')"></p>
        </div>

        <div class="cb-actions">
          <button
            ref="acceptButtonRef"
            @click="handleAccept"
            class="cb-btn cb-accept"
            :aria-label="t('consentBanner.ariaAccept')"
          >
            {{ t('consentBanner.accept') }}
          </button>
          <button
            @click="handleDecline"
            class="cb-btn cb-decline"
            :aria-label="t('consentBanner.ariaDecline')"
          >
            {{ t('consentBanner.decline') }}
          </button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const CONSENT_KEY = 'plausible-consent'

const showBanner = ref(false)
const dialogRef = ref(null)
const acceptButtonRef = ref(null)
let lastFocusedElement = null

onMounted(() => {
  const consent = localStorage.getItem(CONSENT_KEY)
  if (consent === 'granted') {
    loadPlausible()
  } else if (consent !== 'denied') {
    showBanner.value = true
  }
})

function onKeydown(e) {
  if (e.key === 'Escape') handleDecline()
}

watch(showBanner, async (open) => {
  if (open) {
    lastFocusedElement = document.activeElement
    await nextTick()
    acceptButtonRef.value?.focus()
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
    lastFocusedElement?.focus()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

function handleAccept() {
  localStorage.setItem(CONSENT_KEY, 'granted')
  showBanner.value = false
  loadPlausible()
}

function handleDecline() {
  localStorage.setItem(CONSENT_KEY, 'denied')
  showBanner.value = false
}

function loadPlausible() {
  if (document.getElementById('plausible-script')) return
  const inject = () => {
    const script = document.createElement('script')
    script.async = true
    // Geteilte Root-Property "uxprojects-jok.com" — niemals auf Subdomain
    // ändern, alle uxprojects-jok.com-Subdomains teilen sich diese Property.
    script.setAttribute('data-domain', 'uxprojects-jok.com')
    script.src = 'https://analytics.uxprojects-jok.com/js/script.js'
    script.id = 'plausible-script'
    script.onerror = () => { script.remove() }
    document.head.appendChild(script)
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(inject, { timeout: 3000 })
  } else {
    setTimeout(inject, 1000)
  }
}
</script>

<style scoped>
.cb-root {
  position: fixed;
  z-index: 850;
  bottom: 24px;
  left: 0;
  right: 0;
  padding: 0 clamp(16px, 4vw, 48px);
  pointer-events: none;
}

.cb-panel {
  max-width: 860px;
  margin: 0 auto;
  background: var(--surface-2);
  border: 1px solid var(--line-2);
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

.cb-body { flex: 1; }

.cb-kicker {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin: 0 0 6px;
}

.cb-text {
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--fg);
  margin: 0;
}
.cb-text :deep(strong) { color: var(--fg); font-weight: 600; }
.cb-text :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.cb-text :deep(a:hover) { opacity: 0.75; }

.cb-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .cb-actions { flex-direction: row; }
}

.cb-btn {
  font-family: var(--mono);
  font-size: 11px;
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
.cb-accept:hover { opacity: 0.85; }
.cb-accept:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.cb-decline {
  background: transparent;
  color: var(--fg-3);
  border: 1px solid var(--line-2);
}
.cb-decline:hover { color: var(--fg); border-color: var(--line); }
.cb-decline:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.cb-up-enter-active, .cb-up-leave-active { transition: transform 0.4s ease, opacity 0.4s ease; }
.cb-up-enter-from, .cb-up-leave-to { transform: translateY(32px); opacity: 0; }
</style>
