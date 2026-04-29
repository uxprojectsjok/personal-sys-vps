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
          <button class="logout" @click="confirmReset" aria-label="Ausloggen">
            Ausloggen <span class="arr">↗</span>
          </button>
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
        <footer class="dash-foot">
          <span class="dash-copy">© 2026 · UX-Projects Jan-Oliver Karo</span>
          <nav class="dash-links">
            <NuxtLink to="/datenschutz">Datenschutz</NuxtLink>
            <NuxtLink to="/impressum">Impressum</NuxtLink>
            <NuxtLink to="/lizenz">Lizenz</NuxtLink>
            <NuxtLink to="/dev-docs">Dev-Docs</NuxtLink>
            <NuxtLink to="/api-docs">API-Docs</NuxtLink>
          </nav>
        </footer>
      </div>
    </template>

    <!-- ─────────────── NO SOUL ─ Landing ─────────────── -->
    <template v-else>
      <div class="sys-page landing">

        <nav class="l-nav">
          <div class="lockup">
            <span class="mark">SYS<span class="dot">.</span></span>
            <span class="tag">Save Your Soul · v1.0β</span>
          </div>
          <div class="center"><span class="notice-text">Geschlossene Anwendung von UX-Projects Jan-Oliver Karo. Kein öffentlicher Betrieb. Testphase unter Realbedingungen für eingeladene oder interne Nutzerinnen oder Nutzer.</span></div>
          <div class="actions">
            <button v-if="config.public.allowCreateSoul" class="btn ghost" @click="createSoulOpen = true">Create Soul</button>
            <button class="btn primary" @click="loginOpen = true">Login <span class="arr">→</span></button>
          </div>
        </nav>

        <div class="ticker" aria-hidden="true">
          <div class="track">
            <span v-for="i in 2" :key="i">
              <em>◆</em> Portable identity layer for AI
              <em>◆</em> AES-256 local-first
              <em>◆</em> MCP protocol native
              <em>◆</em> Polygon anchored
              <em>◆</em> sys.md — your file, your rules
            </span>
          </div>
        </div>

        <section class="hero">
          <div class="hero-vis" aria-hidden="true">
            <img src="/ecosystem/mensch_ki.png" alt="" />
          </div>
          <div class="hero-grid">
            <h1 class="display">Save <em>Your</em><br>Soul<span class="amp">.</span></h1>
            <aside class="side">
              <div class="issue">Protokoll · nicht Produkt</div>
              <p>Nutze deine KI wie gewohnt — <b>deine Soul wächst dabei.</b> Kryptographisch signiert, lokal gespeichert, von jeder KI lesbar.</p>
              <p>Kein Account. Kein Plattformzwang. Deine Soul gehört dir.</p>
              <div class="cta-row">
                <button v-if="config.public.allowCreateSoul" class="btn primary" @click="createSoulOpen = true">Create Soul <span class="arr">→</span></button>
                <button class="btn ghost" @click="loginOpen = true">Login with Soul</button>
              </div>
            </aside>
          </div>
          <div class="hero-meta">
            <span><b>01</b> Portable Markdown-Datei</span>
            <span><b>02</b> Wächst mit jeder Session</span>
            <span><b>03</b> Lokal, verschlüsselt, deins</span>
            <span><b>04</b> MCP · Polygon</span>
          </div>
        </section>

        <div class="masthead">
          <div><span class="lbl">sys.md Format</span><span class="val">Markdown<em>+YAML</em></span></div>
          <div><span class="lbl">Verschlüsselung</span><span class="val">AES-256<em>CBC · GCM</em></span></div>
          <div><span class="lbl">Anker</span><span class="val">Polygon<em>Mainnet</em></span></div>
          <div><span class="lbl">Protokoll</span><span class="val">MCP<em>open</em></span></div>
        </div>

        <section class="sec">
          <header class="sec-head">
            <span class="n">Schnellstart</span>
            <h2>In drei Schritten<br><em>zur lebendigen Soul.</em></h2>
          </header>
          <ol class="steps">
            <li><div class="big"><em>01</em></div><div class="k">Schritt 01 · Soul</div><h3>Soul erstellen</h3><p>Einloggen oder auf Einladung eine neue Soul anlegen. Dein digitales Profil ist sofort bereit.</p></li>
            <li><div class="big"><em>02</em></div><div class="k">Schritt 02 · MCP</div><h3>MCP verbinden</h3><p>MCP-Endpunkt in deinem KI-Client eintragen — OAuth-Login erscheint automatisch.</p><code>&lt;dein-server&gt;/mcp</code></li>
            <li><div class="big"><em>03</em></div><div class="k">Schritt 03 · Guide</div><h3>/soul_guide aktivieren</h3><p>Prompt einmal aufrufen — deine KI liest die Soul und schreibt nach jedem bedeutsamen Gespräch eigenständig Einträge.</p></li>
          </ol>
        </section>

        <section class="sec no-pad-bottom">
          <header class="sec-head">
            <span class="n">Vier Bausteine</span>
            <h2>Stimme. Gesicht.<br><em>Bewegung. Gedanken.</em></h2>
          </header>
          <div class="feat">
            <article>
              <div class="feat-vis" aria-hidden="true"><img src="/ecosystem/phase1-soul.png" alt="" /></div>
              <div class="k">I · Soul Protocol</div>
              <h3>Identität<em>,</em> als Datei.</h3>
              <p class="lede">Eine kryptographisch signierte Identitätsdatei, die deine Persönlichkeit strukturiert erfasst und durch jede Session weiterentwickelt wird.</p>
              <ul><li>HMAC-SHA256 Signatur</li><li>sys.md Open Format</li><li>Soul Kalender · Vault-Sync</li><li>Wächst mit jeder Session</li><li>Blockchain-Anker (optional)</li></ul>
            </article>
            <article>
              <div class="feat-vis" aria-hidden="true"><img src="/ecosystem/phase2-network.png" alt="" /></div>
              <div class="k">II · Memory Vault</div>
              <h3>Vault<em>,</em> als Tresor.</h3>
              <p class="lede">Dein lokaler, verschlüsselter Ordner für alles, was dich ausmacht — Stimme, Gesicht, Bewegung, Bilder, Texte. Lokal auf deinem Gerät.</p>
              <ul><li>Stimme, Gesicht &amp; Bewegung</li><li>AES-256-GCM · Passkey (WebAuthn PRF)</li><li>12-Wort BIP39 Recovery</li><li>Vault Explorer · Bulk-Upload</li><li>Geräteübergreifender Import</li></ul>
            </article>
            <article>
              <div class="feat-vis" aria-hidden="true"><img src="/ecosystem/phase4-robot.png" alt="" /></div>
              <div class="k">III · AI Interface</div>
              <h3>KI<em>,</em> die dich kennt.</h3>
              <p class="lede">Sprich mit einer KI, die deine Soul kennt. Gedanken werden analysiert, die Soul automatisch angereichert — dein Profil wächst mit.</p>
              <ul><li>Soul als Kontext für KI</li><li>Streaming-Antworten (SSE)</li><li>Automatische Soul-Anreicherung</li><li>Vision Pipeline · Kamera → Bild/Video</li><li>Entwicklungs-Analyse &amp; Wachstum</li></ul>
            </article>
            <article>
              <div class="feat-vis" aria-hidden="true"><img src="/ecosystem/phase3-api.png" alt="" /></div>
              <div class="k">IV · Soul API</div>
              <h3>Zugriff<em>,</em> unter Kontrolle.</h3>
              <p class="lede">Gib externen Diensten kontrollierten Zugriff auf deine Soul-Daten. Stimme, Gesicht, Kontext — du bestimmst, was freigegeben wird.</p>
              <ul><li>Webhook-Token Authentifizierung</li><li>6 granulare Berechtigungen</li><li>Service-Tokens für Drittdienste</li><li>Soul Grants · Peer-to-Peer</li><li>Browser Extension · Chrome MV3</li></ul>
            </article>
            <article>
              <div class="feat-vis" aria-hidden="true"><img src="/ecosystem/phase1-soul.png" alt="" /></div>
              <div class="k">V · Agent Marketplace</div>
              <h3>KI-Agenten<em>,</em> finden dich.</h3>
              <p class="lede">Registriere deine Soul im dezentralen IPFS-Agenten-Verzeichnis. Externe KI-Agenten entdecken dich, zahlen in POL und erhalten MCP-Zugang — vollautomatisch.</p>
              <ul><li>ERC-8004 IPFS-Registrierung via Pinata</li><li>POL-Amortisierung pro MCP-Anfrage</li><li>Polygon-verifizierte Wallet-Identität</li><li>Replay-geschützte TX-Validierung</li><li>Einnahmen-Ledger (soul_earnings)</li></ul>
            </article>
          </div>
        </section>

        <aside class="pull">
          <span class="mark">&ldquo;</span>
          <blockquote>
            Ich glaube nicht, dass eine Persönlichkeit aufhört, wenn der Körper schläft.<br>
            Die digitale Schicht ist längst Teil des Menschen — <em>sie braucht nur eine Form, die ihm gehört.</em>
          </blockquote>
        </aside>

        <section class="sec">
          <header class="sec-head">
            <span class="n">Setup · FAQ</span>
            <h2>Die wichtigsten<br><em>Schritte.</em></h2>
          </header>
          <div class="faq-list">
            <div
              v-for="item in landingFaq"
              :key="item.q"
              class="faq-item"
              :class="{ open: item.open }"
            >
              <button class="faq-q" @click="item.open = !item.open" :aria-expanded="item.open">
                <span>{{ item.q }}</span>
                <svg class="faq-ico" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div v-if="item.open" class="faq-a">{{ item.a }}</div>
            </div>
          </div>
        </section>

        <section class="sec">
          <header class="sec-head">
            <span class="n">Datenschutz</span>
            <h2>Deine Daten.<br><em>Deine Regeln.</em></h2>
          </header>
          <div class="feat no-border-top">
            <article><div class="k">Lokale Datenhaltung</div><h3>Standardmäßig <em>lokal</em>.</h3><p class="lede">Persönliche Inhalte werden standardmäßig lokal auf deinem Gerät gespeichert. AES-256-CBC ab Browser — Klartext verlässt dein Gerät niemals ohne ausdrückliches Opt-in.</p></article>
            <article><div class="k">Kein Tracking</div><h3>Keine <em>Hintertüren</em>.</h3><p class="lede">Keine Tracking-Technologien, kein Profiling, keine Werbenetzwerke. Zero-Knowledge-Modus mit 12-Wort-Mnemonic oder Passkey als Option.</p></article>
            <article><div class="k">Transparenz</div><h3>Offen <em>dokumentiert</em>.</h3><p class="lede">Das Datenmodell und die Funktionsweise sind offen dokumentiert. Du entscheidest selbst, ob Inhalte exportiert oder extern gespeichert werden.</p></article>
            <article><div class="k">DSGVO</div><h3>Kontrolle <em>behalten</em>.</h3><p class="lede">Privacy by Design. Orientiert an WCAG 2.1 AA und DSGVO. Kein Tracking, keine Werbenetzwerke, keine zentralen Nutzerprofile.</p></article>
          </div>
        </section>

        <section class="sec">
          <header class="sec-head">
            <span class="n">Roadmap</span>
            <h2>Wohin die<br><em>Reise führt.</em></h2>
          </header>
          <ul class="timeline">
            <li class="active"><span class="phase">Alpha · Done ✓</span><span class="date">2026</span><h4>Core · Deployed</h4><div class="chips"><span>Soul Protocol</span><span>Memory Vault</span><span>AES-256 · Passkey</span><span>MCP Server</span><span>Soul API</span><span>Polygon Anchor</span><span>Browser Extension</span><span>PWA Mobile</span></div></li>
            <li class="active"><span class="phase">Beta · Live</span><span class="date">2026</span><h4>Erweiterte Identität</h4><div class="chips"><span>Soul Network</span><span>Mehrere Soul-Versionen</span><span>Erweiterte API-Docs</span><span>Offenes Protokoll</span><span>Agent Marketplace</span><span>POL Amortisierung</span><span>IPFS-Registrierung (ERC-8004)</span></div></li>
            <li><span class="phase">Vision</span><span class="date">Langfristig</span><h4>Offenes Ökosystem</h4><div class="chips"><span>Interoperable Identitäten</span><span>Robotik-Integration</span><span>Dezentrales Protokoll</span><span>Community-Governance</span></div></li>
          </ul>
        </section>

        <footer class="colophon">
          <div>
            <div class="lockup">
              <div class="word">SYS<em>.</em></div>
            </div>
            <p>SaveYourSoul ist ein Privacy-first-Tool für digitale Identität. Servergespeicherte Inhalte werden standardmäßig verschlüsselt. Kein Tracking, keine Werbenetzwerke, keine zentralen Nutzerprofile.</p>
          </div>
          <div><h5>Protokoll</h5><ul><li><NuxtLink to="/api-docs">API Docs</NuxtLink></li><li><NuxtLink to="/dev-docs">Dev Docs</NuxtLink></li><li><a href="https://github.com/uxprojectsjok/SaveYourSoul_SYS" target="_blank" rel="noopener">GitHub</a></li></ul></div>
          <div><h5>Rechtliches</h5><ul><li><NuxtLink to="/datenschutz">Datenschutz</NuxtLink></li><li><NuxtLink to="/impressum">Impressum</NuxtLink></li><li><NuxtLink to="/lizenz">Lizenz</NuxtLink></li></ul></div>
        </footer>
        <div class="foot-rule">
          <span>© 2026 · UX-Projects Jan-Oliver Karo</span>
          <span>WCAG 2.1 AA</span>
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
import { computed, ref } from 'vue'
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

