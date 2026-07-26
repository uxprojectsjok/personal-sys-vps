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

      <!-- MOBILE NOTICE -->
      <div class="mobile-wall">
        <div class="mobile-inner">
          <span class="kicker">SCAN</span>
          <h1 class="mobile-h1">SYS<em>.</em><br>Scan</h1>
          <p class="mobile-p">{{ t.mobileNote }}</p>
          <NuxtLink to="/" class="mobile-back">← {{ t.mobileBack }}</NuxtLink>
        </div>
      </div>

      <!-- DESKTOP -->
      <div class="scan-wrap">

        <!-- TOPBAR -->
        <div class="topbar">
          <div class="topbar-left">
            <span class="kicker">SCAN</span>
            <h1 class="scan-h1">SYS<em>.</em> Scan</h1>
          </div>
          <div class="topbar-right">
            <template v-if="!loading">
              <span class="stat-pill">{{ souls.length }} {{ t.souls }}</span>
              <span class="stat-pill stat-dim">{{ t.updated }} {{ timeStr }}</span>
              <span class="stat-pill stat-dim" v-if="verifying > 0">
                ⛓ {{ t.verifying }} {{ verifying }}…
              </span>
              <button class="refresh-btn" :class="{ spin: refreshing }" @click="runScan">↻</button>
            </template>
            <span class="stat-pill stat-dim" v-else>{{ t.loading }}</span>
          </div>
        </div>

        <!-- DEGRADED STATE -->
        <div class="degraded-banner" v-if="!loading && (degraded.etherscan || degraded.rpc || degraded.ipfs)">
          ⚠ {{ t.degradedNotice }}
          <span v-if="degraded.etherscan">{{ t.degradedEtherscan }}</span>
          <span v-if="degraded.rpc">{{ t.degradedRpc }}</span>
          <span v-if="degraded.ipfs">{{ t.degradedIpfs }}</span>
        </div>

        <!-- TABLE -->
        <div class="tbl-outer">
          <table class="tbl">
            <thead>
              <tr>
                <th class="c-rank">#</th>
                <th class="c-name">{{ t.colName }}</th>
                <th class="c-desc">{{ t.colDesc }}</th>
                <th class="c-tags">{{ t.colTags }}</th>
                <th class="c-tools">{{ t.colTools }}</th>
                <th class="c-price">{{ t.colPrice }}</th>
                <th class="c-token">{{ t.colToken }}</th>
                <th class="c-sess">{{ t.colSessions }}</th>
                <th class="c-anc">{{ t.colAnchors }}</th>
                <th class="c-methods">{{ t.colMethods }}</th>
                <th class="c-chain">{{ t.colAnchored }}</th>
                <th class="c-status">{{ t.colStatus }}</th>
                <th class="c-online">{{ t.colOnline }}</th>
                <th class="c-llms">{{ t.colLlms }}</th>
                <th class="c-access">{{ t.colAccess }}</th>
              </tr>
            </thead>

            <TransitionGroup name="row" tag="tbody" v-if="souls.length > 0">
              <tr
                v-for="(soul, idx) in souls"
                :key="soul.soul_id"
                class="soul-tr"
                :class="{ pulse: pulsing[soul.soul_id] }"
              >
                <td class="c-rank"><span class="rank">{{ idx + 1 }}</span></td>

                <td class="c-name">
                  <span class="sname">{{ soul.name }}</span>
                </td>

                <td class="c-desc">
                  <span class="sdesc" v-if="soul.description">{{ soul.description }}</span>
                  <span class="dim" v-else>—</span>
                </td>

                <td class="c-tags">
                  <span class="tag" v-for="tag in (soul.tags || [])" :key="tag">#{{ tag }}</span>
                  <span class="dim" v-if="!soul.tags?.length">—</span>
                </td>

                <td class="c-tools">
                  <span class="tool-pill" v-for="tool in (soul.agent_tools || [])" :key="tool">{{ toolLabel(tool) }}</span>
                  <span class="dim" v-if="!soul.agent_tools?.length">—</span>
                </td>

                <td class="c-price">
                  <div class="price-stack">
                    <span class="price" v-if="soul.usdc_current != null || soul.price_usdc != null">
                      {{ soul.usdc_current ?? soul.price_usdc }}<span class="price-u"> USDC</span>
                    </span>
                    <span class="dim" v-else>—</span>
                    <span v-if="soul.paypal_enabled" class="price paypal-price">
                      {{ soul.price_eur ?? '?' }}<span class="price-u"> EUR</span>
                    </span>
                  </div>
                </td>

                <td class="c-token">
                  <span class="mono" v-if="soul.token_duration_days">{{ soul.token_duration_days }}d</span>
                  <span class="dim" v-else>—</span>
                </td>

                <td class="c-sess mono">{{ soul.sessions }}</td>
                <td class="c-anc mono">{{ soul.anchor_count }}</td>

                <td class="c-methods">
                  <span class="method-pill" v-if="soul.wallet || soul.wallet_available">{{ t.methodWallet }}</span>
                  <span class="method-pill" v-if="soul.paypal_enabled">{{ t.methodPaypal }}</span>
                  <span class="dim" v-if="!(soul.wallet || soul.wallet_available) && !soul.paypal_enabled">—</span>
                </td>

                <td class="c-chain">
                  <span
                    class="chain-dot"
                    :class="{
                      'chain-ok':      soul.chain_verified === true,
                      'chain-pending': soul.chain_verified === null,
                      'chain-fail':    soul.chain_verified === 'fail',
                      'chain-error':   soul.chain_verified === 'error',
                    }"
                    role="img"
                    :aria-label="soul.chain_verified === true    ? t.verified :
                             soul.chain_verified === null    ? t.verifyPending :
                             soul.chain_verified === 'error' ? t.verifyError :
                                                               t.notVerified"
                  />
                  <span class="chain-text">{{ soul.chain_verified === true    ? t.chainOk :
                             soul.chain_verified === null    ? t.chainPending :
                             soul.chain_verified === 'error' ? t.chainErr :
                                                               t.chainFail }}</span>
                </td>

                <td class="c-status">
                  <span
                    v-if="soul.visibility_zone && soul.visibility_zone !== 'unknown'"
                    class="vis-pill"
                    :class="`vis-pill--${soul.visibility_zone}`"
                  >{{ t[`vis_${soul.visibility_zone}`] }} · {{ visAge(soul.days_since_last_anchor) }}</span>
                  <span class="dim" v-else>—</span>
                </td>

                <td class="c-online">
                  <span
                    v-if="soul.mcp_endpoint && nodeOnline[soul.soul_id] !== undefined"
                    class="node-status"
                    :class="nodeOnline[soul.soul_id] ? 'node-online' : 'node-offline'"
                  >{{ nodeOnline[soul.soul_id] ? 'on' : 'off' }}</span>
                  <span class="dim" v-else>—</span>
                </td>

                <td class="c-llms">
                  <a
                    v-if="soul.mcp_endpoint"
                    :href="llmsUrl(soul.mcp_endpoint)"
                    target="_blank" rel="noopener"
                    class="llms-link"
                    title="AI-readable node description (llms.txt)"
                  >llms</a>
                  <span class="dim" v-else>—</span>
                </td>

                <td class="c-access">
                  <button
                    v-if="soul.mcp_endpoint || soul.wallet || soul.wallet_available"
                    class="access-btn"
                    :class="{ 'access-btn--warn': soul.chain_verified === 'fail' || soul.chain_verified === 'error' }"
                    @click="openModal(soul)"
                  >{{ t.access }} →</button>
                  <span class="dim" v-else>—</span>
                </td>
              </tr>
            </TransitionGroup>

            <!-- SKELETON -->
            <tbody v-else-if="loading">
              <tr v-for="i in 4" :key="i" class="skel-tr">
                <td v-for="j in 15" :key="j"><span class="skel"></span></td>
              </tr>
            </tbody>

            <!-- EMPTY -->
            <tbody v-else>
              <tr><td colspan="15" class="empty-td">{{ t.empty }}</td></tr>
            </tbody>
          </table>
        </div>


      </div>

      <!-- ACCESS MODAL -->
      <Transition name="modal-fade">
        <div v-if="selectedSoul" class="modal-overlay" @click.self="closeModal">
          <div class="modal-box" role="dialog" aria-modal="true">

            <!-- HEAD -->
            <div class="modal-head">
              <div class="modal-brand">SYS<em>.</em></div>
              <button class="modal-close" @click="closeModal" aria-label="Close">✕</button>
            </div>

            <div class="modal-identity">
              <h2 class="modal-soul-name">{{ selectedSoul.name }}</h2>
              <p class="modal-soul-desc" v-if="selectedSoul.description">{{ selectedSoul.description }}</p>
              <div class="modal-soul-tags" v-if="selectedSoul.tags?.length">
                <span class="tag" v-for="tag in selectedSoul.tags" :key="tag">#{{ tag }}</span>
              </div>
              <div class="modal-tools" v-if="selectedSoul.agent_tools?.length">
                <div class="modal-row-label modal-tools-label">{{ t.modalTools }}</div>
                <div class="modal-soul-tags">
                  <span class="tool-pill" v-for="tool in selectedSoul.agent_tools" :key="tool">{{ toolLabel(tool) }}</span>
                </div>
              </div>
            </div>

            <!-- PRICE -->
            <div class="modal-divider"/>
            <div class="modal-price-block">
              <div class="modal-row-label">{{ t.modalPrice }}</div>
              <div class="modal-price-main">
                <span class="modal-pol">{{ selectedSoul.usdc_current ?? selectedSoul.price_usdc }}</span>
                <span class="modal-pol-unit"> USDC</span>
                <span v-if="selectedSoul.dynamic_pricing" class="modal-dyn-pill">{{ t.dynBadge }}</span>
              </div>
              <div class="modal-token-hint" v-if="selectedSoul.token_duration_days">
                {{ t.modalTokenValid }} {{ selectedSoul.token_duration_days }}{{ t.modalDays }}
              </div>
            </div>

            <!-- AI CHAT ACCESS (empfohlener Weg) -->
            <div class="modal-divider"/>
            <div class="modal-row-label" style="margin-bottom:10px">{{ t.aiAccessLabel }}</div>
            <p class="step-label" style="margin-bottom:12px">{{ t.aiAccessIntro }}</p>
            <div class="copy-block" v-if="selectedSoul.mcp_endpoint">
              <code class="copy-code">{{ llmsUrl(selectedSoul.mcp_endpoint) }}</code>
              <button class="copy-btn" @click="copy(llmsUrl(selectedSoul.mcp_endpoint), 'llms')">{{ copied === 'llms' ? t.copied : t.copy }}</button>
            </div>

            <!-- STEPS -->
            <div class="modal-divider"/>
            <div class="modal-row-label" style="margin-bottom:16px">{{ t.modalHow }}</div>

            <div class="modal-step">
              <span class="step-n">01</span>
              <div class="step-body">
                <div class="step-label">{{ t.step1Pre }} <em>{{ selectedSoul.usdc_current ?? selectedSoul.price_usdc }} USDC</em> {{ t.step1Post }}</div>

                <!-- Direkte Wallet-Anzeige (Non-EU-Nodes bzw. EU_CONSUMER_RIGHTS aus) -->
                <div class="copy-block" v-if="selectedSoul.wallet">
                  <code class="copy-code">{{ selectedSoul.wallet }}</code>
                  <button class="copy-btn" @click="copy(selectedSoul.wallet, 'wallet')">{{ copied === 'wallet' ? t.copied : t.copy }}</button>
                </div>

                <!-- Wallet-Adresse ist auf diesem Node erst nach Zustimmung im Chat/MCP-Tool verfügbar -->
                <p class="step-label" v-else-if="selectedSoul.wallet_available">{{ t.walletViaChat }}</p>
              </div>
            </div>

            <div class="modal-step">
              <span class="step-n">02</span>
              <div class="step-body">
                <div class="step-label">{{ t.step2 }}</div>
                <div class="copy-block">
                  <code class="copy-code">{{ payEndpoint }}</code>
                  <button class="copy-btn" @click="copy(payEndpoint, 'pay')">{{ copied === 'pay' ? t.copied : t.copy }}</button>
                </div>
                <div class="step-sub">{{ payBodyExample }}</div>
              </div>
            </div>

            <div class="modal-step">
              <span class="step-n">03</span>
              <div class="step-body">
                <div class="step-label">{{ t.step3Pre }} <code class="i-code">access_token</code> {{ t.step3Post }}</div>
                <div class="copy-block" v-if="selectedSoul.mcp_endpoint">
                  <code class="copy-code">{{ selectedSoul.mcp_endpoint }}</code>
                  <button class="copy-btn" @click="copy(selectedSoul.mcp_endpoint, 'mcp')">{{ copied === 'mcp' ? t.copied : t.copy }}</button>
                </div>
              </div>
            </div>

            <!-- PAYPAL ALTERNATIVE -->
            <template v-if="selectedSoul.paypal_enabled">
              <div class="modal-divider"/>
              <div class="modal-row-label" style="margin-bottom:16px">{{ t.modalPaypalHow }}</div>
              <div class="modal-step">
                <span class="step-n">↔</span>
                <div class="step-body">
                  <div class="step-label">
                    {{ t.paypalStepPre }} <em>{{ selectedSoul.price_eur ? `${selectedSoul.price_eur} EUR` : '' }}</em> {{ t.paypalStepMid }}
                  </div>

                  <!-- Direkte Ziel-Anzeige (Non-EU-Nodes bzw. EU_CONSUMER_RIGHTS aus) -->
                  <div class="copy-block" v-if="selectedSoul.paypal_target">
                    <code class="copy-code">{{ selectedSoul.paypal_target }}</code>
                    <button class="copy-btn" @click="copy(selectedSoul.paypal_target, 'paypal')">{{ copied === 'paypal' ? t.copied : t.copy }}</button>
                  </div>

                  <!-- PayPal-Ziel ist auf diesem Node erst nach Zustimmung im Chat/MCP-Tool verfügbar -->
                  <p class="step-label" v-else>{{ t.paypalViaChat }}</p>

                  <div class="step-sub">{{ t.paypalStepSub }}</div>
                  <div v-if="selectedSoul.price_note" class="step-sub">{{ selectedSoul.price_note }}</div>
                </div>
              </div>
            </template>

            <!-- CONTACT -->
            <template v-if="selectedSoul.contact_email">
              <div class="modal-divider"/>
              <p class="modal-contact">
                {{ t.contactLabel }} <a :href="`mailto:${selectedSoul.contact_email}`">{{ selectedSoul.contact_email }}</a> — {{ t.contactReply }}
              </p>
            </template>

          </div>
        </div>
      </Transition>

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
import { ref, computed, onMounted, onUnmounted } from 'vue'

