// popup.js – SaveYourSoul Companion Extension
'use strict'

const API_BASE = 'https://YOUR_DOMAIN'

let soulCert    = null
let soulContent = null
let pageInfo    = null
let isStreaming = false
const messages  = []
const attachedFiles = []

// Detached mode
const isDetached = new URLSearchParams(location.search).has('detached')
if (isDetached) document.documentElement.classList.add('detached')

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get(['soul_cert', 'soul_cache', 'el_agent_url'])
  soulCert    = data.soul_cert  || null
  soulContent = data.soul_cache || null

  if (soulCert && soulContent) {
    const nameMatch = soulContent.match(/soul_name:\s*(.+)/)
    setStatus('connected', nameMatch?.[1]?.trim() || 'Soul', 'Verbunden')
  } else if (soulCert) {
    loadSoul()
  } else {
    setStatus('disconnected', 'Nicht verbunden', 'In ⚙️ mit SYS verbinden')
  }

  // ElevenLabs URL aus config.json lesen
  try {
    const cfg = await fetch(chrome.runtime.getURL('elevenlabs.config.json')).then(r => r.json())
    if (cfg.agent_url) renderVoiceTab(cfg.agent_url)
  } catch {}

  loadPageInfo()
  setupListeners()
}

// ── Soul ──────────────────────────────────────────────────────────────────────

async function loadSoul() {
  if (!soulContent) setStatus('loading', 'Verbinde…', 'Soul wird geladen…')
  try {
    const r = await fetch(`${API_BASE}/api/soul`, {
      headers: { Authorization: `Bearer ${soulCert}` }
    })
    if (r.status === 401) { setStatus('disconnected', 'Ungültiges Cert', 'Soul-Cert prüfen'); return }
    if (!r.ok) {
      if (soulContent) {
        const nameMatch = soulContent.match(/soul_name:\s*(.+)/)
        setStatus('connected', nameMatch?.[1]?.trim() || 'Soul', 'Verbunden (lokal)')
        return
      }
      throw new Error(`HTTP ${r.status}`)
    }
    soulContent = await r.text()
    await chrome.storage.local.set({ soul_cache: soulContent })
    chrome.runtime.sendMessage({ type: 'CACHE_SOUL', soul: soulContent })
    const nameMatch = soulContent.match(/soul_name:\s*(.+)/)
    setStatus('connected', nameMatch?.[1]?.trim() || 'Soul', 'Verbunden')
  } catch (e) {
    setStatus('disconnected', 'Fehler', e.message)
  }
}

function setStatus(state, name, status) {
  document.getElementById('soul-name').textContent   = name
  document.getElementById('soul-status').textContent = status
  document.getElementById('conn-dot').className = `conn-dot ${state}`
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function sendMessage() {
  if (isStreaming) return
  const input = document.getElementById('chat-input')
  const text  = input.value.trim()
  if (!text) return

  input.value = ''
  input.style.height = 'auto'
  messages.push({ role: 'user', content: text })
  appendMsg('user', text)

  if (!soulCert) {
    appendMsg('assistant', 'Kein Token – bitte in ⚙️ verbinden.')
    return
  }

  const usePageCtx = document.getElementById('use-page-ctx').checked
  const nameMatch  = soulContent?.match(/soul_name:\s*(.+)/)
  const soulName   = nameMatch?.[1]?.trim() || 'Soul'

  let system = soulContent
    ? `Du bist ${soulName}. Du verkörperst diese Person vollständig – in erster Person, ohne Ausnahme.\n\n${soulContent}`
    : 'Du bist ein hilfreicher Assistent.'

  if (usePageCtx && pageInfo) {
    system += `\n\n## Aktuelle Seite\nTitel: ${pageInfo.title}\nURL: ${pageInfo.url}\n\n${pageInfo.text.slice(0, 2000)}`
  }

  if (attachedFiles.length) {
    system += '\n\n## Angehängte Dateien'
    attachedFiles.forEach(f => {
      system += `\n\n### ${f.name}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``
    })
  }

  const loadingEl = appendMsg('loading', '…')
  isStreaming = true
  document.getElementById('send-btn').disabled = true

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${soulCert}`
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        stream: true,
        system,
        messages: messages.slice(-10)
      })
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      loadingEl.remove()
      appendMsg('assistant', `Fehler ${res.status}: ${err.slice(0, 100)}`)
      return
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = '', fullText = ''

    loadingEl.classList.replace('loading', 'assistant')
    loadingEl.textContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const chunk = line.slice(6).trim()
        if (chunk === '[DONE]') break
        try {
          const parsed = JSON.parse(chunk)
          if (parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta') {
            fullText += parsed.delta.text
            loadingEl.textContent = fullText
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight
          }
        } catch {}
      }
    }

    messages.push({ role: 'assistant', content: fullText })
    attachedFiles.length = 0
    renderFileChips()
  } catch (e) {
    loadingEl.remove()
    appendMsg('assistant', `Verbindungsfehler: ${e.message}`)
  } finally {
    isStreaming = false
    document.getElementById('send-btn').disabled = false
  }
}

