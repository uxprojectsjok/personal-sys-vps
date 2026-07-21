<template>
  <div class="legal-page">
    <nav class="l-nav">
      <div class="lockup"><span class="mark">SYS<span class="dot">.</span></span></div>
      <div class="center"><span class="page-title">Kaufbedingungen</span></div>
      <div class="nav-end">
        <button class="back" @click="$router.back()" aria-label="Zurück">← Zurück</button>
      </div>
    </nav>

    <main class="content">
      <p class="template-notice">
        ⚠️ Platzhaltertext (Lorem Ipsum). Diese Seite ist eine Vorlage für die gesetzlichen
        Informationspflichten vor Vertragsschluss (Art. 246a EGBGB). Bevor diese Soul
        echte Zahlungen (PayPal oder x402/USDC) entgegennimmt, muss der Node-Betreiber
        diesen Text durch seine eigenen, rechtlich geprüften Angaben ersetzen — das
        SYS-Projekt liefert hier keine Rechtsberatung.
      </p>

      <h1>Lorem Ipsum Dolor Sit Amet</h1>
      <p class="lead">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
        incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam quis
        nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      </p>

      <h2>1. Lorem ipsum dolor sit amet</h2>
      <p>
        Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
        fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
        culpa qui officia deserunt mollit anim id est laborum.
      </p>

      <h2>2. Anbieter</h2>
      <p>
        __OPERATOR_NAME__<br>
        __OPERATOR_ADDRESS__<br>
        E-Mail: __OPERATOR_EMAIL__<br>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
      </p>

      <h2>3. Lorem ipsum dolor sit amet</h2>
      <p>
        Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
        doloremque laudantium, totam rem aperiam eaque ipsa quae ab illo inventore
        veritatis et quasi architecto beatae vitae dicta sunt explicabo.
      </p>

      <h2>4. Lorem ipsum dolor sit amet</h2>
      <p>
        Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed
        quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
        Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.
      </p>

      <h2>5. Lorem ipsum dolor sit amet</h2>
      <p>
        Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit
        laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure
        reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.
      </p>

      <h2>6. Lorem ipsum dolor sit amet</h2>
      <p>
        At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis
        praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias
        excepturi sint occaecati cupiditate non provident.
      </p>

      <h2>7. Lorem ipsum dolor sit amet</h2>
      <p>
        Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et
        dolorum fuga. Bei technischen Problemen wende dich an: __OPERATOR_EMAIL__
      </p>

      <h2>8. Lorem ipsum dolor sit amet</h2>
      <p>
        Et harum quidem rerum facilis est et expedita distinctio nam libero tempore
        cum soluta nobis est eligendi optio cumque nihil impedit quo minus.
      </p>

      <p class="fine">
        Lorem ipsum — Platzhalter, kein echtes Datum.
      </p>
    </main>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })
useSeoMeta({ title: 'Kaufbedingungen – SYS', robots: 'noindex' })
</script>

<style scoped>
/* body hat app-weit overflow:hidden (eigener Scroll-Container ist die Konvention) —
   diese Standalone-Seite hat keinen, macht sich also selbst zum Scroll-Container. */
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

.content { max-width: 720px; margin: 0 auto; padding: 56px clamp(20px,4vw,44px) 80px; }
.content h1 { font-family: var(--serif); font-size: clamp(26px,4vw,42px); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 12px; }
.content h2 { font-family: var(--sans); font-size: 16px; letter-spacing: normal; text-transform: none; color: var(--fg); margin: 40px 0 12px; font-weight: 700; }
.content p { font-size: 16px; line-height: 1.7; color: var(--fg); margin: 0 0 14px; }
.content .lead { font-size: 17px; color: var(--fg); }
.content code { font-family: var(--mono); font-size: 14px; background: var(--surface-2); padding: 1px 6px; border-radius: 4px; }
.content .fine { font-size: 13px; color: var(--fg-3); margin-top: 40px; }
.template-notice { font-size: 14px; line-height: 1.6; color: var(--fg); background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin: 0 0 32px; }

@media (max-width: 640px) {
  .l-nav { grid-template-columns: 1fr auto; }
  .center { display: none; }
}
</style>
