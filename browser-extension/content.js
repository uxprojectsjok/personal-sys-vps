// content.js – injected into all pages
// Handles: page reading, Soul-Login button injection, Soul-Cert auto-fill (claude.ai MCP connector)

// ── Page Info ────────────────────────────────────────────────────────────────

function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    text: (document.body?.innerText || '').slice(0, 4000)
  }
}

// ── Soul-Login Injection ──────────────────────────────────────────────────────

function findLoginContainers() {
  const containers = new Set()
  document.querySelectorAll('form').forEach(f => {
    if (f.querySelector('input[type="password"], input[type="email"], input[name*="email"], input[name*="user"]'))
      containers.add(f)
  })
  document.querySelectorAll('input[type="email"], input[type="text"][autocomplete*="email"]').forEach(input => {
    const parent = input.closest('[data-testid], [role="main"], section, div[class*="login"], div[class*="auth"], div[class*="signin"]') || input.parentElement?.parentElement
    if (parent && !parent.querySelector('.sys-soul-login-btn')) containers.add(parent)
  })
  return containers
}

function injectSoulLogin() {
  findLoginContainers().forEach(form => {
    if (form.querySelector('.sys-soul-login-btn')) return

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sys-soul-login-btn'
    btn.textContent = '⬡ Als Soul anmelden'
    btn.style.cssText = [
      'display:block', 'width:100%', 'padding:10px 16px', 'margin-top:12px',
      'background:linear-gradient(135deg,#2dd4bf,#818cf8)', 'color:#000',
      'border:none', 'border-radius:8px', 'font-weight:700', 'cursor:pointer',
      'font-size:14px', 'font-family:system-ui,sans-serif', 'letter-spacing:0.01em'
    ].join(';')

    btn.addEventListener('click', async (e) => {
      e.preventDefault()
      const response = await chrome.runtime.sendMessage({ type: 'GET_SOUL_IDENTITY' })
      if (!response?.identity) return
      const { email, name } = response.identity
      form.querySelectorAll('input[type="email"],input[name*="email"],input[name*="mail"],input[name*="user"]')
        .forEach(input => {
          input.value = email || name || ''
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        })
    })

    form.appendChild(btn)
  })
}

// ── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PAGE_INFO') {
    sendResponse(getPageInfo())
  }
  if (msg.type === 'INJECT_SOUL_LOGIN') {
    injectSoulLogin()
    sendResponse({ ok: true })
  }
  if (msg.type === 'GET_SOUL_TOKEN') {
    const soulRaw = sessionStorage.getItem('sys.soul')
    if (!soulRaw) { sendResponse({ error: 'no_soul' }); return }
    const id   = soulRaw.match(/soul_id:\s*(.+)/)?.[1]?.trim()
    const cert = soulRaw.match(/soul_cert:\s*(.+)/)?.[1]?.trim()
    if (!id || !cert) { sendResponse({ error: 'no_token' }); return }
    sendResponse({ token: `${id}.${cert}`, soul: soulRaw })
  }
})

// ── Soul-Cert Auto-Fill (claude.ai MCP-Connector) ────────────────────────────

function findSoulCertInputs(isSysOAuth) {
  const isClaude = location.hostname.includes('claude.ai')
  if (!isClaude && !isSysOAuth) return []

  const results = []

  if (isSysOAuth) {
    const direct = document.getElementById('soul_cert') ||
                   document.querySelector('input[name="soul_cert"]')
    if (direct && !direct.dataset.sysCertInjected) results.push(direct)
    return results
  }

  document.querySelectorAll('input[type="text"], input:not([type])').forEach(input => {
    if (input.dataset.sysCertInjected) return
    let node = input.parentElement
    for (let i = 0; i < 4; i++) {
      if (!node) break
      if (node.textContent.toLowerCase().includes('soul-cert') ||
          node.textContent.toLowerCase().includes('soul cert')) {
        results.push(input)
        break
      }
      node = node.parentElement
    }
  })
  return results
}

async function injectSoulCertFill(isSysOAuth) {
  const inputs = findSoulCertInputs(isSysOAuth)
  if (!inputs.length) return

  const data = await chrome.storage.local.get('soul_cert')
  const cert = data.soul_cert
  if (!cert) return

  inputs.forEach(input => {
    input.dataset.sysCertInjected = '1'

    if (isSysOAuth) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) nativeSetter.call(input, cert)
      else input.value = cert
      input.dispatchEvent(new Event('input',  { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = '⬡ Soul-Cert eintragen'
    btn.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:6px',
      'padding:6px 12px', 'margin-top:6px',
      'background:linear-gradient(135deg,#2dd4bf,#818cf8)', 'color:#000',
      'border:none', 'border-radius:6px', 'font-weight:700', 'cursor:pointer',
      'font-size:12px', 'font-family:system-ui,sans-serif', 'letter-spacing:0.01em',
      'white-space:nowrap'
    ].join(';')

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) nativeSetter.call(input, cert)
      else input.value = cert
      input.dispatchEvent(new Event('input',  { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      btn.textContent = '✓ Eingetragen'
      btn.style.background = '#2dd4bf'
      setTimeout(() => { btn.textContent = '⬡ Soul-Cert eintragen'; btn.style.background = 'linear-gradient(135deg,#2dd4bf,#818cf8)' }, 2000)
    })

    input.insertAdjacentElement('afterend', btn)
  })
}

// ── Init (async — liest konfigurierte SYS-URL aus Storage) ───────────────────

chrome.storage.local.get('sys_url', ({ sys_url }) => {
  let sysOrigin = null
  if (sys_url) {
    try { sysOrigin = new URL(sys_url).origin } catch {}
  }

  const isSysPage  = sysOrigin && location.origin === sysOrigin
  const isSysOAuth = isSysPage && location.pathname.startsWith('/oauth')
  const isClaude   = location.hostname.includes('claude.ai')

  // Soul-Login nicht auf SYS-eigenen Seiten injizieren
  if (!isSysPage) {
    if (document.readyState === 'complete') {
      injectSoulLogin()
    } else {
      window.addEventListener('load', injectSoulLogin)
    }
  }

  // Soul-Cert Auto-Fill: claude.ai
  if (isClaude) {
    const observer = new MutationObserver(() => injectSoulCertFill(false))
    observer.observe(document.body, { childList: true, subtree: true })
    injectSoulCertFill(false)
  }

  // Soul-Cert Auto-Fill: SYS OAuth-Consent-Seite
  if (isSysOAuth) {
    if (document.readyState === 'complete') {
      injectSoulCertFill(true)
    } else {
      window.addEventListener('load', () => injectSoulCertFill(true))
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.soul_cert?.newValue) {
        document.querySelectorAll('[data-sys-cert-injected]').forEach(el => {
          delete el.dataset.sysCertInjected
        })
        injectSoulCertFill(true)
      }
    })
  }
})
