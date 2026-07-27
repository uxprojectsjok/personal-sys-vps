// useNetworkSearch.js
// Geteilte Such-Logik für ContextSearch.vue (Landing-Suchfeld, navigiert nur)
// und search.vue (die eigentliche Ergebnis-Seite). Durchsucht das bestehende
// protokollweite Node-Verzeichnis (/api/soul/scan, siehe soul-mcp/server.mjs)
// UND zusätzlich die llms.txt jedes gefundenen Node (freier Volltext).
// Kein eigener Crawler, kein KI-/Embedding-Aufruf (Kostengründe): einmaliges
// Laden, danach reine String-Filterung im Browser.
// Sicherheit: keine Regex aus Nutzereingabe (kein ReDoS, indexOf/includes
// statt RegExp), Eingabe auf 80 Zeichen gedeckelt. Der Snippet-Ausschnitt aus
// llms.txt wird vor der Anzeige HTML-escaped (escapeHtml()) — erst danach
// wird der <mark>-Treffer eingefügt, sonst könnte eine Node ihre llms.txt mit
// Markup befüllen und über v-html Code einschleusen.
import { ref } from 'vue'

const nodes  = ref([])   // [{ origin, souls: [...], llmsText: '' }]
const loading = ref(false)
const loaded  = ref(false)
const error   = ref(false)

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
// Beschreibung, damit ein Ergebnis nie inhaltsleer wirkt.
function extractIntro(llmsText) {
  const lines = llmsText.split('\n').filter(l => l.trim().startsWith('>'))
  if (!lines.length) return ''
  const text = lines.map(l => l.replace(/^>\s?/, '')).join(' ').trim()
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

function search(rawQuery, t) {
  const q = (rawQuery || '').trim().slice(0, 80).toLowerCase()
  if (!q || error.value) return []
  const out = []
  for (const node of nodes.value) {
    const soulHaystack = node.souls.map(s => [s.name || '', s.description || '', ...(Array.isArray(s.tags) ? s.tags : [])].join(' ')).join(' ')
    const fullHaystack = `${soulHaystack} ${node.llmsText}`.toLowerCase()
    if (!fullHaystack.includes(q)) continue

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
      // Ziel des Ergebnis-Links: llms.txt statt der bloßen Origin — "/" ist bei
      // fremden Nodes hinter deren eigenem Gate (Login/Create-Soul-Flow für
      // Besucher ohne lokale Session), llms.txt ist die öffentliche, ungegatete
      // Content-Seite jeder Node (siehe scanner.vue, gleiches Muster).
      llmsUrl: `${node.origin}/llms.txt`,
      hostname: new URL(node.origin).hostname,
      initial: title.trim().charAt(0).toUpperCase() || '?',
      title,
      snippet,
      meta: metaParts.join(' · '),
      tags: [...new Set(node.souls.flatMap(s => s.tags || []))],
    })
  }
  return out
}

export function useNetworkSearch() {
  return { nodes, loading, loaded, error, ensureLoaded, search }
}
