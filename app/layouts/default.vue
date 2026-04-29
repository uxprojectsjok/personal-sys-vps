<template>
  <div class="min-h-screen min-h-dvh bg-[var(--sys-bg)] text-[var(--sys-fg)] flex flex-col">
    <!-- Skip-to-main-content (WCAG 2.4.1) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--sys-accent)] focus:text-black focus:font-semibold focus:text-sm focus:shadow-lg focus:outline-none"
    >
      Zum Hauptinhalt springen
    </a>
    <slot />
  </div>
</template>
