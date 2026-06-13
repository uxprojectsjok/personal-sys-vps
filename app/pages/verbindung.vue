<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="connect" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Netzwerk', 'Verbindung']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page cn-page">

            <!-- Header -->
            <div class="cn-head">
              <div class="eyebrow">VERIFIKATIONS-HUB</div>
              <h1 class="cn-title">Verbindung &amp; <em>Verifikation</em></h1>
              <p class="cn-lede">Teile deinen MCP-Endpoint per QR-Code oder verifiziere deine Identität — per Fingerabdruck, Gesicht oder Stimme.</p>
            </div>

            <!-- Pending MCP challenge banner -->
            <Transition name="slide-down">
              <div v-if="pendingChallenge" class="cn-mcp-banner">
                <div class="cn-mcp-banner-left">
                  <div class="cn-mcp-ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
                  </div>
                  <div>
                    <div class="cn-mcp-title">Verifikationsanfrage offen</div>
                    <div class="cn-mcp-sub">Claude AI bittet um {{ methodLabel(pendingChallenge.method) }}</div>
                  </div>
                </div>
                <button class="cn-mcp-btn" @click="startVerify(pendingChallenge.method, pendingChallenge.challenge_id)">Jetzt verifizieren</button>
              </div>
            </Transition>

            <!-- QR-CONNECT -->
            <div class="cn-section-label">QR-CONNECT</div>
            <div class="cn-action-card">
              <div class="cn-action-left">
                <div class="cn-action-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/></svg>
                </div>
                <div>
                  <div class="cn-action-title">MCP-Endpoint freigeben</div>
                  <div class="cn-action-sub">QR scannen · Tap bestätigen · verbunden</div>
                </div>
              </div>
              <button class="cn-action-btn" :class="{ 'cn-action-btn--active': qrPhase === 'active' || qrPhase === 'probed' }" :disabled="qrPhase === 'creating' || qrPhase === 'approving'" @click="qrPhase === 'idle' ? startSession() : cancelSession()">
                <svg v-if="qrPhase === 'creating' || qrPhase === 'approving'" class="spin cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                <svg v-else-if="qrPhase === 'active' || qrPhase === 'probed'" class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                <svg v-else class="cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/></svg>
                <span>{{ qrActionLabel }}</span>
              </button>
            </div>

            <!-- QR Dual panel -->
            <Transition name="slide-down">
              <div v-if="qrPhase !== 'idle'" class="cn-dual">
                <div class="cn-panel cn-panel--owner">
                  <div class="cn-panel-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>DU · NODE-INHABER</div>
                  <div v-if="qrPhase === 'active'" class="cn-panel-body cn-qr-body">
                    <canvas ref="qrCanvas" class="cn-qr-canvas" />
                    <div class="cn-countdown"><span class="cn-countdown-num">{{ countdown }}</span><span class="cn-countdown-label">Sekunden</span></div>
                    <p class="cn-hint">Zeige diesen QR-Code jemandem zum Scannen</p>
                  </div>
                  <div v-else-if="qrPhase === 'probed'" class="cn-panel-body cn-approve-body">
                    <div class="cn-probe-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg></div>
                    <div class="cn-probe-title">Jemand scannt gerade</div>
                    <p class="cn-probe-hint">Möchtest du die Verbindung freigeben?</p>
                    <div class="cn-approve-actions"><button class="cn-btn cn-btn--reject" @click="approve(false)">Ablehnen</button><button class="cn-btn cn-btn--accept" @click="approve(true)">Zulassen</button></div>
                  </div>
                  <div v-else-if="qrPhase === 'done'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
                    <div class="cn-done-title">Verbunden</div>
                    <button class="cn-btn cn-btn--done" @click="resetQr">Fertig</button>
                  </div>
                  <div v-else-if="qrPhase === 'error'" class="cn-panel-body cn-done-body">
                    <div class="cn-done-check cn-done-check--err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></div>
                    <div class="cn-done-title">{{ qrError || 'Fehler' }}</div>
                    <button class="cn-btn cn-btn--done" @click="resetQr">Neu versuchen</button>
                  </div>
                </div>
                <div class="cn-panel cn-panel--stranger">
                  <div class="cn-panel-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cn-label-ic"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20"/></svg>FREMDER · /CONNECT</div>
                  <div class="cn-panel-body cn-stranger-body">
                    <div class="cn-sys-logo">SYS<span>.</span></div>
                    <template v-if="qrPhase === 'active'"><div class="cn-stranger-hint">Warte auf Scan…</div></template>
                    <template v-else-if="qrPhase === 'probed'"><div class="cn-stranger-ring"><svg class="spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10" stroke-dasharray="4 2"/></svg></div><div class="cn-stranger-hint">Warte auf Bestätigung…</div></template>
                    <template v-else-if="qrPhase === 'done'">
                      <div class="cn-done-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
                      <div class="cn-done-title">Verbunden</div>
                      <div class="cn-hello-msg">Hello from {{ soulMeta?.name || 'Soul' }}!</div>
                      <div class="cn-verified-row"><span class="cn-verified-dot" />Node verifiziert</div>
                    </template>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- VERIFIZIEREN tiles -->
            <div class="cn-section-label" style="margin-top:40px">VERIFIZIEREN</div>
            <div class="cn-tiles">

              <!-- Fingerabdruck -->
              <div class="cn-tile" :class="tileClass('fingerprint')">
                <div class="cn-tile-head">
                  <div class="cn-tile-ic cn-tile-ic--fp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.459 7.459 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"/></svg></div>
                  <div><div class="cn-tile-title">Fingerabdruck</div><div class="cn-tile-sub">Face ID · Touch ID · Windows Hello</div></div>
                </div>
                <div class="cn-tile-body">
                  <p class="cn-tile-desc">Kryptografisch sicher — beweist Gerätezugehörigkeit via Secure Enclave.</p>
                  <div v-if="verifyState.fingerprint === 'verified'" class="cn-tile-result cn-tile-result--ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>Verifiziert</div>
                  <div v-else-if="verifyState.fingerprint === 'failed'" class="cn-tile-result cn-tile-result--err">Fehlgeschlagen</div>
                  <button v-else class="cn-tile-btn" :disabled="verifyState.fingerprint === 'verifying'" @click="startVerify('fingerprint')">
                    <svg v-if="verifyState.fingerprint === 'verifying'" class="spin cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                    <span>{{ verifyState.fingerprint === 'verifying' ? 'Warte…' : 'Verifizieren' }}</span>
                  </button>
                  <button v-if="['verified','failed'].includes(verifyState.fingerprint)" class="cn-tile-reset" @click="resetVerify('fingerprint')">Neu</button>
                </div>
              </div>

              <!-- Gesicht -->
              <div class="cn-tile" :class="tileClass('face')">
                <div class="cn-tile-head">
                  <div class="cn-tile-ic cn-tile-ic--face"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M11.25 11.25h.008v.008h-.008V11.25Zm1.5 0h.008v.008H12.75V11.25Zm-6 3.75A6.75 6.75 0 0 1 12 5.25a6.75 6.75 0 0 1 6.75 6.75c0 .966-.204 1.885-.568 2.715"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg></div>
                  <div><div class="cn-tile-title">Gesicht</div><div class="cn-tile-sub">Kamera-Selfie · Live-Aufnahme</div></div>
                </div>
                <div class="cn-tile-body">
                  <template v-if="verifyState.face === 'capturing'">
                    <div class="cn-cam-wrap"><video ref="faceVideo" class="cn-cam-preview" autoplay muted playsinline /><canvas ref="faceCanvas" style="display:none" /></div>
                    <div class="cn-cam-hint">Schau direkt in die Kamera</div>
                    <div class="cn-cam-actions">
                      <button class="cn-tile-btn" @click="captureFace">Aufnehmen</button>
                      <button class="cn-tile-reset" @click="stopCamera(); verifyState.face = 'idle'">Abbrechen</button>
                    </div>
                  </template>
                  <template v-else-if="verifyState.face === 'comparing'">
                    <div class="cn-comparing-ring"><svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg></div>
                    <div class="cn-tile-desc">Claude vergleicht…</div>
                  </template>
                  <template v-else>
                    <p class="cn-tile-desc">Bestätigt physische Anwesenheit durch eine Live-Aufnahme.</p>
                    <div v-if="verifyState.face === 'verified'" class="cn-tile-result cn-tile-result--ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>Erkannt</div>
                    <div v-else-if="verifyState.face === 'failed'" class="cn-tile-result cn-tile-result--err">Nicht erkannt</div>
                    <button v-else class="cn-tile-btn" :disabled="verifyState.face === 'verifying'" @click="startVerify('face')">
                      <svg v-if="verifyState.face === 'verifying'" class="spin cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                      <span>{{ verifyState.face === 'verifying' ? 'Kamera öffnen…' : 'Verifizieren' }}</span>
                    </button>
                    <button v-if="['verified','failed'].includes(verifyState.face)" class="cn-tile-reset" @click="resetVerify('face')">Neu</button>
                  </template>
                </div>
              </div>

              <!-- Stimme -->
              <div class="cn-tile" :class="tileClass('voice')">
                <div class="cn-tile-head">
                  <div class="cn-tile-ic cn-tile-ic--voice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg></div>
                  <div><div class="cn-tile-title">Stimme</div><div class="cn-tile-sub">Sprach-Sample · 3 Sekunden</div></div>
                </div>
                <div class="cn-tile-body">
                  <template v-if="verifyState.voice === 'recording'">
                    <div class="cn-rec-ring"><span class="cn-rec-dot" /><span class="cn-rec-label">Aufnahme… {{ recCountdown }}s</span></div>
                  </template>
                  <template v-else-if="verifyState.voice === 'comparing'">
                    <div class="cn-comparing-ring"><svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg></div>
                    <div class="cn-tile-desc">Spektralanalyse…</div>
                  </template>
                  <template v-else>
                    <p class="cn-tile-desc">Sprich einen kurzen Satz — bestätigt Anwesenheit durch Stimmabdruck.</p>
                    <div v-if="verifyState.voice === 'verified'" class="cn-tile-result cn-tile-result--ok">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      Erkannt<span v-if="voiceScore > 0" class="cn-score"> · {{ Math.round(voiceScore * 100) }}%</span>
                    </div>
                    <div v-else-if="verifyState.voice === 'failed'" class="cn-tile-result cn-tile-result--err">
                      Nicht erkannt<span v-if="voiceScore > 0" class="cn-score"> · {{ Math.round(voiceScore * 100) }}%</span>
                    </div>
                    <button v-else class="cn-tile-btn" :disabled="verifyState.voice === 'verifying'" @click="startVerify('voice')">
                      <svg v-if="verifyState.voice === 'verifying'" class="spin cn-btn-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                      <span>{{ verifyState.voice === 'verifying' ? 'Mikrofon…' : 'Verifizieren' }}</span>
                    </button>
                    <button v-if="['verified','failed'].includes(verifyState.voice)" class="cn-tile-reset" @click="resetVerify('voice')">Neu</button>
                  </template>
                </div>
              </div>

            </div>

            <!-- 2FA Wallet -->
            <Transition name="slide-down">
              <div v-if="anyBiometricVerified" class="cn-2fa-card">
                <div class="cn-2fa-head">
                  <div class="cn-2fa-ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"/></svg>
                  </div>
                  <div>
                    <div class="cn-2fa-title">2FA · Wallet-Signatur</div>
                    <div class="cn-2fa-sub">Biometrik + Wallet = höchster Verifikationsgrad</div>
                  </div>
                </div>
                <div v-if="verifiedLevel === '2fa'" class="cn-2fa-verified">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  2FA verifiziert · {{ walletShort }}
                </div>
                <div v-else-if="twoFaState === 'signing'" class="cn-2fa-pending">
                  <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                  Warte auf Wallet-Signatur…
                </div>
                <div v-else-if="twoFaError" class="cn-2fa-error">{{ twoFaError }}</div>
                <button v-else class="cn-2fa-btn" @click="do2FA">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;flex:none"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"/></svg>
                  Wallet verbinden &amp; signieren
                </button>
              </div>
            </Transition>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
  </ClientOnly>
