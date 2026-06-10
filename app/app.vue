<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <SysMobileNav />
  <div id="teleports"></div>
</template>

<script setup>
// Service Worker registrieren — erforderlich für PWA-Installierbarkeit auf Android/Chrome
if (import.meta.client && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
</script>

<style>
/* Teleport-Ziel für ChatInterface dock + FAB auf Mobile.
   CSS-Variablen werden hier definiert, damit die teleportierten Elemente
   außerhalb von .sys-chat trotzdem korrekte Farb- und Schriftwerte erben. */
#teleports {
  --bg:           #161513;
  --surface:      #1c1b18;
  --surface-2:    #232220;
  --surface-3:    #2b2926;
  --line:         rgba(245,241,234,0.07);
  --line-2:       rgba(245,241,234,0.12);
  --fg:           #f4f1ea;
  --fg-2:         rgba(244,241,234,0.72);
  --fg-3:         rgba(244,241,234,0.48);
  --fg-4:         rgba(244,241,234,0.30);
  --accent:       #6db89a;
  --accent-bright: #8ad0b3;
  --accent-deep:  #4f9a7e;
  --accent-dim:   rgba(109,184,154,0.14);
  --accent-glow:  rgba(109,184,154,0.28);
  --on-accent:    #0c1410;
  --scrim:        rgba(10,9,8,0.66);
  --r:    13px; --r-sm: 10px; --r-xs: 7px;
  --serif: 'Noto Serif', Georgia, serif;
  --sans:  'Inter', system-ui, sans-serif;
  --mono:  'JetBrains Mono', ui-monospace, monospace;
}
</style>
