<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="export" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_tools'), $t('nav.export')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
          <div class="page exp-page">

            <!-- ── Header ── -->
            <div class="exp-head">
              <div class="eyebrow">{{ $t('encrypt.kicker') }}</div>
              <h1 class="exp-title">{{ $t('encrypt.title') }}</h1>
            </div>

            <!-- ── Step rail ── -->
            <nav class="exp-rail" :aria-label="$t('encrypt.steps_aria')">
              <div
                v-for="(s, i) in STEPS"
                :key="i"
                class="exp-step"
                :class="{ 'exp-step--on': step === i, 'exp-step--done': step > i }"
              >
                <span class="exp-step-num">
                  <svg v-if="step > i" class="exp-step-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                  </svg>
                  <span v-else>{{ i + 1 }}</span>
                </span>
                <span class="exp-step-lbl">
                  <span class="exp-step-title">{{ s.title }}</span>
                  <span class="exp-step-sub">{{ s.sub }}</span>
                </span>
              </div>
            </nav>

            <!-- ── Body ── -->
            <div class="exp-body">

              <!-- Step 0: 12 Wörter eingeben -->
              <template v-if="step === 0">
                <h2 class="exp-section-title">{{ $t('encrypt.words_title') }}</h2>
                <p class="exp-prose">{{ $t('encrypt.words_prose') }}</p>

                <datalist id="bip39-words">
                  <option v-for="w in BIP39" :key="w" :value="w" />
                </datalist>

                <div class="exp-words-grid">
                  <div
                    v-for="(_, i) in 12"
                    :key="i"
                    class="exp-word-row"
                    :class="{
                      'exp-word-row--valid':   userWords[i] && isValid(userWords[i]),
                      'exp-word-row--invalid': userWords[i] && !isValid(userWords[i])
                    }"
                  >
                    <span class="exp-word-num">{{ i + 1 }}</span>
                    <input
                      :id="`word-${i}`"
                      :aria-label="$t('encrypt.word_aria', { n: i + 1 })"
                      list="bip39-words"
                      :value="userWords[i]"
                      autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
                      maxlength="12" :placeholder="$t('encrypt.word_placeholder')"
                      class="exp-word-input"
                      @input="sanitizeWord(i, $event)"
                    />
                    <svg v-if="userWords[i] && isValid(userWords[i])" class="exp-word-ic ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                    </svg>
                    <svg v-else-if="userWords[i]" class="exp-word-ic err" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                    </svg>
                  </div>
                </div>

                <div class="exp-meta-row">
                  <span class="exp-count">
                    <span :class="{ 'exp-count--full': validCount === 12 }">{{ validCount }}</span>
                    {{ $t('encrypt.valid_count_suffix') }}
                  </span>
                  <button class="exp-random" @click="fillRandom">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    {{ $t('encrypt.fill_random') }}
                  </button>
                </div>

                <div class="exp-warn-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <p>{{ $t('encrypt.warning') }}</p>
                </div>
              </template>

              <!-- Step 1: Bestätigen -->
              <template v-else-if="step === 1">
                <h2 class="exp-section-title">{{ $t('encrypt.confirm_title') }}</h2>
                <p class="exp-prose">{{ $t('encrypt.confirm_prose') }}</p>

                <div class="exp-words-grid exp-words-grid--ro">
                  <div v-for="(word, i) in Array.from(userWords)" :key="i" class="exp-word-row-ro">
                    <span class="exp-word-num">{{ i + 1 }}</span>
                    <span class="exp-word-ro">{{ word }}</span>
                  </div>
                </div>

                <label class="exp-confirm-label">
                  <div
                    class="exp-checkbox"
                    :class="{ 'exp-checkbox--on': confirmed }"
                    @click="confirmed = !confirmed"
                    role="checkbox"
                    :aria-checked="confirmed"
                  >
                    <svg v-if="confirmed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                    </svg>
                  </div>
                  <span class="exp-confirm-text" @click="confirmed = !confirmed">
                    {{ $t('encrypt.confirmed_text') }}
                  </span>
                </label>
              </template>

              <!-- Step 2: Ergebnis -->
              <template v-else-if="step === 2">
                <!-- Laden -->
                <div v-if="isEncrypting" class="exp-state">
                  <svg class="exp-spinner" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.2"/>
                    <path fill="currentColor" fill-opacity="0.7" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <p class="exp-state-lbl">{{ isFetchingVps ? $t('encrypt.fetching_vps') : $t('encrypt.encrypting_soul') }}</p>
                </div>

                <!-- Fehler -->
                <div v-else-if="encryptError" class="exp-state">
                  <div class="exp-result-ic exp-result-ic--err">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
                    </svg>
                  </div>
                  <p class="exp-state-lbl exp-state-lbl--err">{{ encryptError }}</p>
                  <button class="exp-btn exp-btn--ghost" @click="step = 1; encryptError = null">{{ $t('encrypt.back_btn') }}</button>
                </div>

                <!-- Erfolg -->
                <div v-else class="exp-success">
                  <div class="exp-result-ic exp-result-ic--ok">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/>
                    </svg>
                  </div>
                  <div class="exp-success-text">
                    <p class="exp-success-title">{{ $t('encrypt.success_title') }}</p>
                    <p class="exp-success-sub">{{ $t('encrypt.success_sub') }}</p>
                  </div>
                  <div class="exp-info-box">
                    <p>{{ $t('encrypt.soul_downloaded') }}</p>
                  </div>
                  <div v-if="vpsWarning" class="exp-warn-box exp-warn-box--yellow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <p>{{ vpsWarning }}</p>
                  </div>
                </div>
              </template>

            </div>

            <!-- ── Footer ── -->
            <div class="exp-foot">
              <template v-if="step === 0">
                <button class="exp-btn exp-btn--ghost" @click="onNav('soul')">{{ $t('common.cancel') }}</button>
                <button class="exp-btn exp-btn--primary" :disabled="!allValid" @click="step = 1">{{ $t('encrypt.next_btn') }}</button>
              </template>
              <template v-else-if="step === 1">
                <button class="exp-btn exp-btn--ghost" @click="step = 0">{{ $t('encrypt.back_btn') }}</button>
                <button class="exp-btn exp-btn--primary" :disabled="!confirmed" @click="handleEncrypt">{{ $t('encrypt.encrypt_btn') }}</button>
              </template>
              <template v-else-if="step === 2 && !isEncrypting && !encryptError">
                <span />
                <button class="exp-btn exp-btn--primary" @click="onNav('soul')">{{ $t('common.done') }}</button>
              </template>
            </div>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