</template>

<script setup>
import { ref, reactive, computed, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useSoulPasskey } from '~/composables/useSoulPasskey.js'

definePageMeta({ layout: false })
const router = useRouter()
const { hasSoul, soulMeta, soulToken } = useSoul()
const { authenticatePasskey } = useSoulPasskey()

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

// ── QR session ────────────────────────────────────────────────────────────────
const qrPhase = ref('idle'), qrCanvas = ref(null), countdown = ref(120), qrError = ref(''), pendingToken = ref('')
let pollTimer = null, countdownTimer = null
const qrActionLabel = computed(() => ({ idle:'QR anzeigen', creating:'Erstelle…', active:'Läuft…', probed:'Warte…', approving:'Bestätige…' }[qrPhase.value] ?? 'Abbrechen'))
function authHeaders() { return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' } }

async function startSession() {
  qrPhase.value = 'creating'; qrError.value = ''
  try {
    const r = await fetch('/api/connect/create', { method:'POST', headers:authHeaders(), body:JSON.stringify({ soul_name: soulMeta.value?.name||'Soul' }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Fehler')
    pendingToken.value = d.token; countdown.value = d.expires_seconds || 120; qrPhase.value = 'active'
    await nextTick(); await drawQr(d.qr_url); startCountdown(); startPolling()
  } catch (e) { qrError.value = e.message; qrPhase.value = 'error' }
}
async function drawQr(url) {
  if (!qrCanvas.value) return
  const Q = (await import('qrcode')).default
  Q.toCanvas(qrCanvas.value, url, { width:220, margin:2, color:{ dark:'#f4f1ea', light:'#1a1917' } })
}
function startCountdown() {
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => { countdown.value--; if (countdown.value <= 0) { clearInterval(countdownTimer); if (qrPhase.value==='active') cancelSession(true) } }, 1000)
}
function startPolling() {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    if (qrPhase.value !== 'active') { clearInterval(pollTimer); return }
    try { const r = await fetch('/api/connect/pending',{headers:authHeaders()}); const d = await r.json(); if (d.pending?.length) { pendingToken.value=d.pending[0].token; clearInterval(pollTimer); qrPhase.value='probed'; clearInterval(countdownTimer) } } catch(_){}
  }, 3000)
}
async function approve(ok) {
  qrPhase.value = 'approving'; clearInterval(pollTimer); clearInterval(countdownTimer)
  try { const r = await fetch('/api/connect/approve',{method:'POST',headers:authHeaders(),body:JSON.stringify({token:pendingToken.value,approved:ok})}); const d=await r.json(); if(!r.ok)throw new Error(d.error); qrPhase.value=ok?'done':'idle' } catch(e){qrError.value=e.message;qrPhase.value='error'}
}
function cancelSession(expired=false) { clearInterval(pollTimer); clearInterval(countdownTimer); if(expired){qrError.value='QR-Code abgelaufen';qrPhase.value='error'}else{qrPhase.value='idle'}; pendingToken.value='' }
function resetQr() { cancelSession(); qrPhase.value='idle'; qrError.value='' }

// ── Pending MCP challenge ─────────────────────────────────────────────────────
const pendingChallenge = ref(null)
let challengePollTimer = null
async function pollPendingChallenge() {
  try { const r = await fetch('/api/verify/pending',{headers:authHeaders()}); const d=await r.json(); pendingChallenge.value=d.pending?.length?d.pending[0]:null } catch(_){}
}
function methodLabel(m) { return { fingerprint:'Fingerabdruck/Face ID', face:'Gesichtserkennung', voice:'Stimm-Verifikation' }[m] ?? m }

// ── Biometric state ───────────────────────────────────────────────────────────
const verifyState = reactive({ fingerprint:'idle', face:'idle', voice:'idle' })
const faceVideo = ref(null), faceCanvas = ref(null)
const recCountdown = ref(3), voiceScore = ref(0)
let faceCamStream = null, activeChallengeId = null

const anyBiometricVerified = computed(() => Object.values(verifyState).some(s => s === 'verified'))
function tileClass(m) {
  const s = verifyState[m]
  return { 'cn-tile--active': ['verifying','capturing','recording','comparing'].includes(s), 'cn-tile--verified': s==='verified', 'cn-tile--failed': s==='failed' }
}
function resetVerify(m) { verifyState[m]='idle'; if(m==='face') stopCamera(); if(m==='voice') voiceScore.value=0 }

async function startVerify(method, challengeId = null) {
  if (!challengeId) {
    try {
      const r = await fetch('/api/verify/challenge', { method:'POST', headers:authHeaders(), body:JSON.stringify({ method }) })
      const d = await r.json()
      challengeId = d.challenge_id
    } catch(_) {}
  }
  activeChallengeId = challengeId
  if (method === 'fingerprint') await doFingerprint(challengeId)
  else if (method === 'face')   await doFace(challengeId)
  else if (method === 'voice')  await doVoice(challengeId)
  // Dismiss pending challenge banner if it was the one being verified
  if (pendingChallenge.value?.challenge_id === challengeId) pendingChallenge.value = null
}

async function submitResult(method, verified, challengeId) {
  if (!challengeId) return
  try { await fetch('/api/verify/complete',{method:'POST',headers:authHeaders(),body:JSON.stringify({challenge_id:challengeId,method,verified})}) } catch(_){}
}

// ── Fingerabdruck (WebAuthn) ──────────────────────────────────────────────────
async function doFingerprint(challengeId) {
  verifyState.fingerprint = 'verifying'
  try {
    const prf = await authenticatePasskey()
    const ok  = !!prf
    verifyState.fingerprint = ok ? 'verified' : 'failed'
    await submitResult('fingerprint', ok, challengeId)
  } catch(_) { verifyState.fingerprint = 'failed' }
}

// ── Gesicht (Claude Vision) ───────────────────────────────────────────────────
async function doFace(challengeId) {
  verifyState.face = 'verifying'
  try {
    faceCamStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false })
    await nextTick()
    if (faceVideo.value) { faceVideo.value.srcObject = faceCamStream; await faceVideo.value.play() }
    verifyState.face = 'capturing'
  } catch(_) { verifyState.face = 'failed' }
}

