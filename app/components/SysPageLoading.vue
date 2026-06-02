<template>
  <div class="sys-page-loading">
    <svg class="sys-page-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
    </svg>
    <span class="sys-page-loading-text">SYS<span class="dot">.</span></span>
  </div>
</template>

<style scoped>
.sys-page-loading {
  min-height: 100dvh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px;
  background: var(--bg);
}
.sys-page-spinner {
  width: 28px; height: 28px;
  color: var(--accent);
  animation: sys-spin 0.9s linear infinite;
}
@keyframes sys-spin { to { transform: rotate(360deg); } }
.sys-page-loading-text {
  font-family: var(--serif); font-size: 22px; font-weight: 700;
  letter-spacing: -0.03em; color: var(--fg);
}
.dot { color: var(--accent); }
</style>