<ConfirmModal />
  </ClientOnly>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { BIP39, generateMnemonicWords, useSoulEncrypt } from '~/composables/useSoulEncrypt.js'
import { useApiContext } from '~/composables/useApiContext.js'

definePageMeta({ layout: false })

const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulContent, soulMeta, soulToken, isLoaded } = useSoul()
const { syncedFiles, fetchVpsVaultFiles } = useApiContext()
const { readAllVaultFiles, isConnected: vaultConnected } = useVault()
const { mnemonic, isEncrypting, encryptError, encrypt } = useSoulEncrypt()

// ── Shell state ───────────────────────────────────────────────────────────────
const drawerOpen       = ref(false)
const sidebarCollapsed = ref(false)
const cmdkOpen         = ref(false)

// ── Export state ──────────────────────────────────────────────────────────────
const step          = ref(0)
const confirmed     = ref(false)
const isFetchingVps = ref(false)
const vpsWarning    = ref('')
const userWords     = reactive(new Array(12).fill(''))

const STEPS = computed(() => [
  { title: t('encrypt.rail_key'),    sub: t('encrypt.rail_key_sub')    },
  { title: t('encrypt.rail_verify'), sub: t('encrypt.rail_verify_sub') },
  { title: t('encrypt.rail_done'),   sub: t('encrypt.rail_done_sub')   },
])

// ── 12-Wörter-Logik ───────────────────────────────────────────────────────────
const WORD_RE = /^[a-zäöüß]{3,12}$/

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
function isValid(w)  { return WORD_RE.test(w ?? '') }
const validCount = computed(() => userWords.filter(w => isValid(w)).length)
const allValid   = computed(() => validCount.value === 12)

function fillRandom() {
  const words = generateMnemonicWords()
  for (let i = 0; i < 12; i++) userWords[i] = words[i] ?? ''
}

