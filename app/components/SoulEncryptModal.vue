<template>
  <Teleport to="body">
    <Transition name="sys-modal" appear>
      <div
        v-if="isOpen"
        class="senc-overlay"
        @click.self="handleClose"
        role="dialog"
        aria-modal="true"
        aria-label="Soul verschlüsseln"
      >
        <div class="senc-panel">

          <!-- ═══════════ HEADER ═══════════ -->
          <header class="senc-head">
            <div class="senc-head-labels">
              <div class="senc-head-kicker">Vault · Sicherung</div>
              <h2 class="senc-head-title">Soul exportieren<em>.</em></h2>
            </div>
            <button class="senc-close" @click="handleClose" aria-label="Schließen">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <!-- ═══════════ STEP RAIL ═══════════ -->
          <nav class="senc-rail" aria-label="Schritte">
            <div
              v-for="(s, i) in [
                { title: 'Schlüssel', sub: 'Wörter wählen' },
                { title: 'Prüfen', sub: 'Bestätigen' },
                { title: 'Fertig', sub: 'Gesichert' },
              ]"
              :key="i"
              class="senc-rail-item"
              :class="{ on: step === i, done: step > i }"
            >
              <span class="senc-num">
                <span v-if="step > i" class="senc-check">✓</span>
                <span v-else>{{ i + 1 }}</span>
              </span>
              <span class="senc-lbl">
                <span class="senc-t">{{ s.title }}</span>
                <span class="senc-sub">{{ s.sub }}</span>
              </span>
            </div>
          </nav>

          <!-- ═══════════ BODY ═══════════ -->
          <div class="senc-body">

            <!-- ── Schritt 0: 12 Wörter eingeben ── -->
            <template v-if="step === 0">
              <p class="senc-kicker">Schritt 1 / 3</p>
              <h2 class="senc-title">Deine 12 <em>Schlüsselwörter</em></h2>
              <p class="senc-prose">
                Wähle 12 Wörter — auf Deutsch, Englisch oder gemischt.
                Nur Buchstaben, keine Zahlen. Nur du kennst sie.
              </p>

              <datalist id="bip39-words">
                <option v-for="w in BIP39" :key="w" :value="w" />
              </datalist>

              <div class="senc-words-grid">
                <div
                  v-for="(_, i) in 12"
                  :key="i"
                  class="senc-word-row"
                  :class="{
                    valid: userWords[i] && isValid(userWords[i]),
                    invalid: userWords[i] && !isValid(userWords[i])
                  }"
                >
                  <span class="senc-word-num">{{ i + 1 }}</span>
                  <input
                    :id="`word-${i}`"
                    :aria-label="`Schlüsselwort ${i + 1} von 12`"
                    list="bip39-words"
                    :value="userWords[i]"
                    autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
                    maxlength="12" placeholder="wort…"
                    class="senc-word-input"
                    @input="sanitizeWord(i, $event)"
                  />
                  <svg v-if="userWords[i] && isValid(userWords[i])" class="senc-word-icon ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                  </svg>
                  <svg v-else-if="userWords[i]" class="senc-word-icon err" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                  </svg>
                </div>
              </div>

              <div class="senc-meta-row">
                <span class="senc-count">
                  <span :class="{ 'senc-count-full': validCount === 12 }">{{ validCount }}</span>
                  / 12 gültig
                </span>
                <button class="senc-random" @click="fillRandom">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Zufällig füllen
                </button>
              </div>

              <div class="senc-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p>
                  Diese 12 Wörter sind dein einziger Schlüssel. Notiere sie offline –
                  sie können nicht wiederhergestellt werden.
                </p>
              </div>
            </template>

            <!-- ── Schritt 1: Bestätigen ── -->
            <template v-else-if="step === 1">
              <p class="senc-kicker">Schritt 2 / 3</p>
              <h2 class="senc-title"><em>Bestätigen</em></h2>
              <p class="senc-prose">
                Letzte Prüfung. Danach wird der Vault verschlüsselt und als
                <code class="senc-code">.soul</code>-Datei gespeichert.
              </p>

              <div class="senc-words-grid readonly">
                <div
                  v-for="(word, i) in Array.from(userWords)"
                  :key="i"
                  class="senc-word-row-ro"
                >
                  <span class="senc-word-num">{{ i + 1 }}</span>
                  <span class="senc-word-ro">{{ word }}</span>
                </div>
              </div>

              <label class="senc-confirm-label">
                <div
                  class="senc-checkbox"
                  :class="{ checked: confirmed }"
                  @click="confirmed = !confirmed"
                  role="checkbox"
                  :aria-checked="confirmed"
                >
                  <svg v-if="confirmed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                  </svg>
                </div>
                <span class="senc-confirm-text" @click="confirmed = !confirmed">
                  Ich habe alle 12 Wörter sicher offline notiert.
                </span>
              </label>
            </template>

            <!-- ── Schritt 2: Ergebnis ── -->
            <template v-else-if="step === 2">
              <p class="senc-kicker">Schritt 3 / 3</p>
              <h2 class="senc-title">
                <em>{{ isEncrypting ? 'Verschlüsseln…' : encryptError ? 'Fehler' : 'Vault gesichert' }}</em>
              </h2>

              <!-- Spinner -->
              <div v-if="isEncrypting" class="senc-state-center">
                <svg class="senc-spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"/>
                  <path fill="currentColor" fill-opacity="0.75" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p class="senc-state-label">
                  {{ isFetchingVps ? 'VPS-Vault wird geladen…' : 'Soul & Vault werden verschlüsselt…' }}
                </p>
              </div>

              <!-- Fehler -->
              <div v-else-if="encryptError" class="senc-state-center">
                <div class="senc-icon-wrap err">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                  </svg>
                </div>
                <p class="senc-state-label err">{{ encryptError }}</p>
                <button class="senc-back-btn" @click="step = 1; encryptError = null">Zurück</button>
              </div>

              <!-- Erfolg -->
              <div v-else class="senc-success">
                <div class="senc-icon-wrap ok">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/>
                  </svg>
                </div>
                <div class="senc-success-text">
                  <p class="senc-success-title">Vault gesichert</p>
                  <p class="senc-success-sub">sys.md · Bilder · Stimme · Motion · AES-256-GCM · 12 Wörter</p>
                </div>

                <div class="senc-info-box">
                  <p>
                    Deine <code class="senc-code">.soul</code>-Datei wurde heruntergeladen.
                    Bewahre sie sicher auf – sie enthält deinen verschlüsselten Vault.
                  </p>
                </div>

                <div v-if="vpsWarning" class="senc-warning warn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <p>{{ vpsWarning }}</p>
                </div>
              </div>
            </template>

          </div>

          <!-- ═══════════ FOOTER ═══════════ -->
          <footer class="senc-foot">
            <!-- Step 0 -->
            <template v-if="step === 0">
              <div class="senc-foot-left">
                <button class="senc-btn senc-btn-ghost" @click="handleClose">Abbrechen</button>
              </div>
              <button class="senc-btn senc-btn-primary" :disabled="!allValid" @click="step = 1">Weiter →</button>
            </template>

            <!-- Step 1 -->
            <template v-else-if="step === 1">
              <div class="senc-foot-left">
                <button class="senc-btn senc-btn-ghost" @click="step = 0">← Zurück</button>
              </div>
              <button class="senc-btn senc-btn-primary" :disabled="!confirmed" @click="handleEncrypt">Verschlüsseln</button>
            </template>

            <!-- Step 2 done -->
            <template v-else-if="step === 2 && !isEncrypting && !encryptError">
              <div class="senc-foot-left"></div>
              <button class="senc-btn senc-btn-primary" @click="handleClose">Fertig</button>
            </template>

            <!-- Step 2 loading / error — no footer buttons -->
            <template v-else>
              <div></div>
              <div></div>
            </template>
          </footer>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { BIP39, generateMnemonicWords, useSoulEncrypt } from '~/composables/useSoulEncrypt.js'
