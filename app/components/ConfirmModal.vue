<template>
  <Modal
    :open="open"
    :title="title"
    :confirm-text="confirmText"
    :cancel-text="cancelText"
    :danger="danger"
    @confirm="_confirm"
    @cancel="_cancel"
  >
    <span v-if="message">{{ message }}</span>
  </Modal>
</template>

<script setup>
import Modal from '~/components/ui/Modal.vue';
import { useConfirm } from '~/composables/useConfirm.js';
const { open, title, message, confirmText, cancelText, danger, _confirm, _cancel } = useConfirm();
</script>
