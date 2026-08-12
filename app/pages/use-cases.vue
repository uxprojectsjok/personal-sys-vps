<template>
  <ClientOnly>
    <div class="sys-page">

      <a href="#main-content" class="skip-link">{{ $t('common.skip_to_content') }}</a>

      <!-- NAV -->
      <nav class="l-nav">
        <div class="lockup">
          <NuxtLink to="/" class="nav-home"><img src="/logo-nav.png" alt="SYS. Agency" class="nav-logo-img" /></NuxtLink>
        </div>
        <div class="nav-end">
          <button class="theme-toggle" @click="toggleTheme" :aria-label="isDark ? 'Light' : 'Dark'" :title="isDark ? 'Light' : 'Dark'">
            <SysIcon :name="isDark ? 'sun' : 'moon'" style="width:15px;height:15px" />
          </button>
          <LangToggle />
          <NuxtLink to="/gate?login=1" class="nav-signin">{{ t.signIn }}</NuxtLink>
          <button class="back" @click="$router.back()" :aria-label="t.back">{{ t.back }}</button>
        </div>
      </nav>

      <div id="main-content" class="uc-wrap">

        <!-- HERO -->
        <div class="uc-hero">
          <span class="kicker">{{ t.kicker }}</span>
          <h1 class="uc-h1" v-html="t.h1"></h1>
          <p class="uc-intro">{{ t.intro }}</p>
        </div>

        <!-- CASE STUDIES -->
        <section v-for="c in cases" :key="c.badge" class="uc-case">
          <div class="case-head">
            <span class="case-badge">{{ c.badge }}</span>
            <h2 class="case-title">{{ c.title }}</h2>
            <p class="case-sub">{{ c.sub }}</p>
          </div>

          <div v-for="s in c.steps" :key="s.n" class="uc-step">
            <span class="step-n">{{ s.n }}</span>
            <div class="step-body">
              <div class="step-label" v-html="s.label"></div>
              <div class="copy-block" v-if="s.request">
                <code class="copy-code">{{ s.request }}</code>
                <button class="copy-btn" @click="copy(s.request, c.badge + s.n)">{{ copied === c.badge + s.n ? t.copied : t.copy }}</button>
              </div>
              <pre v-if="s.example" class="uc-example"><code>{{ s.example }}</code></pre>
              <p v-if="s.note" class="step-sub" v-html="s.note"></p>
            </div>
          </div>

          <div class="uc-callout">
            <span class="callout-mark">→</span>
            <p v-html="c.callout"></p>
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
          <span class="uc-fr-tag">Apache 2.0</span>
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
import { useColorScheme } from '~/composables/useColorScheme.js'

const { lang } = useLang()
const { isDark, toggle: toggleTheme } = useColorScheme()
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
  signIn: 'Anmelden',
  kicker: 'USE CASES',
  h1: 'SYS<em>.</em> in der Praxis.',
  intro: 'Kein Konzept, kein Mockup — echte Abläufe gegen diesen laufenden Node. So sieht es aus, wenn ein fremder, autonomer KI-Agent ohne jedes Vorwissen und ohne besondere Rechte eine bezahlte Soul findet, das gesetzliche Widerrufsrecht respektiert, zahlt — per x402 oder PayPal — und Zugriff bekommt — ausschließlich über die öffentliche HTTP-Schnittstelle, keine internen Abkürzungen.',

  guaranteesH2: 'Was dabei technisch garantiert ist.',
  guarantees: [
    {
      title: 'Widerrufsrecht zuerst',
      body: 'Ohne Zustimmung zur Widerrufsbelehrung nennt der Node kein Zahlungsziel — technisch erzwungen, nicht nur dokumentiert. Gilt für beide Zahlungswege gleichermaßen.',
    },
    {
      title: 'Rechnung = tatsächlicher Betrag',
      body: 'Der bei der Zustimmung gezeigte Preis kann bis zur echten Zahlung leicht driften (dynamische Preisbildung, nur x402). Die Rechnung wird nach Zahlungsbestätigung mit dem exakt abgebuchten Betrag final korrigiert — nie eine Differenz zwischen Beleg und Kontobewegung.',
    },
    {
      title: 'Kein Vorwissen nötig',
      body: 'Discovery, Preis, Zahlungsziel und Zugriff laufen komplett über dokumentierte, öffentliche Endpunkte — kein Account, keine Vorab-Berechtigung, kein internes Tooling nötig.',
    },
  ],

  moreText: 'Weitere Fallbeispiele — Gatekeeper-Zugriff für gewirte Souls, Peer-to-Peer-Nachrichten im Social Sphere — folgen hier nach demselben Muster.',

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
  signIn: 'Sign in',
  kicker: 'USE CASES',
  h1: 'SYS<em>.</em> in practice.',
  intro: 'Not a concept, not a mockup — real runs against this live node. This is what it looks like when a foreign, autonomous AI agent — with no prior knowledge and no special privileges — finds a paid soul, respects the statutory right of withdrawal, pays — via x402 or PayPal — and gets access — entirely through the public HTTP surface, no internal shortcuts.',

  guaranteesH2: 'What is technically guaranteed here.',
  guarantees: [
    {
      title: 'Withdrawal rights come first',
      body: 'Without consent to the withdrawal notice, the node never reveals a payment target — enforced technically, not just documented. Applies to both payment paths alike.',
    },
    {
      title: 'Invoice = actual amount charged',
      body: 'The price shown at consent time can drift slightly by the time payment settles (dynamic pricing, x402 only). The invoice is finalized after payment confirmation with the exact charged amount — never a mismatch between receipt and ledger.',
    },
    {
      title: 'No prior knowledge required',
      body: 'Discovery, pricing, payment target, and access all run over documented public endpoints — no account, no pre-authorization, no internal tooling required.',
    },
  ],

  moreText: 'More case studies — Gatekeeper access for wired souls, peer-to-peer messages in the Social Sphere — will follow here in the same format.',

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

