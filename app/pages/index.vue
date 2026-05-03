<template>
  <ClientOnly>
    <!-- ═══════════════════════════════════════════════════════════════
         SYS · index.vue — Blockchain-violet editorial redesign
         Integrated logo + background image, responsive desktop→mobile.
         ═══════════════════════════════════════════════════════════════ -->

    <!-- ─────────────── SOUL AKTIV ─ Dashboard ─────────────── -->
    <template v-if="hasSoul">
      <div class="sys-page">
        <header class="sys-dash-head">
          <div class="lockup">
            <span class="mark">SYS<span class="dot">.</span></span>
          </div>
          <div class="id">
            <span class="live"></span>
            #{{ soulMeta?.name || '------' }} · Soul aktiv · {{ shortId }}
          </div>
          <div class="head-actions">
            <button class="logout" @click="confirmReset" aria-label="Ausloggen">
              Ausloggen <span class="arr">↗</span>
            </button>
            <button class="gate-lock" @click="lockGate" aria-label="Node sperren" title="Gate schließen — Passwort wird beim nächsten Besuch erneut abgefragt">
              <i class="ri-lock-line"></i>
            </button>
          </div>
        </header>

        <div class="sys-dash-body">
          <aside class="col-left">
            <div class="profile">
              <label class="avatar" title="Profilbild ändern">
                <img v-if="hasProfile" :src="profileUrl" alt="Profilbild" />
                <span v-else>{{ initial }}</span>
                <input type="file" accept="image/*" hidden @change="handleProfileUpload" />
              </label>
              <div>
                <div class="kicker">Soul · {{ soulMeta?.version || '01' }}</div>
                <h1 class="name">{{ soulMeta?.name || 'Seele' }}<em>.</em></h1>
                <code class="soul-id">{{ soulMeta?.id || '—' }}</code>
              </div>
            </div>

            <button class="cta" @click="$router.push('/session')">
              <span>
                <span class="sub">Primäre Aktion</span>
                <span class="lbl">Entwicklung starten</span>
              </span>
              <span class="arr">→</span>
            </button>

            <dl class="metrics">
              <div class="m">
                <dt>Soul-Datei</dt>
                <dd class="mono">sys.md</dd>
                <span class="status ok"><i></i>Aktiv</span>
              </div>
              <div class="m">
                <dt>Erstellt</dt>
                <dd>{{ fmtDate(soulMeta?.created) }}</dd>
                <span class="status"></span>
              </div>
              <div class="m">
                <dt>Letzte Session</dt>
                <dd>{{ fmtDate(soulMeta?.lastSession) }}</dd>
                <span class="status ok"><i></i>Synced</span>
              </div>
              <div class="m">
                <dt>Cert</dt>
                <dd class="mono sm">{{ shortCert }}</dd>
                <span class="status ok"><i></i>Signiert</span>
              </div>
              <div class="m">
                <dt>Chain</dt>
                <dd><b>{{ chainCount }}</b> Sessions</dd>
                <span class="status" :class="hasAnchor ? 'ok' : 'off'"><i></i>{{ hasAnchor ? 'Verankert' : 'Kein Anker' }}</span>
              </div>
              <div class="m">
                <dt>Vault</dt>
                <dd>{{ vaultConnected ? 'Lokal verbunden' : 'Nicht verbunden' }}</dd>
                <span class="status" :class="vaultConnected ? 'ok' : 'off'"><i></i>{{ vaultConnected ? 'Bereit' : 'Offline' }}</span>
              </div>
            </dl>

            <nav class="actions">
              <button class="act" @click="setupOpen = true">
                <span><span class="lbl">Soul einrichten</span><span class="sub">Wizard · Vault · Verschlüsselung</span></span>
                <span class="ar">→</span>
              </button>
              <button class="act" @click="filesOpen = true">
                <span><span class="lbl">Dateien verwalten</span><span class="sub">Audio · Video · Bilder · Kontext</span></span>
                <span class="ar">→</span>
              </button>
              <button class="act" @click="encryptOpen = true">
                <span><span class="lbl">Soul exportieren</span><span class="sub">.soul · AES-GCM · 12 Wörter</span></span>
                <span class="ar">→</span>
              </button>
              <button class="act" @click="anchorOpen = true">
                <span><span class="lbl">Polygon verankern</span><span class="sub">SHA-256 · Zeitstempel · irreversibel</span></span>
                <span class="ar">→</span>
              </button>
              <button class="act" @click="marketplaceOpen = true">
                <span><span class="lbl">Agent Marketplace</span><span class="sub">Pinata JWT · Amortisierung · IPFS</span></span>
                <span class="ar">→</span>
              </button>
            </nav>
          </aside>

          <section class="col-right">
            <div class="rt-head">
              <h3>Chronik<em>.</em></h3>
              <div class="meta">Session-Log · {{ journal.length }} Einträge</div>
            </div>

            <article v-for="n in journal" :key="n.id" class="note">
              <div class="when">{{ n.when[0] }}</div>
              <p class="note-body">{{ n.body }}</p>
              <span class="tag">{{ n.tag }}</span>
            </article>

            <div class="maturity">
              <div>
                <h5>Soul-Reife · <em>{{ maturityLevel }}</em></h5>
                <div class="bar"><div class="bar-fill" :style="{ width: maturity + '%' }"></div></div>
                <div class="ticks"><span>Genesis</span><span>Aufbau</span><span>Etabliert</span><span>Premium</span></div>
              </div>
              <div class="val">{{ maturity }}<span>%</span></div>
            </div>
          </section>
        </div>
      </div>
    </template>

    <!-- ─────────────── NO SOUL ─ Landing ─────────────── -->
    <template v-else>
      <div class="sys-page landing">
        <div class="l-bg" aria-hidden="true"></div>

        <div class="l-wrap">
          <header class="l-head">
            <div class="l-lockup">
              <img src="~/assets/logo.png" alt="SYS" class="l-logo" />
            </div>
            <span class="l-badge">Private Node</span>
          </header>

          <main class="l-main">
            <p class="l-kicker">Soul-Node · Persönliche Instanz</p>
            <h1 class="l-name">{{ config.public.nodeName }}<em>.</em></h1>
            <p v-if="config.public.nodeTagline" class="l-tagline">{{ config.public.nodeTagline }}</p>

            <div class="l-rule"></div>

            <div class="l-actions">
              <button v-if="allowCreateSoul" class="l-btn-primary" @click="createSoulOpen = true">
                Soul erstellen <span class="l-arr">→</span>
              </button>
              <button class="l-btn-ghost" @click="loginOpen = true">
                Login with Soul
              </button>
            </div>
          </main>

          <footer class="l-foot">
            <a href="https://sys.uxprojects-jok.com/" target="_blank" rel="noopener" class="l-foot-link">
              <span class="l-foot-mark">SYS<span class="l-dot">.</span></span>
              <span>sys.uxprojects-jok.com</span>
              <span class="l-arr">↗</span>
            </a>
          </footer>
        </div>
      </div>
    </template>

    <ConfirmModal />

    <!-- ─── Modals ─────────────────────────────────────────────────── -->
    <ModalCreateSoul
      :is-open="createSoulOpen"
      @create="handleSoulCreate"
      @cancel="createSoulOpen = false"
    />

    <!-- ── Login: sys.md upload (primär) ─────────────────────────── -->
    <Teleport to="body">
      <Transition name="login-sheet">
        <div
          v-if="loginOpen"
          class="fixed inset-0 z-50 flex flex-col justify-end items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Soul laden"
          @click.self="loginOpen = false"
        >
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="loginOpen = false"></div>
          <div class="login-sheet">
            <div class="login-handle">
              <div class="login-bar"></div>
              <button class="login-close" @click="loginOpen = false" aria-label="Schließen">✕</button>
            </div>
            <div class="login-kicker">Soul laden</div>
            <h2 class="login-title">Mit sys<em>.</em>md einloggen</h2>
            <p class="login-sub">Lade deine Soul-Datei — lokal gespeichert, verlässt dieses Gerät nicht.</p>
            <SoulUpload @uploaded="handleLoginUpload" />
            <div class="login-divider">
              <span>oder</span>
            </div>
            <button class="login-alt" @click="openDecryptFromLogin">
              <span>Verschlüsselten Vault laden</span>
              <span class="login-alt-sub">.soul-Bundle · 12 Schlüsselwörter</span>
              <span class="login-arr">→</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── .soul Bundle (verschlüsselt) ──────────────────────────── -->
    <SoulDecryptModal
      :is-open="decryptOpen"
      @close="decryptOpen = false"
      @uploaded="decryptOpen = false"
    />

    <!-- ── Soul einrichten ───────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="sys-modal">
        <div v-if="setupOpen" class="sys-modal-wrap" role="dialog" aria-modal="true" @click.self="setupOpen = false">
          <div class="sys-modal-panel">
            <div class="sys-modal-head">
              <div>
                <div class="sys-modal-kicker">Konfiguration</div>
                <h2 class="sys-modal-title">Soul einrichten<em>.</em></h2>
              </div>
              <button class="sys-modal-close" @click="setupOpen = false" aria-label="Schließen"><span aria-hidden="true">×</span></button>
            </div>
            <div class="sys-modal-body">
              <SoulSetupWizard
                :soul-cert="soulToken"
                :soul-content="soulContent"
                :soul-id="soulMeta?.id || ''"
                :modal="true"
                @close="setupOpen = false"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Dateien verwalten ──────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="sys-modal">
        <div v-if="filesOpen" class="sys-modal-wrap" role="dialog" aria-modal="true" @click.self="filesOpen = false">
          <div class="sys-modal-panel sys-modal-panel--wide">
            <div class="sys-modal-head">
              <div>
                <div class="sys-modal-kicker">Vault</div>
                <h2 class="sys-modal-title">Dateien verwalten<em>.</em></h2>
              </div>
              <button class="sys-modal-close" @click="filesOpen = false" aria-label="Schließen"><span aria-hidden="true">×</span></button>
            </div>
            <div class="sys-modal-body">
              <VaultExplorer
                :soul-cert="soulToken"
                :soul-content="soulContent"
                @encrypt="encryptOpen = true"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <SoulEncryptModal
      :is-open="encryptOpen"
      @close="encryptOpen = false"
    />

    <SoulAnchorModal
      :is-open="anchorOpen"
      @close="anchorOpen = false"
    />

    <Teleport to="body">
      <AgentMarketplacePanel
        v-if="marketplaceOpen"
        :soul-cert="soulToken"
        @close="marketplaceOpen = false"
      />
    </Teleport>

    <ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useConfirm } from '~/composables/useConfirm.js'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useProfile } from '~/composables/useProfile.js'