const config  = useRuntimeConfig()
const router  = useRouter()
const { ask: confirmAsk } = useConfirm()
const { hasSoul, soulContent, soulToken, soulMeta, importFromText, clear: _clear } = useSoul()
const { isConnected: vaultConnected } = useVault()
const { hasProfile, profileUrl, handleUpload: handleProfileUpload } = useProfile()

// ── Landing FAQ ───────────────────────────────────────────────────────────
const landingFaq = ref([
  {
    q: 'Was muss ich als erstes einrichten?',
    a: 'Schritt 1 — Soul erstellen: Einloggen oder eine neue Soul anlegen. Dein Profil (sys.md) wird lokal in deinem Vault gespeichert — nur du hast Zugriff.\n\nSchritt 2 — Soul hochladen: Im Session-Bereich → API-Kontext → Berechtigungen setzen → sys.md auf den Server hochladen. Damit ist die Soul erreichbar.\n\nSchritt 3 — KI verbinden: In Claude Desktop oder claude.ai den Verbindungs-Endpunkt eintragen. Ein Login-Fenster erscheint automatisch.\n\nSchritt 4 — /soul_guide aufrufen: Einmal im KI-Chat eingeben — die KI liest dein Profil und führt sich ab jetzt selbst nach bedeutsamen Gesprächen.',
    open: false,
  },
  {
    q: 'Wie aktiviere ich den Agent Marketplace? (Schritt für Schritt)',
    a: 'Voraussetzung: Soul läuft bereits auf dem Server (Schritt 1–2 aus "Was muss ich einrichten?" erledigt). Für den Bezahlt-Modus wird zusätzlich eine Krypto-Wallet benötigt.\n\n1. Blockchain-Anker setzen (nur für Bezahlt-Modus): Im Dashboard → "Polygon verankern" → Wallet verbinden → Transaktion bestätigen. Damit wird die Soul als echt verifiziert.\n\n2. Speicher-Account anlegen: Auf pinata.cloud (externer Dienst, keine Kooperation mit SaveYourSoul) einen kostenlosen Account erstellen. Im Dashboard → API Keys → New Key → Admin → den angezeigten Schlüssel kopieren.\n\n3. Schlüssel eintragen: Im Dashboard → "Agent Marketplace →" → Feld "Pinata JWT" → Schlüssel einfügen → speichern. Kein technisches Wissen nötig.\n\n4. Zugangsmodus wählen: Im selben Panel → "Zugangsmodus" → Frei oder Bezahlt. Frei ist Standard und sofort aktiv. Für Bezahlt: Preis pro Anfrage + Wallet-Adresse eintragen → speichern.\n\n5. Soul veröffentlichen: Panel → "IPFS-Registrierung" → Metadaten prüfen → "Auf IPFS registrieren". Deine Soul ist danach im dezentralen Verzeichnis auffindbar.\n\n6. Prüfen: Im KI-Chat "soul_discover" aufrufen und nach deinem Namen suchen — deine Soul sollte erscheinen.',
    open: false,
  },
  {
    q: 'Was ist Pinata und warum brauche ich das?',
    a: 'Pinata (pinata.cloud) ist ein unabhängiger Dienst zum Speichern von Dateien im dezentralen IPFS-Netzwerk. SaveYourSoul hat keine Kooperation oder Partnerschaft mit Pinata — es wird als Beispiel-Dienst genutzt, weil er einen kostenlosen Einstieg bietet.\n\nWofür: Damit andere KI-Agenten deine Soul finden können, werden deine öffentlichen Kontaktdaten (Name, Server-Adresse, Zugangsmodus) dauerhaft im IPFS-Netzwerk gespeichert. Pinata übernimmt das Speichern ("Pinnen").\n\nAlternative: Jeder IPFS-Pinning-Dienst mit API-Schlüssel funktioniert — Pinata ist nur die einfachste Option für Einsteiger.\n\nWichtig: Was einmal auf IPFS liegt, kann nicht gelöscht werden. Nur Daten veröffentlichen die dauerhaft öffentlich sein dürfen.\n\nEinrichten in 3 Schritten: (1) Kostenlosen Account auf pinata.cloud anlegen. (2) API Keys → New Key → Admin → JWT kopieren. (3) Im Dashboard → Agent Marketplace → Feld "Pinata JWT" einfügen → speichern.',
    open: false,
  },
  {
    q: 'In welcher Reihenfolge muss ich vorgehen?',
    a: 'Kurzform: Pinata-Schlüssel eintragen → Zugangsmodus wählen → Soul veröffentlichen. Für den Bezahlt-Modus kommt davor noch der Blockchain-Anker.\n\nWarum diese Reihenfolge?\n\nPinata-Schlüssel zuerst — ohne ihn kann die Soul nicht veröffentlicht werden. Einfach im Panel eintragen, kein Neustart nötig.\n\nZugangsmodus vor Veröffentlichung — der gewählte Modus (Frei oder Bezahlt) wird mit in die öffentlichen Daten geschrieben. Also erst entscheiden, dann veröffentlichen.\n\nBlockchain-Anker nur für Bezahlt-Modus — wer POL verlangen möchte, muss vorher bestätigen dass die Soul einer echten Person gehört. Freier Modus funktioniert ohne diesen Schritt.',
    open: false,
  },
  {
    q: 'Wie prüfe ich ob meine Soul im Marketplace sichtbar ist?',
    a: 'Einfachste Methode: Im KI-Chat "soul_discover" aufrufen und nach deinem Namen suchen. Deine Soul sollte mit Name, Zugangsmodus und Server-Adresse erscheinen.\n\nAlternativ: Den Link der nach der Veröffentlichung angezeigt wird direkt im Browser öffnen — dort siehst du den gespeicherten Datensatz.\n\nHinweis: Nach der Veröffentlichung kann es 30–60 Sekunden dauern bis die Soul im Verzeichnis erscheint.',
    open: false,
  },
  {
    q: 'Was passiert wenn ein KI-Agent meine Soul findet und zugreifen will?',
    a: 'Bei freiem Zugang: Der Agent verbindet sich direkt — kein weiterer Schritt nötig.\n\nBei Bezahlt-Modus läuft alles automatisch im Hintergrund:\n\n1. Der Agent sieht deinen Preis und deine Wallet-Adresse im Verzeichnis.\n2. Er sendet den fälligen Betrag in POL (Polygon-Kryptowährung) an deine Wallet.\n3. Er meldet die Zahlung dem Server — dieser prüft sie on-chain.\n4. Bei erfolgreicher Prüfung erhält der Agent Zugang für 1 Stunde.\n\nDu musst nichts tun — alles läuft automatisch. Deine Einnahmen siehst du im Dashboard unter "Einnahmen".',
    open: false,
  },
])

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
}

