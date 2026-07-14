<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <SysMobileNav v-if="hasSoul" />
  <ConsentBanner />
  <div id="teleports"></div>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul'

const { setLocale } = useI18n()
const { soulToken, hasSoul } = useSoul()

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
  --bg:           #000000;
  --surface:      #1a1a1a;
  --surface-2:    #212121;
  --surface-3:    #2a2a2a;
  --line:         rgba(236,236,236,0.07);
  --line-2:       rgba(236,236,236,0.12);
  --fg:           #ececec;
  --fg-2:         #ececec;
  --fg-3:         #ececec;
  --fg-4:         #ececec;
  --accent:       #6db89a;
  --accent-bright: #8ad0b3;
  --accent-deep:  #4f9a7e;
  --accent-dim:   rgba(109,184,154,0.14);
  --accent-glow:  rgba(109,184,154,0.28);
  --on-accent:    #0c1410;
  --scrim:        rgba(10,10,10,0.66);
  --r:    13px; --r-sm: 10px; --r-xs: 7px;
  --serif: 'Noto Serif', Georgia, serif;
  --sans:  'Inter', system-ui, sans-serif;
  --mono:  'JetBrains Mono', ui-monospace, monospace;
}
</style>
