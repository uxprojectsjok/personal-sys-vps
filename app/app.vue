<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <SysMobileNav v-if="hasSoul" />
  <ConsentBanner
    :is-visible="true"
    @show-privacy="openCentralPrivacy"
    @show-privacy-faq="openCentralPrivacy"
  />
  <div id="teleports"></div>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul'
import ConsentBanner from '~/components/ConsentBanner.vue'
import { useColorScheme } from '~/composables/useColorScheme.js'

// Diese Node hat keine eigene Datenschutzerklärung (privater, nicht-
// gewerblicher Node) — die anonyme Reichweitenmessung läuft aber über die
// zentrale, geteilte Plausible-Property "uxprojects-jok.com", deren
// Datenschutzerklärung dort zentral gepflegt wird. Beide Banner-Links
// (Datenschutzerklärung + FAQ-Kurzfassung) zeigen bis auf Weiteres auf
// dieselbe zentrale Seite — es gibt aktuell keine separate FAQ-URL.
function openCentralPrivacy() {
  window.open('https://uxprojects-jok.com/datenschutz', '_blank', 'noopener')
}

const { setLocale } = useI18n()
const { soulToken, hasSoul } = useSoul()

// Applies data-theme from localStorage on every app boot. Previously this
// only ran as a side-effect of some component importing useColorScheme
// (SysTopbar, SettingsModal, ...) — pages that render none of those (e.g.
// /use-cases, direct load) never got data-theme set at all and silently
// fell back to the dark :root defaults, ignoring the stored preference.
useColorScheme()

if (import.meta.client && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

async function initPush(token) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
  if (Notification.permission === 'denied') return
  try {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
    }
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const r = await fetch('/api/push/vapid-key')
      const { publicKey } = await r.json()
      if (!publicKey) return
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
    }
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
  } catch {}
}

onMounted(() => {
  const saved = localStorage.getItem('sys-locale')
  if (saved && ['en', 'de'].includes(saved)) setLocale(saved)
})

if (import.meta.client) {
  watch(soulToken, (token) => {
    if (token && token !== 'anonymous') initPush(token)
  }, { immediate: true })
}
</script>

<style>
/* Teleport-Ziel für ChatInterface dock + FAB auf Mobile.
   CSS-Variablen werden hier definiert, damit die teleportierten Elemente
   außerhalb von .sys-chat trotzdem korrekte Farb- und Schriftwerte erben. */
#teleports {
  /* Was hardcoded dark-only — same dark-mode-era mistake .sys-chat had
     before it was fixed to inherit the real theme tokens. Every name here
     matches a real global token, so `inherit` is required (not var()) to
     bypass this local shadow instead of self-referencing. */
  --bg:           inherit;
  --surface:      inherit;
  --surface-2:    inherit;
  --surface-3:    inherit;
  --line:         inherit;
  --line-2:       inherit;
  --fg:           inherit;
  --fg-2:         inherit;
  --fg-3:         inherit;
  --fg-4:         inherit;
  --accent:       inherit;
  --accent-bright: inherit;
  --accent-deep:  inherit;
  --accent-dim:   inherit;
  --accent-glow:  inherit;
  --on-accent:    inherit;
  --scrim:        inherit;
  --r:    inherit; --r-sm: inherit; --r-xs: inherit;
  --serif: inherit;
  --sans:  inherit;
  --mono:  inherit;
}
</style>