import { useApiContext } from '~/composables/useApiContext.js'

const { soulContent, soulMeta, soulToken } = useSoul()
const { syncedFiles, fetchVpsVaultFiles } = useApiContext()

const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close'])

const { readAllVaultFiles, isConnected: vaultConnected } = useVault()
const { mnemonic, isEncrypting, encryptError, encrypt } = useSoulEncrypt()

const step          = ref(0)
const confirmed     = ref(false)
const sheetEl       = ref(null)
const isFetchingVps = ref(false)
const vpsWarning    = ref('')

// ── 12-Wörter-Logik ──────────────────────────────────────────────────────────
const userWords  = reactive(new Array(12).fill(''))
const WORD_RE    = /^[a-zäöüß]{3,12}$/

function sanitize(raw) {
  return String(raw ?? '').normalize('NFC').toLowerCase().replace(/[^a-zäöüß]/g, '').slice(0, 12)
}
function sanitizeWord(i, event) {
  const clean = sanitize(event.target.value)
  userWords[i] = clean
  if (event.target.value !== clean) {
    const pos = event.target.selectionStart
    event.target.value = clean
    event.target.setSelectionRange(pos, pos)
  }
}
function isValid(w)   { return WORD_RE.test(w ?? '') }
function wordState(i) {
  const w = userWords[i]
  if (!w) return 'border-[var(--sys-border)]'
  return isValid(w) ? 'border-emerald-500/35' : 'border-red-500/35'
}
const validCount = computed(() => userWords.filter(w => isValid(w)).length)
const allValid   = computed(() => validCount.value === 12)
function fillRandom() {
  const words = generateMnemonicWords()
  for (let i = 0; i < 12; i++) userWords[i] = words[i] ?? ''
}
function resetWords() { for (let i = 0; i < 12; i++) userWords[i] = '' }

