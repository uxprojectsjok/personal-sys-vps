<template>
  <div class="ctx-search">
    <div class="ctx-search-box" :class="{ focused: focused }">
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
        @focus="onFocus"
        @blur="onBlur"
      />
      <span v-if="loading" class="ctx-search-spinner" aria-hidden="true" />
    </div>
    <p class="ctx-search-hint">{{ $t('landing.search_hint') }}</p>

    <Transition name="ctx-fade">
      <div v-if="showPanel" class="ctx-search-results" role="listbox">
        <p v-if="error" class="ctx-search-msg">{{ $t('landing.search_error') }}</p>
        <p v-else-if="loading && !loaded" class="ctx-search-msg">{{ $t('landing.search_loading') }}</p>
        <p v-else-if="results.length === 0" class="ctx-search-msg">{{ $t('landing.search_empty') }}</p>
        <a
          v-for="s in results" :key="s.soul_id"
          class="ctx-search-item"
          :href="originOf(s.mcp_endpoint)"
          target="_blank" rel="noopener noreferrer"
          role="option"
        >
          <span class="ctx-search-name">{{ s.name }}</span>
          <span v-if="s.description" class="ctx-search-desc">{{ s.description }}</span>
          <span v-if="s.tags?.length" class="ctx-search-tags">
            <span v-for="t in s.tags.slice(0, 6)" :key="t" class="ctx-search-tag">#{{ t }}</span>
          </span>
        </a>
      </div>
    </Transition>
  </div>
</template>

<script setup>
// Durchsucht das bestehende protokollweite Soul-Verzeichnis (/api/soul/scan,
// siehe soul-mcp/server.mjs) — aggregiert bereits alle Souls über alle
// bekannten Nodes hinweg per On-Chain-Registry, kein eigener Crawler nötig.
// Rein clientseitige Stichwortsuche, kein KI-/Embedding-Aufruf (Kostengründe):
// einmaliges Laden bei erster Interaktion, danach reine String-Filterung im
// Browser. Sicherheit: keine Regex aus Nutzereingabe (kein ReDoS), keine
// Server-Anfrage pro Tastendruck (kein Injection-Ziel), Eingabe auf 80
// Zeichen gedeckelt, Ausgabe läuft ausschließlich über Vues automatisches
// Escaping (kein v-html) — auch bösartig befüllte Soul-Metadaten können hier
// kein Markup einschleusen.
import { ref, computed } from 'vue'

const query   = ref('')
const souls   = ref([])
const loading = ref(false)
const loaded  = ref(false)
const error   = ref(false)
const focused = ref(false)

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

function onFocus() {
  focused.value = true
  ensureLoaded()
}
function onBlur() {
  // Kurze Verzögerung, damit ein Klick auf ein Ergebnis (das sonst vor dem
  // Blur-Handler verschwinden würde) noch ankommt.
  setTimeout(() => { focused.value = false }, 150)
}

const normalizedQuery = computed(() => query.value.trim().slice(0, 80).toLowerCase())

const results = computed(() => {
  const q = normalizedQuery.value
  if (!q) return []
  return souls.value.filter(s => {
    const haystack = [s.name || '', s.description || '', ...(Array.isArray(s.tags) ? s.tags : [])]
      .join(' ').toLowerCase()
    return haystack.includes(q)
  }).slice(0, 20)
})

const showPanel = computed(() => focused.value && normalizedQuery.value.length >= 2)

function originOf(mcpEndpoint) {
  try { return new URL(mcpEndpoint).origin } catch { return '#' }
}
</script>

<style scoped>
.ctx-search { position: relative; width: 100%; max-width: 480px; margin: 0 0 32px; }
.ctx-search-box {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); transition: border-color .15s, box-shadow .15s;
}
.ctx-search-box.focused { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow, transparent); }
.ctx-search-icon { width: 18px; height: 18px; flex: none; color: var(--fg-3); }
.ctx-search-input {
  flex: 1; min-width: 0; background: none; border: none; outline: none;
  color: var(--fg); font-family: var(--sans); font-size: 15px;
}
.ctx-search-input::placeholder { color: var(--fg-3); }
.ctx-search-spinner {
  width: 14px; height: 14px; flex: none; border: 2px solid var(--fg-4); border-top-color: var(--accent);
  border-radius: 50%; animation: ctx-search-spin .7s linear infinite;
}
@keyframes ctx-search-spin { to { transform: rotate(360deg); } }
.ctx-search-hint { font-size: 12px; color: var(--fg-4); margin: 8px 0 0; }

.ctx-search-results {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30;
  background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--r-sm);
  box-shadow: 0 12px 32px rgba(0,0,0,0.28);
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

.ctx-fade-enter-active, .ctx-fade-leave-active { transition: opacity .15s ease, transform .15s ease; }
.ctx-fade-enter-from, .ctx-fade-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 640px) {
  .ctx-search { max-width: none; }
}
</style>
