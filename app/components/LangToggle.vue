<template>
  <button
    class="lang-toggle"
    @click="toggle"
    :aria-label="lang === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'"
  >
    <span :class="{ active: lang === 'de' }">DE</span>
    <span class="sep">/</span>
    <span :class="{ active: lang === 'en' }">EN</span>
  </button>
</template>

<script setup>
const { lang, toggle } = useLang()
</script>

<style scoped>
.lang-toggle {
  font-family: var(--mono);
  font-size: 17px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.4);
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  transition: color 0.15s;
  white-space: nowrap;
}
.lang-toggle:hover { color: rgba(255,255,255,0.65); }
.lang-toggle span.active { color: #6db89a; font-weight: 600; }
.sep { opacity: 0.35; }
</style>