// ── Cases (bilingual labels, protocol-accurate request/response shapes,
// example values — never the real soul_id/wallet/tx_hash/reference_id of a
// live purchase) ─────────────────────────────────────────────────────────
const casesDe = [
  {
    badge: 'x402 / Polygon',
    title: 'Ein autonomer Agent kauft bezahlten Zugriff.',
    sub: 'Sechs Schritte, sechs öffentliche Endpunkte. Werte unten sind Beispielwerte — Preis und Wallet-Adresse sind auf diesem Node dynamisch bzw. erst nach Zustimmung sichtbar.',
    callout: 'Dieser Ablauf wurde live gegen diesen Node verifiziert — inklusive echter on-chain-Zahlung, signiert von einem eigenständigen Skript, das ausschließlich die oben gezeigten öffentlichen Endpunkte anspricht. Kein Aufruf ging an interne, nur lokal erreichbare Routen.',
    steps: [
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
        request: 'POST {mcp_endpoint}',
        example: `Header: Authorization: Bearer {access_token}

{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "<tool>", "arguments": {} } }`,
        note: 'Gültig für die konfigurierte Token-Laufzeit, mehrfach nutzbar — für jedes Tool, das der Soul-Inhaber für zahlende Agenten freigegeben hat.',
      },
    ],
  },
  {
    badge: 'PayPal',
    title: 'Ein menschlicher Käufer zahlt ohne Wallet.',
    sub: 'Gleicher Zustimmungsablauf wie beim x402-Weg — nur mit einer echten, manuell geprüften Überweisung statt automatischem On-Chain-Settlement. Für Käufer ohne Polygon-Wallet.',
    callout: 'Auch dieser Ablauf wurde live gegen diesen Node verifiziert — echte PayPal-Zahlung, manuelle Token-Ausstellung durch den Betreiber, danach erfolgreiche Einlösung durch einen extern per MCP verbundenen Agenten (Claude), bestätigt durch einen echten, protokollierten Tool-Aufruf.',
    steps: [
      {
        n: '01',
        label: 'Discovery — derselbe öffentliche Scan wie bei x402.',
        request: 'GET /api/soul/scan',
        example: `{
  "ok": true,
  "souls": [{
    "soul_id": "{soul_id}",
    "name": "KRO",
    "paypal_enabled": true,
    "price_eur": "0.50",
    "mcp_endpoint": "https://agency.uxprojects-jok.com/mcp"
  }]
}`,
      },
      {
        n: '02',
        label: 'Preview — bestätigt Preis in EUR und dass PayPal akzeptiert wird.',
        request: 'GET /api/soul/preview?soul_id={soul_id}',
        example: `{
  "paypal_accepted": true,
  "price_eur": "0.50",
  "paypal_target": ""   // noch nicht genannt — siehe Schritt 4
}`,
      },
      {
        n: '03',
        label: 'Vorabinformation zum Widerrufsrecht — <strong>Pflicht</strong> vor jeder Zahlung, identisch zu x402.',
        request: 'POST /api/soul/terms/show',
        example: `{ "soul_id": "{soul_id}", "payment_method": "paypal" }

→ { "terms_token": "{terms_token}", "preview_url": "…", "legal_text": "…" }`,
      },
      {
        n: '04',
        label: 'Zustimmung — erst jetzt wird das PayPal-Ziel genannt.',
        request: 'POST /api/soul/terms/accept',
        example: `{
  "soul_id": "{soul_id}",
  "terms_token": "{terms_token}",
  "payment_method": "paypal",
  "consent_immediate_performance": true,
  "consent_withdrawal_waiver": true
}

→ { "payment": { "value": "https://paypal.me/{provider}" }, "price": "0.50", "invoice_number": "…" }`,
        note: 'Die <code class="i-code">reference_id</code> (= <code class="i-code">terms_token</code>) muss in die PayPal-Zahlungsnotiz — sonst kann der Betreiber die Zahlung nicht zuordnen.',
      },
      {
        n: '05',
        label: 'Zahlung — echte Überweisung außerhalb der API, manuell geprüft.',
        note: 'Kein Endpunkt — dieser Schritt läuft auf paypal.com selbst. Der Käufer überweist den genannten Betrag mit <code class="i-code">{terms_token}</code> in der Notiz. Der Betreiber gleicht den Zahlungseingang gegen diese Referenz ab und stellt danach von Hand einen Zugangs-Token aus — üblich innerhalb von 48h, nicht sofort wie bei x402.',
      },
      {
        n: '06',
        label: 'Zugriff — sobald der Token vorliegt, identisch zu x402.',
        request: 'POST {mcp_endpoint}',
        example: `Header: Authorization: Bearer {access_token}

{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "<tool>", "arguments": {} } }`,
        note: 'Ab hier kein Unterschied mehr zum x402-Weg — derselbe Token, dieselbe Bearer-Auth, dieselben freigegebenen Tools.',
      },
    ],
  },
]