function handleLoginUpload(text) {
  importFromText(text)
  loginOpen.value = false
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
.sys-dash-head .logout { font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); background: transparent; border: 0; padding: 10px 14px; cursor: pointer; }
.sys-dash-head .logout:hover { color: var(--accent); }
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

/* ────── LANDING ────── */
.landing { padding-top: 28px; }
.l-nav { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px; padding: 0 clamp(20px,4vw,44px) 24px; border-bottom: 1px solid var(--rule); }
.l-nav .center { text-align: center; font-family: var(--sans); font-size: 11px; letter-spacing: 0.01em; text-transform: none; color: var(--fg-3); display: flex; align-items: center; justify-content: center; gap: 10px; line-height: 1.5; }
.notice-text { max-width: 44ch; }
.l-nav .actions { justify-self: end; display: flex; gap: 10px; align-items: center; }
@media (max-width: 900px) { .l-nav { grid-template-columns: 1fr auto; } .l-nav .center { display: none; } }
@media (max-width: 520px) { .l-nav { grid-template-columns: 1fr; justify-items: start; } .l-nav .actions { justify-self: stretch; width: 100%; margin-top: 16px; } .l-nav .actions .btn { flex: 1; justify-content: center; } }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 46px; padding: 0 22px; font-family: var(--sans); font-size: 13px; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; background: transparent; color: inherit; white-space: nowrap; }
.btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.btn.primary:hover { background: var(--accent-bright); border-color: var(--accent-bright); box-shadow: 0 10px 30px rgba(139,92,246,0.35); }
.btn.ghost { border-color: var(--rule-2); color: var(--fg); }
.btn.ghost:hover { background: rgba(255,255,255,0.04); border-color: var(--accent); }

