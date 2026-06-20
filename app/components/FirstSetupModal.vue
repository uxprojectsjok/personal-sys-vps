<!-- ════════════════════════════════════════════════════════════════════
  SYS · FirstSetupModal.vue · Editorial v3
  Erste Instanz — Step 1: Admin-Token. Step 2: Soul sichern / importieren.
═════════════════════════════════════════════════════════════════════ -->

<template>
  <Transition name="sys-modal-fade">
    <div
      v-if="token"
      class="sys-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-setup-title"
    >
      <div class="sys-modal sys-modal--md sys-modal--no-rail">

        <!-- ── STEP 1: Admin-Token ──────────────────────────────────── -->
        <template v-if="step === 1">
          <header class="sys-modal-head">
            <div class="sys-modal-handle" aria-hidden="true" />
            <div class="head-icon" aria-hidden="true">
              <i class="ri-shield-keyhole-line" />
            </div>
            <span class="sys-kicker">{{ postImportConfirmOnly ? $t('first_setup.kicker_import') : $t('first_setup.kicker_new') }}</span>
            <h1 id="first-setup-title" class="sys-display">{{ $t('first_setup.token_label') }} <em>{{ $t('first_setup.title_token_em') }}</em>.</h1>
            <p class="sys-lede">
              <template v-if="postImportConfirmOnly">
                {{ $t('first_setup.lede_import_1') }} <em>{{ $t('first_setup.lede_once') }}</em> {{ $t('first_setup.lede_suffix') }}
              </template>
              <template v-else>
                {{ $t('first_setup.lede_init_1') }} <em>{{ $t('first_setup.lede_once') }}</em> {{ $t('first_setup.lede_suffix') }}
              </template>
            </p>
          </header>

          <div class="sys-modal-body">
            <div class="token-card">
              <div class="token-card-head">
                <span class="sys-kicker" style="margin:0;padding:0;border:0">{{ $t('first_setup.token_label') }}</span>
                <button class="token-copy" :class="{ copied }" type="button" :aria-label="$t('first_setup.btn_copy_aria')" @click="copyToken">
                  <i :class="copied ? 'ri-check-line' : 'ri-clipboard-line'" />
                  <span>{{ copied ? $t('first_setup.btn_copied') : $t('first_setup.btn_copy') }}</span>
                </button>
              </div>
              <code class="token-value">{{ token }}</code>
            </div>

            <div class="warn-row">
              <i class="ri-error-warning-line warn-icon" aria-hidden="true" />
              <p>{{ $t('first_setup.warn_text') }}</p>
            </div>

            <label class="confirm-row">
              <input type="checkbox" v-model="confirmed" class="confirm-cbx" />
              <span>{{ $t('first_setup.confirm_label') }}</span>
            </label>
          </div>

          <footer class="sys-modal-foot">
            <div class="sys-foot-meta">
              <span class="sys-dot" :class="confirmed ? 'sys-dot--ok' : 'sys-dot--warn'" />
              {{ confirmed ? $t('first_setup.status_confirmed') : $t('first_setup.status_pending') }}
            </div>
            <div class="sys-foot-actions">
              <button type="button" class="sys-btn-ed sys-btn-ed--primary" :disabled="!confirmed" @click="postImportConfirmOnly ? emitDismiss() : (step = 2)">
                {{ postImportConfirmOnly ? $t('common.done') : $t('common.next') }}
              </button>
            </div>
          </footer>
        </template>

        <!-- ── STEP 2: Soul sichern / importieren ─────────────────── -->
        <template v-else-if="step === 2">
          <header class="sys-modal-head">
            <div class="sys-modal-handle" aria-hidden="true" />
            <div class="head-icon" aria-hidden="true">
              <i class="ri-user-heart-line" />
            </div>
            <span class="sys-kicker">{{ isSingle ? $t('first_setup.kicker_new_single') : $t('first_setup.kicker_new_vps') }}</span>
            <h1 class="sys-display">Soul <em>{{ $t('first_setup.title_soul_em') }}</em>.</h1>
            <p class="sys-lede">{{ $t('first_setup.lede_soul') }}</p>
          </header>

          <div class="sys-modal-body">

            <!-- Download new -->
            <div class="action-card" @click="emitDownload">
              <div class="action-icon"><i class="ri-download-2-line" /></div>
              <div class="action-text">
                <strong>{{ $t('first_setup.dl_title') }}</strong>
                <span>{{ $t('first_setup.dl_desc') }}</span>
              </div>
              <i class="ri-arrow-right-line action-arr" />
            </div>

            <div class="sep-or">{{ $t('common.or') }}</div>

            <!-- Import existing -->
            <div class="action-card" @click="triggerFilePicker">
              <div class="action-icon"><i class="ri-upload-2-line" /></div>
              <div class="action-text">
                <strong>{{ $t('first_setup.import_title') }}</strong>
                <span>{{ $t('first_setup.import_desc') }}</span>
              </div>
              <i class="ri-arrow-right-line action-arr" />
            </div>
            <input ref="fileInput" type="file" accept=".md,text/plain" hidden @change="handleFile" />
            <p v-if="importError" class="import-error">{{ importError }}</p>
            <p v-if="importing" class="import-status">{{ $t('first_setup.importing') }}</p>

            <!-- Skip -->
            <button class="skip-link" @click="emitDismiss">{{ $t('first_setup.btn_skip') }}</button>
          </div>
        </template>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  token: { type: String, default: null },
})
const emit = defineEmits(['dismiss', 'download-soul', 'import-soul'])

