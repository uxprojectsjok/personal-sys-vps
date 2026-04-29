<template>
  <Button
    @click="handleDownload"
    :variant="iconOnly ? 'ghost' : 'ghost'"
    :size="iconOnly ? 'sm' : 'md'"
    :title="iconOnly ? 'Soul exportieren' : undefined"
    :disabled="!hasSoul"
    class="flex items-center gap-2"
  >
    <!-- Download-Icon -->
    <svg class="w-4 h-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
    <span v-if="!iconOnly" class="text-sm">Soul exportieren</span>
  </Button>
</template>

<script setup>
import { useSoul } from "~/composables/useSoul.js";
import Button from "~/components/ui/Button.vue";

defineProps({
  iconOnly: {
    type: Boolean,
    default: false
  }
});

const { hasSoul, exportAsBlob } = useSoul();

function handleDownload() {
  exportAsBlob();
}
</script>