.ticker { border-bottom: 1px solid var(--rule); overflow: hidden; font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-3); background: linear-gradient(90deg, rgba(139,92,246,0.04), transparent 20%, transparent 80%, rgba(139,92,246,0.04)); }
.ticker .track { display: flex; gap: 48px; padding: 12px 0; white-space: nowrap; animation: sys-tick 40s linear infinite; }
.ticker em { color: var(--accent); font-style: normal; margin-right: 12px; font-size: 8px; vertical-align: middle; }
@keyframes sys-tick { to { transform: translateX(-50%); } }

.hero { position: relative; padding: clamp(48px,8vw,96px) clamp(20px,4vw,44px) clamp(40px,6vw,72px); border-bottom: 1px solid var(--rule); overflow: hidden; isolation: isolate; }
.hero::before { content: ""; position: absolute; inset: 0; z-index: -3; background: url('~/assets/background-dark.webp') no-repeat center right / cover; opacity: 0.55; }
.hero::after { content: ""; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(90deg, var(--paper) 0%, rgba(18,16,26,0.92) 40%, rgba(18,16,26,0.55) 70%, rgba(18,16,26,0.35) 100%),
              radial-gradient(ellipse at 85% 50%, rgba(139,92,246,0.18), transparent 60%); }
.hero-vis { position: absolute; right: 0; top: 0; bottom: 0; width: 55%; z-index: -2; pointer-events: none; overflow: hidden; }
.hero-vis img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; opacity: 0.45; }
@media (max-width: 900px) { .hero-vis { display: none; } }
.hero-grid { display: grid; grid-template-columns: 1.2fr 360px; gap: clamp(32px,5vw,56px); align-items: end; }
@media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } .hero::before { opacity: 0.28; } }
.display { font-family: var(--serif); font-weight: 400; margin: 0; line-height: 0.92; letter-spacing: -0.035em; font-size: clamp(56px,11vw,148px); color: var(--fg); text-wrap: balance; }
.display em { font-style: italic; color: var(--accent); text-shadow: 0 0 40px rgba(139,92,246,0.4); }
.display .amp { font-family: var(--serif); font-style: italic; color: var(--fg-3); font-weight: 400; }
.side { border-left: 1px solid var(--rule-2); padding-left: clamp(16px,3vw,28px); max-width: 360px; }
@media (max-width: 900px) { .side { border-left: 0; padding-left: 0; border-top: 1px solid var(--rule-2); padding-top: 24px; max-width: none; } }
.side .issue { font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); margin-bottom: 18px; }
.side p { font-family: var(--serif); font-size: 17px; line-height: 1.55; color: var(--fg-2); margin: 0 0 20px; }
.side p b { color: var(--fg); font-weight: 700; }
.cta-row { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
.hero-meta { display: grid; grid-template-columns: repeat(4,1fr); gap: 24px; padding: 28px 0 0; margin-top: 48px; border-top: 1px solid var(--rule); font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg-3); }
.hero-meta b { color: var(--fg); font-weight: 500; }
@media (max-width: 640px) { .hero-meta { grid-template-columns: repeat(2,1fr); } }

