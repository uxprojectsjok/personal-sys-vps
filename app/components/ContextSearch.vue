<template>
  <div class="ctx-search">
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
      <button type="submit" class="ctx-search-submit" :disabled="loading || !query.trim()" :aria-label="$t('landing.search_placeholder')">
        <span v-if="loading" class="ctx-search-spinner" aria-hidden="true" />
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6"/>
        </svg>
      </button>
    </form>
    <p class="ctx-search-hint">{{ $t('landing.search_hint') }}</p>

    <div v-if="hasSearched" class="ctx-search-results" role="region" :aria-label="$t('landing.search_placeholder')">
      <p v-if="error" class="ctx-search-msg">{{ $t('landing.search_error') }}</p>
      <p v-else-if="results.length === 0" class="ctx-search-msg">{{ $t('landing.search_empty') }}</p>
      <a
        v-for="s in results" :key="s.soul_id"
        class="ctx-search-item"
        :href="originOf(s.mcp_endpoint)"
        target="_blank" rel="noopener noreferrer"
      >
        <span class="ctx-search-name">{{ s.name }}</span>
        <span v-if="s.description" class="ctx-search-desc">{{ s.description }}</span>
        <span v-if="s.tags?.length" class="ctx-search-tags">
          <span v-for="t in s.tags.slice(0, 6)" :key="t" class="ctx-search-tag">#{{ t }}</span>
        </span>
      </a>
    </div>
  </div>
</template>

<script setup>
// Durchsucht das bestehende protokollweite Node-Verzeichnis (/api/soul/scan,
// siehe soul-mcp/server.mjs) — aggregiert bereits alle Nodes/Souls über alle
// bekannten Nodes hinweg per On-Chain-Registry, kein eigener Crawler nötig.
// Rein clientseitige Stichwortsuche, kein KI-/Embedding-Aufruf (Kostengründe):
// einmaliges Laden bei erster Suche, danach reine String-Filterung im
// Browser. Google-artig: Eingabe erst nach explizitem Absenden (Button/Enter)
// ausgewertet, kein Live-Filtern während des Tippens.
// Sicherheit: keine Regex aus Nutzereingabe (kein ReDoS), keine
// Server-Anfrage pro Tastendruck (kein Injection-Ziel), Eingabe auf 80
// Zeichen gedeckelt, Ausgabe läuft ausschließlich über Vues automatisches
// Escaping (kein v-html) — auch bösartig befüllte Node-Metadaten können hier
// kein Markup einschleusen.
import { ref, computed } from 'vue'

const query          = ref('')
const submittedQuery = ref('')
const souls          = ref([])
const loading        = ref(false)
const loaded         = ref(false)
const error          = ref(false)
const hasSearched    = ref(false)

async function ensureLoaded() {
  if (loaded.value || loading.value) return
  loading.value = true
  error.value = false
  try {
    const res = await fetch('/api/soul/scan')
    if (!res.ok) throw new Error('http_error')
    const data = await res.json()
    souls.value = Array.isArray(data.souls) ? data.souls : []
    loaded.value = true
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

async function doSearch() {
  const q = query.value.trim().slice(0, 80)
  if (!q) return
  await ensureLoaded()
  submittedQuery.value = q.toLowerCase()
  hasSearched.value = true
}

const results = computed(() => {
  const q = submittedQuery.value
  if (!q || error.value) return []
  return souls.value.filter(s => {
    const haystack = [s.name || '', s.description || '', ...(Array.isArray(s.tags) ? s.tags : [])]
      .join(' ').toLowerCase()
    return haystack.includes(q)
  }).slice(0, 20)
})

function originOf(mcpEndpoint) {
  try { return new URL(mcpEndpoint).origin } catch { return '#' }
}
</script>

<style scoped>
.ctx-search { position: relative; width: 100%; max-width: 480px; margin: 0 0 32px; }
.ctx-search-box {
  display: flex; align-items: center; gap: 10px;
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
.ctx-search-spinner {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
  border-radius: 50%; animation: ctx-search-spin .7s linear infinite;
}
@keyframes ctx-search-spin { to { transform: rotate(360deg); } }
.ctx-search-hint { font-size: 12px; color: var(--fg-4); margin: 8px 0 0; }

.ctx-search-results {
  margin-top: 14px;
  background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--r-sm);
  max-height: 360px; overflow-y: auto; padding: 6px;
}
.ctx-search-msg { font-size: 14px; color: var(--fg-3); text-align: center; padding: 16px 8px; margin: 0; }
.ctx-search-item {
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  border-radius: var(--r-sm); text-decoration: none; color: var(--fg);
  transition: background .12s;
}
.ctx-search-item:hover, .ctx-search-item:focus-visible { background: var(--surface-2); }
.ctx-search-name { font-size: 14px; font-weight: 500; color: var(--fg); }
.ctx-search-desc { font-size: 13px; color: var(--fg-2); line-height: 1.4; }
.ctx-search-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.ctx-search-tag { font-size: 11px; color: var(--accent); }

@media (max-width: 640px) {
  .ctx-search { max-width: none; }
}
</style>
