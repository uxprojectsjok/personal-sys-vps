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

// Zerlegt die node-weite llms.txt in ihre "### {Soul}"-Blöcke (server-seitig
// erzeugt, siehe soul-mcp/server.mjs pushSoulFieldLines) — ein Treffer wird
// dadurch der EINZELNEN Soul zugeordnet statt pauschal dem ganzen Node, samt
// deren eigener "Own llms.txt: {url}"-Zeile als direktes Link-Ziel. Sonst
// verlinkt jedes Ergebnis nur auf die generische Node-Übersicht, und eine KI
// bräuchte einen zweiten Hop, um bei der tatsächlich gemeinten Soul zu landen
// — genau das Problem, das die Soul-eigene llms.txt (siehe pushSoulFieldLines)
// lösen sollte. parts[0] ist der Node-Intro-Text vor der ersten Soul (Legal-
// Hinweis etc.), bleibt für Treffer außerhalb jeder Soul als Fallback.
function splitSoulSegments(llmsText) {
  const parts = llmsText.split(/\n(?=### )/)
  const intro = parts[0] || ''
  const souls = parts.slice(1).map(seg => {
    const cut = seg.indexOf('\n## How to access')
    return cut === -1 ? seg : seg.slice(0, cut)
  })
  return { intro, souls }
}

function search(rawQuery, t) {
  const q = (rawQuery || '').trim().slice(0, 80).toLowerCase()
  if (!q || error.value) return []
  const out = []
  for (const node of nodes.value) {
    const { intro, souls: segments } = splitSoulSegments(node.llmsText)
    let anySoulMatched = false

    for (const segment of segments) {
      if (!segment.toLowerCase().includes(q)) continue
      anySoulMatched = true

      const soulId  = segment.match(/\*\*soul_id:\*\*\s*`([^`]+)`/)?.[1]
      const ownUrl  = segment.match(/Own llms\.txt:\s*(\S+)/)?.[1]
      const heading = segment.match(/^### (.+)/)?.[1]?.trim()
      const meta    = soulId ? node.souls.find(s => s.soul_id === soulId) : null

      let snippet = buildSnippet(segment, q)
      if (!snippet) snippet = escapeHtml(extractIntro(segment)) || escapeHtml(extractIntro(node.llmsText))

      const price = meta && (meta.usdc_current ?? meta.price_usdc)
      const metaParts = [t('landing.search_meta_soul_one', { n: 1 })]
      metaParts.push(typeof price === 'number' && price > 0 ? t('landing.search_meta_price', { p: price }) : t('landing.search_meta_free'))

      out.push({
        origin: node.origin,
        // Direkter Soul-Link statt der Node-Übersicht — siehe splitSoulSegments()
        // oben. Fällt nur auf die Node-llms.txt zurück, falls die Zeile aus
        // irgendeinem Grund fehlt (z.B. Node läuft noch auf einer älteren
        // Version ohne Soul-eigene llms.txt).
        llmsUrl: ownUrl || `${node.origin}/llms.txt`,
        hostname: new URL(node.origin).hostname,
        initial: (heading || meta?.name || '?').trim().charAt(0).toUpperCase() || '?',
        title: heading || meta?.name || soulId || new URL(node.origin).hostname,
        snippet,
        meta: metaParts.join(' · '),
        tags: meta?.tags || [],
      })
    }

    // Fallback: Treffer nur im Node-Intro (Legal-Text etc.) oder Node ohne
    // Souls — unverändertes altes Verhalten, verlinkt auf die Node-Übersicht,
    // weil hier keine einzelne Soul zuständig ist.
    if (!anySoulMatched && intro.toLowerCase().includes(q)) {
      let snippet = buildSnippet(intro, q) || escapeHtml(extractIntro(node.llmsText))
      const titleMatch = node.llmsText.match(/^#\s*(.+)$/m)
      const title = titleMatch ? titleMatch[1].trim() : new URL(node.origin).hostname
      out.push({
        origin: node.origin,
        llmsUrl: `${node.origin}/llms.txt`,
        hostname: new URL(node.origin).hostname,
        initial: title.trim().charAt(0).toUpperCase() || '?',
        title,
        snippet,
        meta: t(node.souls.length === 1 ? 'landing.search_meta_soul_one' : 'landing.search_meta_soul_other', { n: node.souls.length }),
        tags: [...new Set(node.souls.flatMap(s => s.tags || []))],
      })
    }
  }
  return out
}

export function useNetworkSearch() {
  return { nodes, loading, loaded, error, ensureLoaded, search }
}
