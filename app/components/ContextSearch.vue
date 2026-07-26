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
        v-for="r in results" :key="r.origin"
        class="ctx-search-item"
        :href="r.origin"
        target="_blank" rel="noopener noreferrer"
      >
        <span class="ctx-search-avatar" aria-hidden="true">{{ r.initial }}</span>
        <span class="ctx-search-body">
          <span class="ctx-search-head">
            <span class="ctx-search-name">{{ r.title }}</span>
            <span class="ctx-search-url">{{ r.hostname }}</span>
          </span>
          <span v-if="r.meta" class="ctx-search-meta">{{ r.meta }}</span>
          <span v-if="r.snippet" class="ctx-search-desc" v-html="r.snippet"></span>
          <span v-if="r.tags?.length" class="ctx-search-tags">
            <span v-for="t in r.tags.slice(0, 6)" :key="t" class="ctx-search-tag">#{{ t }}</span>
          </span>
        </span>
      </a>
    </div>
  </div>
</template>

<script setup>
// Durchsucht das bestehende protokollweite Node-Verzeichnis (/api/soul/scan,
// siehe soul-mcp/server.mjs) UND zusätzlich die llms.txt jedes gefundenen
// Node (freier Volltext — Beschreibung, Preise, Kontakt, alles was ein
// Betreiber dort reinschreibt, nicht nur die strukturierten Felder aus dem
// Scan). Kein eigener Crawler nötig, kein KI-/Embedding-Aufruf (Kosten-
// gründe): einmaliges Laden bei erster Suche, danach reine String-Filterung
// im Browser — wie Google, mit Textausschnitt um den Treffer herum.
// Google-artig: Eingabe erst nach explizitem Absenden (Button/Enter)
// ausgewertet, kein Live-Filtern während des Tippens.
// Sicherheit: keine Regex aus Nutzereingabe (kein ReDoS, indexOf/includes
// statt RegExp), keine Server-Anfrage pro Tastendruck (kein Injection-Ziel),
// Eingabe auf 80 Zeichen gedeckelt. Der Snippet-Ausschnitt aus llms.txt wird
// vor der Anzeige HTML-escaped (eigene escapeHtml()) — erst danach wird der
// <mark>-Treffer eingefügt, sonst könnte eine Node ihre llms.txt mit Markup
// befüllen und über v-html Code einschleusen.
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const query          = ref('')
const submittedQuery = ref('')
const nodes          = ref([])   // [{ origin, souls: [...], llmsText: '' }]
const loading        = ref(false)
const loaded         = ref(false)
const error          = ref(false)
const hasSearched    = ref(false)

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function fetchLlmsTxt(origin) {
  try {
    const res = await fetch(`${origin}/llms.txt`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

async function ensureLoaded() {
  if (loaded.value || loading.value) return
  loading.value = true
  error.value = false
  try {
    const res = await fetch('/api/soul/scan')
    if (!res.ok) throw new Error('http_error')
    const data = await res.json()
    const souls = Array.isArray(data.souls) ? data.souls : []

    const byOrigin = new Map()
    for (const s of souls) {
      let origin
      try { origin = new URL(s.mcp_endpoint).origin } catch { continue }
      if (!byOrigin.has(origin)) byOrigin.set(origin, [])
      byOrigin.get(origin).push(s)
    }

    const origins = [...byOrigin.keys()]
    const llmsTexts = await Promise.all(origins.map(fetchLlmsTxt))
    nodes.value = origins.map((origin, i) => ({
      origin,
      souls: byOrigin.get(origin),
      llmsText: llmsTexts[i] || '',
    }))
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

// Google-artiger Textausschnitt: ~60 Zeichen vor/nach dem Treffer, Treffer
// selbst hervorgehoben. Arbeitet auf bereits escapetem HTML, damit <mark>
// sicher eingefügt werden kann, ohne dass Node-Text als Markup interpretiert wird.
function buildSnippet(rawText, query) {
  const lower = rawText.toLowerCase()
  const idx = lower.indexOf(query)
  if (idx === -1) return ''
  const start = Math.max(0, idx - 60)
  const end   = Math.min(rawText.length, idx + query.length + 60)
  const before = escapeHtml(rawText.slice(start, idx))
  const match  = escapeHtml(rawText.slice(idx, idx + query.length))
  const after  = escapeHtml(rawText.slice(idx + query.length, end))
  const prefix = start > 0 ? '…' : ''
  const suffix = end < rawText.length ? '…' : ''
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`
}

// Blockquote-Intro aus llms.txt ("> ...") als generische Fallback-
// Beschreibung, damit ein Ergebnis nie inhaltsleer wirkt, auch wenn der
// Treffer nur im Titel/Tag steckt und keine direkte Textstelle liefert.
function extractIntro(llmsText) {
  const lines = llmsText.split('\n').filter(l => l.trim().startsWith('>'))
  if (!lines.length) return ''
  const text = lines.map(l => l.replace(/^>\s?/, '')).join(' ').trim()
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

const results = computed(() => {
  const q = submittedQuery.value
  if (!q || error.value) return []
  const out = []
  for (const node of nodes.value) {
    const soulHaystack = node.souls.map(s => [s.name || '', s.description || '', ...(Array.isArray(s.tags) ? s.tags : [])].join(' ')).join(' ')
    const fullHaystack = `${soulHaystack} ${node.llmsText}`.toLowerCase()
    if (!fullHaystack.includes(q)) continue

    // Snippet bevorzugt aus llms.txt (mehr Kontext), dann aus der ersten
    // passenden Soul-Beschreibung, zuletzt die generische Intro — ein
    // Ergebnis zeigt also immer einen erklärenden Text, nie nur den Titel.
    let snippet = buildSnippet(node.llmsText, q)
    if (!snippet) {
      const hit = node.souls.find(s => (s.description || '').toLowerCase().includes(q))
      if (hit) snippet = buildSnippet(hit.description, q)
    }
    if (!snippet) snippet = escapeHtml(extractIntro(node.llmsText))

    const primarySoul = node.souls.find(s => s.name && !/^[0-9a-f-]{8,}$/.test(s.name)) || node.souls[0]
    const titleMatch = node.llmsText.match(/^#\s*(.+)$/m)
    const title = primarySoul?.name || (titleMatch ? titleMatch[1].trim() : new URL(node.origin).hostname)

    const soulCount = node.souls.length
    const prices = node.souls.map(s => s.usdc_current ?? s.price_usdc).filter(p => typeof p === 'number' && p > 0)
    const metaParts = [t(soulCount === 1 ? 'landing.search_meta_soul_one' : 'landing.search_meta_soul_other', { n: soulCount })]
    metaParts.push(prices.length ? t('landing.search_meta_price', { p: Math.min(...prices) }) : t('landing.search_meta_free'))

    out.push({
      origin: node.origin,
      hostname: new URL(node.origin).hostname,
      initial: title.trim().charAt(0).toUpperCase() || '?',
      title,
      snippet,
      meta: metaParts.join(' · '),
      tags: [...new Set(node.souls.flatMap(s => s.tags || []))],
    })
  }
  return out.slice(0, 20)
})
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
  max-height: 460px; overflow-y: auto; padding: 6px;
}
.ctx-search-msg { font-size: 14px; color: var(--fg-3); text-align: center; padding: 16px 8px; margin: 0; }
.ctx-search-item {
  display: flex; align-items: flex-start; gap: 12px; padding: 14px 12px;
  border-radius: var(--r-sm); text-decoration: none; color: var(--fg);
  transition: background .12s;
}
.ctx-search-item + .ctx-search-item { border-top: 1px solid var(--line); }
.ctx-search-item:hover, .ctx-search-item:focus-visible { background: var(--surface-2); }
.ctx-search-avatar {
  flex: none; width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-dim, rgba(109,184,154,0.18)); color: var(--accent);
  font-family: var(--serif); font-size: 16px; font-weight: 600;
}
.ctx-search-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.ctx-search-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ctx-search-name { font-size: 16px; font-weight: 600; color: var(--fg); }
.ctx-search-url { font-family: var(--mono); font-size: 11px; color: var(--accent); }
.ctx-search-meta { font-size: 12px; color: var(--fg-3); }
.ctx-search-desc { font-size: 13px; color: var(--fg-2); line-height: 1.55; }
.ctx-search-desc :deep(mark) { background: var(--accent-dim, rgba(109,184,154,0.25)); color: var(--fg); border-radius: 2px; padding: 0 1px; }
.ctx-search-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.ctx-search-tag { font-size: 11px; color: var(--accent); }

@media (max-width: 640px) {
  .ctx-search { max-width: none; }
}
</style>