const isSingle             = computed(() => props.token === '__single__')
const step                 = ref(1)
const copied               = ref(false)
const confirmed            = ref(false)
const postImportConfirmOnly = ref(false)

watch(() => props.token, (val, oldVal) => {
  if (val === '__single__') {
    postImportConfirmOnly.value = false
    step.value = 2
  } else if (val && oldVal && val !== oldVal) {
    // Token wechselte nach Import: neuer Admin-Token für importierte Soul anzeigen
    postImportConfirmOnly.value = true
    confirmed.value = false
    step.value = 1
  } else if (val && !oldVal) {
    postImportConfirmOnly.value = false
    step.value = 1
  }
}, { immediate: true })
const importing = ref(false)
const importError = ref('')
const fileInput = ref(null)

async function copyToken() {
  if (!props.token) return
  try {
    await navigator.clipboard.writeText(props.token)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

function emitDownload() {
  emit('download-soul')
}

function emitDismiss() {
  emit('dismiss')
}

function triggerFilePicker() {
  importError.value = ''
  fileInput.value?.click()
}

async function handleFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  importError.value = ''
  importing.value = true
  try {
    const text = await file.text()
    if (!text.includes('soul_id:')) {
      importError.value = t('first_setup.err_invalid')
      importing.value = false
      return
    }
    emit('import-soul', text)
  } catch {
    importError.value = t('first_setup.err_read')
  } finally {
    importing.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>

<style scoped>
.head-icon {
  width: 44px; height: 44px;
  border: 1px solid var(--sys-rule-strong);
  background: var(--sys-violet-dim);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
.head-icon i { font-size: 22px; color: var(--sys-violet); }

.token-card {
  border: 1px solid rgba(139,92,246,0.30);
  background: linear-gradient(135deg, rgba(139,92,246,0.06), transparent 60%);
  padding: 18px 20px;
  margin-bottom: 18px;
}
.token-card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.token-copy {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid var(--sys-rule-strong);
  color: var(--sys-fg-muted); padding: 6px 10px;
  font-family: var(--sys-mono); font-size: 12px;
  letter-spacing: 0.18em; text-transform: uppercase;
  cursor: pointer; transition: all 0.15s;
  min-height: unset; border-radius: 0;
}
.token-copy:hover { color: var(--sys-violet); border-color: var(--sys-violet); }
.token-copy.copied { color: var(--sys-ok); border-color: rgba(184,220,196,0.4); }
.token-copy i { font-size: 13px; }
.token-value {
  display: block; font-family: var(--sys-mono); font-size: 13px;
  line-height: 1.6; color: var(--sys-violet); word-break: break-all;
  user-select: all; padding-top: 8px; border-top: 1px solid var(--sys-rule);
}

.warn-row {
  display: grid; grid-template-columns: 24px 1fr; gap: 12px;
  align-items: start; padding: 14px 16px;
  border: 1px solid rgba(240,163,163,0.25);
  background: rgba(240,163,163,0.04); margin-bottom: 18px;
}
.warn-icon { font-size: 18px; color: var(--sys-err); line-height: 1.2; }
.warn-row p { font-family: var(--sys-serif); font-size: 14px; line-height: 1.5; color: var(--sys-fg-muted); margin: 0; }

.confirm-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 0;
  cursor: pointer; user-select: none;
  font-family: var(--sys-serif); font-size: 15px; color: var(--sys-fg-muted); min-height: unset;
}
.confirm-row:hover { color: var(--sys-fg); }
.confirm-cbx {
  appearance: none; -webkit-appearance: none;
  width: 20px; height: 20px;
  border: 1px solid var(--sys-rule-strong);
  background: var(--sys-paper-2); cursor: pointer;
  position: relative; flex: none; transition: all 0.15s; border-radius: 0;
}
.confirm-cbx:checked { background: var(--sys-violet); border-color: var(--sys-violet); }
.confirm-cbx:checked::after {
  content: "✓"; position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--sys-serif); font-size: 14px;
  color: var(--sys-on-accent, #0a0810); font-weight: bold;
}

/* Step 2 */
.action-card {
  display: flex; align-items: center; gap: 16px;
  border: 1px solid var(--sys-rule-strong);
  padding: 16px 18px; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  margin-bottom: 0;
}
.action-card:hover { border-color: var(--sys-violet); background: rgba(139,92,246,0.04); }
.action-icon {
  width: 36px; height: 36px; flex: none;
  border: 1px solid var(--sys-rule-strong);
  display: flex; align-items: center; justify-content: center;
  color: var(--sys-violet); font-size: 18px;
}
.action-text { flex: 1; }
.action-text strong {
  display: block; font-family: var(--sys-mono); font-size: 12px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--sys-fg);
  margin-bottom: 4px;
}
.action-text span { font-family: var(--sys-serif); font-size: 13px; color: var(--sys-fg-muted); }
.action-arr { color: var(--sys-fg-dim); font-size: 18px; flex: none; }

.sep-or {
  text-align: center; font-family: var(--sys-mono); font-size: 10px;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--sys-fg-dim); margin: 14px 0;
}

.import-error { font-family: var(--sys-mono); font-size: 11px; color: var(--sys-err); margin: 10px 0 0; }
.import-status { font-family: var(--sys-mono); font-size: 11px; color: var(--sys-fg-muted); margin: 10px 0 0; }

.skip-link {
  display: block; width: 100%; margin-top: 20px;
  background: transparent; border: none;
  font-family: var(--sys-mono); font-size: 10px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--sys-fg-dim); cursor: pointer; text-align: center;
  padding: 8px; transition: color 0.15s;
}
.skip-link:hover { color: var(--sys-fg-muted); }
</style>