async function captureFace() {
  if (!faceVideo.value || !faceCanvas.value) return
  const v = faceVideo.value
  faceCanvas.value.width = v.videoWidth || 640
  faceCanvas.value.height = v.videoHeight || 480
  faceCanvas.value.getContext('2d').drawImage(v, 0, 0)
  stopCamera()
  verifyState.face = 'comparing'
  try {
    const b64 = faceCanvas.value.toDataURL('image/jpeg', 0.85).split(',')[1]
    const r = await fetch('/api/verify/face-check', { method:'POST', headers:authHeaders(), body:JSON.stringify({ image_base64:b64, mime:'image/jpeg' }) })
    const d = await r.json()
    const ok = d.match === true
    verifyState.face = ok ? 'verified' : 'failed'
    await submitResult('face', ok, activeChallengeId)
  } catch(_) { verifyState.face = 'failed' }
}

function stopCamera() { if(faceCamStream){ faceCamStream.getTracks().forEach(t=>t.stop()); faceCamStream=null } }

// ── Stimme (Web Audio FFT) ────────────────────────────────────────────────────

function fftMags(samples) {
  let n = 256; while (n < Math.min(samples.length, 4096)) n <<= 1
  const re = new Float32Array(n), im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = (samples[i]||0) * (0.5*(1-Math.cos(2*Math.PI*i/(n-1))))
  // bit-reversal
  for (let i=1,j=0; i<n; i++) { let b=n>>1; for(;j&b;b>>=1)j^=b; j^=b; if(i<j){let t=re[i];re[i]=re[j];re[j]=t} }
  // butterfly
  for (let len=2; len<=n; len<<=1) {
    const ang = -2*Math.PI/len
    const wr0 = Math.cos(ang), wi0 = Math.sin(ang)
    for (let i=0; i<n; i+=len) {
      let wr=1, wi=0
      for (let j=0; j<(len>>1); j++) {
        const k=i+j, l=k+(len>>1), tr=re[l]*wr-im[l]*wi, ti=re[l]*wi+im[l]*wr
        re[l]=re[k]-tr; im[l]=im[k]-ti; re[k]+=tr; im[k]+=ti
        const nw=wr*wr0-wi*wi0; wi=wr*wi0+wi*wr0; wr=nw
      }
    }
  }
  const mags = new Float32Array(n>>1)
  for (let i=0; i<n>>1; i++) mags[i]=Math.sqrt(re[i]*re[i]+im[i]*im[i])
  return mags
}

