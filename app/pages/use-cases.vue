<template>
  <ClientOnly>
    <div class="sys-page">

      <!-- NAV -->
      <nav class="l-nav">
        <div class="lockup">
          <NuxtLink to="/" class="nav-home">SYS<span class="dot">.</span></NuxtLink>
        </div>
        <div class="nav-end">
          <LangToggle />
          <button class="back" @click="$router.back()" :aria-label="t.back">{{ t.back }}</button>
        </div>
      </nav>

      <div class="uc-wrap">

        <!-- HERO -->
        <div class="topbar">
          <div class="topbar-left">
            <span class="kicker">{{ t.kicker }}</span>
            <h1 class="uc-h1" v-html="t.h1"></h1>
            <p class="uc-intro">{{ t.intro }}</p>
          </div>
        </div>

        <!-- CASE STUDY -->
        <section class="uc-case">
          <div class="case-head">
            <span class="case-badge">{{ t.caseBadge }}</span>
            <h2 class="case-title">{{ t.caseTitle }}</h2>
            <p class="case-sub">{{ t.caseSub }}</p>
          </div>

          <div v-for="s in steps" :key="s.n" class="uc-step">
            <span class="step-n">{{ s.n }}</span>
            <div class="step-body">
              <div class="step-label" v-html="s.label"></div>
              <div class="copy-block" v-if="s.request">
                <code class="copy-code">{{ s.request }}</code>
                <button class="copy-btn" @click="copy(s.request, s.n)">{{ copied === s.n ? t.copied : t.copy }}</button>
              </div>
              <pre v-if="s.example" class="uc-example"><code>{{ s.example }}</code></pre>
              <p v-if="s.note" class="step-sub" v-html="s.note"></p>
            </div>
          </div>

          <div class="uc-callout">
            <span class="callout-mark">→</span>
            <p v-html="t.calloutText"></p>
          </div>
        </section>

        <!-- GUARANTEES -->
        <section class="uc-guarantees">
          <h2 class="uc-h2">{{ t.guaranteesH2 }}</h2>
          <div class="guarantee-grid">
            <div class="guarantee-card" v-for="g in t.guarantees" :key="g.title">
              <div class="guarantee-title">{{ g.title }}</div>
              <p class="guarantee-body">{{ g.body }}</p>
            </div>
          </div>
        </section>

        <!-- MORE -->
        <section class="uc-more">
          <p>{{ t.moreText }}</p>
        </section>
      </div>

      <!-- FOOTER -->
      <footer class="colophon">
        <div class="col-brand">
          <div class="col-name">SYS<em>.</em></div>
          <span class="fr-tag">Apache 2.0</span>
        </div>
        <div class="col-group">
          <div class="col-head">{{ t.footerProtocol }}</div>
          <ul>
            <li><a href="https://sys.uxprojects-jok.com/why" target="_blank" rel="noopener">{{ t.linkWhy }}</a></li>
            <li><a href="https://sys.uxprojects-jok.com/api-docs" target="_blank" rel="noopener">API Docs</a></li>
            <li><a href="https://sys.uxprojects-jok.com/dev-docs" target="_blank" rel="noopener">Dev Docs</a></li>
            <li><NuxtLink to="/scanner">Scan</NuxtLink></li>
          </ul>
        </div>
        <div class="col-group">
          <div class="col-head">{{ t.footerLegal }}</div>
          <ul>
            <li><NuxtLink to="/impressum">{{ t.linkImprint }}</NuxtLink></li>
            <li><NuxtLink to="/datenschutz">{{ t.linkPrivacy }}</NuxtLink></li>
            <li><NuxtLink to="/lizenz">{{ t.linkLicense }}</NuxtLink></li>
          </ul>
        </div>
      </footer>

    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed } from 'vue'

const { lang } = useLang()
const copied = ref(null)

function copy(text, key) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    copied.value = key
    setTimeout(() => { if (copied.value === key) copied.value = null }, 2000)
  })
}