const { lang } = useLang()

// ── i18n ────────────────────────────────────────────────────────────────────
const de = {
  back:           '← Zurück',
  mobileNote:     'Scan ist für Desktop optimiert. Öffne diese Seite auf einem größeren Bildschirm.',
  mobileBack:     'Zurück',
  souls:          'Souls',
  updated:        'Aktualisiert',
  verifying:      'Prüfe',
  loading:        'Lädt…',
  colName:        'Soul',
  colDesc:        'Beschreibung',
  colTags:        'Tags',
  colTools:       'Werkzeuge',
  colPrice:       'USDC / Anfrage',
  colToken:       'Token',
  colSessions:    'Sessions',
  colAnchors:     'Anchors',
  colMethods:     'Methoden',
  colAnchored:    'Verankert',
  colStatus:      'Status',
  colOnline:      'Online',
  colLlms:        'KI-Info',
  colAccess:      'Zugang',
  access:         'Access',
  verified:       'Chain-verifiziert',
  verifyPending:  'Prüfung läuft',
  chainOk:        'Verifiziert',
  chainPending:   'Prüfung läuft',
  chainErr:       'Fehler',
  chainFail:      'Ungeprüft',
  methodWallet:   'Wallet',
  methodPaypal:   'PayPal',
  modalKicker:    'SOUL ACCESS',
  modalPrice:     'Preis',
  dynBadge:       'dynamisch',
  modalTools:     'Verfügbare Werkzeuge',
  modalTokenValid:'Token gültig:',
  modalDays:      ' Tage',
  aiAccessLabel:  'Zugang per KI-Chat',
  aiAccessIntro:  'Kopiere diesen Link und füge ihn deiner KI im Chat ein. Sag ihr außerdem, ob du per x402/USDC oder PayPal zahlen möchtest — den Rest übernimmt sie.',
  modalHow:       'Zugang erhalten',
  step1Pre:       'Preis:',
  step1Post:      '— gezahlt per x402 (signierte EIP-3009-Autorisierung) an diese Wallet auf Polygon:',
  step2:          'Dein KI-Agent ruft diesen Endpunkt per x402-Protokoll auf (402-Challenge → signierte Autorisierung):',
  step3Pre:       'Du erhältst einen',
  step3Post:      '— nutze ihn als Bearer-Token am MCP-Endpunkt:',
  modalPaypalHow: 'Ohne Polygon-Wallet',
  paypalStepPre:  'Zahle',
  paypalStepMid:  'per PayPal an:',
  paypalStepSub:  'Danach den Soul-Betreiber kontaktieren — Zugang wird manuell geprüft und freigeschaltet, in der Regel innerhalb von 48 Stunden.',
  walletViaChat:    'Die Wallet-Adresse bekommst du im Chat mit deiner KI oder direkt über das passende MCP-Tool.',
  paypalViaChat:    'Das PayPal-Ziel bekommst du im Chat mit deiner KI oder direkt über das passende MCP-Tool.',
  llmsTitle:      'KI-lesbare Node-Beschreibung',
  visDiscoverable: 'Auffindbar',
  visFading:       'Verblassend — verlässt Discovery-Fenster',
  visInvisible:    'Nicht auffindbar — jetzt ankern',
  vis_discoverable: 'auffindbar',
  vis_fading:       'verblassend',
  vis_invisible:    'nicht auffindbar',
  copy:           'Kopieren',
  copied:         'Kopiert ✓',
  notVerified:    'Nicht verifiziert',
  verifyError:    'Verifizierung fehlgeschlagen (Netzwerkfehler) — keine Aussage über Echtheit',
  confirmUnverifiedFail:  'Diese Soul konnte NICHT verifiziert werden — die On-Chain-Transaktion passt nicht zur angegebenen ID. Möglicherweise gefälscht. Trotzdem fortfahren?',
  confirmUnverifiedError: 'Verifizierung konnte wegen eines Netzwerkfehlers nicht abgeschlossen werden. Echtheit ist ungeklärt. Trotzdem fortfahren?',
  degradedNotice:   'Einige Datenquellen sind aktuell nicht erreichbar — die Netzwerkansicht könnte unvollständig sein.',
  degradedEtherscan: 'On-Chain-Discovery (Etherscan) fehlgeschlagen.',
  degradedRpc:       'Polygon-RPC fehlgeschlagen — Verifizierung eingeschränkt.',
  degradedIpfs:      'IPFS nicht erreichbar — manche Profile unvollständig.',
  empty:          'Keine Souls gefunden.',
  footNote:       'Jeder Soul wird unabhängig gegen den Polygon-Contract verifiziert. Discovery via Peer-Netzwerk. →',
  footLink:       'Protokoll verstehen',
  footerProtocol: 'Protokoll',
  footerLegal:    'Rechtliches',
  linkWhy:        'Warum SYS',
  linkImprint:    'Impressum',
  linkPrivacy:    'Datenschutz',
  linkLicense:    'Lizenz',
  contactLabel:   'Bei Problemen kontaktieren:',
  contactReply:   'Antwort in der Regel innerhalb von 48h',
  tool_audio_get:      'Audio abrufen',
  tool_audio_list:     'Audio auflisten',
  tool_context_get:    'Kontext lesen',
  tool_context_list:   'Kontext auflisten',
  tool_health_check_payed: 'Gesundheit',
  tool_image_get:      'Bild abrufen',
  tool_image_list:     'Bilder auflisten',
  tool_profile_get:    'Profil abrufen',
  tool_shop_write_read: 'Shopping',
  tool_soul_maturity:  'Reifegrad',
  tool_soul_read:      'Soul lesen',
  tool_soul_skills:    'Skills',
  tool_verify_human:   'Menschlichkeit',
  tool_video_get:      'Video abrufen',
  tool_video_list:     'Videos auflisten',
}
const en = {
  back:           '← Back',
  mobileNote:     'Scan is optimised for desktop. Open this page on a larger screen.',
  mobileBack:     'Back',
  souls:          'Souls',
  updated:        'Updated',
  verifying:      'Verifying',
  loading:        'Loading…',
  colName:        'Soul',
  colDesc:        'Description',
  colTags:        'Tags',
  colTools:       'Tools',
  colPrice:       'USDC / Request',
  colToken:       'Token',
  colSessions:    'Sessions',
  colAnchors:     'Anchors',
  colMethods:     'Methods',
  colAnchored:    'Anchored',
  colStatus:      'Status',
  colOnline:      'Online',
  colLlms:        'AI Info',
  colAccess:      'Access',
  access:         'Access',
  verified:       'Chain verified',
  verifyPending:  'Verifying',
  chainOk:        'Verified',
  chainPending:   'Verifying',
  chainErr:       'Error',
  chainFail:      'Unverified',
  methodWallet:   'Wallet',
  methodPaypal:   'PayPal',
  modalKicker:    'SOUL ACCESS',
  modalPrice:     'Price',
  dynBadge:       'dynamic',
  modalTools:     'Available tools',
  modalTokenValid:'Token valid:',
  modalDays:      ' days',
  aiAccessLabel:  'Access via AI chat',
  aiAccessIntro:  'Copy this link and paste it to your AI in chat. Also tell it whether you want to pay via x402/USDC or PayPal — it takes care of the rest.',
  modalHow:       'How to access',
  step1Pre:       'Price:',
  step1Post:      '— paid via x402 (signed EIP-3009 authorization) to this wallet on Polygon:',
  step2:          'Your AI agent calls this endpoint via the x402 protocol (402 challenge → signed authorization):',
  step3Pre:       'You receive an',
  step3Post:      '— use it as Bearer token at the MCP endpoint:',
  modalPaypalHow: 'Without a Polygon wallet',
  paypalStepPre:  'Pay',
  paypalStepMid:  'via PayPal to:',
  paypalStepSub:  'Then contact the soul operator directly — access is reviewed and granted manually, typically within 48 hours.',
  walletViaChat:    'Get the wallet address from your AI in chat, or directly via the matching MCP tool.',
  paypalViaChat:    'Get the PayPal target from your AI in chat, or directly via the matching MCP tool.',
  llmsTitle:      'AI-readable node description',
  visDiscoverable: 'Discoverable',
  visFading:       'Fading — leaving discovery window',
  visInvisible:    'Not discoverable — anchor now',
  vis_discoverable: 'discoverable',
  vis_fading:       'fading',
  vis_invisible:    'not discoverable',
  copy:           'Copy',
  copied:         'Copied ✓',
  notVerified:    'Not verified',
  verifyError:    'Verification failed (network error) — no statement about authenticity',
  confirmUnverifiedFail:  'This soul could NOT be verified — the on-chain transaction does not match the claimed ID. It may be fake. Continue anyway?',
  confirmUnverifiedError: 'Verification could not be completed due to a network error. Authenticity is unresolved. Continue anyway?',
  degradedNotice:   'Some data sources are currently unreachable — the network view may be incomplete.',
  degradedEtherscan: 'On-chain discovery (Etherscan) failed.',
  degradedRpc:       'Polygon RPC failed — verification limited.',
  degradedIpfs:      'IPFS unreachable — some profiles incomplete.',
  empty:          'No souls found.',
  footNote:       'Every soul is independently verified against the Polygon contract. Discovery via peer network. →',
  footLink:       'Understand the protocol',
  footerProtocol: 'Protocol',
  footerLegal:    'Legal',
  linkWhy:        'Why SYS',
  linkImprint:    'Legal Notice',
  linkPrivacy:    'Privacy Policy',
  linkLicense:    'License',
  contactLabel:   'Problems? Contact:',
  contactReply:   'Typically replies within 48h',
  tool_audio_get:      'Get audio',
  tool_audio_list:     'List audio',
  tool_context_get:    'Get context',
  tool_context_list:   'List context',
  tool_health_check_payed: 'Health',
  tool_image_get:      'Get image',
  tool_image_list:     'List images',
  tool_profile_get:    'Get profile',
  tool_shop_write_read: 'Shopping',
  tool_soul_maturity:  'Maturity level',
  tool_soul_read:      'Read soul',
  tool_soul_skills:    'Skills',
  tool_verify_human:   'Humanity',
  tool_video_get:      'Get video',
  tool_video_list:     'List videos',
}
const t = computed(() => lang.value === 'de' ? de : en)

