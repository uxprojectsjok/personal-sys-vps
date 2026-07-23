<template>
  <div class="sys-mark-wrap">
    <img
      src="/logo.png"
      alt="SYS"
      class="sys-mark"
      :style="{ width: size, height: 'auto' }"
    />
    <div v-if="operator" class="sys-mark-operator">{{ operator }}</div>
  </div>
</template>

<script setup>
// Zentrale Logo-Marke — ersetzt den früheren "SYS." Text-Schriftzug
// (.gate-mark) auf gate.vue/index.vue/join.vue. Einziger Ort, der public/
// logo.png referenziert, damit ein Rebrand (siehe utils/generate-icons.mjs)
// nicht an drei Stellen einzeln nachgezogen werden muss.
// operator: optionale Betreiber-Zeile unter dem Logo, z.B. für Multi-Hoster-
// Betreiber die sich mit Namen zeigen wollen — leer per Default, kein Zwang.
defineProps({
  size: { type: String, default: '52px' },
  operator: { type: String, default: '' },
})
</script>

<style scoped>
.sys-mark-wrap { display: flex; flex-direction: column; align-items: center; }
.sys-mark { display: block; margin: 0 auto 8px; }
.sys-mark-operator {
  font-family: var(--mono); font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg-2); margin: 0 0 16px;
}
</style>