function appendMsg(role, text) {
  const el = document.createElement('div')
  el.className = `msg ${role}`
  el.textContent = text
  const box = document.getElementById('messages')
  box.appendChild(el)
  box.scrollTop = box.scrollHeight
  return el
}

// ── Voice Tab ─────────────────────────────────────────────────────────────────

function renderVoiceTab(url) {
  const container = document.getElementById('voice-container')
  if (!url) {
    container.innerHTML = '<div class="empty-state">Keine Agent-URL konfiguriert</div>'
    return
  }
  container.innerHTML = `
    <div class="voice-launch">
      <div class="voice-icon">🎙️</div>
      <div class="voice-label">Soul Voice Agent</div>
      <div class="voice-desc">Öffnet im Browser-Tab mit Mikrofon-Zugriff</div>
      <button class="btn-primary voice-open-btn" id="voice-open-btn">Gespräch starten</button>
    </div>
  `
  document.getElementById('voice-open-btn').addEventListener('click', () => {
    if (messages.length) {
      const summary = messages
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'Ich' : 'Soul'}: ${m.content}`)
        .join('\n')
      navigator.clipboard.writeText(summary).catch(() => {})
      const btn = document.getElementById('voice-open-btn')
      const orig = btn.textContent
      btn.textContent = '📋 Kontext kopiert…'
      setTimeout(() => { btn.textContent = orig }, 1200)
    }
    setTimeout(() => chrome.tabs.create({ url }), messages.length ? 1300 : 0)
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

async function loadPageInfo() {
  try {
    let tab
    if (isDetached) {
      const tabs = await chrome.tabs.query({ active: true })
      tab = tabs.find(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'))
    } else {
      ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    }
    if (!tab?.id) return
    const info = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' })
    if (!info) return
    pageInfo = info
    document.getElementById('page-info').innerHTML = `
      <div class="page-title">${esc(info.title)}</div>
      <div class="page-url">${esc(info.url)}</div>
      <div class="page-excerpt">${esc(info.text.slice(0, 320))}…</div>
    `
  } catch {
    document.getElementById('page-info').innerHTML = '<div class="empty-state">Seite nicht lesbar</div>'
  }
}

async function triggerSoulLogin() {
  try {
    let tab
    if (isDetached) {
      const tabs = await chrome.tabs.query({ active: true })
      tab = tabs.find(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'))
    } else {
      ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    }
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'INJECT_SOUL_LOGIN' })
  } catch {}
}

// ── Detach ────────────────────────────────────────────────────────────────────

function detachWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html') + '?detached=1',
    type: 'popup',
    width: 480,
    height: 700,
    focused: true
  })
  window.close()
}

// ── File Attach ───────────────────────────────────────────────────────────────

function handleFileSelect(files) {
  Array.from(files).forEach(file => {
    const reader = new FileReader()
    reader.onload = (e) => {
      attachedFiles.push({ name: file.name, content: e.target.result })
      renderFileChips()
    }
    reader.readAsText(file)
  })
}

function renderFileChips() {
  const chips = document.getElementById('file-chips')
  chips.innerHTML = ''
  attachedFiles.forEach((f, i) => {
    const chip = document.createElement('div')
    chip.className = 'file-chip'
    chip.innerHTML = `<span>📄 ${esc(f.name)}</span><button class="chip-remove" data-i="${i}">×</button>`
    chips.appendChild(chip)
  })
  chips.querySelectorAll('.chip-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      attachedFiles.splice(+btn.dataset.i, 1)
      renderFileChips()
    })
  )
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function connectFromSysTab() {
  const statusEl = document.getElementById('connect-status')
  statusEl.textContent = 'Suche SYS-Tab…'

  let tabs = await chrome.tabs.query({ url: 'https://YOUR_DOMAIN/*' })

  // Fallback: alle Tabs manuell filtern (Chrome-Permission-Edge-Case)
  if (!tabs.length) {
    const allTabs = await chrome.tabs.query({})
    tabs = allTabs.filter(t => t.url && t.url.startsWith('https://YOUR_DOMAIN'))
  }

  if (!tabs.length) {
    statusEl.textContent = '⚠ SYS-Tab nicht gefunden – bitte YOUR_DOMAIN öffnen'
    chrome.tabs.create({ url: 'https://YOUR_DOMAIN/session' })
    return
  }

  statusEl.textContent = `${tabs.length} SYS-Tab(s) gefunden, suche Session…`

  // Alle SYS-Tabs durchsuchen – sessionStorage ist per-Tab
  const extractor = () => {
    const soulRaw  = sessionStorage.getItem('sys.soul')
    const certOnly = sessionStorage.getItem('sys.soul_cert')
    if (!soulRaw && !certOnly) return { error: 'no_soul' }
    const src  = soulRaw || ''
    const id   = src.match(/soul_id:\s*(.+)/)?.[1]?.trim()
    const cert = src.match(/soul_cert:\s*(.+)/)?.[1]?.trim() || certOnly
    // certOnly könnte schon das Bearer-Token "{id}.{cert}" sein
    if (!id && certOnly && certOnly.includes('.')) {
      return { token: certOnly, soul: soulRaw || '' }
    }
    if (!id || !cert) return { error: 'no_token', debug: `id=${id} cert=${!!cert}` }
    return { token: `${id}.${cert}`, soul: soulRaw || '' }
  }

  let found = null
  for (const tab of tabs) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: extractor
      })
      const res = results?.[0]?.result
      if (res && !res.error && res.token) { found = res; break }
    } catch {}
  }

  if (!found) {
    statusEl.textContent = '⚠ Keine Soul-Session gefunden – bitte auf YOUR_DOMAIN/session einloggen'
    chrome.tabs.create({ url: 'https://YOUR_DOMAIN/session' })
    return
  }

  await chrome.storage.local.set({ soul_cert: found.token, soul_cache: found.soul })
  soulCert    = found.token
  soulContent = found.soul
  statusEl.textContent = '✓ Verbunden'
  await loadSoul()
  switchTab('chat')
}

async function disconnect() {
  await chrome.storage.local.remove(['soul_cert', 'soul_cache'])
  soulCert = null; soulContent = null
  setStatus('disconnected', 'Nicht verbunden', 'In ⚙️ mit SYS verbinden')
  document.getElementById('connect-status').textContent = ''
}

// ── UI Wiring ─────────────────────────────────────────────────────────────────

function setupListeners() {
  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  )
  document.getElementById('send-btn').addEventListener('click', sendMessage)
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  document.getElementById('chat-input').addEventListener('input', function () {
    this.style.height = 'auto'
    this.style.height = Math.min(this.scrollHeight, 80) + 'px'
  })
  document.getElementById('soul-login-btn').addEventListener('click', triggerSoulLogin)
  document.getElementById('connect-btn').addEventListener('click', connectFromSysTab)
  document.getElementById('disconnect-btn').addEventListener('click', disconnect)
  document.getElementById('detach-btn').addEventListener('click', detachWindow)
  if (isDetached) document.getElementById('detach-btn').style.display = 'none'
  document.getElementById('attach-btn').addEventListener('click', () =>
    document.getElementById('file-input').click()
  )
  document.getElementById('file-input').addEventListener('change', (e) => {
    handleFileSelect(e.target.files)
    e.target.value = ''
  })
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name)
  )
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === `tab-${name}`)
  )
  if (name === 'page') loadPageInfo()
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Start ─────────────────────────────────────────────────────────────────────
init()
