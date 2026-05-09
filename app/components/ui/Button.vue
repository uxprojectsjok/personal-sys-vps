<!-- ════════════════════════════════════════════════════════════════════
  SYS · ui/Button.vue · Editorial v2
  Drop-in replacement. Same props (variant, size).

  Removes:
    - Radial-gradient click flash (AI-tropy)
    - Pill-y rounded-xl (10px) — now 0px (editorial square)
    - Multi-shadow whites (subtle border + tonal hover instead)

  Adds:
    - 'edPrimary' variant: violet fill, the hero CTA used in modal foots
    - 'link'      variant: text-only with bottom rule (editorial)
═════════════════════════════════════════════════════════════════════ -->

<template>
  <button
    :class="[
      'sys-ed-btn',
      `sys-ed-btn--${variant}`,
      `sys-ed-btn--${size}`,
    ]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: v => ['primary', 'edPrimary', 'ghost', 'amber', 'danger', 'link'].includes(v),
  },
  size: {
    type: String,
    default: 'md',
    validator: v => ['sm', 'md', 'lg'].includes(v),
  },
})
</script>

<style scoped>
/* ── Base ──────────────────────────────────────────────────────────── */
.sys-ed-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--sys-sans, 'Oxanium', system-ui, sans-serif);
  font-weight: 600;
  letter-spacing: 0.01em;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 0;          /* editorial square */
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    box-shadow 0.18s ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.sys-ed-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sys-ed-btn:active:not(:disabled) {
  transform: scale(0.97);
  transition-duration: 0.06s;
}
.sys-ed-btn:focus-visible {
  outline: 1px solid rgba(255,255,255,0.30);
  outline-offset: 2px;
}

/* ── Sizes ─────────────────────────────────────────────────────────── */
.sys-ed-btn--sm { height: 36px; min-height: 36px; padding: 0 14px; font-size: 12px; }
.sys-ed-btn--md { height: 44px; min-height: 44px; padding: 0 20px; font-size: 13px; }
.sys-ed-btn--lg { height: 52px; min-height: 52px; padding: 0 28px; font-size: 14px; }

/* ── Variants ──────────────────────────────────────────────────────── */

/* primary — violet fill, the hero action */
.sys-ed-btn--primary,
.sys-ed-btn--edPrimary {
  background: var(--sys-violet);
  color: var(--sys-on-accent, #0a0810);
  border-color: var(--sys-violet);
}
.sys-ed-btn--primary:hover:not(:disabled),
.sys-ed-btn--edPrimary:hover:not(:disabled) {
  background: var(--sys-accent-bright, #a78bfa);
  border-color: var(--sys-accent-bright, #a78bfa);
  box-shadow: 0 8px 24px rgba(139,92,246,0.30);
}

/* ghost — outline only */
.sys-ed-btn--ghost {
  background: transparent;
  color: var(--sys-fg-muted);
  border-color: var(--sys-rule-strong, rgba(226,220,240,0.20));
}
.sys-ed-btn--ghost:hover:not(:disabled) {
  color: var(--sys-fg);
  border-color: var(--sys-violet);
  background: var(--sys-violet-dim);
}

/* amber — neutral pill, used for secondary CTAs (legacy compat) */
.sys-ed-btn--amber {
  background: rgba(255,255,255,0.04);
  color: var(--sys-fg);
  border-color: rgba(255,255,255,0.14);
}
.sys-ed-btn--amber:hover:not(:disabled) {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.24);
}

/* danger — semantic muted red (not orange) */
.sys-ed-btn--danger {
  background: rgba(240,163,163,0.08);
  color: #f0a3a3;
  border-color: rgba(240,163,163,0.30);
}
.sys-ed-btn--danger:hover:not(:disabled) {
  background: rgba(240,163,163,0.16);
  border-color: rgba(240,163,163,0.48);
}

/* link — text + underline rule (editorial) */
.sys-ed-btn--link {
  background: transparent;
  color: var(--sys-fg-muted);
  border-color: transparent;
  padding-left: 0;
  padding-right: 0;
  border-bottom: 1px solid var(--sys-rule-strong);
  border-radius: 0;
  height: auto;
  min-height: unset;
  font-family: var(--sys-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 500;
  padding-bottom: 4px;
}
.sys-ed-btn--link:hover:not(:disabled) {
  color: var(--sys-violet);
  border-color: var(--sys-violet);
}
</style>