import { computeMaturity } from '#shared/utils/soulMaturity.js'
import { parseSoul } from '#shared/utils/soulParser.js'
import ConfirmModal from '~/components/ConfirmModal.vue'
import ModalCreateSoul from '~/components/ModalCreateSoul.vue'
import SoulEncryptModal from '~/components/SoulEncryptModal.vue'
import SoulAnchorModal from '~/components/SoulAnchorModal.vue'
import AgentMarketplacePanel from '~/components/AgentMarketplacePanel.vue'
import SoulDecryptModal from '~/components/SoulDecryptModal.vue'
import SoulUpload from '~/components/SoulUpload.vue'
import SoulSetupWizard from '~/components/SoulSetupWizard.vue'
import VaultExplorer from '~/components/VaultExplorer.vue'

const config = useRuntimeConfig()
const { ask: confirmAsk } = useConfirm()
const { hasSoul, soulContent, soulToken, soulMeta, importFromText, clear: _clear } = useSoul()
const { isConnected: vaultConnected } = useVault()
const { hasProfile, profileUrl, handleUpload: handleProfileUpload } = useProfile()
const { allowCreateSoul, fetchNodeStatus } = useNodeStatus()

// Node-Status beim Start laden
onMounted(() => fetchNodeStatus())

// ── Modal-State ───────────────────────────────────────────────────────────
const createSoulOpen    = ref(false)
const loginOpen         = ref(false)   // einfaches sys.md-Upload-Sheet
const decryptOpen       = ref(false)   // verschlüsselter .soul-Bundle
const setupOpen         = ref(false)   // SoulSetupWizard
const filesOpen         = ref(false)   // VaultExplorer
const encryptOpen       = ref(false)
const anchorOpen        = ref(false)
const marketplaceOpen   = ref(false)   // AgentMarketplacePanel

