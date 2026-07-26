<template>
  <form class="ctx-search-box" @submit.prevent="doSearch">
    <svg class="ctx-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
      <circle cx="11" cy="11" r="7"/>
      <path stroke-linecap="round" d="m20 20-3.5-3.5"/>
    </svg>
    <input
      v-model="query"
      type="text"
      class="ctx-search-input"
      :placeholder="$t('landing.search_placeholder')"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      maxlength="80"
      :aria-label="$t('landing.search_placeholder')"
    />
    <button type="submit" class="ctx-search-submit" :disabled="!query.trim()" :aria-label="$t('landing.search_placeholder')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6"/>
      </svg>
    </button>
  </form>
</template>

<script setup>
// Reines Suchfeld — navigiert bei Absenden zur eigenständigen Ergebnis-Seite
// (search.vue), zeigt selbst keine Ergebnisse mehr (vorher: Inline-Dropdown
// auf der Landing, jetzt eine echte, Google-artige Ergebnisseite). Die
// eigentliche Such-Logik lebt in useNetworkSearch.js, geteilt mit search.vue.
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const query  = ref('')

function doSearch() {
  const q = query.value.trim().slice(0, 80)
  if (!q) return
  router.push({ path: '/search', query: { q } })
}
</script>

<style scoped>
.ctx-search-box {
  display: flex; align-items: center; gap: 10px; width: 100%; max-width: 480px; margin: 0 0 32px;
  padding: 6px 6px 6px 16px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); transition: border-color .15s, box-shadow .15s;
}
.ctx-search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow, transparent); }
.ctx-search-icon { width: 18px; height: 18px; flex: none; color: var(--fg-3); }
.ctx-search-input {
  flex: 1; min-width: 0; background: none; border: none; outline: none;
  color: var(--fg); font-family: var(--sans); font-size: 15px; padding: 10px 0;
}
.ctx-search-input::placeholder { color: var(--fg-3); }
.ctx-search-submit {
  flex: none; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--on-accent, #fff); border: none; border-radius: var(--r-sm);
  cursor: pointer; transition: background .15s, opacity .15s;
}
.ctx-search-submit svg { width: 18px; height: 18px; }
.ctx-search-submit:hover:not(:disabled) { background: var(--accent-bright, var(--accent)); }
.ctx-search-submit:disabled { opacity: .4; cursor: not-allowed; }

@media (max-width: 640px) {
  .ctx-search-box { max-width: none; }
}
</style>
