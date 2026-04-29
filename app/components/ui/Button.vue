<template>
  <button
    :class="[
      'inline-flex items-center justify-center gap-2',
      'font-medium tracking-wide transition-all duration-200',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sys-accent)]',
      variantClasses,
      sizeClasses
    ]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  variant: {
    type: String,
    default: "primary",
    validator: (v) => ["primary", "ghost", "amber", "danger"].includes(v)
  },
  size: {
    type: String,
    default: "md",
    validator: (v) => ["sm", "md", "lg"].includes(v)
  }
});

const variantClasses = computed(() => {
  const map = {
    primary: [
      "bg-[rgba(255,255,255,0.08)] text-white",
      "border border-[rgba(255,255,255,0.18)]",
      "hover:bg-[rgba(255,255,255,0.13)] hover:border-[rgba(255,255,255,0.3)]",
      "shadow-[0_0_20px_rgba(255,255,255,0.05)]",
      "rounded-xl"
    ].join(" "),

    ghost: [
      "bg-transparent text-[var(--sys-fg-muted)]",
      "border border-[var(--sys-border)]",
      "hover:bg-[var(--sys-bg-surface)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.15)]",
      "rounded-xl"
    ].join(" "),

    amber: [
      "bg-[rgba(255,255,255,0.05)] text-white/75",
      "border border-[rgba(255,255,255,0.15)]",
      "hover:bg-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.3)]",
      "rounded-xl"
    ].join(" "),

    danger: [
      "bg-[rgba(239,68,68,0.12)] text-red-300",
      "border border-[rgba(239,68,68,0.25)]",
      "hover:bg-[rgba(239,68,68,0.2)] hover:border-[rgba(239,68,68,0.4)]",
      "rounded-xl"
    ].join(" ")
  };
  return map[props.variant] ?? map.primary;
});

const sizeClasses = computed(() => {
  const map = {
    sm: "px-3 py-2 text-sm min-h-[40px]",
    md: "px-5 py-3 text-sm min-h-[48px]",
    lg: "px-7 py-4 text-base min-h-[56px]"
  };
  return map[props.size] ?? map.md;
});
</script>
