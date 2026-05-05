<!-- ════════════════════════════════════════════════════════════════════
  SYS · ui/Modal.vue · Editorial v2
  Drop-in replacement for the existing ui/Modal.vue.
  Same props, same emits — new look.

  Adds (optional, all backwards-compatible):
    - kicker        : eyebrow text above title (e.g. "Vault · §01")
    - lede          : longer subtitle paragraph below title
    - footMeta      : small text on left of foot (e.g. "Verschlüsselt · AES-256")
    - footStatus    : 'idle' | 'live' | 'ok' | 'warn'  (colored dot)
    - size          : 'sm' | 'md' | 'lg' | 'xl'
    - icon          : remixicon class (e.g. "ri-shield-keyhole-line") shown in head
    - confirmDisabled
    - confirmLoading
  Slots:
    - default       : main body
    - title         : custom title node (overrides title prop)
    - foot-meta     : custom foot meta (overrides footMeta prop)
    - foot-actions  : custom foot actions (overrides default cancel/confirm)
    - foot-help     : extra help row under foot

  Requires sys-editorial.css to be imported in main.css.
═════════════════════════════════════════════════════════════════════ -->

<template>
  <Teleport to="body">
    <Transition name="sys-modal-fade">
      <div
        v-if="open"
        class="sys-modal-overlay"
        role="dialog"
        :aria-modal="true"
        :aria-labelledby="title ? 'sys-modal-title' : undefined"
        @click.self="$emit('cancel')"
        @keydown.esc="$emit('cancel')"
      >
        <div
          ref="panelEl"
          class="sys-modal"
          :class="sizeClass"
          @keydown.tab="trapFocus"
        >
          <!-- ── HEAD ────────────────────────────────────────────────── -->
          <header class="sys-modal-head" :class="{ 'sys-modal-head--no-rule': !title && !kicker && !lede && !$slots.title }">
            <div class="sys-modal-handle" aria-hidden="true" />

            <button
              class="sys-modal-close"
              type="button"
              aria-label="Schließen"
              @click="$emit('cancel')"
            >
              <span aria-hidden="true">×</span>
            </button>

            <span v-if="kicker" class="sys-kicker">{{ kicker }}</span>

            <div v-if="icon" class="head-icon" aria-hidden="true">
              <i :class="icon" />
            </div>

            <h2 v-if="title || $slots.title" id="sys-modal-title" class="sys-display">
              <slot name="title">{{ title }}</slot>
            </h2>

            <p v-if="lede" class="sys-lede">{{ lede }}</p>
          </header>

          <!-- ── BODY ────────────────────────────────────────────────── -->
          <div class="sys-modal-body" :class="bodyClass">
            <slot />
          </div>

          <!-- ── FOOT ────────────────────────────────────────────────── -->
          <footer v-if="!hideFoot" class="sys-modal-foot">
            <div class="sys-foot-meta">
              <slot name="foot-meta">
                <span v-if="footStatus" class="sys-dot" :class="`sys-dot--${footStatus}`" />
                <span v-if="footMeta">{{ footMeta }}</span>
              </slot>
            </div>

            <div class="sys-foot-actions">
              <slot name="foot-actions">
                <button
                  v-if="!hideCancel"
                  type="button"
                  class="sys-btn-ed sys-btn-ed--ghost"
                  @click="$emit('cancel')"
                >
                  {{ cancelText }}
                </button>
                <button
                  type="button"
                  class="sys-btn-ed"
                  :class="danger ? 'sys-btn-ed--danger' : 'sys-btn-ed--primary'"
                  :disabled="confirmDisabled || confirmLoading"
                  @click="$emit('confirm')"
                >
                  {{ confirmLoading ? loadingText : confirmText }}
                </button>
              </slot>
            </div>

            <div v-if="$slots['foot-help']" class="sys-foot-help">
              <slot name="foot-help" />
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'

const props = defineProps({
  open:            { type: Boolean, default: false },
  title:           { type: String,  default: '' },
  kicker:          { type: String,  default: '' },
  lede:            { type: String,  default: '' },
  icon:            { type: String,  default: '' },
  footMeta:        { type: String,  default: '' },
  footStatus:      { type: String,  default: '' },         // idle | live | ok | warn
  size:            { type: String,  default: 'sm' },        // sm | md | lg | xl
  confirmText:     { type: String,  default: 'Bestätigen' },
  cancelText:      { type: String,  default: 'Abbrechen' },
  loadingText:     { type: String,  default: 'Lade…' },
  hideCancel:      { type: Boolean, default: false },
  hideFoot:        { type: Boolean, default: false },
  danger:          { type: Boolean, default: false },       // default false now (was true!)
  confirmDisabled: { type: Boolean, default: false },
  confirmLoading:  { type: Boolean, default: false },
  bodyClass:       { type: String,  default: '' },
})

defineEmits(['confirm', 'cancel'])

const sizeClass = computed(() => `sys-modal--${props.size}`)

const panelEl = ref(null)
let previousFocus = null

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

watch(() => props.open, async val => {
  if (val) {
    previousFocus = document.activeElement
    await nextTick()
    panelEl.value?.querySelector(FOCUSABLE)?.focus()
  } else {
    previousFocus?.focus?.()
  }
})

function trapFocus(e) {
  const focusable = Array.from(panelEl.value?.querySelectorAll(FOCUSABLE) ?? [])
  if (!focusable.length) return
  const first = focusable[0]
  const last  = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus()
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
.head-icon i {
  font-size: 22px;
  color: var(--sys-violet);
}
</style>