// ── Computed ──────────────────────────────────────────────────────────────
const initial      = computed(() => (soulMeta.value?.name || 'S').charAt(0).toUpperCase())
const shortId      = computed(() => { const id = soulMeta.value?.id || ''; return id ? id.slice(0, 8) + '…' + id.slice(-4) : '—' })
const shortCert    = computed(() => { const c = soulMeta.value?.cert || ''; return c ? c.slice(0, 8) + '…' + c.slice(-4) : '—' })

// chainCount aus soul_growth_chain Array-Länge
const chainCount = computed(() => {
  if (!soulContent.value) return 0
  const m = soulContent.value.match(/soul_growth_chain:\s*(\[[\s\S]*?\])/m)
  if (!m) return 0
  try {
    const arr = JSON.parse(m[1])
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    // Fallback: Zeilen zählen die mit - beginnen
    const lines = m[1].split('\n').filter(l => l.trim().startsWith('-'))
    return lines.length
  }
})

// hasAnchor: true wenn soul_chain_anchor nicht null/leer
const hasAnchor = computed(() => {
  if (!soulContent.value) return false
  const m = soulContent.value.match(/soul_chain_anchor:\s*(.+)/)
  const val = m?.[1]?.trim()
  return !!val && val !== 'null' && val !== '~' && val !== ''
})

