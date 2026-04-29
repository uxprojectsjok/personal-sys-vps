<template>
  <component
    :is="tag"
    :class="[
      'text-white',
      glow ? 'sys-glow-text' : ''
    ]"
  >
    <slot />
  </component>
</template>

<script setup>
defineProps({
  tag: {
    type: String,
    default: "span"
  },
  glow: {
    type: Boolean,
    default: true
  }
});
</script>