// ── Verschlüsseln ─────────────────────────────────────────────────────────────
async function handleEncrypt() {
  step.value = 2
  encryptError.value = null
  isEncrypting.value = true

  try {
    // 1. Lokale Vault-Dateien (falls verbunden)
    const localFiles = vaultConnected.value ? await readAllVaultFiles() : []

    // 2. VPS-Dateien holen – nur Dateien die lokal noch nicht vorhanden sind.
    //    Basisnamen der lokalen Dateien als Skip-Set übergeben → kein unnötiger
    //    Download großer Video-/Audio-Dateien die der lokale Vault bereits enthält.
    const localBaseNames = new Set(localFiles.map(f => f.name.split('/').pop()))
    const totalSynced = (syncedFiles.value.audio?.length  ?? 0) +
                        (syncedFiles.value.video?.length  ?? 0) +
                        (syncedFiles.value.images?.length ?? 0) +
                        (syncedFiles.value.context?.length ?? 0)
    const vpsOnlyCount = ['audio', 'video', 'images', 'context'].reduce((sum, cat) =>
      sum + (syncedFiles.value[cat] || []).filter(n => !localBaseNames.has(n.split('/').pop())).length, 0)

    const hasVpsFiles = soulToken.value && vpsOnlyCount > 0

    let vpsFiles = []
    vpsWarning.value = ''
    if (hasVpsFiles) {
      isFetchingVps.value = true
      vpsFiles = await fetchVpsVaultFiles(soulToken.value, localBaseNames)
      isFetchingVps.value = false
      const skipped = vpsOnlyCount - vpsFiles.length
      if (skipped > 0) {
        vpsWarning.value = `${skipped} VPS-Datei(en) konnten nicht geladen werden (Vault-Session abgelaufen oder Timeout). Nur lokale Dateien wurden eingebunden.`
      }
    }

    // 3. Mergen: lokale Dateien haben Vorrang bei gleichem Basisnamen
    // localBaseNames wurde oben bereits deklariert (VPS-Skip-Optimierung)
    const extraVpsFiles = vpsFiles.filter(f => !localBaseNames.has(f.name.split('/').pop()))
    const allFiles       = [...localFiles, ...extraVpsFiles]

    const name  = soulMeta.value?.name || 'soul'
    const clean = Array.from(userWords).map(sanitize)
    if (clean.length !== 12 || !clean.every(w => isValid(w))) {
      encryptError.value = 'Alle 12 Felder müssen gültige Wörter enthalten.'
      return
    }
    mnemonic.value = clean
    await encrypt(soulContent.value, allFiles, name)
  } finally {
    isFetchingVps.value = false
    isEncrypting.value  = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
watch(() => props.isOpen, (val) => {
  if (val) {
    step.value          = 0
    confirmed.value     = false
    encryptError.value  = null
    isFetchingVps.value = false
    vpsWarning.value    = ''
    resetWords()
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

function handleClose() {
  if (isEncrypting.value) return
  emit('close')
}
</script>

<style scoped>
/* ── Design tokens ─────────────────────────────────────── */
.senc-overlay {
  --ink:          #08070c;
  --paper:        #12101a;
  --paper-2:      #1a1726;
  --paper-3:      #0d0b14;
  --rule:         rgba(226,220,240,0.10);
  --rule-2:       rgba(226,220,240,0.20);
  --fg:           #ece7f5;
  --fg-2:         rgba(236,231,245,0.72);
  --fg-3:         rgba(236,231,245,0.48);
  --fg-4:         rgba(236,231,245,0.30);
  --accent:       #8b5cf6;
  --accent-2:     rgba(139,92,246,0.14);
  --accent-bright:#a78bfa;
  --on-accent:    #0a0810;
  --ok:           #b8dcc4;
  --err:          #f0a3a3;
  --serif:        'Noto Serif', Georgia, serif;
  --sans:         'Inter', system-ui, sans-serif;
  --mono:         'JetBrains Mono', ui-monospace, monospace;

  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(7,6,11,0.78);
  backdrop-filter: blur(10px);
}

/* ── Panel ─────────────────────────────────────────────── */
.senc-panel {
  position: relative;
  width: 100%; max-width: 540px;
  max-height: 92dvh;
  background: var(--paper);
  border: 1px solid var(--rule-2);
  border-radius: 16px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
}

/* ── Head ──────────────────────────────────────────────── */
.senc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 8px 16px;
  background: var(--paper-3);
}

.senc-head-labels { display: flex; flex-direction: column; gap: 2px; }
.senc-head-kicker {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.24em;
  text-transform: uppercase; color: var(--accent);
}
.senc-head-title {
  font-family: var(--serif); font-size: 22px; font-weight: 400;
  letter-spacing: -0.02em; color: var(--fg); line-height: 1; margin: 0;
}
.senc-head-title em { font-style: italic; color: var(--accent); }

.senc-close {
  width: 36px; height: 36px; flex: none;
  border: 1px solid var(--rule-2); background: transparent; cursor: pointer;
  color: var(--fg-3); font-size: 22px; line-height: 1; font-family: var(--sans);
  display: flex; align-items: center; justify-content: center;
  transition: color 0.12s, border-color 0.12s; padding: 0;
}
.senc-close:hover { color: var(--fg); border-color: var(--accent); background: var(--accent-2); }

/* ── Rail ──────────────────────────────────────────────── */
.senc-rail {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-3);
}

.senc-rail-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-right: 1px solid var(--rule);
  opacity: 0.4;
  transition: opacity 0.2s;
}
.senc-rail-item:last-child { border-right: none; }
.senc-rail-item.on  { opacity: 1; }
.senc-rail-item.done { opacity: 0.7; }

.senc-num {
  width: 22px; height: 22px; flex: none;
  border: 1px solid var(--rule-2); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-size: 10px;
  color: var(--fg-3);
  transition: background 0.2s, color 0.2s;
}
.senc-rail-item.on  .senc-num { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.senc-rail-item.done .senc-num { background: rgba(184,220,196,0.15); border-color: var(--ok); color: var(--ok); }

.senc-check { font-size: 10px; line-height: 1; }

.senc-lbl { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.senc-t   { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.senc-sub { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; color: var(--fg-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Body ──────────────────────────────────────────────── */
.senc-body {
  overflow-y: auto;
  padding: 28px 32px;
  min-height: 0;
}

.senc-kicker {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--fg-3); margin-bottom: 6px;
}
.senc-title {
  font-family: var(--serif); font-size: clamp(22px, 3vw, 28px); font-weight: 400;
  letter-spacing: -0.02em; color: var(--fg); margin: 0 0 10px;
}
.senc-title em { font-style: italic; color: var(--accent); }
.senc-prose {
  font-family: var(--serif); font-size: 15px; color: var(--fg-2);
  line-height: 1.6; margin: 0 0 24px; max-width: 60ch; text-wrap: pretty;
}
.senc-code {
  font-family: var(--mono); font-size: 12px; color: var(--fg-2);
  background: var(--paper-3); padding: 1px 5px; border-radius: 3px;
}

/* ── Words grid ────────────────────────────────────────── */
.senc-words-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 6px; margin-bottom: 16px;
}

.senc-word-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--paper-3);
  border: 1px solid var(--rule);
  transition: border-color 0.15s;
}
.senc-word-row.valid   { border-color: rgba(184,220,196,0.35); }
.senc-word-row.invalid { border-color: rgba(240,163,163,0.35); }

.senc-word-num {
  font-family: var(--mono); font-size: 10px; color: var(--fg-4);
  width: 16px; flex: none; text-align: right;
}
.senc-word-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  font-family: var(--mono); font-size: 13px; font-weight: 700;
  color: var(--fg);
}
.senc-word-input::placeholder { color: var(--fg-4); font-weight: 400; }

.senc-word-icon { width: 12px; height: 12px; flex: none; }
.senc-word-icon.ok  { color: var(--ok); opacity: 0.7; }
.senc-word-icon.err { color: var(--err); opacity: 0.7; }

/* ── Meta row ──────────────────────────────────────────── */
.senc-meta-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.senc-count {
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
}
.senc-count-full { color: var(--fg); }

.senc-random {
  display: flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  font-family: var(--mono); font-size: 11px; color: var(--fg-3);
  transition: color 0.12s;
}
.senc-random:hover { color: var(--fg); }
.senc-random svg { width: 12px; height: 12px; flex: none; }

/* ── Warning box ───────────────────────────────────────── */
.senc-warning {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--rule-2);
  margin-bottom: 8px;
}
.senc-warning svg { width: 16px; height: 16px; flex: none; color: var(--fg-3); margin-top: 1px; }
.senc-warning p   { font-family: var(--sans); font-size: 12px; color: var(--fg-3); line-height: 1.5; margin: 0; }
.senc-warning.warn svg { color: rgba(251,191,36,0.7); }
.senc-warning.warn p   { color: rgba(251,191,36,0.7); }

/* ── Readonly word grid (step 1) ───────────────────────── */
.senc-words-grid.readonly { margin-bottom: 20px; }

.senc-word-row-ro {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--paper-3);
  border: 1px solid var(--rule);
}
.senc-word-ro {
  font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--fg);
}