// Maturity wird live aus dem Soul-Content berechnet — nicht aus Frontmatter-Feld
const maturityData = computed(() => computeMaturity(soulContent.value))
const maturity     = computed(() => maturityData.value.score)
const maturityLevel = computed(() => maturityData.value.level)

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}
function lockGate() {
  document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'
  window.location.href = '/gate'
}

async function confirmReset() {
  const ok = await confirmAsk({
    title: 'Ausloggen',
    message: 'Soul aus dem Browser entfernen? Deine Datei bleibt erhalten.',
    confirmText: 'Ausloggen',
    cancelText: 'Abbrechen',
    danger: true,
  })
  if (ok) _clear?.()
}

function handleSoulCreate(soulText) {
  if (soulText) importFromText(soulText)
  createSoulOpen.value = false
  fetchNodeStatus()
}

function handleLoginUpload(text) {
  importFromText(text)
  loginOpen.value = false
  fetchNodeStatus()
}

function openDecryptFromLogin() {
  loginOpen.value = false
  decryptOpen.value = true
}

// ── Chronik: letzte 4 Einträge aus Session-Log Section ───────────────────
const journal = computed(() => {
  if (!soulContent.value) return []
  const { sections } = parseSoul(soulContent.value)
  const raw = (sections['Session-Log (komprimiert)'] || sections['Session-Log'] || '').replace(/\r/g, '')
  if (!raw.trim()) return []

  // Einträge: Zeilen die mit "- **DATUM**:" beginnen
  const entries = []
  const lines = raw.split('\n')
  let current = null
  for (const line of lines) {
    const m = line.match(/^-\s+\*\*([^*:]+):?\*\*:?\s*(.*)/)
    if (m) {
      if (current) entries.push(current)
      current = { dateStr: m[1].trim(), body: m[2].trim() }
    } else if (current && line.trim() && !line.trim().startsWith('-')) {
      current.body += ' ' + line.trim()
    }
  }
  if (current) entries.push(current)
  if (!entries.length) return []

  // Letzten 4, neueste zuerst
  return entries.slice(0, 4).map((e, i) => {
    let when = [e.dateStr, '']
    try {
      const d = new Date(e.dateStr)
      if (!isNaN(d)) {
        const today = new Date()
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
        if (d.toDateString() === today.toDateString()) {
          when = ['Heute', '']
        } else if (d.toDateString() === yesterday.toDateString()) {
          when = ['Gestern', '']
        } else {
          when = [d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }), '']
        }
      }
    } catch {}
    return { id: i, when, body: e.body, tag: 'Log' }
  })
})
</script>

<style scoped>
/* ═══════════════ SYS · violet editorial design system ═══════════════ */
.sys-page {
  --ink:#08070c; --paper:#12101a; --paper-2:#1a1726; --paper-3:#0d0b14;
  --rule:rgba(226,220,240,0.10); --rule-2:rgba(226,220,240,0.20);
  --fg:#ece7f5; --fg-2:rgba(236,231,245,0.72); --fg-3:rgba(236,231,245,0.48); --fg-4:rgba(236,231,245,0.30);
  --accent:#8b5cf6; --accent-2:rgba(139,92,246,0.14); --accent-bright:#a78bfa; --accent-deep:#6d28d9; --on-accent:#0a0810;
  --serif:'Noto Serif', Georgia, serif;
  --sans:'Inter', system-ui, -apple-system, sans-serif;
  --mono:'JetBrains Mono', ui-monospace, monospace;
  background: var(--paper); color: var(--fg); font-family: var(--sans);
  min-height: 100vh; min-height: 100dvh;
}
.kicker { font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.24em; color: var(--fg-3); }
.arr { font-family: var(--serif); }
.live { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); display: inline-block; }