.masthead { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid var(--rule); }
.masthead > div { padding: 24px 28px; border-right: 1px solid var(--rule); display: flex; flex-direction: column; gap: 8px; }
.masthead > div:last-child { border-right: 0; }
.masthead .lbl { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); }
.masthead .val { font-family: var(--serif); font-size: 28px; line-height: 1; color: var(--fg); }
.masthead .val em { font-size: 12px; color: var(--fg-3); font-family: var(--mono); letter-spacing: 0.1em; margin-left: 6px; font-style: normal; vertical-align: 1px; }
@media (max-width: 900px) { .masthead { grid-template-columns: repeat(2,1fr); } .masthead > div:nth-child(2) { border-right: 0; } .masthead > div:nth-child(-n+2) { border-bottom: 1px solid var(--rule); } }
@media (max-width: 480px) { .masthead { grid-template-columns: 1fr; } .masthead > div { border-right: 0; border-bottom: 1px solid var(--rule); } .masthead > div:last-child { border-bottom: 0; } }

.sec { padding: clamp(48px,7vw,80px) clamp(20px,4vw,44px); border-bottom: 1px solid var(--rule); }
.sec.no-pad-bottom { padding-bottom: 0; border-bottom: 0; }
.sec-head { display: grid; grid-template-columns: 140px 1fr; gap: 40px; margin-bottom: 48px; align-items: start; }
@media (max-width: 720px) { .sec-head { grid-template-columns: 1fr; gap: 16px; } }
.sec-head .n { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); padding-top: 12px; border-top: 2px solid var(--accent); display: inline-block; }
.sec-head h2 { font-family: var(--serif); font-weight: 400; font-size: clamp(36px, 5vw, 72px); line-height: 0.98; letter-spacing: -0.03em; margin: 0; color: var(--fg); text-wrap: balance; }
.sec-head h2 em { font-style: italic; color: var(--fg-3); }

.steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
@media (max-width: 900px) { .steps { grid-template-columns: 1fr; } }
.steps li { border-left: 1px solid var(--rule); padding: 0 28px 28px; }
.steps li:first-child { border-left: 0; padding-left: 0; }
@media (max-width: 900px) { .steps li { border-left: 0; border-top: 1px solid var(--rule); padding: 28px 0; } .steps li:first-child { border-top: 0; padding-top: 0; } }
.steps .big { font-family: var(--serif); font-size: clamp(72px,9vw,112px); line-height: 0.85; color: var(--fg); letter-spacing: -0.04em; margin-bottom: 12px; }
.steps .big em { font-style: italic; color: var(--accent); }
.steps .k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin-bottom: 16px; }
.steps h3 { font-family: var(--serif); font-weight: 400; font-size: 28px; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 12px; color: var(--fg); }
.steps p { font-size: 14px; line-height: 1.6; color: var(--fg-2); margin: 0 0 14px; max-width: 36ch; }
.steps code { font-family: var(--mono); font-size: 11px; color: var(--accent-bright); background: var(--accent-2); padding: 4px 8px; letter-spacing: 0.02em; border: 1px solid rgba(139,92,246,0.2); }

.feat { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid var(--rule); }
.feat.no-border-top { border-top: 0; }
.feat.two article:nth-child(n) { border-bottom: 0; }
.feat article { padding: 36px 28px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.feat article:nth-child(2n) { border-right: 0; }
@media (max-width: 720px) { .feat { grid-template-columns: 1fr; } .feat article { border-right: 0; } }
.feat-vis { margin: -36px -28px 28px; height: 200px; overflow: hidden; position: relative; }
.feat-vis::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 30%, var(--paper) 100%); pointer-events: none; }
.feat-vis img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; opacity: 0.88; transition: opacity 0.4s ease; }
.feat article:hover .feat-vis img { opacity: 1; }