function spectralEnvelope(buf) {
  const s = buf.getChannelData(0), frameSize=2048, hop=512
  const env = new Float64Array(frameSize>>1); let cnt=0
  for (let start=0; start+frameSize<=s.length; start+=hop, cnt++) {
    const frame = s.slice(start, start+frameSize)
    const mags = fftMags(frame)
    for (let i=0; i<env.length; i++) env[i] += Math.log1p(mags[i])
  }
  if (cnt>0) for (let i=0; i<env.length; i++) env[i]/=cnt
  return env
}

function cosineSim(a, b) {
  let dot=0, na=0, nb=0; const n=Math.min(a.length,b.length)
  for (let i=0;i<n;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}
  return dot/(Math.sqrt(na*nb)+1e-10)
}

function recordAudio(stream, ms) {
  return new Promise((resolve, reject) => {
    const chunks=[]; const mr=new MediaRecorder(stream)
    mr.ondataavailable = e => e.data.size && chunks.push(e.data)
    mr.onstop = () => new Blob(chunks).arrayBuffer().then(resolve).catch(reject)
    mr.onerror = reject; mr.start(); setTimeout(()=>mr.stop(), ms)
  })
}

async function doVoice(challengeId) {
  verifyState.voice = 'verifying'; voiceScore.value = 0
  try {
    // 1. Vault-Audio laden
    const listRes = await fetch('/api/vault/audio', { headers: authHeaders() })
    const listData = await listRes.json()
    const refUrl = listData.active_url || listData.files?.[0]?.url
    if (!refUrl) throw new Error('Keine Stimme im Vault')

    const refBuf = await fetch(refUrl, { headers: authHeaders() }).then(r => r.arrayBuffer())

    // 2. Mikrofon aufnehmen
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false })
    verifyState.voice = 'recording'; recCountdown.value = 3
    const recTimer = setInterval(() => { recCountdown.value--; if(recCountdown.value<=0) clearInterval(recTimer) }, 1000)
    const recBuf = await recordAudio(stream, 3000)
    clearInterval(recTimer)
    stream.getTracks().forEach(t => t.stop())

    verifyState.voice = 'comparing'

    // 3. Spektralvergleich
    const ctx = new AudioContext()
    const [refDecoded, recDecoded] = await Promise.all([
      ctx.decodeAudioData(refBuf),
      ctx.decodeAudioData(recBuf),
    ])
    ctx.close()

    const score = cosineSim(spectralEnvelope(refDecoded), spectralEnvelope(recDecoded))
    voiceScore.value = score
    const ok = score > 0.78
    verifyState.voice = ok ? 'verified' : 'failed'
    await submitResult('voice', ok, challengeId)
  } catch(_) { verifyState.voice = 'failed' }
}

