<template>
  <div class="legal-page">
    <nav class="l-nav">
      <div class="lockup"><span class="mark">SYS<span class="dot">.</span></span></div>
      <div class="center"><span class="page-title">{{ t('impressum.pageTitle') }}</span></div>
      <div class="nav-end">
        <div class="lang-toggle">
          <button :class="{ active: locale === 'de' }" @click="switchLocale('de')">DE</button>
          <button :class="{ active: locale === 'en' }" @click="switchLocale('en')">EN</button>
        </div>
        <button class="back" @click="$router.back()" aria-label="Back">← </button>
      </div>
    </nav>

    <main class="content">
      <h1>{{ t('impressum.h1') }}</h1>
      <p class="lead">{{ t('impressum.sub') }}</p>

      <h2>{{ t('impressum.s1h2') }}</h2>
      <div v-html="t('impressum.s1Content')"></div>

      <h2>{{ t('impressum.s2h2') }}</h2>
      <div v-html="t('impressum.s2Content')"></div>

      <h2>{{ t('impressum.s3h2') }}</h2>
      <p>{{ t('impressum.s3Content') }}</p>

      <h2>{{ t('impressum.s4h2') }}</h2>
      <p>{{ t('impressum.s4Content') }}</p>

      <h2>{{ t('impressum.s5h2') }}</h2>
      <div v-html="t('impressum.s5Content')"></div>

      <h2>{{ t('impressum.s6h2') }}</h2>
      <div v-html="t('impressum.s6Content')"></div>

      <h2>{{ t('impressum.s7h2') }}</h2>
      <div v-html="t('impressum.s7Content')"></div>

      <h2>{{ t('impressum.s8h2') }}</h2>
      <div v-html="t('impressum.s8Content')"></div>

      <h2>{{ t('impressum.s9h2') }}</h2>
      <div v-html="t('impressum.s9Content')"></div>

      <h2>{{ t('impressum.s10h2') }}</h2>
      <p>{{ t('impressum.s10Content') }}</p>

      <h2>{{ t('impressum.s11h2') }}</h2>
      <div v-html="t('impressum.s11Content')"></div>

      <p class="fine">{{ t('impressum.stand') }}</p>
    </main>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Impressum – SYS', robots: 'noindex' })

const { t, locale, setLocale } = useI18n()
function switchLocale(code) {
  setLocale(code)
  localStorage.setItem('sys-locale', code)
}
</script>

<style scoped>
/* body hat app-weit overflow:hidden — diese Standalone-Seite macht sich
   selbst zum Scroll-Container, gleiche Konvention wie agb.vue. */
.legal-page { height: 100dvh; overflow-y: auto; -webkit-overflow-scrolling: touch; background: var(--bg); color: var(--fg); font-family: var(--sans); }

.l-nav {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px;
  padding: 0 clamp(20px,4vw,44px); height: 64px; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; z-index: 100;
  background: rgba(23,23,23,0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.lockup { display: flex; align-items: center; gap: 10px; }
.mark { font-family: var(--serif); font-size: clamp(20px,3vw,26px); font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
.dot { color: var(--accent); }
.center { text-align: center; }
.page-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg); }
.nav-end { display: flex; align-items: center; gap: 16px; }
.back { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg); background: none; border: none; cursor: pointer; }
.back:hover { color: var(--accent); }
.lang-toggle { display: flex; gap: 4px; }
.lang-toggle button {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: var(--fg-3);
  background: none; border: 1px solid var(--line); padding: 3px 8px; cursor: pointer;
}
.lang-toggle button.active { color: var(--fg); border-color: var(--accent); }

.content { max-width: 720px; margin: 0 auto; padding: 56px clamp(20px,4vw,44px) 80px; }
.content h1 { font-family: var(--serif); font-size: clamp(26px,4vw,42px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 12px; }
.content h2 { font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent-bright); margin: 40px 0 12px; font-weight: 500; }
.content p, .content :deep(p) { font-size: 16px; line-height: 1.7; color: var(--fg); margin: 0 0 14px; }
.content .lead { font-size: 17px; color: var(--fg); }
.content :deep(code) { font-family: var(--mono); font-size: 14px; background: var(--surface-2); padding: 1px 6px; border-radius: 4px; }
.content :deep(a) { color: var(--accent-bright); text-decoration: none; }
.content :deep(a:hover) { text-decoration: underline; }
.content :deep(.i-name) { font-weight: 600; }
.content :deep(.i-sub) { font-size: 13px; color: var(--fg-3); }
.content .fine { font-size: 13px; color: var(--fg-3); margin-top: 40px; }

@media (max-width: 640px) {
  .l-nav { grid-template-columns: 1fr auto; }
  .center { display: none; }
}
</style>