.lockup { display: flex; align-items: center; gap: 12px; }
.lockup .logo { width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 0 12px rgba(167,139,250,0.35)); }
.lockup .mark { font-family: var(--serif); font-weight: 700; font-size: 22px; letter-spacing: -0.02em; }
.lockup .mark .dot { color: var(--accent); }
.lockup .tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--fg-3); border-left: 1px solid var(--rule-2); padding-left: 12px; }
@media (max-width: 560px) { .lockup .tag { display: none; } }

/* ────── DASHBOARD ────── */
.sys-dash-head { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 16px clamp(16px,3vw,32px); border-bottom: 1px solid var(--rule); background: var(--paper-3); }
.sys-dash-head .id { justify-self: center; display: inline-flex; align-items: center; gap: 12px; padding: 8px 20px; border-left: 1px solid var(--rule-2); border-right: 1px solid var(--rule-2); font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); }
.sys-dash-head .head-actions { display: flex; align-items: center; gap: 4px; }
.sys-dash-head .logout { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); background: transparent; border: 0; padding: 10px 14px; cursor: pointer; }
.sys-dash-head .logout:hover { color: var(--accent); }
.sys-dash-head .gate-lock { background: transparent; border: 0; padding: 10px 10px; cursor: pointer; color: var(--fg-3); font-size: 16px; line-height: 1; display: flex; align-items: center; border-left: 1px solid var(--rule-2); }
.sys-dash-head .gate-lock:hover { color: var(--accent); }
@media (max-width: 800px) {
  .sys-dash-head { grid-template-columns: auto auto; grid-template-rows: auto auto; }
  .sys-dash-head .id { grid-column: 1/-1; grid-row: 2; justify-self: start; padding-left: 0; border-left: 0; font-size: 10px; }
}

.sys-dash-body { display: grid; grid-template-columns: 440px 1fr; gap: 0; }
@media (max-width: 900px) { .sys-dash-body { grid-template-columns: 1fr; } }
.col-left { padding: clamp(32px,5vw,56px) clamp(20px,4vw,44px); border-right: 1px solid var(--rule); display: flex; flex-direction: column; gap: 32px; }
.col-right { padding: clamp(32px,5vw,56px) clamp(20px,4vw,44px); display: flex; flex-direction: column; gap: 18px; }
@media (max-width: 900px) { .col-left { border-right: 0; border-bottom: 1px solid var(--rule); } }

.profile { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
.profile .avatar { width: 88px; height: 88px; flex: none; border: 1px solid var(--rule-2); background:
    radial-gradient(circle at 30% 30%, rgba(139,92,246,0.28), transparent 60%),
    linear-gradient(135deg, #1d1a28 0%, #12101a 100%);
  display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-size: 36px; color: var(--fg); cursor: pointer; overflow: hidden; position: relative; }
.profile .avatar::after { content: ""; position: absolute; inset: 0; background: url('~/assets/logo.png') center / 70% no-repeat; opacity: 0.18; mix-blend-mode: screen; pointer-events: none; }
.profile .avatar img { width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 1; }
.profile .name { font-family: var(--serif); font-weight: 400; font-size: clamp(32px,4.5vw,44px); line-height: 0.95; letter-spacing: -0.025em; margin: 8px 0 10px; color: var(--fg); }
.profile .name em { color: var(--accent); font-style: italic; }
.profile .soul-id { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--fg-3); background: rgba(255,255,255,0.03); padding: 6px 10px; border: 1px solid var(--rule); display: inline-block; word-break: break-all; }

.cta { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 26px; background: var(--accent); color: var(--on-accent); border: 0; cursor: pointer; text-align: left; transition: all 0.2s; position: relative; overflow: hidden; }
.cta::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transform: translateX(-100%); transition: transform 0.6s; }
.cta:hover { background: var(--accent-bright); box-shadow: 0 20px 50px rgba(139,92,246,0.35); }
.cta:hover::before { transform: translateX(100%); }
.cta .sub { font-family: var(--mono); font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; opacity: 0.7; display: block; margin-bottom: 4px; }
.cta .lbl { font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em; display: block; }
.cta .arr { font-size: 28px; }

