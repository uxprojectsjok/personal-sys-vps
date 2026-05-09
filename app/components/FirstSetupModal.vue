<!-- ════════════════════════════════════════════════════════════════════
  SYS · FirstSetupModal.vue · Editorial v2
  Erste Instanz — Admin-Token sichern.
  Same prop (token), same emit (dismiss). New look.
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
        <!-- ── HEAD ──────────────────────────────────────────────── -->
        <header class="sys-modal-head">
          <div class="sys-modal-handle" aria-hidden="true" />

          <div class="head-icon" aria-hidden="true">
            <i class="ri-shield-keyhole-line" />
          </div>

          <span class="sys-kicker">Erste Instanz · §00</span>
          <h1 id="first-setup-title" class="sys-display">
            Admin-Token <em>sichern</em>.
          </h1>
          <p class="sys-lede">
            Diese Instanz wurde gerade initialisiert. Dein Admin-Token wurde generiert —
            er wird <em>nur dieses eine Mal</em> angezeigt und ist nicht wiederherstellbar.
          </p>
        </header>

        <!-- ── BODY ──────────────────────────────────────────────── -->
        <div class="sys-modal-body">
          <!-- Token reveal -->
          <div class="token-card">
            <div class="token-card-head">
              <span class="sys-kicker" style="margin: 0; padding: 0; border: 0;">
                Admin-Token
              </span>
              <button
                class="token-copy"
                :class="{ copied }"
                type="button"
                aria-label="Token kopieren"
                @click="copyToken"
              >
                <i :class="copied ? 'ri-check-line' : 'ri-clipboard-line'" />
                <span>{{ copied ? 'Kopiert' : 'Kopieren' }}</span>
              </button>
            </div>
            <code class="token-value">{{ token }}</code>
          </div>

          <!-- Warning -->
          <div class="warn-row">
            <i class="ri-error-warning-line warn-icon" aria-hidden="true" />
            <p>
              Speichere den Token jetzt in einem Passwort-Manager.
              Ohne ihn kannst du keine Schlüssel rotieren oder die Instanz administrieren.
            </p>
          </div>

          <!-- Confirmation -->
          <label class="confirm-row">
            <input
              type="checkbox"
              v-model="confirmed"
              class="confirm-cbx"
            />
            <span>Ich habe den Token sicher gespeichert.</span>
          </label>
        </div>

        <!-- ── FOOT ──────────────────────────────────────────────── -->
        <footer class="sys-modal-foot">
          <div class="sys-foot-meta">
            <span
              class="sys-dot"
              :class="confirmed ? 'sys-dot--ok' : 'sys-dot--warn'"
            />
            {{ confirmed ? 'Token bestätigt' : 'Bestätigung erforderlich' }}
          </div>

          <div class="sys-foot-actions">
            <button
              type="button"
              class="sys-btn-ed sys-btn-ed--primary"
              :disabled="!confirmed"
              @click="dismiss"
            >
              Weiter zur Instanz →
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  token: { type: String, default: null },
})
const emit = defineEmits(['dismiss'])

const copied    = ref(false)
const confirmed = ref(false)

async function copyToken() {
  if (!props.token) return
  try {
    await navigator.clipboard.writeText(props.token)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* ignore */ }
}

function dismiss() {
  if (!confirmed.value) return
  emit('dismiss')
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
.head-icon i {
  font-size: 22px;
  color: var(--sys-violet);
}

.token-card {
  border: 1px solid rgba(139,92,246,0.30);
  background: linear-gradient(135deg, rgba(139,92,246,0.06), transparent 60%);
  padding: 18px 20px;
  margin-bottom: 18px;
}
.token-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.token-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--sys-rule-strong);
  color: var(--sys-fg-muted);
  padding: 6px 10px;
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
  min-height: unset;
  border-radius: 0;
}
.token-copy:hover {
  color: var(--sys-violet);
  border-color: var(--sys-violet);
}
.token-copy.copied {
  color: var(--sys-ok);
  border-color: rgba(184,220,196,0.4);
}
.token-copy i { font-size: 13px; }

.token-value {
  display: block;
  font-family: var(--sys-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--sys-violet);
  word-break: break-all;
  user-select: all;
  padding-top: 8px;
  border-top: 1px solid var(--sys-rule);
}

.warn-row {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 12px;
  align-items: start;
  padding: 14px 16px;
  border: 1px solid rgba(240,163,163,0.25);
  background: rgba(240,163,163,0.04);
  margin-bottom: 18px;
}
.warn-icon {
  font-size: 18px;
  color: var(--sys-err);
  line-height: 1.2;
}
.warn-row p {
  font-family: var(--sys-serif);
  font-size: 14px;
  line-height: 1.5;
  color: var(--sys-fg-muted);
  margin: 0;
}

.confirm-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  cursor: pointer;
  user-select: none;
  font-family: var(--sys-serif);
  font-size: 15px;
  color: var(--sys-fg-muted);
  min-height: unset;
}
.confirm-row:hover { color: var(--sys-fg); }

.confirm-cbx {
  appearance: none;
  -webkit-appearance: none;
  width: 20px; height: 20px;
  border: 1px solid var(--sys-rule-strong);
  background: var(--sys-paper-2);
  cursor: pointer;
  position: relative;
  flex: none;
  transition: all 0.15s;
  border-radius: 0;
}
.confirm-cbx:checked {
  background: var(--sys-violet);
  border-color: var(--sys-violet);
}
.confirm-cbx:checked::after {
  content: "✓";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--sys-serif);
  font-size: 14px;
  color: var(--sys-on-accent, #0a0810);
  font-weight: bold;
}
</style>