// ── i18n ────────────────────────────────────────────────────────────────────
const de = {
  back: '← Zurück',
  kicker: 'USE CASES · BEISPIEL 1',
  h1: 'SYS<em>.</em> in der Praxis.',
  intro: 'Kein Konzept, kein Mockup — ein echter Ablauf gegen diesen laufenden Node. So sieht es aus, wenn ein fremder, autonomer KI-Agent ohne jedes Vorwissen und ohne besondere Rechte eine bezahlte Soul findet, das gesetzliche Widerrufsrecht respektiert, per x402 zahlt und Zugriff bekommt — ausschließlich über die öffentliche HTTP-Schnittstelle, keine internen Abkürzungen.',

  caseBadge: 'x402 / Polygon',
  caseTitle: 'Ein autonomer Agent kauft bezahlten Zugriff.',
  caseSub: 'Sechs Schritte, sechs öffentliche Endpunkte. Werte unten sind Beispielwerte — Preis und Wallet-Adresse sind auf diesem Node dynamisch bzw. erst nach Zustimmung sichtbar.',

  calloutText: 'Dieser Ablauf wurde live gegen diesen Node verifiziert — inklusive echter on-chain-Zahlung, signiert von einem eigenständigen Skript, das ausschließlich die oben gezeigten öffentlichen Endpunkte anspricht. Kein Aufruf ging an interne, nur lokal erreichbare Routen.',

  guaranteesH2: 'Was dabei technisch garantiert ist.',
  guarantees: [
    {
      title: 'Widerrufsrecht zuerst',
      body: 'Ohne Zustimmung zur Widerrufsbelehrung (Schritt 3+4) nennt der Node kein Zahlungsziel — technisch erzwungen, nicht nur dokumentiert.',
    },
    {
      title: 'Rechnung = tatsächlicher Betrag',
      body: 'Der bei der Zustimmung gezeigte Preis kann bis zur echten Zahlung leicht driften (dynamische Preisbildung). Die Rechnung wird nach Zahlungsbestätigung mit dem exakt abgebuchten Betrag final korrigiert — nie eine Differenz zwischen Beleg und Kontobewegung.',
    },
    {
      title: 'Kein Vorwissen nötig',
      body: 'Discovery, Preis, Zahlungsziel und Zugriff laufen komplett über dokumentierte, öffentliche Endpunkte — kein Account, keine Vorab-Berechtigung, kein internes Tooling nötig.',
    },
  ],

  moreText: 'Weitere Fallbeispiele — PayPal-Zahlungsweg, Gatekeeper-Zugriff für gewirte Souls, Peer-to-Peer-Nachrichten im Social Sphere — folgen hier nach demselben Muster.',

  copy: 'Kopieren',
  copied: 'Kopiert ✓',
  footerProtocol: 'Protokoll',
  footerLegal: 'Rechtliches',
  linkWhy: 'Warum SYS',
  linkImprint: 'Impressum',
  linkPrivacy: 'Datenschutz',
  linkLicense: 'Lizenz',
}

const en = {
  back: '← Back',
  kicker: 'USE CASES · EXAMPLE 1',
  h1: 'SYS<em>.</em> in practice.',
  intro: 'Not a concept, not a mockup — a real run against this live node. This is what it looks like when a foreign, autonomous AI agent — with no prior knowledge and no special privileges — finds a paid soul, respects the statutory right of withdrawal, pays via x402, and gets access — entirely through the public HTTP surface, no internal shortcuts.',

  caseBadge: 'x402 / Polygon',
  caseTitle: 'An autonomous agent buys paid access.',
  caseSub: 'Six steps, six public endpoints. Values below are example values — price and wallet address are dynamic on this node, and the wallet is only revealed after consent.',

  calloutText: 'This flow was verified live against this node — including a real on-chain payment, signed by a standalone script that talks exclusively to the public endpoints shown above. No call went to any internal, localhost-only route.',

  guaranteesH2: 'What is technically guaranteed here.',
  guarantees: [
    {
      title: 'Withdrawal rights come first',
      body: 'Without consent to the withdrawal notice (steps 3+4), the node never reveals a payment target — enforced technically, not just documented.',
    },
    {
      title: 'Invoice = actual amount charged',
      body: 'The price shown at consent time can drift slightly by the time payment settles (dynamic pricing). The invoice is finalized after payment confirmation with the exact charged amount — never a mismatch between receipt and ledger.',
    },
    {
      title: 'No prior knowledge required',
      body: 'Discovery, pricing, payment target, and access all run over documented public endpoints — no account, no pre-authorization, no internal tooling required.',
    },
  ],

  moreText: 'More case studies — the PayPal payment path, Gatekeeper access for wired souls, peer-to-peer messages in the Social Sphere — will follow here in the same format.',

  copy: 'Copy',
  copied: 'Copied ✓',
  footerProtocol: 'Protocol',
  footerLegal: 'Legal',
  linkWhy: 'Why SYS',
  linkImprint: 'Legal Notice',
  linkPrivacy: 'Privacy Policy',
  linkLicense: 'License',
}