/* ── Confirm checkbox ──────────────────────────────────── */
.senc-confirm-label {
  display: flex; align-items: flex-start; gap: 12px;
  cursor: pointer; margin-bottom: 4px;
}
.senc-checkbox {
  width: 20px; height: 20px; flex: none; margin-top: 1px;
  border: 1px solid var(--rule-2);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.senc-checkbox.checked { background: var(--fg); border-color: var(--fg); }
.senc-checkbox svg { width: 12px; height: 12px; color: var(--paper); }
.senc-confirm-text {
  font-family: var(--sans); font-size: 13px; color: var(--fg-2); line-height: 1.5;
  user-select: none;
}

/* ── State center (step 2) ─────────────────────────────── */
.senc-state-center {
  display: flex; flex-direction: column; align-items: center;
  gap: 16px; padding: 32px 0;
  text-align: center;
}
.senc-state-label {
  font-family: var(--sans); font-size: 14px; color: var(--fg-2);
}
.senc-state-label.err { color: var(--err); }

.senc-spinner {
  width: 40px; height: 40px;
  animation: senc-spin 1s linear infinite;
  color: var(--fg-2);
}
@keyframes senc-spin { to { transform: rotate(360deg); } }

.senc-icon-wrap {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.senc-icon-wrap.ok  { background: rgba(184,220,196,0.10); border: 1px solid rgba(184,220,196,0.25); }
.senc-icon-wrap.ok  svg { width: 24px; height: 24px; color: var(--ok); opacity: 0.7; }
.senc-icon-wrap.err { background: rgba(240,163,163,0.10); border: 1px solid rgba(240,163,163,0.25); }
.senc-icon-wrap.err svg { width: 24px; height: 24px; color: var(--err); opacity: 0.8; }

.senc-back-btn {
  padding: 8px 20px; border: 1px solid var(--rule-2);
  background: transparent; color: var(--fg-3); cursor: pointer;
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em;
  transition: color 0.12s, border-color 0.12s;
}
.senc-back-btn:hover { color: var(--fg); border-color: var(--rule-2); }

/* ── Success (step 2) ──────────────────────────────────── */
.senc-success {
  display: flex; flex-direction: column; gap: 16px; padding: 8px 0;
}
.senc-success .senc-icon-wrap { align-self: center; }
.senc-success-text { text-align: center; }
.senc-success-title {
  font-family: var(--serif); font-size: 16px; font-weight: 400; color: var(--fg);
  margin-bottom: 4px;
}
.senc-success-sub {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
  color: var(--fg-3);
}
.senc-info-box {
  padding: 14px 16px;
  background: var(--paper-3); border: 1px solid var(--rule);
}
.senc-info-box p {
  font-family: var(--sans); font-size: 12px; color: var(--fg-3); line-height: 1.6; margin: 0;
}

/* ── Footer ────────────────────────────────────────────── */
.senc-foot {
  display: grid; grid-template-columns: 1fr auto;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid var(--rule);
  background: var(--paper-3);
  gap: 12px;
}
.senc-foot-left { display: flex; align-items: center; }

/* ── Buttons ───────────────────────────────────────────── */
.senc-btn {
  height: 44px; padding: 0 20px;
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.1em;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.senc-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.senc-btn-primary {
  background: var(--accent); border: 1px solid var(--accent);
  color: var(--on-accent);
}
.senc-btn-primary:hover:not(:disabled) {
  background: var(--accent-bright); border-color: var(--accent-bright);
  box-shadow: 0 6px 20px rgba(139,92,246,0.35);
}

.senc-btn-ghost {
  background: transparent; border: 1px solid var(--rule-2);
  color: var(--fg-3);
}
.senc-btn-ghost:hover { color: var(--fg); border-color: var(--rule-2); }

/* ── Transitions ───────────────────────────────────────── */
.sys-modal-enter-active, .sys-modal-leave-active { transition: opacity 0.2s; }
.sys-modal-enter-active .senc-panel, .sys-modal-leave-active .senc-panel { transition: transform 0.25s ease, opacity 0.2s; }
.sys-modal-enter-from { opacity: 0; }
.sys-modal-enter-from .senc-panel { transform: translateY(20px) scale(0.98); opacity: 0; }
.sys-modal-leave-to { opacity: 0; }
.sys-modal-leave-to .senc-panel { transform: translateY(20px) scale(0.98); opacity: 0; }

/* ── Mobile ────────────────────────────────────────────── */
@media (max-width: 639px) {
  .senc-overlay { padding: 12px; }
  .senc-panel { max-height: calc(100dvh - 24px); }
  .senc-body { padding: 20px 16px; }
  .senc-foot { padding: 12px 16px; }
  .senc-lbl { display: none; }
}
</style>
