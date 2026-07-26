<template>
  <button
    class="locale-toggle"
    @click="toggle"
    :aria-label="locale === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'"
  >
    <span :class="{ active: locale === 'de' }">DE</span>
    <span class="sep">/</span>
    <span :class="{ active: locale === 'en' }">EN</span>
  </button>
</template>

<script setup>
// Sprachumschalter für die Landing-Page — nutzt das App-weite vue-i18n
// (useI18n), nicht das eigenständige useLang()/LangToggle-System der
// /scanner-Seite (siehe project_sys_v2_vision Memory: zwei bewusst getrennte
// i18n-Systeme). Gleicher Umschalt-Mechanismus wie SettingsModal.vue.
import { useI18n } from 'vue-i18n'

const { locale, setLocale } = useI18n()

function toggle() {
  const next = locale.value === 'de' ? 'en' : 'de'
  setLocale(next)
  localStorage.setItem('sys-locale', next)
}
</script>

<style scoped>
.locale-toggle {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
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
.locale-toggle:hover { color: var(--fg); }
.locale-toggle span.active { color: var(--accent); font-weight: 600; }
.sep { opacity: 0.4; }
</style>
