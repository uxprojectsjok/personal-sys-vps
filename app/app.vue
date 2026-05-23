<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
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
  --rule:         rgba(226, 220, 240, 0.10);
  --rule-2:       rgba(226, 220, 240, 0.20);
  --fg:           #ece7f5;
  --fg-2:         rgba(236, 231, 245, 0.88);
  --fg-3:         rgba(236, 231, 245, 0.70);
  --fg-4:         rgba(236, 231, 245, 0.55);
  --accent:       #8b5cf6;
  --accent-bright: #a78bfa;
  --accent-dim:   rgba(139, 92, 246, 0.12);
  --on-accent:    #0a0810;
  --paper-3:      #0d0b14;
  --serif:        'Noto Serif', Georgia, serif;
  --mono:         'JetBrains Mono', ui-monospace, monospace;
  --sans:         'Inter', system-ui, sans-serif;
}
</style>
