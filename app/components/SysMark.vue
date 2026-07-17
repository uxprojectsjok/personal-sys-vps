<template>
  <img
    src="/logo.png"
    alt="SYS"
    class="sys-mark"
    :style="{ width: size, height: 'auto' }"
  />
</template>

<script setup>
// Zentrale Logo-Marke — ersetzt den früheren "SYS." Text-Schriftzug
// (.gate-mark) auf gate.vue/index.vue/join.vue. Einziger Ort, der public/
// logo.png referenziert, damit ein Rebrand (siehe utils/generate-icons.mjs)
// nicht an drei Stellen einzeln nachgezogen werden muss.
defineProps({
  size: { type: String, default: '52px' },
})
</script>

<style scoped>
.sys-mark { display: block; margin: 0 auto 8px; }
</style>
