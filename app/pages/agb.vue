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
      <h1>Kaufbedingungen &amp; Vorabinformationen</h1>
      <p class="lead">
        Diese Seite fasst die gesetzlichen Informationspflichten vor Vertragsschluss
        zusammen (Art. 246a EGBGB), die für den Kauf von Zugang zu dieser Soul über
        den Nicht-Krypto-Zahlungsweg (PayPal) gelten. Sie ergänzt die Widerrufsbelehrung,
        die du vor der Zustimmung separat als PDF erhältst.
      </p>

      <h2>Wesentliche Eigenschaften der Leistung</h2>
      <p>
        Zeitlich begrenzter, interaktiver Lesezugriff auf den Agent-Sandbox-Bereich dieser
        Soul über ein Zugriffs-Token — Gültigkeitsdauer je nach Konfiguration der Soul,
        siehe Angabe im Kaufhinweis der Vorschau bzw. der Widerrufsbelehrung.
      </p>

      <h2>Anbieter</h2>
      <p>
        UX-Projects – Jan-Oliver Karo<br>
        [REDACTED-ADDRESS], [REDACTED-ADDRESS], Deutschland<br>
        E-Mail: info@uxprojects-jok.com<br>
        Einzelunternehmen · Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine
        Umsatzsteuer erhoben.
      </p>

      <h2>Gesamtpreis</h2>
      <p>
        Der Preis in EUR wird bei der jeweiligen Soul in der Vorschau (<code>soul_preview</code>)
        angezeigt und ist als Endpreis zu verstehen (siehe Preishinweis dort).
      </p>

      <h2>Zahlungsbedingungen</h2>
      <p>
        Zahlung per PayPal (oder wahlweise POL/Kryptowährung über den technischen
        Zahlungsweg der Soul). Der Zugang wird nach Zahlungseingang manuell durch den
        Betreiber freigeschaltet, in der Regel innerhalb von 48 Stunden — nicht sofort
        wie beim automatisierten POL-Zahlungsweg.
      </p>

      <h2>Leistungsbeginn</h2>
      <p>
        Die digitale Leistung beginnt nach Freischaltung durch den Anbieter, nicht bereits
        mit Zahlungseingang. Mit deiner ausdrücklichen Zustimmung (siehe Widerrufsbelehrung)
        beginnt sie vor Ablauf der 14-tägigen Widerrufsfrist — dadurch erlischt dein
        Widerrufsrecht vorzeitig.
      </p>

      <h2>Funktionsweise digitaler Inhalte</h2>
      <p>
        Zugang erfolgt über ein Zugriffs-Token (<code>pol_access_token</code>), das nach
        Prüfung des Zahlungseingangs per E-Mail oder direkt im Chat übermittelt wird.
        Gültigkeitsdauer je nach Soul-Konfiguration, siehe Widerrufsbelehrungs-PDF.
      </p>

      <h2>Mängelhaftung</h2>
      <p>
        Es gilt das gesetzliche Mängelhaftungsrecht. Bei technischen Problemen wende dich
        an: info@uxprojects-jok.com
      </p>

      <h2>Streitbeilegung</h2>
      <p>
        Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor
        einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).
      </p>

      <p class="fine">
        Stand: 06.07.2026. Diese Instanz befindet sich im Beta-/Testbetrieb.
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
  background: rgba(22,21,19,0.95); backdrop-filter: blur(12px);
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
.content h2 { font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent-bright); margin: 40px 0 12px; font-weight: 500; }
.content p { font-size: 16px; line-height: 1.7; color: var(--fg-2); margin: 0 0 14px; }
.content .lead { font-size: 17px; color: var(--fg); }
.content code { font-family: var(--mono); font-size: 14px; background: var(--surface-2); padding: 1px 6px; border-radius: 4px; }
.content .fine { font-size: 13px; color: var(--fg-3); margin-top: 40px; }

@media (max-width: 640px) {
  .l-nav { grid-template-columns: 1fr auto; }
  .center { display: none; }
}
</style>