const t = computed(() => lang.value === 'de' ? de : en)

// ── Steps (bilingual labels, protocol-accurate request/response shapes,
// example values — never the real soul_id/wallet/tx_hash of a live purchase) ──
const stepsDe = [
  {
    n: '01',
    label: 'Discovery — der Agent kennt noch keine Soul, nur den Node.',
    request: 'GET /api/soul/scan',
    example: `{
  "ok": true,
  "souls": [{
    "soul_id": "{soul_id}",
    "name": "KRO",
    "price_usdc": 0.5,
    "usdc_current": 0.81,
    "dynamic_pricing": true,
    "mcp_endpoint": "https://agency.uxprojects-jok.com/mcp"
  }]
}`,
  },
  {
    n: '02',
    label: 'Preview — aktuellen Preis und Zahlungsendpunkt bestätigen.',
    request: 'GET /api/soul/preview?soul_id={soul_id}',
    example: `{
  "usdc_required": "0.81xxxx",
  "pay_endpoint": "https://agency.uxprojects-jok.com/api/soul/pay/x402",
  "wallet": ""   // noch nicht genannt — siehe Schritt 4
}`,
  },
  {
    n: '03',
    label: 'Vorabinformation zum Widerrufsrecht — <strong>Pflicht</strong> vor jeder Zahlung.',
    request: 'POST /api/soul/terms/show',
    example: `{ "soul_id": "{soul_id}", "payment_method": "x402" }

→ { "terms_token": "{terms_token}", "preview_url": "…", "legal_text": "…" }`,
  },
  {
    n: '04',
    label: 'Zustimmung — erst jetzt wird das Zahlungsziel genannt.',
    request: 'POST /api/soul/terms/accept',
    example: `{
  "soul_id": "{soul_id}",
  "terms_token": "{terms_token}",
  "payment_method": "x402",
  "consent_immediate_performance": true,
  "consent_withdrawal_waiver": true
}

→ { "payment": { "value": "0x…" }, "price": "0.81xxxx", "invoice_number": "…" }`,
  },
  {
    n: '05',
    label: 'Zahlung — echter x402-Handshake (402 → signierte Autorisierung → Settlement).',
    request: 'POST /api/soul/pay/x402',
    example: `{ "soul_id": "{soul_id}", "reference_id": "{terms_token}" }
// ohne Signatur: 402 + PAYMENT-REQUIRED-Header
// mit signierter EIP-3009-Autorisierung im X-PAYMENT-Header: 200

→ { "ok": true, "tx_hash": "0x…", "usdc_amount": "0.81xxxx", "access_token": "{access_token}" }`,
    note: 'Signiert wird lokal, mit der eigenen Wallet des Agenten — der Node sieht nie einen privaten Schlüssel.',
  },
  {
    n: '06',
    label: 'Zugriff — mit dem erhaltenen Token lesen, ohne erneut zu zahlen.',
    request: 'GET /api/soul/paid-read?soul_id={soul_id}',
    note: 'Header: <code class="i-code">Authorization: Bearer {access_token}</code> — gültig für die konfigurierte Token-Laufzeit, mehrfach nutzbar.',
  },
]

