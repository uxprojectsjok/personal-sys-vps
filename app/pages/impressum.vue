<template>
  <div class="legal-page">

    <nav class="l-nav">
      <div class="lockup">
        <span class="mark">SYS<span class="dot">.</span></span>
      </div>
      <div class="center"><span class="page-title">Impressum</span></div>
      <button class="back" @click="$router.back()" aria-label="Zurück">
        ← Zurück
      </button>
    </nav>

    <main id="main-content" class="content">
      <LegalImpressumContent />
    </main>

    <div class="foot-rule">
      <span>© [Jahr] · [Ihr Name]</span>
      <span>WCAG 2.1 AA</span>
    </div>

  </div>
</template>

<script setup>
definePageMeta({ layout: false })
useSeoMeta({ title: 'Impressum – SaveYourSoul', robots: 'noindex' })
</script>

<style scoped>
.legal-page {
  --ink: #08070c; --paper: #12101a; --paper-2: #1a1726;
  --rule: rgba(226,220,240,0.10); --rule-2: rgba(226,220,240,0.20);
  --fg: #ece7f5; --fg-2: rgba(236,231,245,0.72); --fg-3: rgba(236,231,245,0.48); --fg-4: rgba(236,231,245,0.30);
  --accent: #8b5cf6; --accent-bright: #a78bfa;
  --serif: 'Noto Serif', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;
  --mono: 'Oxanium', monospace;
  min-height: 100dvh;
  background: var(--paper);
  color: var(--fg);
  font-family: var(--sans);
}

.l-nav {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 24px;
  padding: 28px clamp(20px,4vw,44px) 24px;
  border-bottom: 1px solid var(--rule);
}
.lockup { display: flex; align-items: center; gap: 10px; }
.logo { width: 32px; height: 32px; object-fit: contain; }
.mark { font-family: var(--mono); font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
.dot { color: var(--accent); }
.center { text-align: center; }
.page-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); }
.back { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; transition: color 0.15s; }
.back:hover { color: var(--accent); }

.content {
  max-width: 720px;
  margin: 0 auto;
  padding: 56px clamp(20px,4vw,44px) 80px;
}

.content :deep(h1) { font-family: var(--serif); font-size: clamp(28px,4vw,40px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; color: var(--fg); margin: 0 0 12px; }
.content :deep(h2) { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin: 48px 0 16px; font-weight: 500; }
.content :deep(h3) { font-family: var(--serif); font-size: 18px; font-weight: 700; color: var(--fg); margin: 28px 0 10px; }
.content :deep(p) { font-size: 15px; line-height: 1.7; color: var(--fg-2); margin: 0 0 14px; }
.content :deep(strong) { color: var(--fg); font-weight: 600; }
.content :deep(a) { color: var(--accent-bright); text-decoration: underline; text-underline-offset: 3px; }
.content :deep(ul) { padding-left: 20px; }
.content :deep(li) { font-size: 15px; line-height: 1.7; color: var(--fg-2); margin-bottom: 6px; }

.foot-rule {
  display: flex;
  justify-content: space-between;
  padding: 20px clamp(20px,4vw,44px);
  border-top: 1px solid var(--rule);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--fg-4);
}

@media (max-width: 640px) {
  .l-nav { grid-template-columns: 1fr auto; }
  .center { display: none; }
}
</style>
