<template>
  <div class="link-page">
    <!-- Loading -->
    <div v-if="loading" class="link-center">
      <span class="link-spinner"></span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="link-center">
      <div class="link-error-box">
        <svg class="link-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>
        </svg>
        <p class="link-error-title">{{ errorTitle }}</p>
        <p class="link-error-sub">{{ errorSub }}</p>
      </div>
    </div>

    <!-- Content -->
    <template v-else>
      <header class="link-header">
        <div class="link-header-inner">
          <span class="link-badge">SYS</span>
          <span class="link-label">{{ fileLabel }}</span>
        </div>
      </header>

      <!-- Markdown content -->
      <main class="link-main">
        <div class="link-body" v-html="rendered"></div>
      </main>

      <footer class="link-footer">
        <span>{{ $t('link.footer') }}</span>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

definePageMeta({ layout: false })

const route    = useRoute()
const { t }    = useI18n()
const loading  = ref(true)
const error    = ref(false)
const errorTitle = ref('')
const errorSub   = ref('')
const rawContent = ref('')
const fileLabel  = ref('')
const fileExt    = ref('md')

// ── Minimal Markdown → HTML ──────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function renderMarkdown(src) {
  const lines = src.split('\n')
  const out   = []
  let inUl = false, inOl = false, inCode = false, codeLines = []

  const flushList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  const inlineFormat = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')

  for (const raw of lines) {
    const line = raw

    // Fenced code block
    if (line.startsWith('```')) {
      if (inCode) {
        out.push('<pre><code>' + escHtml(codeLines.join('\n')) + '</code></pre>')
        inCode = false; codeLines = []
      } else { flushList(); inCode = true }
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.+)/)
    if (h) { flushList(); out.push(`<h${h[1].length}>${inlineFormat(escHtml(h[2]))}</h${h[1].length}>`); continue }

    // HR
    if (/^---+$/.test(line.trim())) { flushList(); out.push('<hr>'); continue }

    // Unordered list
    const ul = line.match(/^[\-\*]\s+(.+)/)
    if (ul) {
      if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false }; out.push('<ul>'); inUl = true }
      out.push(`<li>${inlineFormat(escHtml(ul[1]))}</li>`); continue
    }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) {
      if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false }; out.push('<ol>'); inOl = true }
      out.push(`<li>${inlineFormat(escHtml(ol[1]))}</li>`); continue
    }

    // Blockquote
    const bq = line.match(/^>\s*(.*)/)
    if (bq) { flushList(); out.push(`<blockquote>${inlineFormat(escHtml(bq[1]))}</blockquote>`); continue }

    // Empty line
    if (line.trim() === '') { flushList(); out.push('<br>'); continue }

    // Paragraph
    flushList()
    out.push(`<p>${inlineFormat(escHtml(line))}</p>`)
  }
  flushList()
  return out.join('\n')
}

const rendered = computed(() => {
  if (!rawContent.value) return ''
  if (fileExt.value === 'json') {
    try {
      const obj = JSON.parse(rawContent.value)
      return '<pre><code>' + escHtml(JSON.stringify(obj, null, 2)) + '</code></pre>'
    } catch { return '<pre><code>' + escHtml(rawContent.value) + '</code></pre>' }
  }
  if (fileExt.value === 'txt' || fileExt.value === 'csv') {
    return '<pre>' + escHtml(rawContent.value) + '</pre>'
  }
  return renderMarkdown(rawContent.value)
})