const casesEn = [
  {
    badge: 'x402 / Polygon',
    title: 'An autonomous agent buys paid access.',
    sub: 'Six steps, six public endpoints. Values below are example values — price and wallet address are dynamic on this node, and the wallet is only revealed after consent.',
    callout: 'This flow was verified live against this node — including a real on-chain payment, signed by a standalone script that talks exclusively to the public endpoints shown above. No call went to any internal, localhost-only route.',
    steps: [
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
        request: 'POST {mcp_endpoint}',
        example: `Header: Authorization: Bearer {access_token}

{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "<tool>", "arguments": {} } }`,
        note: 'Valid for the configured token lifetime, reusable — for any tool the soul owner enabled for paying agents.',
      },
    ],
  },
  {
    badge: 'PayPal',
    title: 'A human buyer pays without a wallet.',
    sub: 'Same consent flow as the x402 path — just with a real, manually reviewed transfer instead of automatic on-chain settlement. For buyers without a Polygon wallet.',
    callout: 'This flow was also verified live against this node — a real PayPal payment, manual token issuance by the operator, then successful redemption by an externally connected agent (Claude, via MCP), confirmed by a real, logged tool call.',
    steps: [
      {
        n: '01',
        label: 'Discovery — the same public scan as x402.',
        request: 'GET /api/soul/scan',
        example: `{
  "ok": true,
  "souls": [{
    "soul_id": "{soul_id}",
    "name": "KRO",
    "paypal_enabled": true,
    "price_eur": "0.50",
    "mcp_endpoint": "https://agency.uxprojects-jok.com/mcp"
  }]
}`,
      },
      {
        n: '02',
        label: 'Preview — confirms the EUR price and that PayPal is accepted.',
        request: 'GET /api/soul/preview?soul_id={soul_id}',
        example: `{
  "paypal_accepted": true,
  "price_eur": "0.50",
  "paypal_target": ""   // not revealed yet — see step 4
}`,
      },
      {
        n: '03',
        label: 'Pre-purchase withdrawal-rights notice — <strong>mandatory</strong> before any payment, identical to x402.',
        request: 'POST /api/soul/terms/show',
        example: `{ "soul_id": "{soul_id}", "payment_method": "paypal" }

→ { "terms_token": "{terms_token}", "preview_url": "…", "legal_text": "…" }`,
      },
      {
        n: '04',
        label: 'Consent — only now is the PayPal target revealed.',
        request: 'POST /api/soul/terms/accept',
        example: `{
  "soul_id": "{soul_id}",
  "terms_token": "{terms_token}",
  "payment_method": "paypal",
  "consent_immediate_performance": true,
  "consent_withdrawal_waiver": true
}

→ { "payment": { "value": "https://paypal.me/{provider}" }, "price": "0.50", "invoice_number": "…" }`,
        note: 'The <code class="i-code">reference_id</code> (= <code class="i-code">terms_token</code>) must go into the PayPal payment note — otherwise the operator can\'t match the payment.',
      },
      {
        n: '05',
        label: 'Payment — a real transfer outside the API, reviewed manually.',
        note: 'No endpoint — this step happens on paypal.com itself. The buyer sends the invoiced amount with <code class="i-code">{terms_token}</code> in the note. The operator matches the incoming payment against that reference, then issues an access token by hand — typically within 48h, not instant like x402.',
      },
      {
        n: '06',
        label: 'Access — once the token exists, identical to x402.',
        request: 'POST {mcp_endpoint}',
        example: `Header: Authorization: Bearer {access_token}

{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "<tool>", "arguments": {} } }`,
        note: 'No difference from here on out — same token, same bearer auth, same enabled tools.',
      },
    ],
  },
]

