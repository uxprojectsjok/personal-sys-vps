<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <ConsentBanner
    :isVisible="true"
    @showPrivacy="navigateTo('/datenschutz')"
    @showPrivacyFaq="faqOpen = true"
  />
  <PrivacyFaqModal :isOpen="faqOpen" @close="faqOpen = false" />
</template>

<script setup>
import { ref } from 'vue'
const faqOpen = ref(false)
</script>