onMounted(async () => {
  const { soul_id, token } = route.params
  try {
    const res = await fetch(`/api/vault/link/${soul_id}/${token}`)
    if (!res.ok) {
      error.value = true
      if (res.status === 403) {
        errorTitle.value = t('link.err_disabled')
        errorSub.value   = t('link.err_disabled_sub')
      } else if (res.status === 401) {
        errorTitle.value = t('link.err_invalid')
        errorSub.value   = t('link.err_invalid_sub')
      } else {
        errorTitle.value = t('link.err_not_found')
        errorSub.value   = `Status ${res.status}`
      }
      return
    }
    rawContent.value = await res.text()
    fileLabel.value  = res.headers.get('x-soul-label') || res.headers.get('x-soul-file') || t('link.file_label_default')
    fileExt.value    = (fileLabel.value.split('.').pop() || 'md').toLowerCase()
  } catch (e) {
    error.value    = true
    errorTitle.value = t('link.err_unavailable')
    errorSub.value   = t('link.err_connection')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.link-page {
  min-height: 100vh;
  background: #0e0e0c;
  color: rgba(255,255,255,0.82);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* ── Header ── */
.link-header {
  border-bottom: 1px solid rgba(255,255,255,0.07);
  padding: 14px 24px;
  display: flex;
  align-items: center;
}
.link-header-inner { display: flex; align-items: center; gap: 10px; }
.link-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  color: #6db89a; border: 1px solid rgba(109,184,154,0.35);
  padding: 2px 7px; border-radius: 4px;
}
.link-label {
  font-size: 13px; color: rgba(255,255,255,0.55); font-family: monospace;
}

/* ── Main ── */
.link-main {
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

/* ── Markdown body ── */
.link-body { font-size: 15px; line-height: 1.75; color: rgba(255,255,255,0.78); }
.link-body :deep(h1) { font-size: 1.6em; font-weight: 700; color: #fff; margin: 1.2em 0 0.5em; line-height: 1.3; }
.link-body :deep(h2) { font-size: 1.25em; font-weight: 600; color: rgba(255,255,255,0.9); margin: 1.4em 0 0.5em; border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 0.3em; }
.link-body :deep(h3) { font-size: 1.05em; font-weight: 600; color: rgba(255,255,255,0.85); margin: 1.2em 0 0.4em; }
.link-body :deep(h4),
.link-body :deep(h5),
.link-body :deep(h6) { font-size: 0.95em; font-weight: 600; color: rgba(255,255,255,0.75); margin: 1em 0 0.3em; }
.link-body :deep(p)  { margin: 0.6em 0; }
.link-body :deep(br) { display: block; margin: 0.3em 0; content: ""; }
.link-body :deep(ul) { padding-left: 1.4em; margin: 0.5em 0; list-style: disc; }
.link-body :deep(ol) { padding-left: 1.4em; margin: 0.5em 0; }
.link-body :deep(li) { margin: 0.25em 0; }
.link-body :deep(blockquote) {
  border-left: 3px solid rgba(109,184,154,0.5);
  padding: 0.4em 1em; margin: 0.8em 0;
  color: rgba(255,255,255,0.5); font-style: italic;
  background: rgba(255,255,255,0.03);
}
.link-body :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em; background: rgba(255,255,255,0.07);
  padding: 0.15em 0.4em; border-radius: 4px; color: #a5f3c0;
}
.link-body :deep(pre) {
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; padding: 1em 1.2em; overflow-x: auto; margin: 1em 0;
}
.link-body :deep(pre code) { background: none; padding: 0; font-size: 0.9em; color: rgba(255,255,255,0.75); }
.link-body :deep(a) { color: #6db89a; text-decoration: none; }
.link-body :deep(a:hover) { text-decoration: underline; }
.link-body :deep(hr) { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.5em 0; }
.link-body :deep(strong) { color: rgba(255,255,255,0.95); font-weight: 600; }

/* ── Loading/Error ── */
.link-center {
  min-height: 70vh; display: flex; align-items: center; justify-content: center;
}
.link-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: #6db89a;
  animation: spin 0.8s linear infinite;
  display: block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.link-error-box { text-align: center; }
.link-error-icon { width: 40px; height: 40px; color: rgba(255,255,255,0.2); margin: 0 auto 12px; display: block; }
.link-error-title { font-size: 15px; color: rgba(255,255,255,0.6); margin-bottom: 6px; }
.link-error-sub   { font-size: 13px; color: rgba(255,255,255,0.3); }

/* ── Footer ── */
.link-footer {
  text-align: center; font-size: 11px; color: rgba(255,255,255,0.2);
  padding: 16px; border-top: 1px solid rgba(255,255,255,0.05);
  letter-spacing: 0.05em;
}
</style>