const cases = computed(() => lang.value === 'de' ? casesDe : casesEn)
</script>

<style scoped>
.sys-page {
  /* Was hardcoded dark-only, shadowing the real theme tokens of the same
     name — every border/background on this page was silently stuck on
     dark regardless of theme. --bg/--line/--line-2 need `inherit` (shared
     name with the real ancestor token); --bg-2 and the --teal tokens are
     locally-named so var() is safe. */
  --bg:     inherit;
  --bg-2:   var(--surface);
  --line:   inherit;
  --line-2: inherit;
  --teal:   var(--accent);
  --teal-bright: var(--accent-bright);
  /* --fg/--serif/--sans/--mono inherited from sys-v2.css's global :root — no local override. */
  --text:   17px;
  min-height: 100vh; background: var(--bg); color: var(--fg); font-family: var(--sans);
}

/* ── NAV ──────────────────────────────────────────────────────────── */
.l-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 clamp(20px,4vw,52px); height: 64px;
  border-bottom: 1px solid var(--line);
  position: sticky; top: 0; z-index: 100;
  background: var(--glass-solid); backdrop-filter: blur(12px);
}
.nav-home { display: flex; text-decoration: none; }
.nav-logo-img { display: block; height: clamp(28px,4vw,36px); width: auto; }
.nav-end { display: flex; align-items: center; gap: 16px; }
.theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: none; border: none; color: var(--fg-3); cursor: pointer; padding: 0; transition: color 0.15s; }
.theme-toggle:hover { color: var(--fg); }
.nav-signin { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; transition: color 0.15s; white-space: nowrap; display: inline-flex; align-items: center; }
.nav-signin:hover { color: var(--fg); }
.back { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg); background: none; border: none; padding: 0; cursor: pointer; transition: color 0.15s; white-space: nowrap; display: inline-flex; align-items: center; }
.back:hover { color: var(--teal); }

/* ── WRAP / HERO ──────────────────────────────────────────────────── */
.uc-wrap { padding: clamp(32px,5vw,56px) clamp(20px,4vw,52px) 0; max-width: 860px; margin: 0 auto; }
.kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--teal); display: block; margin-bottom: 16px; }
.uc-hero { padding-bottom: clamp(32px,5vw,48px); margin-bottom: clamp(40px,6vw,64px); border-bottom: 1px solid var(--line); }
.uc-h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(34px,5.5vw,56px); line-height: 1.05; letter-spacing: -0.03em; color: var(--fg); margin: 0 0 22px; }
.uc-h1 :deep(em) { font-style: italic; color: var(--teal); }
.uc-intro { font-size: 17px; line-height: 1.75; color: var(--fg); max-width: 62ch; }