const stepsEn = [
  {
    n: '01',
    label: 'Discovery — the agent doesn\'t know any soul yet, only the node.',
    request: 'GET /api/soul/scan',
    example: `{
  "ok": true,
  "souls": [{
    "soul_id": "{soul_id}",
    "name": "KRO",
    "price_usdc": 0.5,
    "usdc_current": 0.81,
    "dynamic_pricing": true,
    "mcp_endpoint": "https://agency.uxprojects-jok.com/mcp"
  }]
}`,
  },
  {
    n: '02',
    label: 'Preview — confirm the current price and payment endpoint.',
    request: 'GET /api/soul/preview?soul_id={soul_id}',
    example: `{
  "usdc_required": "0.81xxxx",
  "pay_endpoint": "https://agency.uxprojects-jok.com/api/soul/pay/x402",
  "wallet": ""   // not revealed yet — see step 4
}`,
  },
  {
    n: '03',
    label: 'Pre-purchase withdrawal-rights notice — <strong>mandatory</strong> before any payment.',
    request: 'POST /api/soul/terms/show',
    example: `{ "soul_id": "{soul_id}", "payment_method": "x402" }

→ { "terms_token": "{terms_token}", "preview_url": "…", "legal_text": "…" }`,
  },
  {
    n: '04',
    label: 'Consent — only now is the payment target revealed.',
    request: 'POST /api/soul/terms/accept',
    example: `{
  "soul_id": "{soul_id}",
  "terms_token": "{terms_token}",
  "payment_method": "x402",
  "consent_immediate_performance": true,
  "consent_withdrawal_waiver": true
}

→ { "payment": { "value": "0x…" }, "price": "0.81xxxx", "invoice_number": "…" }`,
  },
  {
    n: '05',
    label: 'Payment — a real x402 handshake (402 → signed authorization → settlement).',
    request: 'POST /api/soul/pay/x402',
    example: `{ "soul_id": "{soul_id}", "reference_id": "{terms_token}" }
// without a signature: 402 + PAYMENT-REQUIRED header
// with a signed EIP-3009 authorization in the X-PAYMENT header: 200

→ { "ok": true, "tx_hash": "0x…", "usdc_amount": "0.81xxxx", "access_token": "{access_token}" }`,
    note: 'Signing happens locally, with the agent\'s own wallet — the node never sees a private key.',
  },
  {
    n: '06',
    label: 'Access — read with the received token, without paying again.',
    request: 'GET /api/soul/paid-read?soul_id={soul_id}',
    note: 'Header: <code class="i-code">Authorization: Bearer {access_token}</code> — valid for the configured token lifetime, reusable.',
  },
]

const steps = computed(() => lang.value === 'de' ? stepsDe : stepsEn)
</script>

<style scoped>
.sys-page {
  --bg:     #0f0f0f;
  --bg-2:   #161616;
  --line:   rgba(255,255,255,0.07);
  --teal:   #6db89a;
  --fg:     #f0f0f0;
  --fg-dim: rgba(240,240,240,0.50);
  --serif:  'Noto Serif', Georgia, serif;
  --sans:   'Inter', system-ui, sans-serif;
  --mono:   'JetBrains Mono', 'Oxanium', ui-monospace, monospace;
  --text:   17px;
  min-height: 100vh; background: var(--bg); color: var(--fg); font-family: var(--sans);
}

/* ── NAV ──────────────────────────────────────────────────────────── */
.l-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 clamp(20px,4vw,52px); height: 64px;
  border-bottom: 1px solid var(--line);
  position: sticky; top: 0; z-index: 100;
  background: rgba(15,15,15,0.95); backdrop-filter: blur(12px);
}
.nav-home { font-family: var(--serif); font-weight: 700; font-size: clamp(22px,3vw,28px); letter-spacing: -0.02em; color: var(--fg); text-decoration: none; }
.nav-home .dot { color: var(--teal); }
.nav-end { display: flex; align-items: center; gap: 16px; }
.back { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg); background: none; border: none; cursor: pointer; transition: color 0.15s; white-space: nowrap; }
.back:hover { color: var(--teal); }

/* ── WRAP / HERO ──────────────────────────────────────────────────── */
.uc-wrap { padding: clamp(28px,4vw,48px) clamp(20px,4vw,52px) 0; max-width: 860px; margin: 0 auto; }
.kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--teal); display: block; margin-bottom: 14px; }
.topbar { margin-bottom: 48px; }
.uc-h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(32px,5vw,52px); line-height: 1.05; letter-spacing: -0.03em; color: #fff; margin: 0 0 18px; }
.uc-h1 :deep(em) { font-style: italic; color: var(--teal); }
.uc-intro { font-size: 16px; line-height: 1.75; color: var(--fg-dim); max-width: 68ch; }