.feat .k { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; color: var(--accent); text-transform: uppercase; }
.feat h3 { font-family: var(--serif); font-weight: 400; font-size: clamp(28px,3.5vw,40px); line-height: 1; letter-spacing: -0.025em; margin: 18px 0 16px; color: var(--fg); }
.feat h3 em { font-style: italic; color: var(--accent); }
.feat .lede { font-family: var(--serif); font-size: 17px; line-height: 1.55; color: var(--fg-2); margin: 0 0 20px; max-width: 40ch; }
.feat ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.feat li { font-size: 13px; color: var(--fg-2); display: flex; gap: 10px; line-height: 1.5; }
.feat li::before { content: "—"; color: var(--fg-4); flex: none; }

.pull { padding: clamp(56px,9vw,96px) clamp(20px,4vw,44px); border-bottom: 1px solid var(--rule); display: grid; grid-template-columns: 120px 1fr; gap: 32px; align-items: start; }
@media (max-width: 640px) { .pull { grid-template-columns: 1fr; gap: 16px; } }
.pull .mark { font-family: var(--serif); font-style: italic; font-size: clamp(72px,10vw,112px); line-height: 0.8; color: var(--accent); }
.pull blockquote { font-family: var(--serif); font-weight: 400; font-size: clamp(26px,4vw,52px); line-height: 1.12; letter-spacing: -0.022em; margin: 0; color: var(--fg); text-wrap: balance; }
.pull blockquote em { font-style: italic; color: var(--fg-3); }