/* ── CASE STUDY ───────────────────────────────────────────────────── */
.uc-case { border: 1px solid var(--line); background: var(--surface-2); padding: clamp(24px,4vw,40px); margin-bottom: 40px; }
.uc-case + .uc-case { margin-top: 0; }
.uc-guarantees { margin-top: 16px; }
.case-head { margin-bottom: 36px; }
.case-badge {
  display: inline-block; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--teal-bright); border: 1px solid rgba(109,184,154,0.35); padding: 4px 10px; margin-bottom: 16px;
}
.case-title { font-family: var(--serif); font-weight: 400; font-size: clamp(24px,3.2vw,32px); color: var(--fg); margin: 0 0 12px; letter-spacing: -0.01em; }
.case-sub { font-size: var(--text); color: var(--fg); line-height: 1.7; max-width: 62ch; }

.uc-step { display: flex; gap: 20px; margin-bottom: 30px; align-items: flex-start; padding-bottom: 30px; border-bottom: 1px solid var(--line); }
.uc-step:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.step-n {
  font-family: var(--mono); font-size: 13px; color: var(--teal-bright); border: 1px solid rgba(109,184,154,0.35);
  min-width: 32px; height: 26px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 2px;
}
.step-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; flex: 1; }
.step-label { font-size: var(--text); color: var(--fg); line-height: 1.65; }
.step-label :deep(strong) { color: var(--teal-bright); font-weight: 600; }
.step-sub { font-size: 15px; color: var(--fg); line-height: 1.7; }
.i-code, :deep(.i-code) { font-family: var(--mono); font-size: 13px; color: var(--fg); background: rgba(109,184,154,0.14); padding: 1px 6px; }

.copy-block { display: flex; align-items: stretch; border: 1px solid var(--line-2); background: var(--surface-2); }
.copy-code { font-family: var(--mono); font-size: 13.5px; color: var(--fg); padding: 10px 12px; flex: 1; word-break: break-all; min-width: 0; display: block; }
.copy-btn { font-family: var(--sans); font-size: 12px; background: none; border: none; border-left: 1px solid var(--line-2); color: var(--fg); padding: 0 14px; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
.copy-btn:hover { background: rgba(109,184,154,0.1); color: var(--teal-bright); }

.uc-example {
  font-family: var(--mono); font-size: 13.5px; line-height: 1.7; color: var(--fg);
  background: var(--surface-3); border: 1px solid var(--line-2); padding: 16px 18px;
  overflow-x: auto; margin: 0; white-space: pre;
}
.uc-example code { color: inherit; }

.uc-callout {
  display: flex; gap: 14px; align-items: flex-start; margin-top: 10px;
  padding: 20px 22px; border: 1px solid rgba(109,184,154,0.3); background: rgba(109,184,154,0.07);
}
.callout-mark { font-family: var(--serif); font-style: italic; color: var(--teal-bright); font-size: 18px; flex: none; }
.uc-callout p { font-size: 15px; line-height: 1.7; color: var(--fg); margin: 0; }

/* ── GUARANTEES ───────────────────────────────────────────────────── */
.uc-guarantees { margin-bottom: 56px; }
.uc-h2 { font-family: var(--serif); font-weight: 400; font-size: clamp(24px,3.2vw,32px); color: var(--fg); margin: 0 0 26px; letter-spacing: -0.01em; }
.guarantee-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
@media (max-width: 760px) { .guarantee-grid { grid-template-columns: 1fr; } }
.guarantee-card { border: 1px solid var(--line); padding: 22px; }
.guarantee-title { font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em; color: var(--teal-bright); margin-bottom: 12px; }
.guarantee-body { font-size: 15px; line-height: 1.7; color: var(--fg); margin: 0; }

/* ── MORE ─────────────────────────────────────────────────────────── */
.uc-more { padding-bottom: 56px; }
.uc-more p { font-size: 15px; color: var(--fg); line-height: 1.75; font-style: italic; }

/* ── FOOTER ───────────────────────────────────────────────────────── */
.colophon { border-top: 1px solid var(--line); padding: clamp(32px,5vw,64px) clamp(20px,4vw,52px); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; max-width: 1100px; margin: 0 auto; }
@media (max-width: 720px) { .colophon { grid-template-columns: 1fr; gap: 32px; } }
.col-brand { display: flex; flex-direction: column; gap: 12px; }
.col-name { font-family: var(--serif); font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
.col-name em { font-style: italic; color: var(--teal); }
.uc-fr-tag { font-family: var(--mono); font-size: 11px; color: var(--fg); }
.col-head { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg); margin-bottom: 14px; }
.colophon ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.colophon a { font-size: 15px; color: var(--fg); text-decoration: none; transition: color 0.15s; }
.colophon a:hover { color: var(--teal); }
</style>