.metrics { margin: 0; padding: 0; border-top: 1px solid var(--rule-2); }
.metrics .m { display: grid; grid-template-columns: 140px 1fr auto; align-items: baseline; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--rule); }
@media (max-width: 560px) { .metrics .m { grid-template-columns: 1fr auto; } .metrics dt { grid-column: 1/-1; margin-bottom: -8px; } }
.metrics dt { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); }
.metrics dd { margin: 0; font-family: var(--serif); font-size: 18px; color: var(--fg); letter-spacing: -0.005em; overflow-wrap: anywhere; }
.metrics dd.mono { font-family: var(--mono); letter-spacing: 0.02em; font-size: 14px; }
.metrics dd.mono.sm { font-size: 12px; }
.metrics dd b { font-weight: 400; color: var(--accent); }
.status { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }
.status.ok { color: #b8dcc4; }
.status.warn { color: var(--accent-bright); }
.status.off { color: var(--fg-3); }

.actions { display: flex; flex-direction: column; border-top: 1px solid var(--rule-2); }
.act { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 18px 0; border: 0; border-bottom: 1px solid var(--rule); background: transparent; color: var(--fg); text-align: left; cursor: pointer; align-items: center; font: inherit; }
.act:hover { background: rgba(139,92,246,0.04); }
.act .lbl { font-family: var(--serif); font-size: 20px; letter-spacing: -0.01em; display: block; }
.act .sub { font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--fg-3); margin-top: 2px; display: block; }
.act .ar { font-family: var(--serif); font-size: 22px; color: var(--fg-3); }
.act:hover .ar { color: var(--accent); }

.dash-foot { border-top: 1px solid var(--rule); font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; display: flex; align-items: center; flex-wrap: wrap; gap: 0; }
.dash-copy { color: var(--fg-4); padding: 14px clamp(20px,4vw,44px); white-space: nowrap; }
.dash-links { display: flex; flex-wrap: wrap; }
.dash-links a { color: var(--fg-3); text-decoration: none; padding: 0 16px; min-height: 48px; display: flex; align-items: center; border-left: 1px solid var(--rule); transition: color 0.15s; }
.dash-links a:hover { color: var(--accent); }
@media (max-width: 640px) {
  .dash-foot { flex-direction: column; align-items: stretch; }
  .dash-copy { padding: 12px 20px; border-bottom: 1px solid var(--rule); font-size: 9px; }
  .dash-links { display: grid; grid-template-columns: 1fr 1fr; }
  .dash-links a { border-left: 0; border-top: 1px solid var(--rule); padding: 14px 20px; font-size: 11px; letter-spacing: 0.14em; min-height: 44px; }
  .dash-links a:nth-child(even) { border-left: 1px solid var(--rule); }
}

.rt-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--rule); padding-bottom: 18px; margin-bottom: 8px; }
.rt-head h3 { font-family: var(--serif); font-size: clamp(32px,4.5vw,44px); font-weight: 400; margin: 0; letter-spacing: -0.025em; }
.rt-head h3 em { font-style: italic; color: var(--accent); }
.rt-head .meta { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); }

.note { padding: 18px 0; border-bottom: 1px solid var(--rule); display: grid; grid-template-columns: 72px 1fr auto; gap: 20px; align-items: start; }
.note .when { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; color: var(--fg-3); white-space: nowrap; padding-top: 2px; }
.note-body { font-size: 13px; line-height: 1.65; color: var(--fg-2); margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.note .tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent-bright); padding: 3px 7px; border: 1px solid rgba(139,92,246,0.35); white-space: nowrap; }
@media (max-width: 640px) { .note { grid-template-columns: 56px 1fr; gap: 12px; } .note .tag { display: none; } }

.maturity { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: end; padding: 28px 0 0; margin-top: 16px; border-top: 1px solid var(--rule); }
.maturity h5 { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin: 0 0 16px; font-weight: 500; }
.maturity h5 em { font-style: normal; color: var(--accent-bright); }
.bar { height: 6px; background: rgba(255,255,255,0.06); position: relative; overflow: hidden; }
.bar-fill { position: absolute; inset: 0; background: linear-gradient(90deg, var(--accent-deep) 0%, var(--accent) 60%, var(--accent-bright) 100%); box-shadow: 0 0 20px rgba(139,92,246,0.5); transition: width 0.4s ease; }
.ticks { display: flex; justify-content: space-between; margin-top: 10px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-4); }
.maturity .val { font-family: var(--serif); font-size: clamp(48px,7vw,64px); line-height: 0.9; letter-spacing: -0.03em; color: var(--fg); }
.maturity .val span { font-size: 22px; color: var(--fg-3); font-family: var(--mono); letter-spacing: 0.05em; margin-left: 4px; }