/* ── CASE STUDY ───────────────────────────────────────────────────── */
.uc-case { border: 1px solid var(--line); background: rgba(255,255,255,0.015); padding: clamp(24px,4vw,40px); margin-bottom: 56px; }
.case-head { margin-bottom: 32px; }
.case-badge {
  display: inline-block; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--teal); border: 1px solid rgba(109,184,154,0.3); padding: 4px 10px; margin-bottom: 14px;
}
.case-title { font-family: var(--serif); font-weight: 400; font-size: clamp(22px,3vw,30px); color: #fff; margin: 0 0 10px; letter-spacing: -0.01em; }
.case-sub { font-size: 14px; color: var(--fg-dim); line-height: 1.6; max-width: 62ch; }

.uc-step { display: flex; gap: 18px; margin-bottom: 28px; align-items: flex-start; padding-bottom: 28px; border-bottom: 1px solid var(--line); }
.uc-step:last-of-type { border-bottom: none; }
.step-n {
  font-family: var(--mono); font-size: 13px; color: var(--teal); border: 1px solid rgba(109,184,154,0.3);
  min-width: 32px; height: 26px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 2px;
}
.step-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; flex: 1; }
.step-label { font-size: var(--text); color: var(--fg); line-height: 1.6; }
.step-label :deep(strong) { color: var(--teal); font-weight: 600; }
.step-sub { font-size: 14px; color: var(--fg-dim); line-height: 1.6; }
.i-code, :deep(.i-code) { font-family: var(--mono); font-size: 13px; color: var(--fg); background: rgba(109,184,154,0.1); padding: 1px 6px; }

.copy-block { display: flex; align-items: stretch; border: 1px solid var(--line); background: rgba(255,255,255,0.025); }
.copy-code { font-family: var(--mono); font-size: 13px; color: var(--fg); padding: 9px 12px; flex: 1; word-break: break-all; min-width: 0; display: block; }
.copy-btn { font-family: var(--sans); font-size: 12px; background: none; border: none; border-left: 1px solid var(--line); color: var(--fg); padding: 0 14px; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
.copy-btn:hover { background: rgba(109,184,154,0.07); color: var(--teal); }

.uc-example {
  font-family: var(--mono); font-size: 12.5px; line-height: 1.6; color: var(--fg-dim);
  background: rgba(0,0,0,0.3); border: 1px solid var(--line); padding: 14px 16px;
  overflow-x: auto; margin: 0; white-space: pre;
}
.uc-example code { color: inherit; }

.uc-callout {
  display: flex; gap: 14px; align-items: flex-start; margin-top: 8px;
  padding: 18px 20px; border: 1px solid rgba(109,184,154,0.25); background: rgba(109,184,154,0.05);
}
.callout-mark { font-family: var(--serif); font-style: italic; color: var(--teal); font-size: 18px; flex: none; }
.uc-callout p { font-size: 14px; line-height: 1.65; color: var(--fg); margin: 0; }

/* ── GUARANTEES ───────────────────────────────────────────────────── */
.uc-guarantees { margin-bottom: 56px; }
.uc-h2 { font-family: var(--serif); font-weight: 400; font-size: clamp(22px,3vw,30px); color: #fff; margin: 0 0 24px; letter-spacing: -0.01em; }
.guarantee-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
@media (max-width: 760px) { .guarantee-grid { grid-template-columns: 1fr; } }
.guarantee-card { border: 1px solid var(--line); padding: 20px; }
.guarantee-title { font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em; color: var(--teal); margin-bottom: 10px; }
.guarantee-body { font-size: 14px; line-height: 1.65; color: var(--fg-dim); margin: 0; }

/* ── MORE ─────────────────────────────────────────────────────────── */
.uc-more { padding-bottom: 56px; }
.uc-more p { font-size: 14px; color: var(--fg-dim); line-height: 1.7; font-style: italic; }

/* ── FOOTER ───────────────────────────────────────────────────────── */
.colophon { border-top: 1px solid var(--line); padding: clamp(32px,5vw,64px) clamp(20px,4vw,52px); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; max-width: 1100px; margin: 0 auto; }
@media (max-width: 720px) { .colophon { grid-template-columns: 1fr; gap: 32px; } }
.col-brand { display: flex; flex-direction: column; gap: 12px; }
.col-name { font-family: var(--serif); font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: #fff; }
.col-name em { font-style: italic; color: var(--teal); }
.fr-tag { font-family: var(--mono); font-size: 11px; color: var(--fg-dim); }
.col-head { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-dim); margin-bottom: 14px; }
.colophon ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.colophon a { font-size: 15px; color: var(--fg); text-decoration: none; transition: color 0.15s; }
.colophon a:hover { color: var(--teal); }
</style>