// ── Verschlüsseln ─────────────────────────────────────────────────────────────
async function handleEncrypt() {
  step.value = 2
  encryptError.value = null
  isEncrypting.value = true

  try {
    const localFiles = vaultConnected.value ? await readAllVaultFiles() : []
    const localBaseNames = new Set(localFiles.map(f => f.name.split('/').pop()))
    const vpsOnlyCount = ['audio', 'video', 'images', 'context'].reduce((sum, cat) =>
      sum + (syncedFiles.value[cat] || []).filter(n => !localBaseNames.has(n.split('/').pop())).length, 0)

    let vpsFiles = []
    vpsWarning.value = ''
    if (soulToken.value && vpsOnlyCount > 0) {
      isFetchingVps.value = true
      vpsFiles = await fetchVpsVaultFiles(soulToken.value, localBaseNames)
      isFetchingVps.value = false
      const skipped = vpsOnlyCount - vpsFiles.length
      if (skipped > 0) {
        vpsWarning.value = t('encrypt.vps_warning', { n: skipped })
      }
    }

    const extraVpsFiles = vpsFiles.filter(f => !localBaseNames.has(f.name.split('/').pop()))
    const allFiles      = [...localFiles, ...extraVpsFiles]
    const name  = soulMeta.value?.name || 'soul'
    const clean = Array.from(userWords).map(sanitize)
    if (clean.length !== 12 || !clean.every(w => isValid(w))) {
      encryptError.value = t('encrypt.words_required')
      return
    }
    mnemonic.value = clean
    await encrypt(soulContent.value, allFiles, name)
  } finally {
    isFetchingVps.value = false
    isEncrypting.value  = false
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function lockGate() {
  document.cookie = 'sys_token=; Max-Age=0; path=/'
  window.location.href = '/gate'
}

function onNav(id) {
  if (id === 'export')   return
  if (id === 'chat')     { router.push('/session');     return }
  if (id === 'setup')    { router.push('/setup');  return }
  if (id === 'soul')     { router.push('/soul');        return }
  if (id === 'chronik')  { router.push('/chronicle');     return }
  if (id === 'files')    { router.push('/vault');     return }
  if (id === 'market')   { router.push('/marketplace'); return }
  if (id === 'earnings') { router.push('/earnings');   return }
  if (id === 'maturity') { router.push('/maturity');       return }
  if (id === 'health')   { router.push('/health'); return }
  if (id === 'anchor')   { router.push('/anchor');   return }
  if (id === 'peers')    { router.push('/peers');       return }
  if (id === 'connect')  { router.push('/connection');  return }
  if (id === 'settings') { router.push('/settings'); return }
  drawerOpen.value = false
  router.push('/')
}
</script>

<style scoped>
.sys-loading {
  min-height: 100dvh; display: flex; align-items: center; justify-content: center;
  background: var(--bg); color: var(--fg-3);
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase;
}

.exp-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 36px clamp(22px, 4vw, 42px) 88px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Header ── */
.exp-head { margin-bottom: 24px; }
.exp-title {
  font-family: var(--serif); font-size: clamp(28px, 4vw, 40px);
  font-weight: 400; letter-spacing: -0.025em; color: var(--fg);
  line-height: 1.1; margin: 8px 0 0;
}
.exp-title em { font-style: italic; color: var(--accent); }

/* ── Step rail ── */
.exp-rail {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  border: 1px solid var(--line);
  border-radius: var(--r) var(--r) 0 0;
  overflow: hidden;
  margin-bottom: 0;
}
.exp-step {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px;
  border-right: 1px solid var(--line);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  opacity: 0.45;
  transition: opacity 0.2s, background 0.2s;
}
.exp-step:last-child { border-right: none; }
.exp-step--on  { opacity: 1; background: var(--surface-2); }
.exp-step--done { opacity: 0.75; }

.exp-step-num {
  width: 22px; height: 22px; flex: none; border-radius: 50%;
  border: 1px solid var(--line-2);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-size: 13px; color: var(--fg-3);
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.exp-step--on   .exp-step-num { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.exp-step--done .exp-step-num { background: var(--accent-dim); border-color: rgba(109,184,154,0.40); color: var(--accent-bright); }
.exp-step-check { width: 11px; height: 11px; }

.exp-step-lbl   { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.exp-step-title {
  font-family: var(--mono); font-size: 15px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.exp-step-sub {
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.06em;
  color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Body ── */
.exp-body {
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  background: rgba(23,23,23,0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 28px 24px 24px;
  display: flex; flex-direction: column; gap: 16px;
}

.exp-section-title {
  font-family: var(--serif); font-size: clamp(20px, 3vw, 26px); font-weight: 400;
  letter-spacing: -0.02em; color: var(--fg); margin: 0 0 2px;
}
.exp-section-title em { font-style: italic; color: var(--accent); }
.exp-prose {
  font-family: var(--sans); font-size: 17px; color: var(--fg);
  line-height: 1.65; margin: 0; max-width: 560px;
}
.exp-code {
  font-family: var(--mono); font-size: 14px; color: var(--fg-2);
  background: var(--surface-2); padding: 1px 5px; border-radius: 2px;
}

/* ── Words grid ── */
.exp-words-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
}
.exp-word-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  transition: border-color 0.15s;
}
.exp-word-row--valid   { border-color: rgba(109,184,154,0.35); }
.exp-word-row--invalid { border-color: rgba(224,108,117,0.35); }

.exp-word-num {
  font-family: var(--mono); font-size: 14px; color: var(--fg-3);
  width: 16px; flex: none; text-align: right;
}
.exp-word-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  font-family: var(--mono); font-size: 15px; font-weight: 700;
  color: var(--fg);
}
.exp-word-input::placeholder { color: var(--fg-3); font-weight: 400; }
.exp-word-ic { width: 12px; height: 12px; flex: none; }
.exp-word-ic.ok  { color: var(--accent-bright); opacity: 0.75; }
.exp-word-ic.err { color: #e06c75; opacity: 0.75; }

/* ── Meta row ── */
.exp-meta-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: -4px;
}
.exp-count {
  font-family: var(--mono); font-size: 15px; color: var(--fg-2);
}
.exp-count--full { color: var(--accent-bright); }

.exp-random {
  display: flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  font-family: var(--mono); font-size: 15px; color: var(--fg-2);
  transition: color 0.12s;
}
.exp-random:hover { color: var(--fg); }
.exp-random svg { width: 12px; height: 12px; flex: none; }

/* ── Warning box ── */
.exp-warn-box {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-xs);
}
.exp-warn-box svg { width: 15px; height: 15px; flex: none; color: var(--fg-3); margin-top: 1px; }
.exp-warn-box p   { font-size: 15px; color: var(--fg); font-weight: 600; line-height: 1.6; margin: 0; }
.exp-warn-box--yellow svg { color: rgba(251,191,36,0.65); }
.exp-warn-box--yellow p   { color: rgba(251,191,36,0.65); }

/* ── Readonly word grid (step 1) ── */
.exp-words-grid--ro { margin-bottom: 4px; }
.exp-word-row-ro {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-xs);
}
.exp-word-ro { font-family: var(--mono); font-size: 15px; font-weight: 700; color: var(--fg); }

/* ── Confirm checkbox ── */
.exp-confirm-label {
  display: flex; align-items: flex-start; gap: 12px;
  cursor: pointer;
}
.exp-checkbox {
  width: 20px; height: 20px; flex: none; margin-top: 1px;
  border: 1px solid var(--line-2);
  border-radius: 2px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.exp-checkbox--on { background: var(--fg); border-color: var(--fg); }
.exp-checkbox svg { width: 12px; height: 12px; color: var(--bg); }
.exp-confirm-text {
  font-size: 16px; color: var(--fg); line-height: 1.55; user-select: none;
}

/* ── State center (step 2) ── */
.exp-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 16px; padding: 32px 0; text-align: center;
}
.exp-state-lbl { font-size: 17px; color: var(--fg); }
.exp-state-lbl--err { color: #e06c75; }

.exp-spinner {
  width: 40px; height: 40px; color: var(--fg-3);
  animation: exp-spin 1s linear infinite;
}
@keyframes exp-spin { to { transform: rotate(360deg); } }

.exp-result-ic {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.exp-result-ic--ok  { background: var(--accent-dim); border: 1px solid rgba(109,184,154,0.30); }
.exp-result-ic--ok  svg { width: 24px; height: 24px; color: var(--accent-bright); }
.exp-result-ic--err { background: rgba(224,108,117,0.08); border: 1px solid rgba(224,108,117,0.25); }
.exp-result-ic--err svg { width: 24px; height: 24px; color: #e06c75; opacity: 0.85; }

/* ── Success ── */
.exp-success {
  display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 8px 0;
}
.exp-success-text { text-align: center; }
.exp-success-title {
  font-family: var(--serif); font-size: 17px; font-weight: 400; color: var(--fg); margin-bottom: 4px;
}
.exp-success-sub {
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg-2);
}
.exp-info-box {
  width: 100%; padding: 14px 16px;
  background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-xs);
}
.exp-info-box p { font-size: 15px; color: var(--fg-2); line-height: 1.6; margin: 0; }
.exp-success .exp-warn-box { width: 100%; }

/* ── Footer ── */
.exp-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r) var(--r);
  background: var(--surface-2);
  margin-top: -1px;
  gap: 12px;
}

/* ── Buttons ── */
.exp-btn {
  height: 44px; padding: 0 20px;
  font-family: var(--mono); font-size: 14.5px; letter-spacing: 0.08em;
  cursor: pointer; border-radius: var(--r-xs);
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.exp-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.exp-btn--primary {
  background: var(--accent); border: 1px solid var(--accent);
  color: var(--on-accent); font-weight: 600;
}
.exp-btn--primary:hover:not(:disabled) {
  background: var(--accent-bright); border-color: var(--accent-bright);
  box-shadow: 0 6px 20px var(--accent-glow);
}
.exp-btn--ghost {
  background: transparent; border: 1px solid var(--line-2);
  color: var(--fg-2);
}
.exp-btn--ghost:hover { color: var(--fg); border-color: var(--line-2); background: var(--surface); }

@media (max-width: 900px) {
  .exp-page { padding: 20px 16px 80px; }
  .exp-step-lbl { display: none; }
  .exp-words-grid { grid-template-columns: 1fr; }
}
</style>