/* ────── LANDING (private node) ────── */
.landing { position: relative; min-height: 100vh; min-height: 100dvh; display: flex; align-items: stretch; }

.l-bg {
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(ellipse at 70% 40%, rgba(139,92,246,0.13) 0%, transparent 55%),
    radial-gradient(ellipse at 20% 80%, rgba(139,92,246,0.07) 0%, transparent 50%),
    var(--paper);
  pointer-events: none;
}
.l-bg::after {
  content: "";
  position: absolute; inset: 0;
  background: url('~/assets/background-dark.webp') no-repeat center right / cover;
  opacity: 0.06;
}

.l-wrap {
  position: relative; z-index: 1;
  width: 100%; max-width: 560px;
  margin: 0 auto;
  padding: clamp(32px,6vw,64px) clamp(24px,5vw,48px);
  display: flex; flex-direction: column;
  min-height: 100vh; min-height: 100dvh;
}

.l-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: clamp(48px,10vh,96px); }
.l-lockup { display: flex; align-items: center; gap: 12px; }
.l-logo { width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(139,92,246,0.4)); }
.l-mark { font-family: var(--serif); font-weight: 700; font-size: 20px; letter-spacing: -0.02em; color: var(--fg); }
.l-dot { color: var(--accent); }
.l-badge { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent); border: 1px solid rgba(139,92,246,0.35); padding: 5px 12px; background: rgba(139,92,246,0.06); }

.l-main { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-bottom: clamp(32px,6vh,64px); }
.l-kicker { font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--fg-3); margin: 0 0 18px; }
.l-name { font-family: var(--serif); font-weight: 400; font-size: clamp(40px,8vw,72px); line-height: 0.95; letter-spacing: -0.03em; margin: 0 0 16px; color: var(--fg); }
.l-name em { color: var(--accent); font-style: italic; }
.l-tagline { font-family: var(--serif); font-size: 17px; line-height: 1.55; color: var(--fg-2); margin: 0; max-width: 38ch; }
.l-rule { width: 48px; height: 2px; background: var(--accent); margin: 32px 0; opacity: 0.7; }

.l-actions { display: flex; flex-direction: column; gap: 12px; max-width: 320px; }
.l-btn-primary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; background: var(--accent); color: var(--on-accent); border: 0; cursor: pointer; font-family: var(--serif); font-size: 18px; letter-spacing: -0.01em; min-height: 56px; transition: all 0.15s; text-align: left; }
.l-btn-primary:hover { background: var(--accent-bright); box-shadow: 0 12px 32px rgba(139,92,246,0.3); }
.l-btn-ghost { display: flex; align-items: center; justify-content: center; padding: 14px 24px; background: transparent; border: 1px solid var(--rule-2); color: var(--fg-3); cursor: pointer; font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; min-height: 48px; transition: all 0.15s; }
.l-btn-ghost:hover { color: var(--accent); border-color: var(--accent); background: rgba(139,92,246,0.04); }
.l-arr { font-family: var(--serif); font-style: italic; }

.l-foot { border-top: 1px solid var(--rule); padding-top: 20px; margin-top: auto; }
.l-foot-link { display: inline-flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-4); text-decoration: none; transition: color 0.15s; }
.l-foot-link:hover { color: var(--accent); }
.l-foot-mark { font-family: var(--serif); font-size: 13px; font-weight: 700; letter-spacing: -0.01em; color: var(--fg-3); }