.timeline { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--rule); }
.timeline li { display: grid; grid-template-columns: 140px 140px 1fr auto; gap: 28px; padding: 24px 0; border-bottom: 1px solid var(--rule); align-items: center; }
@media (max-width: 820px) { .timeline li { grid-template-columns: 1fr 1fr; gap: 10px; } .timeline li h4 { grid-column: 1/-1; } .timeline li .chips { grid-column: 1/-1; justify-content: flex-start; } }
@media (max-width: 480px) { .timeline li { grid-template-columns: 1fr; } }
.timeline .phase { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); }
.timeline li.active .phase { color: var(--accent); }
.timeline .date { font-family: var(--serif); font-size: 20px; color: var(--fg); letter-spacing: -0.01em; }
.timeline h4 { font-family: var(--serif); font-weight: 400; font-size: 22px; margin: 0; letter-spacing: -0.015em; }
.timeline .chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.timeline .chips span { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; padding: 6px 10px; border: 1px solid var(--rule-2); color: var(--fg-2); }

/* ────── LANDING FAQ ────── */
.faq-list { border-top: 1px solid var(--rule); }
.faq-item { border-bottom: 1px solid var(--rule); }
.faq-q {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
  width: 100%; background: transparent; border: 0; padding: 22px 0; cursor: pointer;
  text-align: left; font: inherit; color: var(--fg); transition: color 0.15s;
}
.faq-q:hover { color: var(--accent-bright); }
.faq-q span { font-family: var(--serif); font-size: clamp(17px,2.5vw,22px); letter-spacing: -0.015em; line-height: 1.2; }
.faq-ico { width: 18px; height: 18px; flex: none; margin-top: 3px; color: var(--fg-3); transition: transform 0.2s; }
.faq-item.open .faq-ico { transform: rotate(180deg); color: var(--accent); }
.faq-a {
  padding: 0 0 24px;
  font-size: 14px; line-height: 1.75; color: var(--fg-2);
  white-space: pre-line;
  border-top: 1px solid var(--rule);
  padding-top: 16px;
  max-width: 72ch;
}

.colophon { display: grid; grid-template-columns: minmax(180px, 260px) auto auto; justify-content: start; column-gap: 56px; row-gap: 32px; padding: 56px clamp(20px,4vw,44px) 40px; }
@media (max-width: 900px) { .colophon { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .colophon { grid-template-columns: 1fr; } }
.colophon h5 { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin: 0 0 18px; font-weight: 500; }
.colophon ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.colophon a { color: var(--fg-2); text-decoration: none; font-size: 13px; border-bottom: 1px solid transparent; }
.colophon a:hover { color: var(--accent); border-color: var(--accent); }
.colophon .word { font-family: var(--serif); font-size: 40px; letter-spacing: -0.02em; line-height: 1; }
.colophon .word em { color: var(--accent); font-style: italic; }
.colophon p { font-family: var(--serif); font-size: 15px; line-height: 1.5; color: var(--fg-3); margin: 16px 0 0; max-width: 28ch; }
.foot-rule { padding: 18px clamp(20px,4vw,44px); border-top: 1px solid var(--rule); display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-4); gap: 12px; flex-wrap: wrap; }

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
