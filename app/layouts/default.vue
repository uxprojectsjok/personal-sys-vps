<template>
  <div class="min-h-screen min-h-dvh bg-[var(--sys-bg)] text-[var(--sys-fg)] flex flex-col">
    <!-- Skip-to-main-content (WCAG 2.4.1) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--sys-accent)] focus:text-black focus:font-semibold focus:text-sm focus:shadow-lg focus:outline-none"
    >
      Zum Hauptinhalt springen
    </a>
    <slot />
    <footer class="sys-footer">
      <a href="https://sys.uxprojects-jok.com/" target="_blank" rel="noopener" class="sys-footer-link">
        sys.uxprojects-jok.com
      </a>
    </footer>
  </div>
</template>

<script setup>
import { useSoul } from '~/composables/useSoul.js'

const { soulToken } = useSoul()

onMounted(async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const r = await fetch('/api/push/vapid-key')
    const { publicKey } = await r.json()
    if (!publicKey) return
    const stored = localStorage.getItem('sys_vapid_key')
    if (stored === publicKey) return  // Key unverändert — nichts zu tun
    // Key hat sich geändert (z.B. nach init.sh) → neu subscriben
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe().catch(() => {})
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
    const token = soulToken.value
    if (!token || token === 'anonymous') return
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    localStorage.setItem('sys_vapid_key', publicKey)
  } catch {}
})
</script>

<style scoped>
.sys-footer {
  text-align: center;
  padding: 18px 16px;
  border-top: 1px solid rgba(236, 231, 245, 0.06);
}
.sys-footer-link {
  font-family: var(--sys-mono, ui-monospace, monospace);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(236, 231, 245, 0.28);
  text-decoration: none;
  transition: color 0.2s;
}
.sys-footer-link:hover {
  color: rgba(236, 231, 245, 0.6);
}
</style>