/* ────── LOGIN BOTTOMSHEET ────── */
.login-sheet {
  position: relative; z-index: 10;
  background: var(--paper-2); border-top: 1px solid var(--rule-2);
  border-radius: 20px 20px 0 0;
  padding: 20px clamp(16px,5vw,28px) 40px;
  max-height: 92dvh; overflow-y: auto; overflow-x: hidden;
  width: 100%; max-width: 520px; box-sizing: border-box;
}
.login-handle { display: flex; align-items: center; margin-bottom: 20px; }
.login-bar { flex: 1; display: flex; justify-content: center; }
.login-bar::after { content: ""; display: block; width: 40px; height: 2px; background: var(--rule-2); border-radius: 2px; }
.login-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--rule); background: transparent; color: var(--fg-3); cursor: pointer; font-size: 12px; }
.login-close:hover { color: var(--fg); border-color: var(--rule-2); }
.login-kicker { font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
.login-title { font-family: var(--serif); font-weight: 400; font-size: clamp(28px,4vw,36px); letter-spacing: -0.025em; margin: 0 0 10px; color: var(--fg); line-height: 1; }
.login-title em { font-style: italic; color: var(--accent); }
.login-sub { font-family: var(--sans); font-size: 13px; color: var(--fg-3); line-height: 1.5; margin: 0 0 20px; }
.login-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; }
.login-divider::before, .login-divider::after { content: ""; flex: 1; height: 1px; background: var(--rule); }
.login-divider span { font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-4); }
.login-alt { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 16px 18px; background: transparent; border: 1px solid var(--rule); color: var(--fg); cursor: pointer; text-align: left; font: inherit; transition: all 0.15s; box-sizing: border-box; }
.login-alt:hover { border-color: var(--accent); background: var(--accent-2); }
.login-alt span { font-family: var(--serif); font-size: clamp(15px,3.5vw,18px); letter-spacing: -0.01em; min-width: 0; }
.login-alt-sub { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-3); flex: 1; min-width: 0; display: none; }
@media (min-width: 400px) { .login-alt-sub { display: block; } }
.login-arr { font-family: var(--serif); font-size: 20px; color: var(--fg-3); }
.login-alt:hover .login-arr { color: var(--accent); }

/* Login-Sheet Transition */
.login-sheet-enter-active, .login-sheet-leave-active { transition: transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease; }
.login-sheet-enter-from, .login-sheet-leave-to { transform: translateY(100%); opacity: 0; }

/* ────── GENERISCHE MODALS (Setup / Files) ────── */
.sys-modal-wrap {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(7,6,11,0.78); backdrop-filter: blur(10px);
  --paper: #12101a; --paper-2: #1a1726; --paper-3: #0d0b14;
  --rule: rgba(226,220,240,0.10); --rule-2: rgba(226,220,240,0.20);
  --fg: #ece7f5; --fg-2: rgba(236,231,245,0.72); --fg-3: rgba(236,231,245,0.48); --fg-4: rgba(236,231,245,0.30);
  --accent: #8b5cf6; --accent-2: rgba(139,92,246,0.14); --accent-bright: #a78bfa;
  --serif: 'Noto Serif', Georgia, serif; --mono: 'Oxanium', ui-monospace, monospace;
}
.sys-modal-panel {
  position: relative; z-index: 10;
  background: var(--paper); border: 1px solid var(--rule-2);
  border-radius: 16px;
  width: 100%; max-width: 520px; max-height: 92dvh;
  display: flex; flex-direction: column; overflow: hidden;
}
.sys-modal-panel--wide { max-width: 760px; }
.sys-modal-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 8px 12px; min-height: 44px; border-bottom: 1px solid var(--rule);
  background: var(--paper-3);
}
.sys-modal-kicker { font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.sys-modal-title { font-family: var(--serif); font-weight: 400; font-size: 22px; letter-spacing: -0.02em; margin: 0; color: var(--fg); line-height: 1; }
.sys-modal-title em { font-style: italic; color: var(--accent); }
.sys-modal-close { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--rule-2); background: transparent; color: var(--fg-3); cursor: pointer; font-size: 22px; line-height: 1; font-family: var(--sans); padding: 0; flex-shrink: 0; }
.sys-modal-close:hover { color: var(--fg); border-color: var(--rule-2); }
.sys-modal-body { flex: 1; overflow-y: auto; padding: 28px 32px; }

/* Centered modal Transition */
.sys-modal-enter-active, .sys-modal-leave-active { transition: opacity 0.2s ease; }
.sys-modal-enter-active .sys-modal-panel, .sys-modal-leave-active .sys-modal-panel { transition: transform 0.25s ease, opacity 0.2s; }
.sys-modal-enter-from, .sys-modal-leave-to { opacity: 0; }
.sys-modal-enter-from .sys-modal-panel, .sys-modal-leave-to .sys-modal-panel { transform: translateY(20px) scale(0.98); opacity: 0; }

/* Mobile */
@media (max-width: 639px) {
  .sys-modal-wrap { padding: 12px; }
  .sys-modal-panel { border-radius: 16px; max-height: calc(100dvh - 24px); }
}
</style>
