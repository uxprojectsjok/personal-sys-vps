<!-- ════════════════════════════════════════════════════════════════════
  SYS · ConfirmModal.vue · Editorial v2
  Drop-in replacement. Same composable (useConfirm), same surface.
  Just delegates to the upgraded ui/Modal.vue.
═════════════════════════════════════════════════════════════════════ -->

<template>
  <Modal
    :open="open"
    :title="title"
    :confirm-text="confirmText"
    :cancel-text="cancelText"
    :danger="danger"
    size="sm"
    @confirm="_confirm"
    @cancel="_cancel"
  >
    <p v-if="message" class="sys-prose" style="margin: 0;">{{ message }}</p>
  </Modal>
</template>

<script setup>
import Modal from '~/components/ui/Modal.vue';
import { useConfirm } from '~/composables/useConfirm.js';
const {
  open,
  title,
  message,
  confirmText,
  cancelText,
  danger,
  _confirm,
  _cancel,
} = useConfirm();
</script>