function toolLabel(name) {
  return t.value[`tool_${name}`] || name
}

// Sichtbarer Degraded-State — wird zu Beginn jedes runScan() zurückgesetzt und von den
// Discovery-/Verifikations-Funktionen gesetzt, wenn eine externe Abhängigkeit ausfällt.
// Ohne das bleiben Etherscan-/RPC-/IPFS-Ausfälle für Nutzer unsichtbar (nur weniger/
// falsch dargestellte Souls, ohne Erklärung warum).
const degraded = ref({ etherscan: false, rpc: false, ipfs: false })

// ── Chain ─────────────────────────────────────────────────────────────────────
const RPC             = 'https://polygon-bor-rpc.publicnode.com'
const SYS_CONTRACT    = '0xE80B92edFE2286a5a941D10123AbF5E11F76342B'
const ANCHORED_TOPIC0 = '0x24b87c8294e674d1419dd6c41c12b8d49dc2544499faf53e81accbe330f7cdae'

// Discovers nodes + basic soul stubs from on-chain Anchored events via Etherscan.
// Returns { origins: string[], stubs: object[] } — works without any node being online.
async function discoverNodesFromChain(apiKey) {
  if (!apiKey) {
    console.warn('[scan] discoverNodesFromChain: kein Etherscan API-Key konfiguriert — On-Chain-Discovery übersprungen.')
    degraded.value.etherscan = true
    return { origins: [], stubs: [] }
  }
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=137&module=logs&action=getLogs` +
      `&address=${SYS_CONTRACT}&topic0=${ANCHORED_TOPIC0}` +
      `&fromBlock=90674283&toBlock=latest&page=1&offset=1000&apikey=${apiKey}`
    const json = await fetch(url, { signal: AbortSignal.timeout(15000) }).then(r => r.json())
    if (json.status !== '1' || !Array.isArray(json.result)) {
      console.warn('[scan] Etherscan getLogs lieferte kein verwertbares Ergebnis:', json.status, json.message)
      degraded.value.etherscan = true
      return { origins: [], stubs: [] }
    }

    // Count anchors + track latest TX per soulId topic
    const anchorCount = new Map()
    const latestTx    = new Map()
    for (const log of json.result) {
      const topic = log.topics[1]
      const block = parseInt(log.blockNumber, 16)
      anchorCount.set(topic, (anchorCount.get(topic) || 0) + 1)
      const prev = latestTx.get(topic)
      if (!prev || block > prev.block) latestTx.set(topic, { txHash: log.transactionHash, block })
    }

    // Batch-fetch TX calldata (10 per request)
    const entries  = [...latestTx.entries()] // [topic, {txHash, block}]
    const txHashes = entries.map(([, v]) => v.txHash)
    const origins  = new Set()
    const stubs    = []

    for (let i = 0; i < txHashes.length; i += 10) {
      const slice = entries.slice(i, i + 10)
      const batch = slice.map(([, v], idx) => ({
        jsonrpc: '2.0', method: 'eth_getTransactionByHash', params: [v.txHash], id: idx,
      }))
      try {
        const results = await fetch(RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(10000),
        }).then(r => r.json())
        for (const res of (Array.isArray(results) ? results : [results])) {
          const tx   = res.result
          const meta = tx?.input ? extractSysMeta(tx.input) : null
          if (!meta?.mcp || !meta?.id) continue
          try {
            const origin = new URL(meta.mcp).origin
            origins.add(origin)
            // Map txHash back to topic for anchor count
            const topic = slice[res.id]?.[0]
            stubs.push({
              soul_id:      meta.id,
              mcp_endpoint: meta.mcp,
              name:         meta.name || null,
              tags:         meta.tags || [],
              cid:          meta.cid  || null,
              tx_hash:      tx.hash,
              anchor_count: anchorCount.get(topic) || 1,
              chain_verified: null,
              _stub:        true,
            })
          } catch (e) {
            console.warn('[scan] ungültige mcp_endpoint-URL in Anchor-Calldata, Eintrag übersprungen:', e.message)
          }
        }
      } catch (e) {
        console.warn('[scan] RPC-Batch (eth_getTransactionByHash) fehlgeschlagen:', e.message)
        degraded.value.rpc = true
      }
    }
    return { origins: [...origins], stubs }
  } catch (e) {
    console.error('[scan] discoverNodesFromChain fehlgeschlagen:', e.message)
    degraded.value.etherscan = true
    return { origins: [], stubs: [] }
  }
}

function hexToBytes(hex) {
  const clean = hex.replace('0x', '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function extractSysMeta(inputHex) {
  try {
    const raw = hexToBytes(inputHex)
    if (raw.length <= 100) return null
    const extra = new TextDecoder('utf-8', { fatal: false }).decode(raw.slice(100))
    const MARKER = '\x00SYS1\x00'
    const idx = extra.indexOf(MARKER)
    if (idx === -1) return null
    return JSON.parse(extra.slice(idx + MARKER.length))
  } catch { return null }
}

// Rückgabe: true (verifiziert) | 'fail' (aktiv widerlegt — TX passt nicht zur soulId) |
// 'error' (RPC/Netzwerkfehler — konnte nicht geprüft werden, KEINE Aussage über Echtheit)
// Diese Unterscheidung ist sicherheitsrelevant: ein RPC-Ausfall darf nicht denselben
// UI-Zustand erzeugen wie eine tatsächlich widerlegte/gefälschte Anchor-TX.
async function verifyTx(txHash, soulId) {
  if (!txHash) return 'fail'
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionByHash', params: [txHash], id: 1 }),
      signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) {
      console.warn(`[scan] verifyTx: RPC antwortete mit ${r.status} für soul_id=${soulId}`)
      degraded.value.rpc = true
      return 'error'
    }
    const d = await r.json()
    if (d.error) {
      console.warn(`[scan] verifyTx: RPC-Fehler für soul_id=${soulId}:`, d.error)
      degraded.value.rpc = true
      return 'error'
    }
    const tx = d.result
    if (!tx?.input) return 'fail'
    const meta = extractSysMeta(tx.input)
    if (!meta) return 'fail'
    return meta.id === soulId ? true : 'fail'
  } catch (e) {
    console.warn(`[scan] verifyTx: Netzwerkfehler für soul_id=${soulId}:`, e.message)
    degraded.value.rpc = true
    return 'error'
  }
}

// ── IPFS fetch ────────────────────────────────────────────────────────────────
async function fetchFromIPFS(cid) {
  if (!cid) return null
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
  ]
  for (const url of gateways) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) continue
      return await r.json()
    } catch (e) {
      console.warn(`[scan] IPFS-Gateway ${url} fehlgeschlagen:`, e.message)
    }
  }
  console.warn(`[scan] Alle IPFS-Gateways fehlgeschlagen für CID=${cid}`)
  degraded.value.ipfs = true
  return null
}

// ── Soul cache (localStorage) ─────────────────────────────────────────────────
const CACHE_KEY = 'sys_soul_cache'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000   // 7 days

function cacheLoad() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') }
  catch (e) { console.warn('[scan] localStorage-Cache konnte nicht gelesen werden:', e.message); return {} }
}
function cacheSave(map, staleIds = []) {
  try {
    const obj = {}
    for (const [id, soul] of map) {
      if (!soul._stub) obj[id] = { ...soul, _cachedAt: Date.now() }
    }
    const merged = { ...cacheLoad(), ...obj }
    // Explizit entfernte Souls (z.B. durch discoverable-Abgleich widerlegt) auch aus
    // dem Cache tilgen — sonst würde der reine {...alt, ...neu}-Merge sie einfach
    // stehen lassen, weil sie in `obj` gar nicht mehr vorkommen.
    for (const id of staleIds) delete merged[id]
    // Evict expired
    const now = Date.now()
    for (const id of Object.keys(merged)) {
      if (now - (merged[id]._cachedAt || 0) > CACHE_TTL) delete merged[id]
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(merged))
  } catch (e) { console.warn('[scan] localStorage-Cache konnte nicht geschrieben werden:', e.message) }
}
function cacheFill(stub) {
  const cache = cacheLoad()
  const hit   = cache[stub.soul_id]
  if (!hit) return stub
  return { ...hit, _stub: true, mcp_endpoint: stub.mcp_endpoint, tx_hash: stub.tx_hash }
}

// ── State ─────────────────────────────────────────────────────────────────────
const souls      = ref([])
const pulsing    = ref({})
const prevPrices = ref({})
const loading    = ref(true)
const refreshing = ref(false)
const verifying  = ref(0)
const lastUpdate = ref(null)
const nodeOnline = ref({})   // soul_id → true | false | null (checking)

async function checkNodeOnline(soul) {
  if (!soul.mcp_endpoint) return
  try {
    const origin = new URL(soul.mcp_endpoint).origin
    const r = await fetch(`${origin}/api/soul/scan`, { signal: AbortSignal.timeout(5000) })
    const json = r.ok ? await r.json().catch(() => null) : null
    nodeOnline.value = { ...nodeOnline.value, [soul.soul_id]: json?.ok === true }
  } catch {
    nodeOnline.value = { ...nodeOnline.value, [soul.soul_id]: false }
  }
}

const timeStr = computed(() =>
  lastUpdate.value
    ? lastUpdate.value.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''
)

// ── Scan logic ────────────────────────────────────────────────────────────────
async function runScan() {
  refreshing.value = true
  degraded.value = { etherscan: false, rpc: false, ipfs: false }

  const visited  = new Set()
  const queue    = []
  const soulMap  = new Map()
  const staleIds = new Set()   // per Live-Abgleich widerlegte Souls — auch aus dem Cache tilgen

  // Bootstrap: nodes.json (fast path) + Etherscan chain discovery (autonomous) — parallel
  const config = useRuntimeConfig()
  const [seeds, { origins: chainNodes, stubs: chainStubs }] = await Promise.all([
    fetch('/nodes.json').then(r => r.json()).catch(e => {
      console.warn('[scan] nodes.json (Bootstrap-Liste) konnte nicht geladen werden:', e.message)
      return []
    }),
    discoverNodesFromChain(config.public.etherscanApiKey),
  ])

  // Pre-seed from localStorage cache — only show stubs with full cached data (name required)
  for (const stub of chainStubs) {
    if (soulMap.has(stub.soul_id)) continue
    const filled = cacheFill(stub)
    if (filled.name) soulMap.set(stub.soul_id, filled)
  }
  if (soulMap.size) updateTable(soulMap)

  // IPFS enrichment — fires in parallel with BFS
  // Fills missing fields (name/description/wallet) regardless of stub/live status
  const ipfsData = new Map()   // soul_id → IPFS JSON (arrives async)

  function applyIPFS(soulId) {
    const ipfs    = ipfsData.get(soulId)
    const current = soulMap.get(soulId)
    if (!ipfs || !current) return
    const uuidName = !current.name || /^[0-9a-f-]{8,}$/.test(current.name)
    soulMap.set(soulId, {
      ...current,
      name:        uuidName             ? (ipfs.name        || current.name) : current.name,
      description: current.description  ? current.description : (ipfs.description || ''),
      tags:        current.tags?.length ? current.tags         : (ipfs.tags || []),
      wallet:      current.wallet       ? current.wallet       : (ipfs.wallet || ''),
      agent_tools: current.agent_tools?.length ? current.agent_tools : (ipfs.agent_tools || []),
    })
  }

  Promise.all(chainStubs.filter(s => s.cid).map(async stub => {
    const data = await fetchFromIPFS(stub.cid)
    if (!data?.name) return
    ipfsData.set(stub.soul_id, data)
    applyIPFS(stub.soul_id)
    updateTable(soulMap)
  })).catch(e => console.warn('[scan] IPFS-Anreicherungs-Batch fehlgeschlagen:', e.message))

  // Eigener Node zuerst — same-origin, funktioniert unabhängig von Etherscan/
  // RPC-Ausfällen (z.B. durch Ad-/Privacy-Blocker, die Blockchain-Domains
  // filtern). Ohne das zeigt der Scanner bei einem Discovery-Ausfall "0
  // Souls", obwohl der eigene Node ganz normal erreichbar ist.
  const ownOrigin = window.location.origin
  const allSeeds  = [...new Set([ownOrigin, ...seeds, ...chainNodes])]
  for (const url of allSeeds) queue.push(url)

  // BFS: query each node, live data overrides stubs
  while (queue.length > 0) {
    const raw = queue.shift()
    const base = raw.replace(/\/mcp$/, '').replace(/\/$/, '')
    if (visited.has(base)) continue
    visited.add(base)

    try {
      // Ein einzelner unerreichbarer Peer ist normaler Netzwerk-Churn, kein
      // Grund für den globalen Degraded-Hinweis — nur leichtes Logging.
      const data = await fetch(`${base}/api/soul/scan`, {
        signal: AbortSignal.timeout(8000),
      }).then(r => r.ok ? r.json() : null).catch(e => {
        console.debug(`[scan] Node ${base} nicht erreichbar:`, e.message)
        return null
      })

      if (!data?.souls) continue

      // Abgleich: der Node hat gerade live geantwortet — seine Souls-Liste gilt als
      // maßgeblich. Souls, die vorher aus dem localStorage-Cache oder direkt aus
      // Chain-Calldata als Stub gezeigt wurden (beide können veraltet sein, z.B. nach
      // einem discoverable-Opt-out), aber jetzt nicht mehr in der Live-Antwort dieses
      // Node stecken, werden entfernt — sonst überlebt eine Soul ihren eigenen
      // Datenschutz-Opt-out im Browser-Cache anderer Besucher.
      const liveIds = new Set(data.souls.map(s => s.soul_id))
      let removed = false
      for (const [id, existing] of soulMap) {
        if (!existing.mcp_endpoint || liveIds.has(id)) continue
        try {
          if (new URL(existing.mcp_endpoint).origin === base) { soulMap.delete(id); staleIds.add(id); removed = true }
        } catch { /* ungültige URL — nichts zu tun */ }
      }
      if (removed) updateTable(soulMap)

      for (const soul of data.souls) {
        const prev = soulMap.get(soul.soul_id)
        soulMap.set(soul.soul_id, {
          ...soul,
          tags: soul.tags?.length ? soul.tags : (prev?.tags || []),
          chain_verified: null,
          _stub: false,
        })
        // Fill still-missing fields from IPFS if already fetched
        applyIPFS(soul.soul_id)
        // Show incrementally
        updateTable(soulMap)
        // Queue discovered mcp_endpoint as potential new node
        if (soul.mcp_endpoint) {
          try {
            const u = new URL(soul.mcp_endpoint)
            const discovered = u.origin   // nur https://host — kein Pfad, kein Query
            if (!visited.has(discovered)) queue.push(discovered)
          } catch (e) {
            console.warn(`[scan] Node ${base} meldet ungültige mcp_endpoint-URL:`, soul.mcp_endpoint, e.message)
          }
        }
      }
    } catch (e) {
      console.error(`[scan] Unerwarteter Fehler bei der Verarbeitung von Node ${base}:`, e.message)
    }
  }

  loading.value = false
  lastUpdate.value = new Date()
  refreshing.value = false

  // Persist live data to localStorage for offline fallback
  cacheSave(soulMap, [...staleIds])

  // Node online check — stubs never got live data → offline; rest check via API
  ;[...soulMap.values()].forEach(soul => {
    if (soul._stub) {
      nodeOnline.value = { ...nodeOnline.value, [soul.soul_id]: false }
    } else {
      checkNodeOnline(soul)
    }
  })

  // Verify all souls on-chain in parallel (max 4 at a time)
  const allSouls = [...soulMap.values()]
  verifying.value = allSouls.length

  const chunks = []
  for (let i = 0; i < allSouls.length; i += 4) chunks.push(allSouls.slice(i, i + 4))

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async soul => {
      const ok = await verifyTx(soul.tx_hash, soul.soul_id)
      const entry = soulMap.get(soul.soul_id)
      if (entry) {
        entry.chain_verified = ok
        soulMap.set(soul.soul_id, { ...entry })
      }
      verifying.value = Math.max(0, verifying.value - 1)
      updateTable(soulMap)
    }))
  }
}

function updateTable(soulMap) {
  const next = [...soulMap.values()].sort((a, b) => (b.price_usdc ?? 0) - (a.price_usdc ?? 0))

  // Detect price changes → pulse
  next.forEach(soul => {
    const prev = prevPrices.value[soul.soul_id]
    const curr = soul.price_usdc
    if (prev !== undefined && prev !== curr) {
      pulsing.value = { ...pulsing.value, [soul.soul_id]: true }
      setTimeout(() => {
        const p = { ...pulsing.value }
        delete p[soul.soul_id]
        pulsing.value = p
      }, 1100)
    }
    prevPrices.value[soul.soul_id] = curr
  })

  souls.value = next
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const selectedSoul = ref(null)
const copied       = ref(null)

function llmsUrl(mcpEndpoint) {
  try { return new URL(mcpEndpoint).origin + '/llms.txt' } catch { return '#' }
}
function visAge(days) {
  if (days === null || days === undefined) return '—'
  if (days < 1) return Math.round(days * 24) + 'h'
  return Math.floor(days) + 'd'
}

function openModal(soul) {
  if (soul.chain_verified === 'fail') {
    if (!window.confirm(t.value.confirmUnverifiedFail)) return
  } else if (soul.chain_verified === 'error') {
    if (!window.confirm(t.value.confirmUnverifiedError)) return
  }
  selectedSoul.value = soul
  copied.value = null
}
function closeModal() {
  selectedSoul.value = null
}

const payEndpoint = computed(() => {
  if (!selectedSoul.value?.mcp_endpoint) return ''
  try { return new URL(selectedSoul.value.mcp_endpoint).origin + '/api/soul/pay/x402' }
  catch { return '' }
})
const payBodyExample = 'x402 protocol: 402 challenge → signed EIP-3009 retry (PAYMENT-SIGNATURE header)'

function copy(text, key) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    copied.value = key
    setTimeout(() => { if (copied.value === key) copied.value = null }, 2000)
  })
}

// Close on Escape
function onKeyDown(e) { if (e.key === 'Escape') closeModal() }

let timer
onMounted(() => {
  runScan()
  timer = setInterval(runScan, 300_000)
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
/* ── ROOT — gleiche Variablen wie index.vue ───────────────────────── */
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

/* ── MOBILE WALL ──────────────────────────────────────────────────── */
.mobile-wall { display: none; min-height: calc(100vh - 64px); align-items: center; justify-content: center; padding: 40px 28px; text-align: center; }
.mobile-inner { max-width: 380px; }
.mobile-h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(48px,14vw,72px); line-height: 0.95; letter-spacing: -0.04em; color: #fff; margin: 12px 0 24px; }
.mobile-h1 em { font-style: italic; color: var(--teal); }
.mobile-p { font-size: 16px; line-height: 1.7; color: var(--fg); margin-bottom: 32px; }
.mobile-back { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--teal); text-decoration: none; }
@media (max-width: 900px) { .mobile-wall { display: flex; } .scan-wrap { display: none; } }

/* ── SCAN WRAP ────────────────────────────────────────────────────── */
.scan-wrap { padding: clamp(28px,4vw,48px) clamp(20px,4vw,52px); }

/* ── TOPBAR ───────────────────────────────────────────────────────── */
.kicker { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--teal); display: block; margin-bottom: 10px; }
.topbar { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
.scan-h1 { font-family: var(--serif); font-weight: 400; font-size: clamp(32px,5vw,56px); line-height: 1; letter-spacing: -0.03em; color: #fff; margin: 0; }
.scan-h1 em { font-style: italic; color: var(--teal); }
.topbar-right { display: flex; align-items: center; gap: 8px; padding-bottom: 6px; flex-wrap: wrap; }
.stat-pill { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--teal); border: 1px solid rgba(109,184,154,0.3); padding: 5px 10px; }
.stat-dim { color: var(--fg); border-color: var(--line); }
.refresh-btn { background: none; border: 1px solid var(--line); color: var(--fg); font-size: 16px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; padding: 0; }
.refresh-btn:hover { border-color: var(--teal); color: var(--teal); }
.degraded-banner {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.02em; color: rgba(230,140,80,0.95);
  border: 1px solid rgba(230,140,80,0.35); background: rgba(230,140,80,0.06);
  padding: 8px 14px; margin: 0 0 14px; display: flex; flex-wrap: wrap; gap: 4px 10px;
}
.refresh-btn.spin { animation: spin 0.7s linear; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── TABLE ────────────────────────────────────────────────────────── */
.tbl-outer { width: 100%; overflow-x: auto; border: 1px solid var(--line); }
.tbl { width: 100%; border-collapse: collapse; table-layout: auto; }
.tbl thead tr { background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.12); }
.tbl th { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg); padding: 12px 14px; text-align: left; white-space: nowrap; font-weight: 400; }
.tbl td { padding: 13px 14px; border-bottom: 1px solid var(--line); vertical-align: middle; font-size: 14px; }
.soul-tr { transition: background 0.15s; }
.soul-tr:hover { background: rgba(255,255,255,0.02); }
.soul-tr:last-child td { border-bottom: 0; }

/* price pulse */
@keyframes price-pulse {
  0%   { background: rgba(109,184,154,0.00); box-shadow: inset 0 0 0 1px rgba(109,184,154,0.0); }
  35%  { background: rgba(109,184,154,0.07); box-shadow: inset 0 0 0 1px rgba(109,184,154,0.5); }
  100% { background: rgba(109,184,154,0.00); box-shadow: inset 0 0 0 1px rgba(109,184,154,0.0); }
}
.soul-tr.pulse { animation: price-pulse 1.1s ease-out; }

/* row transitions */
.row-move        { transition: transform 0.4s cubic-bezier(0.22,1,0.36,1); }
.row-enter-active{ transition: opacity 0.3s, transform 0.3s; }
.row-leave-active{ transition: opacity 0.2s; position: absolute; }
.row-enter-from  { opacity: 0; transform: translateY(-6px); }
.row-leave-to    { opacity: 0; }

/* columns */
.c-rank { width: 40px; }
.rank { font-family: var(--mono); font-size: 12px; color: var(--fg); }
.c-name { min-width: 100px; max-width: 160px; }
.sname { display: block; font-family: var(--serif); font-size: 15px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-tags { min-width: 120px; }
.tag { display: inline-block; font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; color: var(--teal); border: 1px solid rgba(109,184,154,0.22); padding: 2px 6px; margin: 2px 2px 2px 0; }
.c-tools { min-width: 110px; }
.tool-pill { display: inline-block; font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em; color: var(--fg); border: 1px solid var(--line); padding: 2px 6px; margin: 2px 2px 2px 0; }
.dim { color: var(--fg); font-family: var(--mono); font-size: 12px; }
.price-stack { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.price { font-family: var(--mono); font-size: 13px; color: var(--teal); font-weight: 600; }
.price-u { font-size: 10px; letter-spacing: 0.1em; opacity: 0.8; }
.mono { font-family: var(--mono); font-size: 13px; color: var(--fg); }
.c-methods { min-width: 90px; }
.method-pill { display: inline-block; font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; color: var(--teal); border: 1px solid rgba(109,184,154,0.22); padding: 2px 6px; margin: 2px 2px 2px 0; }
.c-chain { width: 90px; text-align: left; white-space: nowrap; }
.chain-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.chain-text { font-family: var(--mono); font-size: 11px; color: var(--fg); vertical-align: middle; }
.chain-ok      { background: var(--teal); box-shadow: 0 0 6px rgba(109,184,154,0.6); }
.chain-pending { background: rgba(200,200,200,0.25); animation: blink 1.2s ease-in-out infinite; }
.chain-fail    { background: rgba(240,100,100,0.5); }
.chain-error   { background: rgba(230,180,80,0.6); }
@keyframes blink { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
.c-status { white-space: nowrap; }
.c-online { white-space: nowrap; }
.c-llms   { white-space: nowrap; }
.c-access { white-space: nowrap; }
.access-btn { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--teal); text-decoration: none; border: 1px solid rgba(109,184,154,0.28); padding: 6px 12px; transition: all 0.15s; background: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
.access-btn:hover { background: rgba(109,184,154,0.07); border-color: var(--teal); }
.access-btn--warn { color: rgba(230,140,80,0.9); border-color: rgba(230,140,80,0.35); }
.access-btn--warn:hover { background: rgba(230,140,80,0.08); border-color: rgba(230,140,80,0.6); }
.llms-link { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--teal); text-decoration: none; border: 1px solid rgba(109,184,154,0.28); padding: 6px 12px; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
.llms-link:hover { background: rgba(109,184,154,0.07); border-color: var(--teal); }
.node-status  { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
.node-online  { color: #4caf7d; }
.node-offline { color: #e05252; }

.vis-pill {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.10em;
  text-transform: lowercase; white-space: nowrap;
  padding: 3px 8px; border-radius: 99px; flex: none;
  color: var(--teal); background: rgba(109,184,154,0.10); border: 1px solid rgba(109,184,154,0.28);
}
.vis-pill--fading    { color: #d4af37; background: rgba(212,175,55,0.10); border-color: rgba(212,175,55,0.28); }
.vis-pill--invisible { color: #e06c75; background: rgba(224,108,117,0.10); border-color: rgba(224,108,117,0.28); animation: vis-pulse 1.8s ease-in-out infinite; }
@keyframes vis-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* skeleton */
.skel-tr td { padding: 14px; }
.skel { display: block; height: 11px; background: rgba(255,255,255,0.04); animation: shimmer 1.4s ease-in-out infinite alternate; }
@keyframes shimmer { from { opacity: 0.4; } to { opacity: 0.9; } }

/* empty */
.empty-td { text-align: center; padding: 60px; font-family: var(--mono); font-size: 12px; color: var(--fg); }

/* ── FOOT ROW ─────────────────────────────────────────────────────── */
.foot-row { margin-top: 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.legend { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11px; color: var(--fg); letter-spacing: 0.06em; }
.foot-note { font-family: var(--mono); font-size: 11px; color: var(--fg); letter-spacing: 0.04em; text-align: right; }
.foot-link { color: var(--teal); text-decoration: none; }
.foot-link:hover { text-decoration: underline; }

/* ── FOOTER ───────────────────────────────────────────────────────── */
.colophon { border-top: 1px solid var(--line); padding: clamp(32px,5vw,64px) clamp(20px,4vw,52px); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; }
@media (max-width: 720px) { .colophon { grid-template-columns: 1fr; gap: 32px; } }
.col-brand { display: flex; flex-direction: column; gap: 12px; }
.col-name { font-family: var(--serif); font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: #fff; }
.col-name em { font-style: normal; color: var(--teal); }
.fr-tag { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg); }
.col-head { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--fg); margin-bottom: 16px; }
.colophon ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.colophon a { font-size: 15px; color: var(--fg); text-decoration: none; transition: color 0.15s; }
.colophon a:hover { color: #fff; }

/* ── DESCRIPTION COLUMN ───────────────────────────────────────────────── */
.c-desc { min-width: 180px; max-width: 280px; }
.sdesc { font-family: var(--mono); font-size: 11px; color: var(--fg); white-space: normal; overflow-wrap: break-word; max-width: 260px; display: block; line-height: 1.5; }

/* ── DYNAMIC PRICE INDICATOR ──────────────────────────────────────────── */
.price-dyn { font-family: var(--mono); font-size: 10px; color: var(--fg); letter-spacing: 0.06em; margin-left: 6px; border: 1px solid var(--line); padding: 1px 5px; }

/* ── MODAL ────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.76); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.modal-box {
  background: var(--bg-2); border: 1px solid rgba(109,184,154,0.22);
  width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto;
  padding: 32px 36px;
}

/* head — wie .nav-title auf index.vue */
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.modal-brand {
  font-family: var(--serif); font-weight: 400;
  font-size: clamp(26px,4vw,36px); letter-spacing: -0.04em; line-height: 1;
  color: var(--fg);
}
.modal-brand em { color: var(--teal); font-style: italic; }
.modal-close {
  background: none; border: 1px solid var(--line); color: var(--fg-dim);
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 12px; transition: all 0.15s;
}
.modal-close:hover { border-color: var(--teal); color: var(--teal); }

/* identity — wie hero-title + hero-sub auf index.vue */
.modal-identity { margin-bottom: 24px; }
.modal-soul-name {
  font-family: var(--serif); font-weight: 400;
  font-size: clamp(28px,4vw,40px); letter-spacing: -0.03em;
  line-height: 0.95; color: #fff; margin: 0 0 14px;
}
.modal-soul-desc {
  font-family: var(--sans); font-size: var(--text); line-height: 1.72;
  color: var(--fg); margin: 0 0 14px; max-width: 48ch;
}
.modal-soul-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.modal-soul-tags .tag,
.modal-tools .tool-pill {
  font-family: var(--sans); font-size: var(--text); letter-spacing: normal;
  color: var(--fg); padding: 4px 10px;
}

/* divider */
.modal-divider { height: 1px; background: var(--line); margin: 22px 0; }

/* Modal-Inhalt: EINE Textgröße (var(--text)), EINE Grundfarbe (var(--fg)) für alles.
   Teal nur noch für echte Links und die <em>-Betonung von Beträgen — keine
   Unterscheidung mehr über Schriftgröße/-art/Groß-Klein-Schreibung. */
.modal-row-label {
  font-family: var(--sans); font-size: var(--text); font-weight: 600;
  color: var(--fg); margin-bottom: 10px;
}
.modal-price-block { margin-bottom: 4px; }
.modal-price-main { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.modal-pol { font-family: var(--sans); font-size: var(--text); font-weight: 600; color: var(--fg); }
.modal-pol-unit { font-family: var(--sans); font-size: var(--text); color: var(--fg); }
.modal-dyn-pill { font-family: var(--sans); font-size: var(--text); color: var(--fg); border: 1px solid var(--line); padding: 2px 10px; }
.modal-token-hint { font-family: var(--sans); font-size: var(--text); color: var(--fg); }
.modal-tools { margin-top: 14px; }
.modal-tools-label { margin-bottom: 8px; }
.modal-contact { font-family: var(--sans); font-size: var(--text); color: var(--fg); line-height: 1.6; }
.modal-contact a { color: var(--teal); text-decoration: none; }
.modal-contact a:hover { text-decoration: underline; }

/* steps */
.modal-step { display: flex; gap: 16px; margin-bottom: 20px; align-items: flex-start; }
.step-n {
  font-family: var(--sans); font-size: var(--text);
  color: var(--fg); border: 1px solid rgba(109,184,154,0.3);
  min-width: 28px; height: 22px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 2px;
}
.step-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }
.step-label { font-family: var(--sans); font-size: var(--text); color: var(--fg); line-height: 1.65; }
.step-label em { font-style: normal; color: var(--teal); }
.step-sub { font-family: var(--sans); font-size: var(--text); color: var(--fg); line-height: 1.65; }
.i-code { font-family: var(--sans); font-size: var(--text); color: var(--fg); background: rgba(109,184,154,0.08); padding: 1px 6px; }

/* copy block */
.copy-block { display: flex; align-items: stretch; border: 1px solid var(--line); background: rgba(255,255,255,0.025); }
.copy-code { font-family: var(--sans); font-size: var(--text); color: var(--fg); padding: 9px 12px; flex: 1; word-break: break-all; min-width: 0; display: block; }
.copy-btn { font-family: var(--sans); font-size: var(--text); background: none; border: none; border-left: 1px solid var(--line); color: var(--fg); padding: 0 14px; cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0; }
.copy-btn:hover { background: rgba(109,184,154,0.07); color: var(--teal); }

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.18s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .modal-box { transition: transform 0.18s; }
.modal-fade-enter-from .modal-box { transform: translateY(-10px) scale(0.98); }
</style>