// ── 2FA Wallet (ethers signMessage) ──────────────────────────────────────────
const twoFaState = ref('idle') // idle | signing | done
const twoFaError = ref('')
const verifiedLevel = ref('') // '' | 'biometric' | '2fa'
const walletShort = ref('')

async function do2FA() {
  twoFaError.value = ''; twoFaState.value = 'signing'
  try {
    const { BrowserProvider } = await import('ethers')
    if (!window.ethereum) throw new Error('Kein Web3-Wallet gefunden. MetaMask oder kompatibles Wallet installieren.')
    const provider = new BrowserProvider(window.ethereum)
    await provider.send('eth_requestAccounts', [])
    const signer  = await provider.getSigner()
    const address = await signer.getAddress()
    const cid     = activeChallengeId || ('vc_' + Date.now().toString(16))
    const signature = await signer.signMessage(cid)

    const r = await fetch('/api/verify/2fa', { method:'POST', headers:authHeaders(), body:JSON.stringify({ challenge_id:cid, signature, address }) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Fehler')

    verifiedLevel.value = '2fa'
    walletShort.value   = address.slice(0,6) + '…' + address.slice(-4)
    twoFaState.value    = 'done'
  } catch(e) {
    twoFaError.value = e.message || 'Wallet-Signatur fehlgeschlagen'
    twoFaState.value = 'idle'
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
pollPendingChallenge()
challengePollTimer = setInterval(pollPendingChallenge, 8000)

onUnmounted(() => {
  clearInterval(pollTimer); clearInterval(countdownTimer); clearInterval(challengePollTimer)
  stopCamera()
})

// ── Navigation ────────────────────────────────────────────────────────────────
function lockGate() { document.cookie='sys_token=; Max-Age=0; path=/'; window.location.href='/gate' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/einrichten', soul:'/soul', chronik:'/chronik', files:'/dateien', maturity:'/reife', calendar:'/kalender', anchor:'/verankern', export:'/exportieren', peers:'/peers', market:'/marketplace', earnings:'/einnahmen', settings:'/einstellungen' }
  if (id === 'connect') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}
</script>

<style scoped>
.cn-page { max-width:860px; margin:0 auto; padding:32px clamp(16px,3vw,32px) 80px; }

/* Header */
.cn-head { padding-bottom:28px; border-bottom:1px solid var(--line); margin-bottom:32px; }
.cn-title { font-family:var(--serif); font-size:clamp(28px,4vw,42px); font-weight:400; letter-spacing:-0.03em; color:var(--fg); line-height:1.05; margin:8px 0 12px; }
.cn-title em { font-style:italic; color:var(--accent); }
.cn-lede { font-size:15px; line-height:1.65; color:var(--fg); max-width:560px; margin:0; }

/* Section label */
.cn-section-label { font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--fg); margin-bottom:12px; }

/* MCP Banner */
.cn-mcp-banner { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px; margin-bottom:24px; border:1px solid rgba(109,184,154,0.35); border-radius:var(--r); background:var(--accent-dim); }
.cn-mcp-banner-left { display:flex; align-items:center; gap:12px; min-width:0; }
.cn-mcp-ic { width:40px; height:40px; flex:none; border-radius:var(--r-xs); background:rgba(109,184,154,0.2); display:flex; align-items:center; justify-content:center; color:var(--accent); }
.cn-mcp-ic svg { width:20px; height:20px; }
.cn-mcp-title { font-family:var(--sans); font-size:14px; font-weight:600; color:var(--fg); }
.cn-mcp-sub   { font-family:var(--mono); font-size:11px; color:var(--fg); margin-top:2px; }
.cn-mcp-btn { height:38px; padding:0 16px; flex:none; background:var(--accent); border:none; border-radius:var(--r-xs); font-family:var(--sans); font-size:13px; font-weight:600; color:var(--on-accent); cursor:pointer; transition:background 0.15s; }
.cn-mcp-btn:hover { background:var(--accent-bright); }

/* QR Action card */
.cn-action-card { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 22px; margin-bottom:32px; border:1px solid var(--line); border-radius:var(--r); background:var(--surface); }
.cn-action-left { display:flex; align-items:center; gap:16px; min-width:0; }
.cn-action-ic { width:48px; height:48px; flex:none; border-radius:var(--r-xs); background:var(--accent-dim); border:1px solid rgba(109,184,154,0.25); display:flex; align-items:center; justify-content:center; color:var(--accent); }
.cn-action-ic svg { width:22px; height:22px; }
.cn-action-title { font-family:var(--sans); font-size:15px; font-weight:600; color:var(--fg); }
.cn-action-sub   { font-family:var(--mono); font-size:12px; color:var(--fg); margin-top:2px; }
.cn-action-btn { display:inline-flex; align-items:center; gap:8px; flex:none; height:40px; padding:0 18px; border:1px solid rgba(109,184,154,0.40); border-radius:var(--r-xs); background:var(--accent-dim); cursor:pointer; font-family:var(--sans); font-size:14px; font-weight:500; color:var(--accent-bright); transition:all 0.15s; }
.cn-action-btn:hover:not(:disabled) { background:rgba(109,184,154,0.18); color:var(--fg); }
.cn-action-btn:disabled { opacity:0.4; cursor:not-allowed; }
.cn-action-btn--active { background:var(--surface-2); border-color:var(--line-2); color:var(--fg-3); }
.cn-btn-ic { width:16px; height:16px; flex:none; }

/* QR Dual panel */
.cn-dual { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid var(--line); border-radius:var(--r); overflow:hidden; margin-bottom:40px; }
.cn-panel { display:flex; flex-direction:column; min-height:300px; }
.cn-panel--owner   { border-right:1px solid var(--line); background:var(--surface); }
.cn-panel--stranger { background:var(--surface-2); }
.cn-panel-label { display:flex; align-items:center; gap:8px; padding:12px 20px; border-bottom:1px solid var(--line); font-family:var(--mono); font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--fg); }
.cn-label-ic { width:14px; height:14px; flex:none; }
.cn-panel-body { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px 24px; gap:14px; text-align:center; }
.cn-qr-canvas { image-rendering:pixelated; border-radius:4px; }
.cn-countdown { display:flex; flex-direction:column; align-items:center; gap:2px; }
.cn-countdown-num   { font-family:var(--mono); font-size:28px; color:var(--fg); line-height:1; }
.cn-countdown-label { font-family:var(--mono); font-size:11px; color:var(--fg-4); letter-spacing:0.1em; }
.cn-hint { font-family:var(--mono); font-size:12px; color:var(--fg-3); margin:0; }
.cn-probe-ring { width:52px; height:52px; border-radius:50%; border:2px solid rgba(138,208,179,0.35); display:flex; align-items:center; justify-content:center; color:var(--accent-bright); animation:probe-pulse 1.8s ease-in-out infinite; }
.cn-probe-ring svg { width:22px; height:22px; }
@keyframes probe-pulse { 0%,100%{opacity:0.5;transform:scale(1)}50%{opacity:1;transform:scale(1.08)} }
.cn-probe-title { font-family:var(--serif); font-size:20px; font-weight:400; color:var(--fg); }
.cn-probe-hint  { font-family:var(--mono); font-size:12px; color:var(--fg-3); margin:0; }
.cn-approve-actions { display:flex; gap:10px; }
.cn-btn { height:40px; padding:0 20px; font-family:var(--sans); font-size:14px; font-weight:500; border-radius:var(--r-xs); cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:6px; }
.cn-btn--reject { background:transparent; border:1px solid var(--line-2); color:var(--fg-2); }
.cn-btn--reject:hover { color:#e06c75; border-color:rgba(224,108,117,0.35); }
.cn-btn--accept { background:var(--accent); border:1px solid var(--accent); color:var(--on-accent); font-weight:600; }
.cn-btn--accept:hover { background:var(--accent-bright); border-color:var(--accent-bright); }
.cn-btn--done { background:var(--surface-3); border:1px solid var(--line-2); color:var(--fg); font-weight:500; padding:0 40px; height:44px; }
.cn-btn--done:hover { background:var(--surface-2); }
.cn-done-check { width:52px; height:52px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; color:var(--on-accent); }
.cn-done-check--err { background:rgba(224,108,117,0.15); border:1px solid rgba(224,108,117,0.35); color:#e06c75; }
.cn-done-check svg { width:22px; height:22px; }
.cn-done-title { font-family:var(--serif); font-size:22px; font-weight:400; color:var(--fg); }
.cn-stranger-body { background:rgba(0,0,0,0.12); }
.cn-sys-logo { font-family:var(--sans); font-size:22px; font-weight:700; color:var(--fg); letter-spacing:-0.04em; }
.cn-sys-logo span { color:var(--accent); }
.cn-stranger-hint { font-family:var(--mono); font-size:13px; color:var(--fg-3); }
.cn-stranger-ring { width:40px; height:40px; display:flex; align-items:center; justify-content:center; }
.cn-stranger-ring svg { width:40px; height:40px; color:var(--fg-4); }
.cn-hello-msg { font-family:var(--serif); font-style:italic; font-size:18px; color:var(--accent); }
.cn-verified-row { display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:12px; color:var(--fg-3); }
.cn-verified-dot { width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 4px var(--accent-glow); flex:none; }

/* Tiles */
.cn-tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.cn-tile { border:1px solid var(--line); border-radius:var(--r); background:var(--surface); overflow:hidden; transition:border-color 0.2s; }
.cn-tile--active   { border-color:rgba(109,184,154,0.45); }
.cn-tile--verified { border-color:var(--accent); }
.cn-tile--failed   { border-color:rgba(224,108,117,0.45); }
.cn-tile-head { display:flex; align-items:center; gap:12px; padding:16px 18px; border-bottom:1px solid var(--line); }
.cn-tile-ic { width:40px; height:40px; flex:none; border-radius:var(--r-xs); display:flex; align-items:center; justify-content:center; }
.cn-tile-ic svg { width:20px; height:20px; }
.cn-tile-ic--fp    { background:rgba(109,184,154,0.12); color:var(--accent); }
.cn-tile-ic--face  { background:rgba(109,154,184,0.12); color:#6d9ab8; }
.cn-tile-ic--voice { background:rgba(184,154,109,0.12); color:#b89a6d; }
.cn-tile-title { font-family:var(--sans); font-size:14px; font-weight:600; color:var(--fg); }
.cn-tile-sub   { font-family:var(--mono); font-size:11px; color:var(--fg); margin-top:2px; }
.cn-tile-body { padding:16px 18px 20px; display:flex; flex-direction:column; align-items:flex-start; gap:12px; }
.cn-tile-desc { font-family:var(--mono); font-size:12px; color:var(--fg); line-height:1.6; margin:0; }
.cn-tile-btn { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; background:var(--accent-dim); border:1px solid rgba(109,184,154,0.35); border-radius:var(--r-xs); font-family:var(--sans); font-size:13px; font-weight:500; color:var(--accent-bright); cursor:pointer; transition:all 0.15s; }
.cn-tile-btn:hover:not(:disabled) { background:rgba(109,184,154,0.16); }
.cn-tile-btn:disabled { opacity:0.45; cursor:not-allowed; }
.cn-tile-reset { font-family:var(--mono); font-size:11px; color:var(--fg-4); background:none; border:none; cursor:pointer; padding:0; }
.cn-tile-reset:hover { color:var(--fg-2); }
.cn-tile-result { display:flex; align-items:center; gap:6px; font-family:var(--sans); font-size:13px; font-weight:600; }
.cn-tile-result svg { width:16px; height:16px; flex:none; }
.cn-tile-result--ok  { color:var(--accent); }
.cn-tile-result--err { color:#e06c75; }
.cn-score { font-weight:400; font-family:var(--mono); font-size:11px; }
/* Camera */
.cn-cam-wrap { width:100%; border-radius:var(--r-xs); overflow:hidden; background:#000; }
.cn-cam-preview { width:100%; height:150px; object-fit:cover; display:block; transform:scaleX(-1); }
.cn-cam-hint { font-family:var(--mono); font-size:11px; color:var(--fg-3); }
.cn-cam-actions { display:flex; align-items:center; gap:12px; }
/* Comparing spinner */
.cn-comparing-ring { display:flex; align-items:center; gap:10px; }
.cn-comparing-ring svg { width:20px; height:20px; color:var(--accent); }
/* Recording */
.cn-rec-ring { display:flex; align-items:center; gap:10px; }
.cn-rec-dot { width:10px; height:10px; border-radius:50%; background:#e06c75; flex:none; animation:rec-blink 1s ease-in-out infinite; }
@keyframes rec-blink { 0%,100%{opacity:1}50%{opacity:0.2} }
.cn-rec-label { font-family:var(--mono); font-size:12px; color:var(--fg); }

/* 2FA card */
.cn-2fa-card { margin-top:24px; padding:20px 22px; border:1px solid rgba(109,184,154,0.3); border-radius:var(--r); background:var(--surface); }
.cn-2fa-head { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.cn-2fa-ic { width:40px; height:40px; flex:none; border-radius:var(--r-xs); background:var(--accent-dim); display:flex; align-items:center; justify-content:center; color:var(--accent); }
.cn-2fa-ic svg { width:20px; height:20px; }
.cn-2fa-title { font-family:var(--sans); font-size:15px; font-weight:600; color:var(--fg); }
.cn-2fa-sub   { font-family:var(--mono); font-size:11px; color:var(--fg); margin-top:2px; }
.cn-2fa-btn { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; background:var(--accent); border:none; border-radius:var(--r-xs); font-family:var(--sans); font-size:14px; font-weight:600; color:var(--on-accent); cursor:pointer; transition:background 0.15s; }
.cn-2fa-btn:hover { background:var(--accent-bright); }
.cn-2fa-verified { display:flex; align-items:center; gap:8px; font-family:var(--sans); font-size:14px; font-weight:600; color:var(--accent); }
.cn-2fa-verified svg { width:18px; height:18px; flex:none; }
.cn-2fa-pending { display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:12px; color:var(--fg-3); }
.cn-2fa-pending svg { width:16px; height:16px; flex:none; }
.cn-2fa-error { font-family:var(--mono); font-size:12px; color:#e06c75; }

/* Animations */
.spin { animation:cn-spin 1s linear infinite; }
@keyframes cn-spin { to{transform:rotate(360deg)} }
.spin-slow { animation:cn-spin 3s linear infinite; }
.slide-down-enter-active, .slide-down-leave-active { transition:all 0.25s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity:0; transform:translateY(-8px); }

/* Mobile */
@media (max-width:860px) { .cn-tiles{grid-template-columns:1fr} .cn-dual{grid-template-columns:1fr} .cn-panel--owner{border-right:none;border-bottom:1px solid var(--line)} .cn-mcp-banner{flex-direction:column;align-items:flex-start} }
@media (max-width:600px) { .cn-action-card{flex-direction:column;align-items:flex-start} }
</style>
