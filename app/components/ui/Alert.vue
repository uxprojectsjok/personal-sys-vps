<template>
  <Transition name="fade">
    <div
      v-if="show"
      :class="['sys-alert', variantClass]"
      role="alert"
      :aria-live="isUrgent ? 'assertive' : 'polite'"
    >
      <i :class="['sys-alert-icon ri-fw', iconClass]" aria-hidden="true" />

      <div class="sys-alert-body">
        <p v-if="title || $slots.title" class="sys-alert-title">
          <slot name="title">{{ title }}</slot>
        </p>
        <div v-if="$slots.default || message || description" class="sys-alert-desc">
          <slot>{{ message || description }}</slot>
        </div>
      </div>

      <div v-if="$slots.action" class="sys-alert-action">
        <slot name="action" />
      </div>

      <button
        v-if="dismissible"
        class="sys-alert-dismiss"
        aria-label="Schließen"
        @click="dismiss"
      >
        <i class="ri-close-line ri-fw" aria-hidden="true" />
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { computed, watch, onUnmounted, ref } from 'vue'

const props = defineProps({
  variant:     { type: String,  default: 'default' }, // default | success | error | destructive | info | warning
  title:       String,
  description: String,
  message:     String,       // backwards-compat shorthand for description
  dismissible: Boolean,
  autoDismiss: { type: Number, default: 0 }, // ms, 0 = disabled
  modelValue:  { type: Boolean, default: undefined },
})

const emit = defineEmits(['update:modelValue', 'dismiss'])

const internalVisible = ref(true)

const show = computed(() => {
  // Message-based visibility (backwards compat: <Alert :message="msg" />)
  if (props.message !== undefined) return !!props.message
  // v-model controlled
  if (props.modelValue !== undefined) return props.modelValue
  return internalVisible.value
})

const normalizedVariant = computed(() => {
  if (props.variant === 'error') return 'destructive'
  return props.variant
})

const variantClass = computed(() => {
  const v = normalizedVariant.value
  return v !== 'default' ? `sys-alert-${v}` : ''
})

const iconClass = computed(() => {
  switch (normalizedVariant.value) {
    case 'success':     return 'ri-checkbox-circle-line'
    case 'destructive': return 'ri-error-warning-line'
    case 'warning':     return 'ri-alert-line'
    case 'info':        return 'ri-information-line'
    default:            return 'ri-information-line'
  }
})

const isUrgent = computed(() => normalizedVariant.value === 'destructive')

function dismiss() {
  internalVisible.value = false
  emit('update:modelValue', false)
  emit('dismiss')
}

let timer = null
watch(() => [props.autoDismiss, show.value], ([ms, visible]) => {
  if (timer) { clearTimeout(timer); timer = null }
  if (ms > 0 && visible) timer = setTimeout(dismiss, ms)
}, { immediate: true })

onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>
