<template>
  <div class="docs-page">

    <!-- ── Gesperrt ── -->
    <div v-if="!allowed" class="locked-screen">
      <div class="locked-inner">
        <span class="locked-mono">Zugang eingeschränkt</span>
        <h1 class="locked-title">API-Dokumentation<em>.</em></h1>
        <p class="locked-body">Die Dokumentation ist derzeit nur für eingeloggte Nutzerinnen und Nutzer zugänglich.</p>
        <NuxtLink to="/" class="locked-btn">← Zur App</NuxtLink>
      </div>
    </div>

    <!-- ── Haupt-Docs-Layout ── -->
    <template v-else>

      <!-- Sticky Top-Nav -->
      <header class="docs-nav">
        <div class="docs-nav-inner">
          <div class="docs-lockup">
            <span class="docs-mark">SYS<span class="docs-dot">.</span></span>
            <span class="docs-slash hidden sm:inline">/</span>
            <span class="docs-title hidden sm:inline">API-Docs</span>
          </div>

          <!-- Search -->
          <div class="docs-search-wrap" @click="searchFocus">
            <svg class="docs-search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z" />
            </svg>
            <input ref="searchInput" v-model="searchQuery" type="text" placeholder="Suchen…" class="docs-search-input" />
            <kbd class="docs-search-kbd">⌘K</kbd>
          </div>

          <div class="docs-nav-right">
            <NuxtLink to="/" class="docs-back" aria-label="Zurück zur App">← Zurück</NuxtLink>
            <button class="docs-menu-btn md:hidden" @click="sidebarOpen = !sidebarOpen" aria-label="Navigation">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path v-if="sidebarOpen" stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                <path v-else stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div class="max-w-screen-xl mx-auto flex">

        <!-- ── Sidebar ── -->
        <aside
          class="fixed md:sticky top-14 h-[calc(100vh-3.5rem)] w-64 flex-none overflow-y-auto border-r border-[var(--sys-border)] bg-[var(--sys-bg)] transition-transform duration-200 z-30"
          :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
        >
          <nav class="p-4 space-y-1">
            <!-- Mobile search -->
            <div class="md:hidden mb-3">
              <div class="flex items-center gap-2 bg-[var(--sys-bg-surface)] border border-[var(--sys-border)] rounded-xl px-3 h-9">
                <svg class="w-3.5 h-3.5 text-[var(--sys-fg-dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0Z" />
                </svg>
                <input v-model="searchQuery" type="text" placeholder="Suchen…" class="bg-transparent text-sm text-[var(--sys-fg)] placeholder-[var(--sys-fg-dim)] focus:outline-none flex-1" />
              </div>
            </div>

            <template v-for="group in filteredNav" :key="group.id">
              <div class="pt-3 first:pt-0">
                <p class="text-xs tracking-[0.18em] uppercase font-semibold text-[var(--sys-fg-dim)] mb-1.5 px-3">{{ group.title }}</p>
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  class="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
                  :class="activeSection === item.id
                    ? 'bg-[rgba(255,255,255,0.08)] text-white'
                    : 'text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[var(--sys-bg-surface)]'"
                  @click="scrollTo(item.id)"
                >
                  {{ item.title }}
                </button>
              </div>
            </template>

            <div v-if="searchQuery && filteredNav.length === 0" class="px-3 py-4 text-sm text-[var(--sys-fg-dim)]">
              Keine Treffer für „{{ searchQuery }}"
            </div>
          </nav>
        </aside>

        <!-- Mobile overlay -->
        <div
          v-if="sidebarOpen"
          class="fixed inset-0 bg-black/60 z-20 md:hidden"
          @click="sidebarOpen = false"
        />

        <!-- ── Main Content ── -->
        <main class="font-content flex-1 min-w-0 px-6 md:px-10 lg:px-16 py-10 md:py-12">

          <!-- Hero -->
          <div class="doc-hero">
            <span class="doc-hero-kicker">API-Dokumentation</span>
            <h1 class="doc-hero-title">SaveYour<em>Soul.</em></h1>
            <p class="doc-hero-sub">Alles was du brauchst, um deine digitale Identität aufzubauen, zu sichern und für KI-Systeme zugänglich zu machen.</p>
          </div>

          <!-- Quick-Links -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-16 max-w-3xl">
            <button
              v-for="q in quickLinks"
              :key="q.id"
              class="group text-left p-4 rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.03)] transition-all"
              @click="scrollTo(q.id)"
            >
              <p class="text-sm font-semibold mb-1 group-hover:text-[var(--sys-accent)] transition-colors">{{ q.title }}</p>
              <p class="text-xs text-[var(--sys-fg-dim)] leading-snug">{{ q.desc }}</p>
            </button>
          </div>

          <!-- ═══════════════════════════════════════
               SECTION 1 – EINFÜHRUNG
               ═══════════════════════════════════════ -->
          <section :id="'what-is-sys'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Erste Schritte">Was ist SaveYourSoul?</DocHeading>
            <p class="doc-lead">SaveYourSoul (SYS) ist ein Konzeptprojekt für eine portable, nutzerkontrollierte Identitätsschicht im KI-Zeitalter. Deine Identität gehört dir — nicht einer Plattform.</p>

            <p class="doc-p">Im Kern von SYS steht eine einfache Idee: Eine <strong>Soul</strong> ist eine Markdown-Datei (<code class="doc-code">sys.md</code>), die deine Persönlichkeit, Erinnerungen und Kontext beschreibt. Diese Datei gehört dir, liegt bei dir, und wird von dir kontrolliert.</p>

            <p class="doc-p">KI-Systeme lesen diese Datei und können dadurch als du sprechen, denken und handeln — authentisch, weil es wirklich <em>dein</em> Kontext ist.</p>

            <div class="doc-info-box my-6">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Kern-Konzepte auf einen Blick</p>
              <div class="space-y-2">
                <div v-for="c in coreConcepts" :key="c.term" class="flex gap-3">
                  <span class="text-xs font-mono text-[var(--sys-accent)] w-20 flex-none pt-0.5">{{ c.term }}</span>
                  <span class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">{{ c.desc }}</span>
                </div>
              </div>
            </div>

            <p class="doc-p">SYS ist kein klassischer Cloud-Dienst. Deine Daten werden optional auf einem VPS gespeichert — aber <em>du</em> entscheidest was und wann. <strong>Verschlüsselung ist Standard</strong> — Klartext verlässt deinen Browser nie, es sei denn du aktivierst explizit den Open-Modus für Public-Network-Souls. Der Vault (dein lokaler Dateiordner) verlässt deinen Rechner nur, wenn du es explizit erlaubst.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 2 – SOUL ERSTELLEN
               ═══════════════════════════════════════ -->
          <section :id="'create-soul'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1">Soul erstellen &amp; einloggen</DocHeading>

            <div class="doc-steps mb-6">
              <div v-for="(step, i) in createSteps" :key="i" class="doc-step">
                <div class="doc-step-num">{{ i + 1 }}</div>
                <div>
                  <p class="text-sm font-semibold mb-0.5">{{ step.title }}</p>
                  <p class="text-sm text-[var(--sys-fg-dim)] leading-relaxed">{{ step.desc }}</p>
                </div>
              </div>
            </div>

            <div class="doc-warning-box my-6">
              <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Geschlossene Testphase</p>
              <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed"></p>
            </div>

            <DocHeading level="2">Soul-Datei verstehen</DocHeading>
            <p class="doc-p">Deine Soul-Datei ist eine Markdown-Datei mit YAML-Frontmatter. Sie beschreibt wer du bist — und wächst mit jeder Entwicklungs-Session.</p>

            <DocCode lang="markdown">---
name: "Jan"
created: "2026-03-11"
soulmate: "claude-sonnet-4-6"
traits:
  - kreativ
  - technisch
  - direkt
topics:
  - Produktdesign
  - KI-Systeme
  - Entrepreneurship
---

# Soul

Ich bin Jan, UX-Designer und Gründer von SaveYourSoul...

## Entwicklung · 2026-03-22
...neue Erkenntnisse, Gedanken, Entscheidungen...</DocCode>

            <p class="doc-p">Entwicklungs-Sessions werden chronologisch an die Datei angehängt. Die KI liest die gesamte Datei und erhält so einen kontinuierlichen Kontext über Wochen und Monate.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 3 – VAULT
               ═══════════════════════════════════════ -->
          <section :id="'vault'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Lokal & Sicher">Vault</DocHeading>
            <p class="doc-lead">Der Vault ist ein lokaler Ordner auf deinem Gerät. Er enthält deine Soul-Dateien, Audiomemos, Bilder und Kontext-Dokumente.</p>

            <DocHeading level="2">Vault verbinden</DocHeading>
            <p class="doc-p">Der Vault kann lokal über die File System Access API verbunden werden. Für Cloud-Backups: .soul-Bundle herunterladen, sicher ablegen und beim nächsten Login über den Import-Dialog laden. Zwei Optionen beim Login:</p>
            <div class="doc-info-box my-4">
              <div class="space-y-2">
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-16 flex-none">Lokal</span>
                  <span class="text-[var(--sys-fg-dim)]">Öffnet einen lokalen Ordner über die File System Access API. SYS speichert den Zugriff in IndexedDB — der Vault ist bei jedem Besuch automatisch verfügbar.</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-16 flex-none">URL / Cloud</span>
                  <span class="text-[var(--sys-fg-dim)]">Beim Login: eine HTTPS-URL (Google Drive, Arweave, IPFS, S3 …) oder Arweave TX-ID eingeben, um ein verschlüsseltes .soul-Bundle direkt zu laden und mit 12 Wörtern zu entschlüsseln. Cloud-Speicher dient nur der Aufbewahrung — kein automatischer Sync.</span>
                </div>
              </div>
            </div>
            <p class="doc-p">Nach erfolgreicher Verbindung zeigt die Vault-Zeile die Anzahl gefundener Dateien. Ein rotes <strong>✕</strong> rechts davon trennt den Vault sofort.</p>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Kompatibilität</p>
              <div class="space-y-1">
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-white/60">✓</span>
                  <span class="text-[var(--sys-fg-dim)]">Chrome, Edge, Brave (Desktop) — vollständige Unterstützung</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-white/60">✓</span>
                  <span class="text-[var(--sys-fg-dim)]">Android Chrome — In-Memory Vault (kein persistenter Ordner)</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-[var(--sys-amber)]">~</span>
                  <span class="text-[var(--sys-fg-dim)]">iOS Safari — In-Memory (Dateien werden nicht zwischen Besuchen gespeichert)</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-red-400">✗</span>
                  <span class="text-[var(--sys-fg-dim)]">Firefox — File System Access API nicht unterstützt</span>
                </div>
              </div>
            </div>

            <DocHeading level="2">VPS-Sync &amp; API-Zugang</DocHeading>
            <p class="doc-p">Damit externe Dienste und MCP-Agenten auf deine Soul zugreifen können, musst du Dateien auf den VPS hochladen (Kachel <em>API-Kontext</em> → Hochladen). <strong>Alle Uploads sind standardmäßig AES-256-CBC verschlüsselt</strong> — der Sync blockiert wenn kein Vault-Schlüssel vorhanden ist. Wähle den Modus bewusst:</p>

            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead>
                  <tr>
                    <th>Modus</th>
                    <th>Beschreibung</th>
                    <th>Empfohlen für</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in vaultModes" :key="m.mode">
                    <td class="font-mono text-xs text-[var(--sys-accent)]">{{ m.mode }}</td>
                    <td>{{ m.desc }}</td>
                    <td class="text-[var(--sys-fg-dim)]">{{ m.for }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <DocHeading level="2">Verschlüsseln &amp; Download</DocHeading>
            <p class="doc-p">Unter <em>Verschlüsseln und Download</em> erzeugst du eine vollständige, verschlüsselte Sicherungskopie deines Vaults als <code class="doc-code">.soul</code>-Bundle (JSON). Der Prozess läuft in zwei Phasen:</p>
            <div class="doc-info-box my-4">
              <div class="space-y-2">
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-32 flex-none pt-0.5">1. VPS-Fetch</span>
                  <span class="text-[var(--sys-fg-dim)]">Alle auf dem VPS gespeicherten Vault-Dateien werden abgerufen. Falls der VPS eine aktive Vault-Session hat, werden CBC-verschlüsselte Dateien dabei automatisch entschlüsselt. Dateien die nicht entschlüsselt werden konnten, werden übersprungen — mit einem Warnhinweis im Ergebnis-Screen.</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-32 flex-none pt-0.5">2. AES-256-GCM</span>
                  <span class="text-[var(--sys-fg-dim)]">sys.md + alle Vault-Dateien (lokal + VPS) werden client-seitig mit AES-256-GCM neu verschlüsselt und als <code>.soul</code>-Bundle heruntergeladen. Lokale Dateien haben bei Namensgleichheit Vorrang.</span>
                </div>
              </div>
            </div>
            <p class="doc-p">Das Bundle kannst du auf beliebigem externen Speicher ablegen (Google Drive, ArDrive, IPFS …). Beim nächsten Login einfach die URL im Import-Dialog eingeben — das Bundle wird geladen und mit deinen 12 Wörtern entschlüsselt. Cloud-Speicher dient nur der sicheren Aufbewahrung, kein automatischer Sync.</p>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Schlüsselquelle</th><th>Verfahren</th><th>Empfohlen für</th></tr></thead>
                <tbody>
                  <tr v-for="m in bundleKeyModes" :key="m.mode">
                    <td class="font-mono text-xs text-[var(--sys-accent)]">{{ m.mode }}</td>
                    <td>{{ m.desc }}</td>
                    <td class="text-[var(--sys-fg-dim)]">{{ m.for }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-1">Wichtig: 12 Wörter sicher aufbewahren</p>
              <p class="text-xs text-[var(--sys-fg-dim)]">Deine 12 Wörter (BIP39 Mnemonic) sind der einzige Schlüssel zu deinem verschlüsselten Bundle. Sie werden nirgends gespeichert. Verlierst du sie, ist der Zugang zum verschlüsselten Vault unwiderruflich verloren.</p>
            </div>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 4 – API-KONTEXT
               ═══════════════════════════════════════ -->
          <section :id="'api-context'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Für KI-Dienste">API-Kontext</DocHeading>
            <p class="doc-lead">Der API-Kontext steuert welche Daten externe Dienste lesen dürfen. Du öffnest die Kachel <em>API-Kontext</em> und konfigurierst Berechtigungen sowie Dateien.</p>

            <DocHeading level="2">API aktivieren</DocHeading>
            <p class="doc-p">Der Schalter <strong>API-Zugriff aktivieren</strong> schaltet den gesamten externen Zugang ein oder aus. Bei deaktiviertem API erhalten alle verbundenen Dienste einen <code class="doc-code">403</code>-Fehler, unabhängig von ihrem Token.</p>

            <DocHeading level="2">Berechtigungen</DocHeading>
            <p class="doc-p">Jede Berechtigung kontrolliert eine Datei-Kategorie:</p>

            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Berechtigung</th><th>Inhalt</th><th>Endpunkt</th></tr></thead>
                <tbody>
                  <tr v-for="p in apiPermissions" :key="p.name">
                    <td class="font-mono text-xs text-[var(--sys-indigo)]">{{ p.name }}</td>
                    <td>{{ p.content }}</td>
                    <td class="font-mono text-xs text-[var(--sys-fg-dim)]">{{ p.endpoint }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <DocHeading level="2">Dateien hochladen</DocHeading>
            <p class="doc-p">Dateien aus deinem lokalen Vault werden auf dem SYS-Server gespeichert und für verbundene Dienste bereitgestellt. Audio- und Videodateien werden serverseitig in optimierte Formate konvertiert (MP3, MP4).</p>
            <p class="doc-p">Das Archiv zeigt den Status jeder Datei: <strong>LOKAL</strong> (nur im Vault), <strong>AKTIV</strong> (auf dem Server) oder <strong>VERALTET</strong> (neuere Version lokal verfügbar).</p>

            <div class="doc-warning-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Vault-Zugang erforderlich</p>
              <p class="text-xs text-[var(--sys-fg-dim)]">Bevor du Dateien hochladen kannst, muss der Vault-Zugang offen sein. Ohne offenen Zugang bleiben hochgeladene Dateien für externe Dienste unzugänglich.</p>
            </div>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 5 – VERBUNDENE DIENSTE
               ═══════════════════════════════════════ -->
          <section :id="'services'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Integrationen">Verbundene Dienste</DocHeading>
            <p class="doc-lead">Jeder externe Dienst erhält einen eigenen Service-Token mit granularen Berechtigungen und optionalem Ablaufdatum.</p>

            <DocHeading level="2">Service-Token erstellen</DocHeading>
            <p class="doc-p">Öffne die Kachel <em>Verbundene Dienste</em> und klicke <strong>+ Dienst hinzufügen</strong>. Vergib einen Namen (z.B. „Mein KI-Agent"), wähle die Berechtigungen und das Ablaufdatum.</p>
            <p class="doc-p">Nach dem Erstellen öffnet sich automatisch das Token-Fenster. <strong>Kopiere den Token sofort</strong> — er wird aus Sicherheitsgründen nicht erneut vollständig angezeigt.</p>

            <DocHeading level="2">Token verwenden</DocHeading>
            <p class="doc-p">Alle API-Anfragen eines verbundenen Dienstes müssen den Token im <code class="doc-code">Authorization</code>-Header mitschicken:</p>

            <DocCode lang="http">GET /api/soul HTTP/1.1
Host: YOUR_DOMAIN
Authorization: Bearer &lt;dein-service-token&gt;</DocCode>

            <DocHeading level="2">Verbindung testen</DocHeading>
            <p class="doc-p">Im Token-Fenster findest du den Button <strong>„Verbindung testen"</strong>. Er sendet eine Test-Anfrage mit dem Token und zeigt sofort ob der Vault-Zugang offen ist und der Token gültig ist.</p>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Mögliche Fehlercodes</p>
              <div class="space-y-1.5">
                <div class="flex gap-3 text-xs">
                  <code class="font-mono text-[var(--sys-amber)] w-8 flex-none">401</code>
                  <span class="text-[var(--sys-fg-dim)]">Token ungültig oder nicht vorhanden</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <code class="font-mono text-[var(--sys-amber)] w-8 flex-none">403</code>
                  <span class="text-[var(--sys-fg-dim)]">Vault gesperrt — Zugang muss in der App geöffnet werden</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <code class="font-mono text-[var(--sys-amber)] w-8 flex-none">403</code>
                  <span class="text-[var(--sys-fg-dim)]">API deaktiviert — Schalter in API-Kontext prüfen</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <code class="font-mono text-[var(--sys-amber)] w-8 flex-none">403</code>
                  <span class="text-[var(--sys-fg-dim)]">Fehlende Berechtigung — Token hat keinen Zugriff auf diese Ressource</span>
                </div>
              </div>
            </div>

            <DocHeading level="2">Token widerrufen</DocHeading>
            <p class="doc-p">Klicke in der Service-Liste auf <strong>„Widerrufen"</strong>. Der Token ist sofort ungültig. Alle laufenden Dienste, die diesen Token verwenden, erhalten ab dem nächsten Request einen <code class="doc-code">401</code>-Fehler.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 6 – SOUL NETWORK
               ═══════════════════════════════════════ -->
          <section :id="'soul-network'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Peer-to-Peer">Soul Network</DocHeading>
            <div class="doc-warning-box mb-4 flex items-start gap-2.5">
              <svg class="w-4 h-4 shrink-0 mt-0.5 text-[var(--sys-amber)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
              <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed"><strong class="text-[var(--sys-amber)]">In aktiver Entwicklung.</strong> Das Soul Network befindet sich im Aufbau — Funktionen, API-Endpunkte und das Freigabe-Modell können sich kurzfristig ändern. Die aktuelle Dokumentation spiegelt den Stand des letzten Tests wider.</p>
            </div>
            <p class="doc-lead">Das Soul Network ermöglicht es, Souls direkt miteinander zu verbinden. KI-Agenten können den Soul-Kontext verbundener Personen in ihre Antworten einbeziehen.</p>

            <DocHeading level="2">Das Konzept</DocHeading>
            <p class="doc-p">Jede Soul hat eine eindeutige <strong>Soul-ID</strong> — eine lange alphanumerische Kennung. Diese ID ist ein privates Geheimnis: Sie steht nirgendwo öffentlich und kann nicht erraten werden.</p>
            <p class="doc-p">Wenn du jemandem deine Soul-ID gibst, vertraust du ihnen — denn mit der ID können sie deinen Soul-Kontext lesen. Das macht das Netzwerk zu einem <em>kryptographisch verankerten Vertrauensgraphen</em>: Nur Menschen, die du persönlich kennst, kommen an deine ID.</p>

            <DocHeading level="2">Verbindung aufbauen</DocHeading>
            <p class="doc-p">Öffne in der App die Kachel <em>Soul Network</em>. Dort siehst du deine eigene Soul-ID (zum Kopieren und Weitergeben). Um eine Verbindung herzustellen:</p>

            <div class="doc-steps mb-4">
              <div v-for="(s, i) in networkSteps" :key="i" class="doc-step">
                <div class="doc-step-num">{{ i + 1 }}</div>
                <div>
                  <p class="text-sm font-semibold mb-0.5">{{ s.title }}</p>
                  <p class="text-sm text-[var(--sys-fg-dim)]">{{ s.desc }}</p>
                </div>
              </div>
            </div>

            <DocHeading level="2">Verbindungsstatus</DocHeading>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Status</th><th>Bedeutung</th></tr></thead>
                <tbody>
                  <tr>
                    <td><span class="inline-flex items-center gap-1.5 text-xs"><span class="w-2 h-2 rounded-full bg-[var(--sys-accent)]"></span> Gegenseitig</span></td>
                    <td class="text-[var(--sys-fg-dim)] text-sm">Beide Seiten haben die Verbindung aufgebaut. KI-Agenten können den Netzwerk-Kontext lesen.</td>
                  </tr>
                  <tr>
                    <td><span class="inline-flex items-center gap-1.5 text-xs"><span class="w-2 h-2 rounded-full bg-[var(--sys-amber)]"></span> Einseitig</span></td>
                    <td class="text-[var(--sys-fg-dim)] text-sm">Nur du hast verbunden. Die andere Seite muss ebenfalls eine Verbindung zu dir aufbauen.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <DocHeading level="2">Verbindung trennen</DocHeading>
            <p class="doc-p">Klicke in der Verbindungsliste auf <strong>„Trennen"</strong>. Die andere Person erhält beim nächsten Öffnen des Soul Networks eine Benachrichtigung, dass du die Verbindung getrennt hast. Sie kann diese mit „Ok" quittieren.</p>
            <p class="doc-p">Beide Seiten können jederzeit trennen — unabhängig voneinander. Die Verbindung ist vollständig aufgehoben, sobald eine Seite trennt.</p>

            <DocHeading :id="'soul-network-vault'" level="2">Inhalte im Netzwerk teilen</DocHeading>
            <p class="doc-p">Permission-Scopes und Dateifreigabe sind <strong>zwei getrennte Ebenen</strong>. Ein Scope allein reicht nicht — jede Datei muss zusätzlich explizit im Bereich <strong>„Netzwerk-Freigaben"</strong> freigegeben werden. Granulare Kontrolle: du entscheidest pro Datei was sichtbar ist.</p>
            <p class="doc-p">Unterstützte Formate: Audio (MP3, WAV, OGG, M4A, OPUS, FLAC, AAC, WebM), Video (MP4, MOV, AVI, MKV, WebM), Bilder (JPG, PNG, WebP, GIF, AVIF), Kontext-Dokumente (PDF, MD, TXT).</p>

            <div class="doc-steps mb-6">
              <div class="doc-step">
                <div class="doc-step-num">1</div>
                <div>
                  <p class="text-sm font-semibold mb-0.5">Verbindung aufbauen</p>
                  <p class="text-sm text-[var(--sys-fg-dim)]">Im Soul Network die Soul-ID der anderen Person eintragen und verbinden. Der <code class="doc-code">soul_grant</code> wird automatisch angelegt — kein manuelles Konfigurieren notwendig.</p>
                </div>
              </div>
              <div class="doc-step">
                <div class="doc-step-num">2</div>
                <div>
                  <p class="text-sm font-semibold mb-0.5">Dateien freigeben</p>
                  <p class="text-sm text-[var(--sys-fg-dim)]">Im Bereich <strong>„Netzwerk-Freigaben"</strong> → <strong>„Datei hinzufügen"</strong> → Datei aus dem Server-Vault wählen. Die Datei wird sofort in den Public Vault hochgeladen und ist danach für verbundene Souls sichtbar. Entfernen per Mülleimer-Icon jederzeit möglich.</p>
                </div>
              </div>
              <div class="doc-step">
                <div class="doc-step-num">3</div>
                <div>
                  <p class="text-sm font-semibold mb-0.5">Vault-Zugang aktiv halten</p>
                  <p class="text-sm text-[var(--sys-fg-dim)]">Die Kachel <strong>„Vault-Zugang"</strong> muss offen sein. Läuft die Vault-Session ab, erhalten verbundene Souls beim Zugriff einen <code class="doc-code">403 vault_locked</code>-Fehler.</p>
                </div>
              </div>
            </div>

            <div class="doc-warning-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Public Vault ist ein separates Verzeichnis</p>
              <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">Nur Dateien die explizit freigegeben wurden landen in <code class="doc-code">vault_public/files/</code>. Dateien im privaten Vault (<code class="doc-code">vault/</code>) sind niemals direkt für andere zugänglich. Verschlüsselte Dateien können nicht freigegeben werden — Dateien im Public Vault sind immer im Klartext gespeichert.</p>
            </div>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Zusammenfassung: Was wird wie geteilt?</p>
              <div class="space-y-2">
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-36 flex-none pt-0.5">Audio / Video</span>
                  <span class="text-[var(--sys-fg-dim)]">Explizit in Netzwerk-Freigaben freigeben. KI kann Dateien als <code>[public-vault-audio:]</code> / <code>[public-vault-video:]</code> im Chat einbetten.</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-36 flex-none pt-0.5">Bilder</span>
                  <span class="text-[var(--sys-fg-dim)]">Explizit in Netzwerk-Freigaben freigeben. KI bettet Bilder als <code>[public-vault-img:]</code> ein.</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-36 flex-none pt-0.5">PDF / MD / TXT</span>
                  <span class="text-[var(--sys-fg-dim)]">Explizit freigeben. Wird als Kontext-Datei inline an verbundene KI-Agenten übergeben.</span>
                </div>
              </div>
            </div>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 6b – SOUL-SYNC
               ═══════════════════════════════════════ -->
          <section :id="'soul-sync'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Multi-Device">Soul-Sync</DocHeading>
            <p class="doc-lead">Der VPS ist die einzige Wahrheitsquelle (Single Point of Truth). Beim Start wird die Server-Version automatisch mit der lokalen sys.md verglichen — Abweichungen werden angezeigt, bevor etwas gespeichert wird.</p>

            <DocHeading level="2">Wie es funktioniert</DocHeading>
            <p class="doc-p">Nach dem Einloggen ruft die App im Hintergrund <code class="doc-code">GET /api/soul</code> ab und vergleicht den Inhalt mit der lokal im Browser gespeicherten sys.md. Stimmen beide überein, passiert nichts. Gibt es Unterschiede, erscheint ein <strong>Sync-Panel</strong> am unteren Bildschirmrand.</p>

            <div class="doc-info-box my-4">
              <div class="space-y-2">
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-36 flex-none pt-0.5">L — Dieses Gerät</span>
                  <span class="text-[var(--sys-fg-dim)]">Die sys.md die zuletzt auf diesem Gerät aktiv war (im Browser-Speicher).</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <span class="font-mono text-[var(--sys-accent)] w-36 flex-none pt-0.5">S — Server</span>
                  <span class="text-[var(--sys-fg-dim)]">Die sys.md die aktuell auf dem VPS liegt — Ergebnis des letzten Uploads von beliebigem Gerät.</span>
                </div>
              </div>
            </div>

            <DocHeading level="2">Sync-Panel</DocHeading>
            <p class="doc-p">Das Panel zeigt für jede abweichende Sektion:</p>
            <div class="doc-info-box my-4">
              <div class="space-y-1.5 text-xs text-[var(--sys-fg-dim)]">
                <div class="flex gap-2"><span class="font-mono text-[var(--sys-accent)] flex-none">Sektionsname</span> Aufklappbar — zeigt lokalen und Server-Inhalt nebeneinander (L / S).</div>
                <div class="flex gap-2"><span class="font-mono text-[var(--sys-accent)] flex-none">Zeichenzahl</span> Zeigt wie viel Inhalt auf jeder Seite vorhanden ist. Die längere (inhaltreichere) Seite wird hervorgehoben.</div>
                <div class="flex gap-2"><span class="font-mono text-[var(--sys-accent)] flex-none">last_session</span> Datum der letzten Sitzung auf jeder Seite — die aktuellere wird mit „Aktueller" markiert.</div>
              </div>
            </div>

            <DocHeading level="2">Aktionen</DocHeading>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Aktion</th><th>Ergebnis</th></tr></thead>
                <tbody>
                  <tr>
                    <td class="font-mono text-xs text-[var(--sys-accent)]">Server übernehmen</td>
                    <td class="text-[var(--sys-fg-dim)]">Die Server-Version ersetzt die lokale sys.md vollständig. Der lokale Stand geht verloren.</td>
                  </tr>
                  <tr>
                    <td class="font-mono text-xs text-[var(--sys-accent)]">Auf Server hochladen</td>
                    <td class="text-[var(--sys-fg-dim)]">Die lokale Version wird per <code>PUT /api/context</code> als neue Server-Version gespeichert. Die Server-Version wird überschrieben.</td>
                  </tr>
                  <tr>
                    <td class="font-mono text-xs text-[var(--sys-accent)]">Schließen</td>
                    <td class="text-[var(--sys-fg-dim)]">Abweichung ignorieren — es wird nichts gespeichert. Das Panel erscheint beim nächsten Login erneut wenn die Versionen noch abweichen.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="doc-warning-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Wichtig: Keine automatische Zusammenführung</p>
              <p class="text-xs text-[var(--sys-fg-dim)]">Es gibt keine automatische Zusammenführung (Merge). Eine Seite gewinnt immer vollständig. Wenn du Änderungen von beiden Seiten behalten willst, kopiere den Inhalt der gewünschten Sektionen manuell aus der sys.md-Datei, bevor du eine Seite übernimmst.</p>
            </div>

            <DocHeading level="2">Verschlüsselungs-Konflikt</DocHeading>
            <p class="doc-p">Beim Abgleich versucht die App zunächst die Server-Soul normal abzurufen. Ist sie mit einem <strong>anderen Schlüssel</strong> verschlüsselt als dem aktuell aktiven, erscheint die Fehlermeldung:</p>
            <div class="doc-info-box my-4 border-[var(--sys-amber)]/40">
              <p class="text-xs font-mono text-[var(--sys-amber)]">Server-Soul ist mit einem anderen Schlüssel verschlüsselt. Bitte zuerst Vault synchronisieren.</p>
            </div>
            <p class="doc-p">Das passiert typischerweise wenn der Vault zuletzt von einem anderen Gerät oder mit anderen Schlüsselwörtern geöffnet wurde — der Server hat dann eine Version, die mit dem damaligen Schlüssel verschlüsselt ist. Die App versucht in diesem Fall automatisch einen Client-seitigen Fallback-Decrypt mit dem aktuell offenen Vault-Schlüssel. Schlägt auch das fehl, ist Vault synchronisieren der richtige Weg:</p>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Schritt</th><th>Aktion</th></tr></thead>
                <tbody>
                  <tr><td class="font-mono text-xs text-[var(--sys-accent)]">1. Vault entsperren</td><td class="text-[var(--sys-fg-dim)]">Kachel „Vault-Zugang" → Entsperren mit Passkey oder 12 Wörtern.</td></tr>
                  <tr><td class="font-mono text-xs text-[var(--sys-accent)]">2. Vault synchronisieren</td><td class="text-[var(--sys-fg-dim)]">Kachel „Vault-Explorer" → Sync-Button → alle Dateien mit aktuellem Schlüssel neu verschlüsseln und hochladen.</td></tr>
                  <tr><td class="font-mono text-xs text-[var(--sys-accent)]">3. Erneut abgleichen</td><td class="text-[var(--sys-fg-dim)]">Soul-Abgleich Button in der Kachel → der Vergleich klappt jetzt.</td></tr>
                </tbody>
              </table>
            </div>

            <DocHeading level="2">Dateien</DocHeading>
            <p class="doc-p">Beim Upload von Vault-Dateien (Audio, Bilder, Kontext) auf den VPS gilt: existiert eine Datei mit demselben Namen bereits auf dem Server, wird sie überschrieben. Neue Dateinamen werden ergänzt. Es gibt keine Versionsverwaltung für Vault-Dateien — der letzte Upload gewinnt.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 6c – VAULT-BILDER IM CHAT
               ═══════════════════════════════════════ -->
          <section :id="'vault-images-chat'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="KI + Vault">Bilder im Chat</DocHeading>
            <p class="doc-lead">Die KI kann Bilder aus deinem Vault im Chat anzeigen — auf Anfrage oder situativ. Sie kennt die verfügbaren Dateinamen und zeigt das passende Bild direkt im Gesprächsfenster.</p>

            <DocHeading level="2">Wie es funktioniert</DocHeading>
            <p class="doc-p">Beim Start jeder Nachricht wird der KI mitgeteilt, welche Bilder im Vault verfügbar sind. Wenn die KI ein Bild zeigen möchte, schreibt sie einen Tag in ihre Antwort:</p>

            <div class="doc-info-box my-4">
              <div class="space-y-2">
                <div class="flex gap-3 text-xs">
                  <code class="font-mono text-[var(--sys-accent)] w-56 flex-none">[vault-img: dateiname.jpg]</code>
                  <span class="text-[var(--sys-fg-dim)]">Eigenes Vault-Bild — geladen aus dem lokalen Vault oder per <code>GET /api/vault/images/:name</code> vom VPS.</span>
                </div>
                <div class="flex gap-3 text-xs">
                  <code class="font-mono text-[var(--sys-accent)] w-56 flex-none">[public-vault-img: soul_id/datei.jpg]</code>
                  <span class="text-[var(--sys-fg-dim)]">Bild eines verbundenen Souls aus dessen Public Vault.</span>
                </div>
              </div>
            </div>

            <p class="doc-p">Die App erkennt diese Tags nach Ende der KI-Antwort, lädt die Bilder (lokal oder per API) und zeigt sie als Bildkacheln unterhalb der Nachricht an. Nur Dateinamen die tatsächlich im Vault vorhanden sind, werden akzeptiert — halluzinierte Namen werden ignoriert.</p>

            <DocHeading level="2">Voraussetzungen</DocHeading>
            <div class="doc-info-box my-4">
              <div class="space-y-1.5 text-xs text-[var(--sys-fg-dim)]">
                <div class="flex gap-2"><span class="text-[var(--sys-fg)] flex-none">Lokal (Desktop):</span> Vault verbunden + Bilder im <code>images/</code>-Unterordner vorhanden.</div>
                <div class="flex gap-2"><span class="text-[var(--sys-fg)] flex-none">VPS (Mobile):</span> Bilder über API-Kontext → Dateien hochladen auf den VPS synchronisiert. Vault-Zugang muss offen sein.</div>
                <div class="flex gap-2"><span class="text-[var(--sys-fg)] flex-none">Netzwerk-Bilder:</span> Verbundener Soul hat Bilder in seinen Public Vault hochgeladen (<code>vault_public/files/</code>).</div>
              </div>
            </div>

            <DocHeading level="2">Beispiel-Prompts</DocHeading>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Nutzer-Anfrage</th><th>KI-Verhalten</th></tr></thead>
                <tbody>
                  <tr>
                    <td class="text-xs">„Zeig mir ein Bild von dir"</td>
                    <td class="text-[var(--sys-fg-dim)] text-xs">Zeigt <code>profile.jpg</code> — das Profilbild aus dem Vault.</td>
                  </tr>
                  <tr>
                    <td class="text-xs">„Zeig mir ein Bild von gestern"</td>
                    <td class="text-[var(--sys-fg-dim)] text-xs">Sucht im Vault nach Dateien mit dem gestrigen Datum im Namen (z.B. <code>cam_2026-03-28-...</code>).</td>
                  </tr>
                  <tr>
                    <td class="text-xs">„Zeig mir ein Bild von Maria"</td>
                    <td class="text-[var(--sys-fg-dim)] text-xs">Zeigt das Profilbild der verbundenen Soul „Maria" aus ihrem Public Vault — falls vorhanden und freigegeben.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-1">Ausbau geplant</p>
              <p class="text-xs text-[var(--sys-fg-dim)]">Derzeit werden Bilder auf Anfrage angezeigt. Geplant: kontextsensitive Bildauswahl (Stimmung, Datum, Stichwort), Bildkommentare der KI, und direkte Vault-Durchsuche über natürliche Sprache.</p>
            </div>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 6d – POLYGON & VERANKERN
               ═══════════════════════════════════════ -->
          <section :id="'polygon'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="On-Chain">Polygon &amp; Verankern</DocHeading>
            <p class="doc-lead">Soul verankern schreibt einen kryptographischen Fingerabdruck deiner Identität unveränderlich auf die Polygon-Blockchain — unabhängig von SYS, unabhängig von Servern.</p>

            <DocHeading level="2">Was wird verankert?</DocHeading>
            <p class="doc-p">Es wird kein Inhalt on-chain gespeichert — nur ein <strong>SHA-256-Hash</strong> deiner aktuellen sys.md sowie die Anzahl deiner Entwicklungs-Sessions. Das kostet minimalen Gas und hinterlässt keinen lesbaren Inhalt in der Chain.</p>
            <p class="doc-p">Der Hash-Wert wird gleichzeitig in deiner sys.md im Frontmatter gespeichert (<code class="doc-code">soul_chain_anchor</code>). Mit dem Verifizieren-Button kann jederzeit geprüft werden ob der aktuelle Inhalt mit dem on-chain-Hash übereinstimmt.</p>

            <DocHeading level="2">Authentizitätsstufen</DocHeading>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Stufe</th><th>Voraussetzung</th><th>Bedeutung</th></tr></thead>
                <tbody>
                  <tr v-for="s in anchorLevels" :key="s.level">
                    <td class="font-mono text-xs text-[var(--sys-accent)]">{{ s.level }}</td>
                    <td>{{ s.req }}</td>
                    <td class="text-[var(--sys-fg-dim)]">{{ s.meaning }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <DocHeading level="2">Voraussetzungen</DocHeading>
            <div class="doc-info-box my-4">
              <div class="space-y-1.5 text-xs text-[var(--sys-fg-dim)]">
                <div class="flex gap-2"><span class="text-white/70 flex-none">1.</span> Mindestens ein Enrichment-Eintrag in der Growth Chain (soul_growth_chain)</div>
                <div class="flex gap-2"><span class="text-white/70 flex-none">2.</span> Wallet verbunden über <strong class="text-white/65">Reown AppKit</strong> — kein Browser-Extension nötig. Funktioniert mit MetaMask Mobile, Rainbow, Coinbase Wallet und allen WalletConnect-kompatiblen Wallets. Desktop: QR-Code scannen oder Wallet-App öffnen. Mobile: direkte Weiterleitung in die Wallet-App.</div>
                <div class="flex gap-2"><span class="text-white/70 flex-none">3.</span> Wallet auf Polygon Mainnet (wird automatisch vorgeschlagen)</div>
                <div class="flex gap-2"><span class="text-white/70 flex-none">4.</span> Mindestens 0,5 POL (Anker-Fee, direkt aus Contract gelesen) + Gas</div>
              </div>
            </div>

            <DocHeading level="2">Mobile – bekannte Besonderheiten</DocHeading>
            <p class="doc-p">Der Anker-Prozess auf Mobile läuft über Reown AppKit (WalletConnect v2). Die App leitet nach dem Klick auf „Wallet verbinden" direkt in die Wallet-App weiter — kein QR-Code nötig. Beim Bestätigen der Transaktion wechselt der Browser kurz zur Wallet-App und zurück. Das verursacht spezifische Herausforderungen:</p>

            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Problem</th><th>Ursache</th><th>Verhalten in SYS</th></tr></thead>
                <tbody>
                  <tr v-for="m in mobileIssues" :key="m.problem">
                    <td class="text-xs">{{ m.problem }}</td>
                    <td class="text-[var(--sys-fg-dim)] text-xs">{{ m.cause }}</td>
                    <td class="text-[var(--sys-fg-dim)] text-xs">{{ m.behavior }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="doc-warning-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Wichtig auf Mobile</p>
              <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">Modal nicht schließen während „Transaktion wird verarbeitet…" angezeigt wird. Die App wartet auf Bestätigung — zuerst 60 Sekunden via WalletConnect, dann bis zu 4 Minuten via öffentlichem Polygon-RPC. Der TX-Hash wird sofort in sys.md geschrieben, sobald die Transaktion gesendet wurde.</p>
            </div>

            <DocHeading level="2">Rate-Limit &amp; Fees</DocHeading>
            <p class="doc-p">Der Smart Contract erlaubt maximal einen Anker pro 24 Stunden pro Soul-ID. Das Rate-Limit wird vor der Transaktion per Read-Call geprüft — so gibt es keine gescheiterten Transaktionen wegen abgelaufenem Limit.</p>
            <p class="doc-p">Die Anker-Fee beträgt 0,5 POL (wird aus dem Contract gelesen, nicht hardcodiert). Gas kommt on-top. Maximal 365 Anker pro Soul und Jahr.</p>

            <DocHeading level="2">Wallet-Eigentümer</DocHeading>
            <p class="doc-p">Beim ersten Anker wird die verbundene Wallet als Eigentümer der Soul-ID im Contract registriert. Alle folgenden Anker müssen mit derselben Wallet durchgeführt werden. Eine Soul kann per <code class="doc-code">transferSoul()</code> auf eine andere Wallet übertragen werden.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 7 – SICHERHEIT
               ═══════════════════════════════════════ -->
          <section :id="'security'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Architektur">Sicherheit &amp; Datenschutz</DocHeading>
            <p class="doc-lead">SYS ist nach dem Prinzip „Privacy by Design" gebaut. Du kontrollierst jede Ebene des Datenflusses.</p>

            <DocHeading level="2">Zwei Vertrauensebenen</DocHeading>
            <p class="doc-p">Die Architektur kennt zwei klar getrennte Modi. Wähle bewusst — je nachdem ob Agenten arbeiten sollen oder maximale Privatsphäre Priorität hat.</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">

              <!-- Stufe 1 -->
              <div class="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] p-5 flex flex-col gap-4">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-black tracking-[0.18em] uppercase text-[var(--sys-fg)]">Stufe 1</span>
                    <span class="text-[10px] text-[var(--sys-fg-dim)] tracking-wide">Agent-Betrieb</span>
                  </div>
                  <p class="text-sm font-bold text-[var(--sys-fg)]">AES-256-CBC · VPS-Schlüssel</p>
                </div>

                <!-- Datenfluss -->
                <div class="rounded-xl bg-[rgba(0,0,0,0.25)] border border-white/[0.07] p-3 font-mono text-[11px] space-y-2">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-white/70">Browser</span>
                    <span class="text-white/25">──CBC──▶</span>
                    <span class="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-white/70">VPS</span>
                    <span class="text-white/25">──CBC──▶</span>
                    <span class="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-white/70">Disk</span>
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-white/25 pl-1">vault_key_hex</span>
                    <span class="text-white/25">──decrypt──▶</span>
                    <span class="px-2 py-0.5 rounded-md border border-[var(--sys-border)] bg-[var(--sys-bg-elevated)] text-[var(--sys-fg-muted)] text-[10px]">MCP / Agent</span>
                  </div>
                </div>

                <div class="space-y-2 text-xs">
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 text-emerald-400 flex-none">✓</span>
                    <span class="text-[var(--sys-fg-dim)]">MCP-Agenten, Webhooks und externe Dienste funktionieren</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 text-emerald-400 flex-none">✓</span>
                    <span class="text-[var(--sys-fg-dim)]">Alle Uploads verschlüsselt — Klartext verlässt Browser nie</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 flex-none" style="color: var(--sys-amber)">⚠</span>
                    <span class="text-[var(--sys-fg-dim)]"><code class="font-mono" style="color: var(--sys-amber)">vault_key_hex</code> liegt in <code class="font-mono text-white/40">api_context.json</code> auf dem VPS — Server-Betreiber könnte theoretisch entschlüsseln</span>
                  </div>
                </div>
              </div>

              <!-- Stufe 2 -->
              <div class="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] p-5 flex flex-col gap-4">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-black tracking-[0.18em] uppercase text-[var(--sys-fg)]">Stufe 2</span>
                    <span class="text-[10px] text-[var(--sys-fg-dim)] tracking-wide">Zero-Knowledge</span>
                  </div>
                  <p class="text-sm font-bold text-[var(--sys-fg)]">AES-256-GCM · Bundle-Download</p>
                </div>

                <!-- Datenfluss -->
                <div class="rounded-xl bg-[rgba(0,0,0,0.25)] border border-white/[0.07] p-3 font-mono text-[11px] space-y-2">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-white/70">Browser</span>
                    <span class="text-white/25">──GCM──▶</span>
                    <span class="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-white/70">.soul</span>
                    <span class="text-white/25">──▶</span>
                    <span class="px-2 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-white/70">Download</span>
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md border border-[var(--sys-border)] bg-[var(--sys-bg-elevated)] text-[var(--sys-fg-muted)] text-[10px]">Schlüssel</span>
                    <span class="text-white/25">──bleibt lokal──</span>
                    <span class="px-2 py-0.5 rounded-md border border-[var(--sys-border)] bg-[var(--sys-bg-elevated)] text-[var(--sys-fg-muted)] text-[10px]">nie VPS</span>
                  </div>
                </div>

                <div class="space-y-2 text-xs">
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 text-emerald-400 flex-none">✓</span>
                    <span class="text-[var(--sys-fg-dim)]">Schlüssel berührt den Server mathematisch nachweisbar nie</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 text-emerald-400 flex-none">✓</span>
                    <span class="text-[var(--sys-fg-dim)]">Betreiber kann nicht entschlüsseln — auch mit vollem Server-Zugriff nicht</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <span class="mt-0.5 text-white/25 flex-none">○</span>
                    <span class="text-[var(--sys-fg-dim)]">Keine serverseitige Entschlüsselung → Agenten und Webhooks können nicht auf Inhalte zugreifen</span>
                  </div>
                </div>
              </div>

            </div>

            <div class="doc-info-box my-4">
              <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">
                <strong class="text-[var(--sys-fg)]">Empfehlung:</strong> Nutze Stufe 1 für den aktiven Betrieb mit Agenten. Erstelle zusätzlich regelmäßig ein Bundle-Download (Stufe 2) als Zero-Knowledge-Sicherung — das schützt auch gegen künftige Kompromittierung des Servers.
              </p>
            </div>

            <DocHeading level="2">Verschlüsselungsarchitektur</DocHeading>
            <div class="doc-table-wrapper my-4">
              <table class="doc-table">
                <thead><tr><th>Schicht</th><th>Verfahren</th><th>Schlüsselquelle</th></tr></thead>
                <tbody>
                  <tr v-for="e in encLayers" :key="e.layer">
                    <td>{{ e.layer }}</td>
                    <td class="font-mono text-xs text-[var(--sys-accent)]">{{ e.algo }}</td>
                    <td class="text-[var(--sys-fg-dim)]">{{ e.key }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <DocHeading level="2">Vault-Session</DocHeading>
            <p class="doc-p">Der Vault-Zugang ist zeitlich begrenzt. Du wählst eine Dauer (1 Stunde bis unbegrenzt). Beim Öffnen ist zwingend ein Verschlüsselungsschlüssel erforderlich — entweder <strong>Passkey</strong> (biometrisch, gerätgebunden) oder <strong>12 Wörter</strong> (BIP39, portabel). Unverschlüsselter Zugang ist nicht möglich.</p>
            <p class="doc-p">Nach Ablauf der gewählten Dauer erhalten externe Dienste automatisch einen <code class="doc-code">403 vault_locked</code>-Fehler. Du musst den Vault erneut öffnen. Das Sperren ist jederzeit manuell möglich und sofort wirksam: Alle aktiven Service-Token verlieren sofort den Zugang.</p>

            <DocHeading level="2">Datenschutz by Design</DocHeading>
            <div class="space-y-3 my-4">
              <div v-for="d in privacyPoints" :key="d.title" class="flex gap-3">
                <div class="w-5 h-5 rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.18)] flex items-center justify-center flex-none mt-0.5">
                  <svg class="w-3 h-3 text-[var(--sys-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium">{{ d.title }}</p>
                  <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed mt-0.5">{{ d.desc }}</p>
                </div>
              </div>
            </div>

            <DocHeading level="2">Sicherheitsmaßnahmen auf dem Server</DocHeading>
            <p class="doc-p">Alle hochgeladenen Dateien werden vor dem Speichern serverseitig auf Schadcode geprüft (Malware-Scanning). Pfad-Traversal-Angriffe, unerlaubte Dateitypen und übermäßige Upload-Volumina werden automatisch abgewiesen. Der Server läuft in einer AppArmor-Sandbox.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 8 – INTEGRATIONEN
               ═══════════════════════════════════════ -->
          <section :id="'integrations'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Integration">Integration</DocHeading>
            <p class="doc-lead">sys.md ist ein offenes Protokoll. Jedes System, das HTTP-Requests senden kann — oder MCP versteht — kann Soul-Daten abrufen und als Kontext verwenden. Kein Plattformzwang, kein Vendor-Lock-in.</p>

            <DocHeading level="2">Wie es funktioniert</DocHeading>
            <p class="doc-p">Du erstellst einen Service-Token mit den gewünschten Berechtigungen. Das externe System sendet diesen Token im <code class="doc-code">Authorization</code>-Header und erhält die freigegebenen Soul-Daten. Welche Daten zurückgegeben werden, steuerst du ausschließlich über die Berechtigungen im API-Kontext.</p>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Voraussetzungen</p>
              <div class="space-y-1 text-xs text-[var(--sys-fg-dim)]">
                <div class="flex items-center gap-2"><span class="text-white/70">1</span> Vault-Zugang offen (Kachel „Vault-Zugang")</div>
                <div class="flex items-center gap-2"><span class="text-white/70">2</span> API aktiviert (Kachel „API-Kontext" → Schalter)</div>
                <div class="flex items-center gap-2"><span class="text-white/70">3</span> Berechtigungen gesetzt und gespeichert</div>
                <div class="flex items-center gap-2"><span class="text-white/70">4</span> Service-Token erstellt (Kachel „Verbundene Dienste")</div>
              </div>
            </div>

            <DocHeading level="2">Minimales Beispiel</DocHeading>
            <p class="doc-p">Jede Sprache, die HTTP-Requests senden kann, funktioniert mit SYS:</p>

            <DocCode lang="python">import requests

TOKEN = "dein-service-token"
BASE  = "https://your-soul-server.example"

# Soul-Kontext abrufen
soul = requests.get(
    f"{BASE}/api/soul",
    headers={"Authorization": f"Bearer {TOKEN}"}
).text

# Als System-Prompt für beliebiges KI-System verwenden
print(soul)</DocCode>

            <DocCode lang="javascript">// Fetch in JavaScript / Node.js
const res = await fetch("https://YOUR_DOMAIN/api/soul", {
  headers: { Authorization: "Bearer &lt;dein-service-token&gt;" }
})
const soul = await res.text()  // sys.md Inhalt als String</DocCode>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 8b – MCP-PROTOKOLL
               ═══════════════════════════════════════ -->
          <section :id="'mcp-protocol'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="MCP">MCP-Protokoll</DocHeading>
            <p class="doc-lead">sys.md als offenes Protokoll für KI-Agenten. Jede MCP-fähige KI — Claude, GPT, lokale Modelle — kann deine Soul direkt laden, Vault-Dateien abrufen, Profile lesen und externe Dienste in deinem Namen orchestrieren.</p>

            <DocHeading level="2">Prinzip: Credentials im Tool-Call, nicht im Server</DocHeading>
            <p class="doc-p">Der MCP-Server speichert keine Drittdienst-Credentials. API-Keys externer Dienste werden beim Tool-Aufruf als Parameter übergeben — sie existieren nur im RAM, für die Dauer eines einzelnen Calls. Kein Key liegt auf dem Server, kein Key wird geloggt.</p>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Verfügbare MCP-Tools</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--sys-fg-dim)] font-mono">
                <span>soul_read</span><span class="text-white/35">sys.md als Kontext laden</span>
                <span>soul_write</span><span class="text-white/35">sys.md aktualisieren</span>
                <span>soul_skills</span><span class="text-white/35">Skill-Dateien aus Soul + Profilen generieren</span>
                <span>vault_manifest</span><span class="text-white/35">Übersicht aller Vault-Inhalte</span>
                <span>audio_get / audio_list</span><span class="text-white/35">Sprachaufnahmen abrufen</span>
                <span>image_get / image_list</span><span class="text-white/35">Bild als base64 direkt an KI liefern — Gesichtsanalyse ohne Upload</span>
                <span>video_get / video_list</span><span class="text-white/35">Video-Frames extrahieren und als Bilder ausgeben — Bewegungsanalyse direkt im Chat</span>
                <span>context_get / context_list</span><span class="text-white/35">Kontext-Dokumente abrufen</span>
                <span>profile_get / profile_save</span><span class="text-white/35">Analyse-Profile (Gesicht, Stimme, Bewegung, Expertise) lesen und schreiben</span>
                <span>calendar_read</span><span class="text-white/35">Kalender abrufen</span>
                <span>network_list / network_peer_get</span><span class="text-white/35">Soul-Network-Verbindungen + Inhalte von Peers lesen — soul_content (sys.md) automatisch bei soul-Permission, verschlüsselt oder nicht</span>
                <span>soul_maturity</span><span class="text-white/35">Reife-Score berechnen und in sys.md schreiben</span>
                <span>soul_cloud_push</span><span class="text-white/35">Verschlüsseltes Bundle an externen Speicher pushen</span>
                <span>verify_human</span><span class="text-white/35">Identitätsverifikation</span>
                <span>beme_chat</span><span class="text-white/35">Als Soul sprechen — KI antwortet in erster Person, serverseitiger Anthropic-Call ohne API-Key im Client</span>
                <span>elevenlabs_agent_update</span><span class="text-white/35">ElevenLabs-Agent mit Soul-Daten aktualisieren</span>
                <span>twilio_call_config</span><span class="text-white/35">Twilio-Nummer konfigurieren</span>
              </div>
            </div>

            <div class="doc-info-box my-4">
              <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Automatisches Verhalten</p>
              <p class="text-xs text-[var(--sys-fg-dim)]">Das Verhalten ist direkt in die Tool-Beschreibung von <code class="font-mono" style="color:var(--sys-violet)">soul_read</code> eingebettet: KI-Clients lesen diese Instruktionen beim Verbinden und verhalten sich entsprechend — ohne manuelle Aufforderung.</p>
              <ul class="mt-2 space-y-1 text-xs text-[var(--sys-fg-dim)]">
                <li>• <strong class="text-[var(--sys-fg)]">soul_read</strong> wird automatisch zu Beginn jeder Sitzung aufgerufen</li>
                <li>• <strong class="text-[var(--sys-fg)]">soul_write</strong> wird nach bedeutsamen Gesprächen eigenständig aufgerufen</li>
              </ul>
              <p class="text-xs text-[var(--sys-fg-dim)] mt-2">MCP-Prompts (<code class="font-mono" style="color:var(--sys-violet)">soul_guide</code>, <code class="font-mono" style="color:var(--sys-violet)">soul_first_entry</code>) sind serverseitig registriert und im Claude Desktop als Slash-Commands verfügbar.</p>
            </div>

            <DocHeading level="2">MCP-Endpunkt verbinden</DocHeading>
            <p class="doc-p">Der MCP-Server läuft unter deiner Soul-Domain. Verbinde ihn in deinem MCP-fähigen KI-Client unter <em>Einstellungen → MCP → Server hinzufügen</em>:</p>
            <DocCode lang="text">URL:  https://your-soul-server.example/mcp
Auth: OAuth 2.0 (Consent-Seite erscheint automatisch)</DocCode>
            <p class="doc-p">Nach der Authentifizierung mit deiner Soul-ID stehen alle Tools sofort zur Verfügung. Berechtigungen werden über die OAuth-Scopes gesteuert — identisch mit den Service-Token-Berechtigungen im API-Kontext.</p>

            <DocHeading level="2">Orchestrierung: KI als Dirigent</DocHeading>
            <p class="doc-p">Das Ziel ist nicht ein KI-Klon — es ist eine KI die dich repräsentiert und in deinem Auftrag handelt. sys.md ist die Partitur, die KI ist der Dirigent. Der MCP-Server verbindet alles — ohne dass du Credentials an eine Plattform übergibst.</p>

            <DocCode lang="javascript">// Beispiel: Gesichts- und Bewegungsanalyse via MCP
const img = await image_get({ filename: "profile.jpg" })
// → Bild erscheint direkt im Chat → KI analysiert → profile_save aufrufen

const vid = await video_get({ filename: "motion_body.webm", max_frames: 6 })
// → 6 gleichmäßige Frames erscheinen direkt → KI analysiert Bewegung

await profile_save({ type: "face",   data: { description: "...", features: {...} } })
await profile_save({ type: "motion", data: { energy_level: "...", gesture_style: "..." } })

// Beispiel: ElevenLabs-Agent mit aktueller Soul aktualisieren
elevenlabs_agent_update({
  agent_id:           "deine-agent-id",
  elevenlabs_api_key: "sk_...",   // nur für diesen Call im RAM
  language:           "de"
})
// → liest sys.md + alle Profile → baut System-Prompt → patcht Agent</DocCode>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 8c – SELF-HOSTED MCP (EXPERIMENTAL)
               ═══════════════════════════════════════ -->
          <section :id="'mcp-self-hosted'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Experimentell">Self-Hosted MCP</DocHeading>
            <p class="doc-lead">Mögliche Weiterentwicklung: jeder Nutzer betreibt seinen eigenen MCP-Server — unabhängig von zentraler Infrastruktur, vollständig unter eigener Kontrolle.</p>

            <div class="my-5 px-4 py-3.5 rounded-xl border text-sm leading-relaxed" style="border-color: rgba(139,92,246,0.25); background: rgba(139,92,246,0.06);">
              <p class="text-xs font-semibold tracking-widest uppercase mb-1" style="color: rgba(139,92,246,0.85)">Status: Experimentelle Vision</p>
              <p class="text-[var(--sys-fg-dim)]">Dieser Abschnitt beschreibt eine geplante, aber noch nicht umgesetzte Möglichkeit. Eingeladene Nutzer erhalten ihren persönlichen MCP-Endpunkt nach dem Onboarding.</p>
            </div>

            <DocHeading level="2">Warum Self-Hosted?</DocHeading>
            <p class="doc-p">Das Web3-Prinzip von SaveYourSoul ist konsequent: Soul-Daten gehören dem Nutzer, der Vault liegt lokal, die Blockchain-Signatur ist dezentral. Ein zentraler MCP-Server ist der verbleibende Single Point of Control. Self-Hosted MCP löst das: jeder Nutzer ist Operator seiner eigenen KI-Schnittstelle — kein Vertrauen in Dritte nötig, keine Abhängigkeit von Verfügbarkeit oder Policy-Änderungen einer zentralen Instanz.</p>

            <DocHeading level="2">Technisches Konzept</DocHeading>
            <p class="doc-p">Das soul-mcp-Paket ist <strong>stateless HTTP</strong> — es hält keine eigenen Daten, sondern proxyt ausschließlich Anfragen an die Soul-API weiter. Das macht es grundsätzlich kompatibel mit serverlosen Ausführungsumgebungen (Edge Functions, Function-as-a-Service). Drei Umgebungsvariablen genügen für eine vollständige Instanz:</p>

            <DocCode lang="text">SOUL_API_URL   – Basis-URL der Soul-API
SOUL_CERT      – Soul-Zertifikat für API-Authentifizierung
BASE_URL       – Öffentliche URL der eigenen MCP-Instanz</DocCode>

            <DocHeading level="2">Offene technische Fragen</DocHeading>
            <p class="doc-p">Für eine serverlose Deployment-Option ohne permanenten Prozess sind zwei Punkte zu lösen:</p>
            <ul class="doc-list">
              <li><strong>OAuth-State:</strong> Der aktuelle OAuth-Flow speichert kurzlebige Auth-Codes im Prozess-RAM. Stateless Umgebungen erfordern einen externen Key-Value-Store für diesen State.</li>
              <li><strong>SSE-Streaming:</strong> MCP Streamable HTTP nutzt Server-Sent Events über einen langlebigen HTTP-Server. Eine serverlose Umgebung erfordert eine angepasste Transport-Implementierung ohne persistente TCP-Verbindung.</li>
            </ul>

            <DocHeading level="2">Heutiger Stand</DocHeading>
            <p class="doc-p">Wer heute eine eigene Instanz betreiben möchte, kann <code class="font-mono text-xs" style="color:var(--sys-violet)">soul-mcp/</code> auf jedem Node.js-fähigen Server starten — lokal mit Tunnel oder auf einem eigenen VPS. <code class="font-mono text-xs" style="color:var(--sys-violet)">BASE_URL</code> und die OAuth-Consent-Seite müssen auf die eigene Domain angepasst werden.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 9 – REFERENZIMPLEMENTIERUNG
               ═══════════════════════════════════════ -->
          <section :id="'reference-impl'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Forschung">Referenzimplementierung</DocHeading>
            <p class="doc-lead">Dieser Abschnitt beschreibt theoretisch, wie ein KI-Agent einen SYS-kompatiblen Stack auf einem VPS einrichten würde — als Referenz für Forschungszwecke und für Personen, die ein eigenes System aufbauen möchten. Es handelt sich um Dokumentation, nicht um ein ausführbares Installationsscript.</p>

            <div class="my-5 px-4 py-3.5 rounded-xl border text-sm leading-relaxed" style="border-color: rgba(139,92,246,0.25); background: rgba(139,92,246,0.06);">
              <p class="text-xs font-semibold tracking-widest uppercase mb-1" style="color: rgba(139,92,246,0.85)">Konzeptprojekt — Kein Produkt</p>
              <p class="text-[var(--sys-fg-dim)]">SYS ist ein offenes Protokoll, keine betriebsfertige Software. Wer eine eigene Instanz betreiben möchte, baut auf dieser Spezifikation auf — eigenverantwortlich und mit entsprechender technischer Kompetenz.</p>
            </div>

            <DocHeading level="2">Stack-Komponenten</DocHeading>
            <p class="doc-p">Eine vollständige SYS-Referenzimplementierung besteht aus vier Schichten:</p>

            <div class="space-y-3 my-4">
              <div v-for="layer in refImplLayers" :key="layer.name" class="flex gap-3 text-sm">
                <code class="font-mono text-xs flex-none pt-0.5 w-40" style="color: var(--sys-accent)">{{ layer.name }}</code>
                <div>
                  <p class="text-[var(--sys-fg)] font-medium mb-0.5">{{ layer.title }}</p>
                  <p class="text-[var(--sys-fg-dim)]">{{ layer.desc }}</p>
                </div>
              </div>
            </div>

            <DocHeading level="2">Theoretischer VPS-Setup — was ein KI-Agent tun würde</DocHeading>
            <p class="doc-p">Ein KI-Agent (Claude, GPT-4 o.ä.) der einen SYS-Stack einrichten soll, würde folgende Schritte durchlaufen. Die Codebeispiele sind illustrativ — kein fertiges Script.</p>

            <DocHeading level="3">1. Laufzeitumgebung</DocHeading>
            <p class="doc-p">OpenResty (nginx + LuaJIT) als Reverse Proxy und API-Layer. Node.js 20+ für den MCP-Server. Kein weiterer Datenbankdienst — alle Soul-Daten leben im Dateisystem.</p>
            <DocCode lang="bash"># Illustrativ — kein ausführbares Script
apt install openresty          # nginx + LuaJIT bundle
apt install nodejs             # v20+ für soul-mcp
luarocks install lua-cjson     # JSON-Encoding in Lua
luarocks install lua-resty-openssl  # HMAC-SHA256</DocCode>

            <DocHeading level="3">2. Secrets — drei Umgebungsvariablen</DocHeading>
            <p class="doc-p">Alle sicherheitskritischen Werte werden als systemd-Service-Override injiziert — nie in Dateien auf Disk geschrieben, nie in das Build-Bundle gebacken.</p>
            <DocCode lang="bash">ANTHROPIC_API_KEY=sk-ant-...       # Anthropic Claude API
SOUL_MASTER_KEY=$(openssl rand -hex 32)   # HMAC-Root-Key für soul_cert-Ableitung
API_SIGNING_KEY=$(openssl rand -hex 32)   # Service-Token-Signierung</DocCode>

            <DocHeading level="3">3. soul_cert — das Authentifizierungsprotokoll</DocHeading>
            <p class="doc-p">Jeder Soul-Inhaber hat ein HMAC-SHA256-Zertifikat, das aus <code class="doc-code">SOUL_MASTER_KEY</code>, <code class="doc-code">soul_id</code> und einer optionalen <code class="doc-code">cert_version</code> abgeleitet wird. Keine Datenbank, kein Session-Store.</p>
            <DocCode lang="text"># cert_version = 0 (Standard, rückwärtskompatibel)
cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[:32]

# cert_version ≥ 1 (nach Rotation)
cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[:32]

bearer = soul_id + "." + cert</DocCode>
            <p class="doc-p"><strong>Cert-Rotation:</strong> <code class="doc-code">POST /api/soul-rotate-cert</code> inkrementiert <code class="doc-code">cert_version</code> in der sys.md und gibt einen neuen Cert zurück. Der alte Cert ist sofort ungültig — <code class="doc-code">SOUL_MASTER_KEY</code> und <code class="doc-code">soul_id</code> bleiben unverändert.</p>

            <DocHeading level="3">4. Dateistruktur auf dem VPS</DocHeading>
            <DocCode lang="text">/var/lib/sys/souls/{soul_id}/
├── sys.md              ← SYSCRYPT01-Präfix wenn AES-256-CBC-verschlüsselt
├── api_context.json     ← Berechtigungen, vault_key_hex, Datei-Index
├── soul_connections.json
└── vault/
    ├── audio/
    ├── images/
    ├── video/
    └── context/</DocCode>

            <DocHeading level="3">5. Verschlüsselungsformat (SYSCRYPT01)</DocHeading>
            <p class="doc-p">Alle VPS-gespeicherten Soul-Dateien tragen optional diesen Header. Ein Implementierer muss dieses Format verstehen um Dateien lesen und schreiben zu können.</p>
            <DocCode lang="text">Bytes 0–3:   53 59 53 01  ("SYS\x01" — Magic)
Bytes 4–19:  16-byte IV   (zufällig, AES-CBC)
Bytes 20+:   AES-256-CBC Ciphertext
Schlüssel:   vault_key_hex aus api_context.json (32 Bytes, hex-encoded)</DocCode>

            <DocHeading level="3">6. MCP-Server konfigurieren</DocHeading>
            <p class="doc-p"><code class="doc-code">soul-mcp/</code> ist stateless HTTP — es hält keine eigenen Daten, sondern proxyt Anfragen an die Soul-API. Drei Umgebungsvariablen genügen:</p>
            <DocCode lang="bash">SOUL_API_URL=https://your-domain.com   # Basis-URL der Soul-API
SOUL_CERT=soul_id.cert                 # Soul-Zertifikat für API-Auth
BASE_URL=https://your-domain.com       # Öffentliche URL des MCP-Servers</DocCode>

            <DocHeading level="2">Kompatibilitätsanforderungen</DocHeading>
            <p class="doc-p">Ein kompatibler Implementierer muss folgende Protokollpunkte erfüllen:</p>
            <div class="space-y-2 my-3">
              <div v-for="req in refImplRequirements" :key="req.id" class="flex gap-3 text-sm">
                <span class="text-[var(--sys-accent)] flex-none font-mono text-xs pt-0.5">{{ req.id }}</span>
                <span class="text-[var(--sys-fg-dim)]">{{ req.text }}</span>
              </div>
            </div>

            <DocHeading level="2">Was bewusst nicht dokumentiert ist</DocHeading>
            <p class="doc-p">Dieses Dokument enthält keine vollständige nginx-Konfiguration, kein Installationsscript und keine Copy-Paste-Deployment-Anleitung. Wer diesen Stack betreibt, sollte die Komponenten einzeln verstehen — HMAC-Auth, Lua-Scripting, OpenResty-Konfiguration, Node.js-Prozessmanagement. Die Spezifikation ist vollständig; das Engineering liegt beim Implementierer.</p>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 10 – API-REFERENZ
               ═══════════════════════════════════════ -->
          <section :id="'api-reference'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1" badge="Referenz">API-Referenz</DocHeading>
            <p class="doc-lead">Alle Endpunkte sind unter deiner Soul-Server-URL erreichbar. Authentifizierung erfolgt via Bearer-Token im <code class="doc-code">Authorization</code>-Header.</p>

            <DocHeading level="2">Authentifizierung</DocHeading>
            <DocCode lang="http">Authorization: Bearer &lt;service-token&gt;</DocCode>
            <p class="doc-p">Service-Tokens werden in der App unter <em>Verbundene Dienste</em> erstellt. Sie erben die konfigurierten Berechtigungen und sind nur gültig wenn der Vault-Zugang offen ist.</p>

            <DocHeading level="2">Endpunkte</DocHeading>
            <div class="space-y-6 my-6">
              <div v-for="ep in endpoints" :key="ep.path" class="rounded-2xl border border-[rgba(255,255,255,0.13)] overflow-hidden">
                <div class="px-4 py-3 flex items-center gap-3 border-b border-[rgba(255,255,255,0.13)] bg-[var(--sys-bg-surface)]">
                  <span class="text-xs font-mono font-bold px-2 py-0.5 rounded" :class="ep.method === 'GET' ? 'bg-[rgba(255,255,255,0.1)] text-white/85' : 'bg-[rgba(255,255,255,0.07)] text-white/70'">{{ ep.method }}</span>
                  <code class="text-sm font-mono text-[var(--sys-fg)]">{{ ep.path }}</code>
                  <span class="text-xs text-[var(--sys-fg-dim)] ml-auto">{{ ep.permission }}</span>
                </div>
                <div class="px-4 py-3">
                  <p class="text-sm text-[var(--sys-fg-dim)] mb-3">{{ ep.desc }}</p>
                  <DocCode :lang="'json'" v-if="ep.response">{{ ep.response }}</DocCode>
                </div>
              </div>
            </div>

            <DocHeading level="2">Netzwerk-Endpunkt</DocHeading>
            <p class="doc-p">Wenn eine Soul gegenseitige Verbindungen im Soul Network hat, können verbundene Souls ebenfalls abgerufen werden:</p>
            <DocCode lang="http">GET /api/vault/connections/network
Authorization: Bearer &lt;soul-cert oder service-token&gt;</DocCode>
            <DocCode lang="json">{
  "ok": true,
  "connections": [
    {
      "soul_id": "abc123...",
      "alias": "Maria",
      "permissions": ["soul"],
      "available": true,
      "soul_content": "---\nname: Maria\n..."
    }
  ]
}</DocCode>
            <p class="doc-p">Peer-Inhalte abrufen — ohne <code class="font-mono" style="color:var(--sys-violet)">file</code>-Parameter gibt der Endpoint automatisch <code class="font-mono" style="color:var(--sys-violet)">soul_content</code> (sys.md) und alle freigegebenen Kontext-Dateien zurück, wenn soul-Permission gesetzt ist. <code class="font-mono" style="color:var(--sys-violet)">file=sys.md</code> funktioniert ebenfalls direkt über soul-Permission ohne expliziten public_files-Eintrag. Verschlüsselte sys.md-Dateien werden serverseitig entschlüsselt, sofern der Vault-Schlüssel hinterlegt ist.</p>
            <DocCode lang="http">GET /api/vault/connections/peer-files?soul_id=&lt;uuid&gt;
GET /api/vault/connections/peer-files?soul_id=&lt;uuid&gt;&amp;file=sys.md
Authorization: Bearer &lt;soul-cert oder service-token&gt;</DocCode>
          </section>

          <!-- ═══════════════════════════════════════
               SECTION 10 – FAQ
               ═══════════════════════════════════════ -->
          <section :id="'faq'" class="doc-section mb-16 scroll-mt-20">
            <DocHeading level="1">Häufige Fragen</DocHeading>
            <div class="space-y-4 mt-6">
              <div
                v-for="q in faqItems"
                :key="q.q"
                class="rounded-2xl border border-[rgba(255,255,255,0.13)] overflow-hidden"
              >
                <button
                  class="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-[var(--sys-bg-surface)] transition-colors"
                  @click="q.open = !q.open"
                >
                  <span class="text-base font-medium">{{ q.q }}</span>
                  <svg class="w-4 h-4 text-[var(--sys-fg-dim)] flex-none mt-0.5 transition-transform duration-200" :class="q.open ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-if="q.open" class="px-5 pb-4 text-base text-[var(--sys-fg-muted)] leading-relaxed border-t border-[rgba(255,255,255,0.13)]" style="padding-top: 12px; white-space: pre-line">
                  {{ q.a }}
                </div>
              </div>
            </div>
          </section>

        </main>

        <!-- ── On This Page (right sidebar) ── -->
        <aside class="hidden xl:block w-52 flex-none sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-10 pr-4">
          <p class="text-xs tracking-[0.18em] uppercase font-semibold text-[var(--sys-fg-dim)] mb-3">Auf dieser Seite</p>
          <nav class="space-y-1">
            <button
              v-for="s in allSections"
              :key="s.id"
              class="w-full text-left py-1 text-xs transition-colors"
              :class="activeSection === s.id ? 'text-[var(--sys-accent)]' : 'text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)]'"
              @click="scrollTo(s.id)"
            >
              {{ s.title }}
            </button>
          </nav>
        </aside>

      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, defineComponent, h } from 'vue'
import { useSoul } from '../composables/useSoul.js'

useHead({ title: 'Dokumentation · SaveYourSoul' })

const config      = useRuntimeConfig()
const { soulToken } = useSoul()
const allowed     = computed(() => config.public.docsPublic || !!soulToken.value)

// ── Layout State ──────────────────────────────────────────────────────────────
const sidebarOpen  = ref(false)
const searchQuery  = ref('')
const searchInput  = ref(null)
const activeSection = ref('what-is-sys')

function searchFocus() { searchInput.value?.focus() }

// ── Keyboard shortcut ⌘K ─────────────────────────────────────────────────────
function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

// ── Navigation Data ───────────────────────────────────────────────────────────
const nav = [
  {
    id: 'start', title: 'Erste Schritte',
    items: [
      { id: 'what-is-sys', title: 'Was ist SaveYourSoul?' },
      { id: 'create-soul', title: 'Soul erstellen & einloggen' },
    ]
  },
  {
    id: 'core', title: 'Kernfunktionen',
    items: [
      { id: 'vault',       title: 'Vault' },
      { id: 'api-context', title: 'API-Kontext' },
      { id: 'services',    title: 'Verbundene Dienste' },
      { id: 'soul-network',       title: 'Soul Network' },
      { id: 'soul-sync',          title: 'Soul-Sync' },
      { id: 'vault-images-chat',  title: 'Bilder im Chat' },
      { id: 'polygon',            title: 'Polygon & Verankern' },
    ]
  },
  {
    id: 'advanced', title: 'Sicherheit & Integration',
    items: [
      { id: 'security',      title: 'Sicherheit & Datenschutz' },
      { id: 'integrations',  title: 'Integration' },
      { id: 'mcp-protocol',    title: 'MCP-Protokoll' },
      { id: 'mcp-self-hosted',  title: 'Self-Hosted MCP' },
      { id: 'reference-impl',  title: 'Referenzimplementierung' },
      { id: 'api-reference',   title: 'API-Referenz' },
    ]
  },
  {
    id: 'help', title: 'Hilfe',
    items: [
      { id: 'faq', title: 'Häufige Fragen' },
    ]
  },
]

const allSections = computed(() => nav.flatMap(g => g.items))

const filteredNav = computed(() => {
  if (!searchQuery.value.trim()) return nav
  const q = searchQuery.value.toLowerCase()
  return nav.map(g => ({
    ...g,
    items: g.items.filter(i => i.title.toLowerCase().includes(q))
  })).filter(g => g.items.length > 0)
})

// ── Scroll & Active Section ───────────────────────────────────────────────────
function scrollTo(id) {
  sidebarOpen.value = false
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  activeSection.value = id
}

let observer = null
onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length) activeSection.value = visible[0].target.id
    },
    { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
  )
  allSections.value.forEach(s => {
    const el = document.getElementById(s.id)
    if (el) observer.observe(el)
  })
})
onUnmounted(() => observer?.disconnect())

// ── Quick Links ───────────────────────────────────────────────────────────────
const quickLinks = [
  { id: 'vault',        title: 'Vault einrichten',     desc: 'Lokalen Ordner verbinden und Zugang öffnen' },
  { id: 'services',     title: 'Dienst verbinden',      desc: 'Service-Token erstellen und testen' },
  { id: 'soul-network',      title: 'Soul Network',      desc: 'Souls peer-to-peer verbinden' },
  { id: 'soul-network',      title: 'Public Vault',      desc: 'Vault-Dateien für verbundene Souls freigeben' },
  { id: 'soul-sync',         title: 'Soul-Sync',         desc: 'Multi-Device — VPS als Single Point of Truth' },
  { id: 'vault-images-chat', title: 'Bilder im Chat',    desc: 'KI zeigt Vault-Bilder auf Anfrage im Chat' },
  { id: 'api-reference',title: 'API-Referenz',          desc: 'Alle Endpunkte auf einen Blick' },
  { id: 'integrations', title: 'Integration',            desc: 'Soul-Daten in eigene Systeme einbinden' },
  { id: 'mcp-protocol', title: 'MCP-Protokoll',          desc: 'sys.md als offenes Protokoll für KI-Agenten' },
  { id: 'security',     title: 'Sicherheit',            desc: 'Verschlüsselung und Datenschutz verstehen' },
]

// ── Content Data ──────────────────────────────────────────────────────────────
const coreConcepts = [
  { term: 'Soul',     desc: 'Deine digitale Identität als Markdown-Datei (sys.md). Beschreibt Persönlichkeit, Erinnerungen und Kontext.' },
  { term: 'Vault',    desc: 'Lokaler Dateiordner im Browser. Enthält sys.md, Audio, Bilder und Kontext-Dokumente. Verlässt dein Gerät nur wenn du es erlaubst.' },
  { term: 'Entwicklung',  desc: 'Neutraler Beobachter-Modus: Die KI kennt den aktuellen sys.md-Stand und agiert als Interviewer, um Lücken im Profil zu füllen. Wird chronologisch an sys.md angehängt.' },
  { term: 'Network',  desc: 'Peer-to-Peer Verbindungen zwischen Souls. Erlaubt KI-Agenten den sozialen Kontext zu lesen.' },
  { term: 'MCP',      desc: 'Model Context Protocol — offener Standard für KI-Kontext-Integration. SaveYourSoul exponiert sys.md, Vault-Dateien und Profile als MCP-Tools. Jede MCP-fähige KI kann damit arbeiten.' },
]

const createSteps = [
  { title: 'Soul erstellen',           desc: 'Klicke auf der Startseite auf „Soul erstellen". Gib deinen Namen und eine erste Beschreibung deiner Identität ein.' },
  { title: 'Soul einloggen',           desc: 'Lade deine bestehende sys.md-Datei hoch — oder entsperre ein verschlüsseltes .soul-Bundle mit deinen 12 Schlüsselwörtern.' },
  { title: 'Entwicklung starten',       desc: 'Wechsle in den Entwicklungs-Modus. Die KI agiert als neutraler Beobachter und baut das Soul-Profil gezielt aus.' },
  { title: 'Vault verbinden (optional)', desc: 'Verbinde einen lokalen Ordner für persistente Datei-Speicherung. Für Cloud-Backups: .soul-Bundle herunterladen, sicher ablegen, beim nächsten Login über URL importieren.' },
]

const vaultModes = [
  { mode: 'Ciphered',    desc: 'Standard. Dateien werden vor dem Upload mit AES-256-CBC (Vault-Session-Schlüssel) verschlüsselt. VPS entschlüsselt bei Bedarf automatisch für autorisierte Dienste. Sync blockiert ohne Vault-Schlüssel.', for: 'Standard für alle Souls — privat und sicher' },
  { mode: 'Open',        desc: 'Explizites Opt-in. Dateien werden im Klartext auf dem VPS gespeichert. Nur sinnvoll für Public-Network-Souls, deren sys.md öffentlich lesbar sein soll.', for: 'Ausschließlich öffentliche / geteilte Souls' },
]

const bundleKeyModes = [
  { mode: '12 Wörter',  desc: 'BIP39 Mnemonic leitet per PBKDF2-SHA256 (100.000 Iterationen) einen 256-Bit AES-GCM-Schlüssel ab. Portabel, gerätunabhängig, offline entschlüsselbar. Auf Papier aufbewahrt überlebt es jeden Hardware- und Plattformwechsel.', for: 'Cloud-Backup, Langzeitarchiv, Nachlass — einzige Methode für .soul-Bundles' },
]

const apiPermissions = [
  { name: 'soul',          content: 'sys.md — dein gesamter Soul-Kontext',  endpoint: 'GET /api/soul' },
  { name: 'audio',         content: 'Audio-Dateien (WebM, MP3, OGG …)',       endpoint: 'GET /api/vault/audio/:name' },
  { name: 'video',         content: 'Video-Dateien (MP4, WebM, MOV …)',       endpoint: 'GET /api/vault/video/:name' },
  { name: 'images',        content: 'Bilder (JPG, PNG, WebP, AVIF)',           endpoint: 'GET /api/vault/images/:name' },
  { name: 'context_files', content: 'Text-Kontext-Dateien (MD, TXT, PDF)',      endpoint: 'GET /api/vault/context/:name' },
]

const networkSteps = [
  { title: 'Soul-ID austauschen',     desc: 'Teile deine Soul-ID mit der anderen Person (im Soul Network oben angezeigt). Sie muss dich persönlich kennen.' },
  { title: 'Verbindung aufbauen',     desc: 'Klicke auf „+ Soul verbinden", gib die Soul-ID der anderen Person ein, wähle einen Alias und Berechtigungen.' },
  { title: 'Verbindung testen',       desc: 'Nutze den „Verbindung testen"-Button um zu prüfen ob die Soul erreichbar ist und ob die Gegenseite bereits zurückverbunden hat.' },
  { title: 'Gegenseite verbindet',    desc: 'Für eine gegenseitige (mutual) Verbindung muss die andere Person ebenfalls deine Soul-ID eingeben und verbinden.' },
]

const encLayers = [
  { layer: 'VPS-Speicherung (Standard)', algo: 'AES-256-CBC',  key: 'Vault-Session-Schlüssel — serverseitig für Service-Token-Zugriff' },
  { layer: 'Cloud-Backup (.soul)',       algo: 'AES-256-GCM',  key: 'Passkey oder 12 Wörter — Schlüssel berührt Server nie, Zero-Knowledge' },
  { layer: 'Bundle-Download',           algo: 'AES-256-GCM',  key: '12 Wörter (BIP39 → PBKDF2-SHA256, 100k Iter.) — Schlüssel berührt Server nie, portabel, langlebig' },
  { layer: 'Transport',                 algo: 'TLS 1.3',      key: 'Zertifikat des Servers (automatisch)' },
  { layer: 'Passkey-Ableitung',         algo: 'PBKDF2-SHA256',key: '100.000 Iterationen, domain-gebunden, gerätespezifisch' },
]

const privacyPoints = [
  { title: 'Verschlüsselung als Standard',          desc: 'Alle Uploads sind standardmäßig AES-256-CBC verschlüsselt. Kein Klartext verlässt deinen Browser — Sync blockiert ohne Vault-Schlüssel.' },
  { title: 'Cloud immer verschlüsselt',             desc: 'Cloud-Backups (.soul-Bundle) sind AES-256-GCM mit 12 Wörtern verschlüsselt — portabel, gerätunabhängig, langlebig. Der Schlüssel berührt den Server nie — mathematisch Zero-Knowledge.' },
  { title: 'Du kontrollierst deine Daten',          desc: 'Deine sys.md liegt in deinem lokalen Vault. Auf dem Server landen nur Daten, die du explizit hochlädst.' },
  { title: 'Granulare Berechtigungen',              desc: 'Jeder Dienst bekommt nur Zugriff auf das, was du ihm explizit erlaubst — pro Datei-Kategorie.' },
  { title: 'Zeitlich begrenzter Zugang',            desc: 'Vault-Sessions laufen automatisch ab. Kein Dienst hat permanenten Zugang — du öffnest ihn bewusst, immer mit Passkey oder 12 Wörtern.' },
  { title: 'Keine zentralen Identitätsdaten',       desc: 'Es gibt keine zentrale Datenbank mit Nutzerprofilen. Deine Identität ist deine Datei.' },
  { title: 'Soul Network: Einwilligung beidseitig', desc: 'Verbindungen sind peer-to-peer — nur wenn beide Seiten zustimmen (mutual) können KI-Agenten den geteilten Kontext lesen.' },
]

const endpoints = [
  {
    method: 'GET', path: '/api/soul', permission: 'Berechtigung: soul',
    desc: 'Gibt den vollständigen Soul-Kontext (sys.md) als Plaintext zurück. Da Verschlüsselung Standard ist, wird die Datei für autorisierte Service-Token serverseitig AES-256-CBC-entschlüsselt. Für Cloud-Backup-Zwecke: ?raw=1 gibt die verschlüsselten Bytes direkt zurück (nur für ciphered Souls).',
    response: '---\nsoul_id: abc123\nsoul_name: Jan\n---\n\nIch bin Jan...'
  },
  {
    method: 'GET', path: '/api/vault/manifest', permission: 'Soul-Cert oder Service-Token',
    desc: 'Gibt eine Übersicht aller synced_files, aktiven Dateien (active_files), Berechtigungen und verfügbaren Endpunkte zurück.',
    response: '{\n  "soul_id": "abc123",\n  "cipher_mode": "ciphered",\n  "synced_files": { "audio": ["voice.webm"], "video": [], "images": [], "context": [] },\n  "endpoints": { "soul": "/api/soul", "audio": "/api/vault/audio", ... }\n}'
  },
  {
    method: 'GET', path: '/api/vault/audio', permission: 'Berechtigung: audio',
    desc: 'Gibt die Liste aller Audio-Dateien zurück (Name, URL, MIME-Type, active-Flag).',
    response: '{\n  "type": "audio",\n  "files": [{ "name": "voice.webm", "url": "https://.../api/vault/audio/voice.webm", "mime": "video/webm", "active": true }]\n}'
  },
  {
    method: 'GET', path: '/api/vault/audio/:name', permission: 'Berechtigung: audio',
    desc: 'Gibt eine einzelne Audio-Datei als Binärstrom zurück. Bei ciphered-Modus wird sie serverseitig AES-CBC-entschlüsselt.',
    response: null
  },
  {
    method: 'GET', path: '/api/vault/video/:name', permission: 'Berechtigung: video',
    desc: 'Gibt eine einzelne Video-Datei zurück. Unterstützt MP4, WebM, MOV.',
    response: null
  },
  {
    method: 'GET', path: '/api/vault/images/:name', permission: 'Berechtigung: images',
    desc: 'Gibt eine Bilddatei zurück (JPG, PNG, WebP, AVIF, GIF).',
    response: null
  },
  {
    method: 'GET', path: '/api/vault/context/:name', permission: 'Berechtigung: context_files',
    desc: 'Gibt eine Text-Kontext-Datei (Markdown, TXT, PDF) zurück.',
    response: null
  },
  {
    method: 'DELETE', path: '/api/vault/:type/:name', permission: 'Nur Soul-Cert',
    desc: 'Löscht eine Datei physisch vom VPS und entfernt sie aus synced_files und active_files in der api_context.json.',
    response: '{ "ok": true }'
  },
  {
    method: 'POST', path: '/api/beme', permission: 'Berechtigung: soul',
    desc: 'Als Soul sprechen — liest sys.md serverseitig (entschlüsselt bei offenem Vault), baut denselben System-Prompt wie der SYS Chat und ruft die Anthropic API auf. Kein API-Key im Client nötig. Eingabe: { message, history?, max_tokens? }. Verwendet vom beme_chat MCP-Tool.',
    response: '{ "response": "...", "soul_name": "Till", "model": "claude-sonnet-4-6" }'
  },
  {
    method: 'GET', path: '/api/vault/public/:soul_id[/:file]', permission: 'soul_cert oder api_grant_token',
    desc: 'Public Vault — listet Dateien oder gibt eine Datei aus vault_public/files/ zurück. Zugang für Netzwerkpartner (soul_grant) oder externe Dienste (api_grant). Dateiname muss in public_files der config.json stehen.',
    response: null
  },
  {
    method: 'GET', path: '/api/vault/peer-stream', permission: 'service_token (soul permission)',
    desc: 'Streamt eine Datei aus dem Public Vault eines verbundenen Peers als rohe Binärdaten mit korrektem Content-Type. Wird intern von network_peer_get genutzt. Parameter: soul_id, file, token. Hinweis: sys.md wird über /api/vault/connections/peer-files bedient, nicht über diesen Endpoint.',
    response: null
  },
  {
    method: 'POST', path: '/api/fetch-bundle', permission: 'Kein Auth erforderlich',
    desc: 'Server-seitiger Proxy zum Laden eines .soul-Bundles von einer externen HTTPS-URL (Google Drive, Arweave, IPFS, S3 …). Umgeht Browser-CORS-Beschränkungen. Beinhaltet SSRF-Schutz und 50 MB Limit.',
    response: '{ "schema": "saveyoursoul/vault/1.0", "algorithm": "AES-256-GCM", "files": [...] }'
  },
  {
    method: 'GET', path: '/api/soul/meta', permission: 'Kein Auth erforderlich',
    desc: 'Öffentliche Soul-Metadaten — Name (immer Plaintext), Schema, cipher_mode, api_enabled, mcp_endpoint, soul_endpoint. Kein Auth erforderlich. 300 Sekunden Cache (X-Cache-Header). Für externe Agenten und Agent-Discovery ohne Authentifizierung.',
    response: '{\n  "soul_id": "abc123",\n  "name": "Jan",\n  "schema": "saveyoursoul/1.0",\n  "encrypted": true,\n  "cipher_mode": "ciphered",\n  "mcp_endpoint": "https://sys.domain.com/mcp",\n  "soul_endpoint": "https://sys.domain.com/api/soul"\n}'
  },
  {
    method: 'GET', path: '/api/soul/verify', permission: 'Kein Auth erforderlich',
    desc: 'Polygon-Verifikation der Soul-Identität über den SoulRegistry-Contract (0xB68Ca7cFFbe1113F62B3d0397d293693A8e0106B). Gecacht: 24h TTL bei verifizierten Souls (X-Cache: HIT), 5 min bei nicht verifizierten. Cache-Miss ruft über den MCP-Server intern ab.',
    response: '{ "verified": true, "soul_id": "abc123", "wallet": "0x...", "cached": false, "source": "live" }'
  },
  {
    method: 'GET/PUT', path: '/api/soul/amortization', permission: 'soul_cert',
    desc: 'Lesen oder konfigurieren des Zugangsmodus. Grundeinstellung: enabled=false (freier Zugriff). GET gibt aktuelle Konfiguration zurück. PUT mit enabled=false speichert sofort ohne Prüfung. PUT mit enabled=true erfordert vorab erfolgreiche Polygon-Verifikation — blockiert mit 403 wenn die Soul nicht on-chain registriert ist. Felder: enabled (bool), pol_per_request (z.B. "0.01"), wallet (0x…, 40 Hex-Zeichen), free_tools[] (Tool-Namen die auch im Bezahlt-Modus kostenfrei bleiben).',
    response: '{\n  "ok": true,\n  "amortization": {\n    "enabled": true,\n    "pol_per_request": "0.01",\n    "wallet": "0x...",\n    "free_tools": ["soul_read"],\n    "activated_at": "2026-04-21T..."\n  }\n}'
  },
  {
    method: 'POST', path: '/api/soul/pay', permission: 'Kein Auth erforderlich',
    desc: 'POL-Zahlung für MCP-Zugang. Body: { soul_id, tx_hash }. Validiert TX auf Polygon Mainnet: Empfänger muss amortization.wallet entsprechen, Betrag ≥ pol_per_request, mindestens 1 Bestätigung. Replay-geschützt (48h shared dict + earnings.json). Bei Erfolg: access_token mit 1h TTL — als Bearer-Token für MCP-Anfragen nutzen.',
    response: '{ "ok": true, "access_token": "tok_...", "expires_in": 3600, "pol_amount": "0.01", "soul_id": "abc123" }'
  },
  {
    method: 'GET', path: '/api/soul/earnings', permission: 'soul_cert',
    desc: 'Liest das Einnahmen-Ledger der Soul. Gibt Summe aller empfangenen POL, Anzahl der bezahlten Anfragen und bis zu 20 Einzel-Einträge zurück. Daten liegen in earnings.json im Soul-Verzeichnis.',
    response: '{\n  "ok": true,\n  "total_pol": "0.15",\n  "total_requests": 15,\n  "entries": [{ "tx_hash": "0x...", "from_wallet": "0x...", "pol_amount": "0.01", "paid_at": "2026-04-21T..." }]\n}'
  },
  {
    method: 'POST', path: '/api/soul/register', permission: 'soul_cert',
    desc: 'Pinnt ERC-8004-kompatible Agent-Metadaten auf IPFS via Pinata. Erfordert Polygon-Verifikation (amortization.verified_wallet) und konfigurierten Pinata JWT (via UI oder .env). Pinata-keyvalues-Index (schema: saveyoursoul/soul/1.0) macht die Soul im Agent-Marketplace auffindbar. Speichert agent_registry_cid + agent_registry_url + agent_registered_at in api_context.json.',
    response: '{\n  "ok": true,\n  "cid": "bafk...",\n  "ipfs_uri": "ipfs://bafk...",\n  "gateway_url": "https://gateway.pinata.cloud/ipfs/bafk...",\n  "pinned_at": "2026-04-21T..."\n}'
  },
  {
    method: 'GET/PUT/DELETE', path: '/api/soul/pinata-config', permission: 'soul_cert',
    desc: 'Pinata JWT über die UI konfigurieren — kein Server-SSH nötig. GET gibt { configured, preview } zurück (JWT gemaskiert: erste 8 + letzte 4 Zeichen). PUT speichert den JWT in /var/lib/sys/pinata_jwt. DELETE löscht ihn. soul-mcp liest die Datei bei jeder Anfrage — kein Neustart des MCP-Servers erforderlich. .env-Variable PINATA_JWT hat Vorrang falls gesetzt.',
    response: '{ "configured": true, "preview": "eyJhbGci…4abc" }'
  },
]

const anchorLevels = [
  { level: 'Stufe 0', req: 'Keine Entwicklungs-Sessions, kein Anker',  meaning: 'Neue oder inaktive Soul — keine Authentizitätsaussage möglich.' },
  { level: 'Stufe 1', req: 'Growth Chain vorhanden',                    meaning: 'Soul hat mindestens einen signierten Entwicklungs-Eintrag — noch nicht on-chain.' },
  { level: 'Stufe 2', req: 'Mindestens 1 Entwicklungs-Session, noch kein Anker', meaning: 'Aktive Soul mit Verlauf, bereit zum Verankern.' },
  { level: 'Stufe 3', req: 'On-chain verankert (soul_chain_anchor)',    meaning: 'Kryptographischer Beweis der Identität auf Polygon — unveränderlich und dauerhaft.' },
]

const mobileIssues = [
  {
    problem: 'tx.wait() hängt ewig',
    cause: 'WalletConnect-Verbindung bricht nach App-Switch ab (Browser → Wallet → Browser)',
    behavior: 'Timeout nach 60s → Fallback-Polling via öffentlichem Polygon-RPC (alle 5s, max. 4 Min.)'
  },
  {
    problem: 'TX gesendet, aber kein Feedback',
    cause: 'Bestätigung kommt nicht durch die unterbrochene Verbindung',
    behavior: 'sys.md wird sofort nach TX-Submission aktualisiert (nicht erst nach Bestätigung). Kein Datenverlust.'
  },
  {
    problem: 'Polling läuft aus ohne Bestätigung',
    cause: 'Sehr langsame Polygon-RPC-Antwortzeiten',
    behavior: 'Fehlermeldung „Transaktion gesendet, Bestätigung ausstehend" + Explorer-Link. TX-Hash bereits in sys.md.'
  },
  {
    problem: 'Provider nach Chain-Wechsel stale',
    cause: 'MetaMask Mobile braucht Zeit nach wallet_switchEthereumChain',
    behavior: 'Mobile: 2,5s Pause + bis zu 6 Retry-Versuche à 500ms. Desktop: 1s Pause + 3 Versuche à 300ms.'
  },
]

const refImplLayers = [
  {
    name: 'Frontend',
    title: 'Nuxt 4 SPA (statisch generiert)',
    desc: 'nuxt generate erzeugt eine reine Client-Side-App. Kein Server-Side-Rendering. Alle Zustände in Composables. Deploy via rsync auf Webroot.'
  },
  {
    name: 'API-Layer',
    title: 'OpenResty (nginx + LuaJIT)',
    desc: 'Kein Node.js in Production. Alle API-Endpunkte sind Lua-Skripte im access/content-Phase-Modell. soul_auth.lua validiert HMAC-Token vor jedem geschützten Handler.'
  },
  {
    name: 'MCP-Server',
    title: 'soul-mcp (Node.js 20+)',
    desc: 'Stateless HTTP-Server auf Port 3098, von OpenResty bei /mcp proxied. Implementiert MCP Streamable HTTP + OAuth 2.0 PKCE. Keine eigene Datenpersistenz.'
  },
  {
    name: 'Storage',
    title: 'Dateisystem (/var/lib/sys/souls/)',
    desc: 'Keine relationale Datenbank. Pro Soul ein Verzeichnis mit sys.md, api_context.json, soul_connections.json und vault/-Unterordnern. Verschlüsselung im Dateisystem selbst (SYSCRYPT01-Präfix).'
  },
]

const refImplRequirements = [
  { id: 'R-01', text: 'soul_cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id [+ ":" + cert_version]).hex()[:32] — stateless, keine Datenbank; cert_version = 0 nutzt altes Format (rückwärtskompatibel)' },
  { id: 'R-02', text: 'Verschlüsselte Dateien: Magic "SYS\\x01" (4 Bytes) + 16-Byte-IV + AES-256-CBC-Ciphertext' },
  { id: 'R-03', text: 'sys.md: Markdown mit YAML-Frontmatter (soul_id, name, version, maturity, Timestamps) + ## Sektionen' },
  { id: 'R-04', text: 'api_context.json: permissions-Objekt, vault_key_hex (hex), synced_files + active_files Index' },
  { id: 'R-05', text: 'GET /api/soul → sys.md-Text; PUT /api/context → soul_content updaten (Server re-verschlüsselt)' },
  { id: 'R-06', text: 'POST /api/webhook → soul + Vault-Dateien als JSON-Response mit url_with_token-Links' },
  { id: 'R-07', text: 'MCP-Tools soul_read + soul_write müssen das MCP Streamable HTTP-Protokoll implementieren' },
  { id: 'R-08', text: 'Rate-Limiting auf /mcp und /oauth/token — kein offener Brute-Force-Kanal' },
  { id: 'R-09', text: 'beme_chat / POST /api/beme: sys.md serverseitig entschlüsseln + Anthropic-Aufruf — kein API-Key im MCP-Client erforderlich' },
  { id: 'R-10', text: 'soul_connections.lua Berechtigungs-Whitelist muss video explizit enthalten (soul/audio/images/video/context_files)' },
  { id: 'R-11', text: 'Public Vault: public_files in config.json muss aktiv befüllt sein — leeres Array macht alle Netzwerk-Freigaben unsichtbar' },
]

const faqItems = ref([
  { q: 'Was passiert mit meiner Soul wenn ich auslogge?', a: 'Deine Soul bleibt in deinem lokalen Vault erhalten. Die Entwicklungs-Sitzung endet, aber deine Identität ist sicher in deinem Vault-Ordner gespeichert. Beim nächsten Login wird sie automatisch geladen.', open: false },
  { q: 'Kann ich SYS auf iOS verwenden?', a: 'Ja — mit Einschränkungen. iOS Safari unterstützt keine persistenten lokalen Ordner (File System Access API). Du kannst SYS nutzen, aber Dateien liegen im Arbeitsspeicher und gehen beim Schließen des Browsers verloren. Für Produktivnutzung empfehlen wir Desktop Chrome oder Edge.', open: false },
  { q: 'Was ist der Unterschied zwischen Passkey und 12 Wörtern?', a: 'Beide leiten denselben kryptographischen Schlüssel ab — der Unterschied ist die Schlüsselquelle. Passkey ist gerätegebunden (dein Fingerabdruck / Face ID auf einem spezifischen Gerät). 12 Wörter sind portabel — du kannst sie auf jedem Gerät eingeben. Wähle 12 Wörter wenn du geräteübergreifend arbeiten willst.', open: false },
  { q: 'Wie lange ist ein Service-Token gültig?', a: 'Das hängt von der Ablaufdauer ab, die du beim Erstellen konfigurierst (unbegrenzt, 30 Tage, 6 Monate, 1 Jahr). Zusätzlich ist der Token immer nur gültig wenn der Vault-Zugang offen ist — läuft die Vault-Session ab, erhalten alle Dienste automatisch einen 403-Fehler.', open: false },
  { q: 'Kann ich eine Verbindung im Soul Network einseitig trennen?', a: 'Ja. Jede Seite kann jederzeit trennen. Die andere Person erhält beim nächsten Öffnen des Soul Networks eine Benachrichtigung. Die KI hat ab sofort keinen Zugang mehr zum geteilten Netzwerk-Kontext dieser Verbindung.', open: false },
  { q: 'Wie sicher ist die Verschlüsselung mit 12 Wörtern?', a: 'Die 12 Wörter (BIP39) werden mit PBKDF2-SHA256 (100.000 Iterationen) zu einem 256-Bit AES-Schlüssel abgeleitet. Das entspricht Industriestandard. Die Sicherheit hängt davon ab, wie sicher du die 12 Wörter aufbewahrst — sie werden nirgends gespeichert.', open: false },
  { q: 'Warum blockiert der Sync und zeigt „Vault-Schlüssel fehlt"?', a: 'Seit der Umstellung auf Verschlüsselung als Standard lässt der Sync keinen Klartext-Upload mehr zu. Du musst den Vault zuerst öffnen (Kachel „Vault-Zugang" → Entsperren mit Passkey oder 12 Wörtern). Erst dann ist der Vault-Schlüssel im Browser vorhanden und der Sync verschlüsselt automatisch vor dem Upload.', open: false },
  { q: 'Was passiert mit meinen Daten wenn ich alles lösche?', a: 'Der Button „Alle VPS-Daten löschen" entfernt sys.md, alle Vault-Dateien und Service-Tokens vom Server. Deine lokale Soul im Vault bleibt unberührt. Du kannst jederzeit neu hochladen.', open: false },
  { q: 'Was ist der Unterschied zwischen lokalem Vault und Cloud-Backup?', a: 'Lokal: ein Ordner auf deinem Gerät, erreichbar via File System Access API — für das aktive Bearbeiten. Cloud: ein verschlüsseltes .soul-Bundle auf einem beliebigen Speicher (Google Drive, Arweave, IPFS …) — nur für die Aufbewahrung. Der Weg: Vault aufbauen → verschlüsselt herunterladen → beliebig ablegen → beim nächsten Login URL eingeben → entschlüsseln. Kein automatischer Sync, kein Cloud-URL-Management im Tool.', open: false },
  { q: 'Was bedeutet die Warnung „X VPS-Datei(en) konnten nicht entschlüsselt werden"?', a: 'Beim Verschlüsseln & Download werden VPS-Dateien automatisch abgerufen. Falls der Vault-Schlüssel in der aktuellen VPS-Session nicht mehr aktiv ist (Session abgelaufen), kann der Server CBC-verschlüsselte Dateien nicht entschlüsseln und gibt sie übersprungen zurück. Lokal gespeicherte Dateien werden trotzdem eingebunden. Lösung: vorher den Vault im API-Kontext erneut öffnen (Vault-Session erneuern), dann erneut verschlüsseln.', open: false },
  { q: 'Wie lade ich ein .soul-Bundle aus Google Drive oder IPFS?', a: 'Beim Login auf „URL / Cloud" wechseln und die öffentliche Share-URL (HTTPS) oder eine Arweave TX-ID (43 Zeichen) eingeben. Das Bundle wird geladen und anschließend mit den 12 Schlüsselwörtern entschlüsselt. Die URL wird für den nächsten Login gespeichert. Google Drive: „Freigeben → Jeder mit dem Link" → direkten Download-Link (uc?export=download&id=…) verwenden.', open: false },
  { q: 'Die Transaktion beim Verankern kam nie zum Ende — was ist passiert?', a: 'Auf Mobile unterbricht der App-Switch (Browser → Wallet-App → Browser zurück) oft die WalletConnect-Verbindung. SYS schreibt den TX-Hash aber sofort in sys.md, sobald die Transaktion gesendet wurde — noch bevor die Bestätigung ankommt. Danach wartet SYS bis zu 60s via WalletConnect, dann nochmal bis zu 4 Min. über den öffentlichen Polygon-RPC. Wenn das Modal die Meldung „Transaktion gesendet, Bestätigung ausstehend" zeigt, ist die TX trotzdem unterwegs — den Explorer-Link öffnen um den Status zu prüfen.', open: false },
  { q: 'Welche Wallet kann ich zum Verankern verwenden?', a: 'Jede EIP-1193-kompatible Wallet via WalletConnect v2: MetaMask (Desktop + Mobile), Rainbow, Coinbase Wallet, Trust Wallet u.v.m. Auf Desktop funktioniert auch die MetaMask-Browser-Extension direkt. Die Wallet muss auf Polygon Mainnet konfiguriert sein — SYS wechselt automatisch und fügt das Netz hinzu falls nötig.', open: false },
  { q: 'Warum sehen verbundene Souls meine Dateien nicht?', a: 'sys.md wird immer automatisch geteilt — dafür ist kein zusätzlicher Schritt nötig. Vault-Dateien (Audio, Bilder, Kontext) sind jedoch nur sichtbar, wenn sie explizit in den Public Vault hochgeladen wurden. Das geht im Datei-Explorer → Tab „Netzwerk" → „Datei hinzufügen" → Datei aus dem Server-Vault wählen. Die Datei wird sofort hochgeladen und ist danach für verbundene Souls sichtbar. Außerdem muss der Vault-Zugang offen sein (Kachel „Vault-Zugang").', open: false },
  { q: 'Muss ich für Soul Network etwas in der App konfigurieren?', a: 'Ja — für Vault-Dateien. Sobald eine gegenseitige Verbindung besteht, wird der soul_grant automatisch angelegt. Danach: im Datei-Explorer → Tab „Netzwerk" → „Datei hinzufügen" → gewünschte Datei (Audio, Bilder, Video, PDF/MD/TXT) aus dem Server-Vault wählen. Jede hinzugefügte Datei wird sofort in den Public Vault hochgeladen und ist ab dann für verbundene Souls sichtbar. Entfernen jederzeit per Mülleimer-Icon.', open: false },
  { q: 'Welche Dateiformate kann ich im Netzwerk teilen?', a: 'Audio: MP3, WAV, OGG, M4A, OPUS, FLAC, AAC, WebM. Video: MP4, MOV, AVI, MKV, WebM. Bilder: JPG, PNG, WebP, GIF, AVIF. Kontext-Dokumente: PDF, Markdown (.md), Textdateien (.txt). Alle Dateien im Public Vault werden im Klartext gespeichert — verschlüsselte Dateien können nicht freigegeben werden. Ein KI-Agent kann Audio mit [public-vault-audio:], Video mit [public-vault-video:] und Bilder mit [public-vault-img:] direkt im Chat einbetten.', open: false },
  { q: 'Was bedeutet „Server-Soul ist mit einem anderen Schlüssel verschlüsselt"?', a: 'Die sys.md auf dem Server wurde mit einem anderen Vault-Schlüssel verschlüsselt als dem aktuell aktiven — zum Beispiel weil der Vault zuletzt von einem anderen Gerät oder mit anderen Schlüsselwörtern geöffnet wurde. Lösung: Vault öffnen (Kachel „Vault-Zugang" → Entsperren) → dann Vault synchronisieren (Kachel „Vault-Explorer" → Sync). Danach klappt der Soul-Abgleich.', open: false },
  { q: 'Was passiert beim Soul-Sync wenn beide Seiten denselben Stand haben?', a: 'Nichts — das Sync-Panel erscheint nicht. Es wird nur angezeigt wenn der Inhalt der server-seitigen sys.md vom lokal gespeicherten Stand abweicht. Der Vergleich läuft beim Start automatisch im Hintergrund.', open: false },
  { q: 'Kann der Soul-Sync Änderungen automatisch zusammenführen (Merge)?', a: 'Nein. Es gibt keine automatische Zusammenführung. Immer gewinnt eine Seite vollständig — entweder Server oder Lokal. Wenn du Inhalte aus beiden Versionen behalten möchtest, musst du die sys.md-Datei vorher manuell sichern und die gewünschten Sektionen per Text-Editor zusammenführen.', open: false },
  { q: 'Warum zeigt die KI keine Bilder aus meinem Vault?', a: 'Drei häufige Ursachen: (1) Die Bilder sind nicht im Vault — lokaler Vault muss verbunden sein, oder Bilder müssen per API-Kontext auf den VPS hochgeladen sein. (2) Der Vault-Zugang ist geschlossen — die Kachel Vault-Zugang muss offen sein, damit der VPS-Zugriff funktioniert. (3) Die KI wurde nicht explizit gefragt — frag sie direkt: Zeig mir ein Bild von dir.', open: false },
  { q: 'Welche Bildformate werden im Chat unterstützt?', a: 'JPG, PNG, WebP und AVIF — alle Formate die der Browser nativ darstellen kann. Die Bilder werden direkt aus dem Vault geladen und nie an externe Dienste weitergegeben. Audio- und Videodateien werden derzeit nicht als Inline-Medien im Chat angezeigt.', open: false },
  { q: 'Was ist der Amortisierungs-Stack?', a: 'Ein optionaler Monetarisierungs-Layer für Soul-Betreiber. Jede Soul hat einen Zugangsmodus — Grundeinstellung ist immer "Frei" (alle MCP-Tools ohne Zahlung nutzbar). Der Modus kann im Agent-Marketplace-Panel per Toggle auf "Bezahlt (POL)" umgestellt werden: Die Soul verlangt dann pro MCP-Anfrage eine POL-Zahlung (Polygon Native Token). Externe KI-Agenten entdecken die Soul im IPFS-Marketplace (soul_discover), senden POL an die konfigurierte Wallet, posten den tx_hash an /api/soul/pay und erhalten einen access_token mit 1h Gültigkeit — den sie dann als Bearer-Token am MCP-Endpunkt verwenden. Bestimmte Tools können als free_tools markiert werden und bleiben auch im Bezahlt-Modus ohne Zahlung zugänglich (z.B. soul_read für Entdeckungs-Queries). Einnahmen werden in earnings.json protokolliert und sind über GET /api/soul/earnings abrufbar.', open: false },
  { q: 'Wie funktioniert die POL-Zahlung technisch?', a: 'Der Agent sendet eine native POL-Transaktion auf Polygon Mainnet an die in amortization.wallet konfigurierte Adresse (Betrag ≥ pol_per_request). Anschließend postet er { soul_id, tx_hash } an POST /api/soul/pay. Der Server prüft: (1) Amortisierung ist aktiv, (2) tx_hash-Format korrekt, (3) TX existiert on-chain, (4) Empfänger stimmt exakt überein, (5) Betrag ≥ pol_per_request, (6) mindestens 1 Bestätigung, (7) TX wurde nicht bereits verwendet (48h Replay-Schutz via shared dict + persistente earnings.json). Bei Erfolg: access_token (1h TTL) + pol_amount + from_wallet in der Antwort. Fehler: 402 (Amortisierung deaktiviert), 404 (TX nicht gefunden), 422 (falscher Empfänger / Betrag zu niedrig / unbestätigt), 409 (TX bereits verwendet).', open: false },
  { q: 'Was ist der IPFS Agent-Marketplace und wie funktioniert die Entdeckung?', a: 'Pinata (pinata.cloud) ist ein externer IPFS-Pinning-Dienst der als dezentrales Verzeichnis für registrierte SYS-Souls genutzt wird. Hinweis: Pinata und SaveYourSoul haben keine Kooperation oder Partnerschaft — Pinata wird als Beispiel-Dienst verwendet weil er einen kostenlosen Einstieg bietet. Jeder IPFS-Pinning-Dienst mit kompatibler API kann alternativ genutzt werden.\n\nBei POST /api/soul/register baut der Server einen ERC-8004-kompatiblen JSON-Blob (soul_id, Name, MCP-Endpunkt, Zahlungskonditionen, Wallet, Verifikations-URL) und pinnt ihn via Pinata API auf IPFS. Pinata speichert dabei keyvalues-Metadaten (schema: saveyoursoul/soul/1.0, soul_id), über die alle registrierten Souls durchsucht werden können — ohne vorherige Kenntnis der MCP-URL. Ein externer Agent ruft dazu das MCP-Tool soul_discover auf (oder GET /internal/discover-souls direkt). Der Agent bekommt: mcp_endpoint, pay_endpoint, wallet, pol_per_request — alles was er für den automatischen Zugang braucht. Pinata arbeitet unabhängig vom SoulRegistry-Contract — beide Systeme koexistieren.', open: false },
  { q: 'Wie richte ich das Pinata-Pinning (IPFS-Registrierung) Schritt für Schritt ein?', a: 'Voraussetzung: Die Soul muss Polygon-verifiziert sein (Blockchain-Anker gesetzt, GET /api/soul/verify gibt "verified": true zurück). Ohne Verifikation wird die Registrierung mit 403 blockiert.\n\nSchritt 1 — Pinata-Account: pinata.cloud aufrufen → kostenlosen Account erstellen (1 GB Free-Tier reicht aus).\n\nSchritt 2 — API-Key erzeugen: Im Pinata-Dashboard → "API Keys" → "New Key" → Admin-Rechte aktivieren → Key benennen (z.B. "soul-mcp") → "Create Key". Den angezeigten JWT sofort kopieren — er wird nur einmal angezeigt.\n\nSchritt 3 — JWT über die UI eintragen (kein SSH nötig): Im SYS-Dashboard → "Agent Marketplace →" → Schritt 1 "Pinata JWT" → JWT einfügen → "JWT speichern". Der JWT wird sofort in /var/lib/sys/pinata_jwt gespeichert und ist ohne MCP-Server-Neustart aktiv.\n\nAlternativ via .env: PINATA_JWT=eyJhbG... in soul-mcp/.env eintragen + pm2 restart soul-mcp. .env hat Vorrang vor der UI-Konfiguration.\n\nSchritt 4 — Zugangsmodus wählen: Im Panel → Schritt 2 "Zugangsmodus" → Toggle "Frei / Bezahlt (POL)". Frei ist die Grundeinstellung und wird sofort gespeichert. Für Bezahlt-Modus: pol_per_request + Wallet + kostenlose Tools eintragen → "Bezahlt-Modus speichern" (erfordert Polygon-Verifikation). Alternativ: PUT /api/soul/amortization.\n\nSchritt 5 — Soul registrieren: Im Panel → Schritt 3 "IPFS-Registrierung" → "Auf IPFS registrieren". Gibt cid, ipfs_uri, gateway_url zurück. CID wird in api_context.json gespeichert.\n\nSchritt 6 — Verifikation: gateway_url im Browser öffnen — der JSON-Blob muss sichtbar sein. Mit soul_discover (q=dein_name) im MCP-Client prüfen ob die Soul im Marketplace erscheint.\n\nDomain-Wechsel: Erneut "Auf IPFS registrieren" — neue CID mit aktualisierten Endpunkten.', open: false },
  { q: 'Welche Daten stehen im gepinnten IPFS-Blob?', a: 'Der ERC-8004-kompatible JSON-Blob enthält: soul_id (UUID), name (Plaintext-Name aus sys.md), mcp_endpoint (vollständige URL), soul_endpoint (/api/soul), pay_endpoint (/api/soul/pay), verify_endpoint (/api/soul/verify), amortization-Objekt (enabled, pol_per_request, wallet, free_tools[]), agent_type ("soul"), protocol ("saveyoursoul/1.0"), schema_version ("ERC-8004/draft"). Die Pinata-keyvalues enthalten zusätzlich: soul_id, schema ("saveyoursoul/soul/1.0"), registered (Zeitstempel) — diese werden für den Pinata-pinList-Filter genutzt. Wichtig: Name und MCP-Endpunkt sind dauerhaft öffentlich auf IPFS — nur registrieren wenn das gewünscht ist.', open: false },
  { q: 'Was passiert mit der IPFS-Registrierung wenn ich meine Domain ändere?', a: 'Jede IPFS-Pin ist content-addressed und unveränderlich — der CID kann nicht nachträglich geändert werden. Ein Domain-Wechsel erfordert eine neue Registrierung: POST /api/soul/register auf dem neuen Server → neuer CID mit neuer Domain. Alte Pins bleiben auf IPFS verfügbar, zeigen aber auf die alte (nicht mehr gültige) Domain. Externe Agenten die nach soul_id suchen, finden über soul_discover alle Pins — der neueste (nach pinned_at sortiert) ist der aktuelle. Empfehlung: Nach dem Umzug einmalig neu registrieren, damit der aktuelle MCP-Endpunkt im Marketplace gefunden wird.', open: false },
])

// ── Inline Components ─────────────────────────────────────────────────────────
const DocHeading = defineComponent({
  props: { level: String, badge: String },
  slots: ['default'],
  setup(props, { slots }) {
    return () => {
      const text = slots.default?.()
      const badge = props.badge ? h('span', {
        class: 'text-xs font-mono px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.08)] text-white/70 border border-[rgba(255,255,255,0.18)] ml-2 align-middle'
      }, props.badge) : null

      if (props.level === '1') {
        return h('h2', { class: 'doc-heading-1 flex items-center flex-wrap gap-2' }, [text, badge])
      }
      return h('h3', { class: 'doc-heading-2' }, [text])
    }
  }
})

const DocCode = defineComponent({
  props: { lang: String },
  slots: ['default'],
  setup(props, { slots }) {
    return () => h('div', { class: 'my-4 rounded-xl overflow-hidden border border-[rgba(255,255,255,0.13)]' }, [
      props.lang ? h('div', {
        class: 'px-4 py-2 bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.13)] flex items-center gap-2'
      }, [
        h('span', { class: 'w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]' }),
        h('span', { class: 'text-xs font-mono text-[var(--sys-fg-dim)]' }, props.lang)
      ]) : null,
      h('pre', { class: 'px-4 py-4 overflow-x-auto bg-[rgba(255,255,255,0.02)] text-xs font-mono text-[var(--sys-fg)] leading-relaxed m-0' },
        h('code', {}, slots.default?.())
      )
    ])
  }
})
</script>

<style scoped>
/* ── Design tokens ── */
.docs-page {
  --ink: #08070c; --paper: #12101a; --paper-2: #1a1726; --paper-3: #0d0b14;
  --rule: rgba(226,220,240,0.10); --rule-2: rgba(226,220,240,0.20);
  --fg: #ece7f5; --fg-2: rgba(236,231,245,0.72); --fg-3: rgba(236,231,245,0.48); --fg-4: rgba(236,231,245,0.30);
  --accent: #8b5cf6; --accent-2: rgba(139,92,246,0.14); --accent-bright: #a78bfa;
  --serif: 'Noto Serif', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;
  --mono: 'Oxanium', monospace;
  min-height: 100dvh;
  background: var(--paper);
  color: var(--fg);
  font-family: var(--sans);
}

/* ── Locked state ── */
.locked-screen { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.locked-inner { max-width: 480px; }
.locked-mono { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); display: block; margin-bottom: 16px; }
.locked-title { font-family: var(--serif); font-size: clamp(32px,5vw,56px); font-weight: 700; letter-spacing: -0.025em; line-height: 1.1; color: var(--fg); margin: 0 0 16px; }
.locked-title em { color: var(--accent); font-style: italic; }
.locked-body { font-size: 15px; line-height: 1.7; color: var(--fg-2); margin: 0 0 28px; }
.locked-btn { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; border: 1px solid var(--rule-2); padding: 12px 20px; display: inline-block; transition: color 0.15s, border-color 0.15s; }
.locked-btn:hover { color: var(--accent); border-color: var(--accent); }

/* ── Top Nav ── */
.docs-nav { position: sticky; top: 0; z-index: 40; border-bottom: 1px solid var(--rule); background: rgba(18,16,26,0.92); backdrop-filter: blur(16px); }
.docs-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 clamp(16px,3vw,32px); height: 56px; display: flex; align-items: center; gap: 20px; }
.docs-lockup { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.docs-logo { width: 28px; height: 28px; object-fit: contain; }
.docs-mark { font-family: var(--mono); font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
.docs-dot { color: var(--accent); }
.docs-slash { color: var(--rule-2); margin: 0 2px; font-size: 14px; }
.docs-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-4); }

.docs-search-wrap { flex: 1; max-width: 280px; display: flex; align-items: center; gap: 8px; background: rgba(13,11,20,0.8); border: 1px solid var(--rule-2); padding: 0 12px; height: 36px; cursor: pointer; transition: border-color 0.15s; }
.docs-search-wrap:hover { border-color: rgba(226,220,240,0.3); }
.docs-search-icon { width: 14px; height: 14px; color: var(--fg-4); flex-shrink: 0; }
.docs-search-input { background: transparent; font-size: 13px; color: var(--fg); flex: 1; outline: none; font-family: var(--sans); }
.docs-search-input::placeholder { color: var(--fg-4); }
.docs-search-kbd { font-family: var(--mono); font-size: 10px; color: var(--fg-4); border: 1px solid var(--rule-2); padding: 2px 5px; flex-shrink: 0; }

.docs-nav-right { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.docs-back { display: inline-flex; align-items: center; font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; transition: color 0.15s; white-space: nowrap; }
.docs-back:hover { color: var(--accent); }
.docs-menu-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--fg-3); background: transparent; border: none; cursor: pointer; }

@media (max-width: 640px) { .docs-search-wrap { display: none; } }

/* ── Doc Hero ── */
.doc-hero { margin-bottom: 56px; max-width: 640px; padding-bottom: 40px; border-bottom: 1px solid var(--rule); }
.doc-hero-kicker { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); display: block; margin-bottom: 16px; }
.doc-hero-title { font-family: var(--serif); font-size: clamp(36px,5vw,64px); font-weight: 700; letter-spacing: -0.025em; line-height: 1.05; color: var(--fg); margin: 0 0 16px; }
.doc-hero-title em { color: var(--accent); font-style: italic; }
.doc-hero-sub { font-size: 16px; line-height: 1.65; color: var(--fg-2); margin: 0; }

/* ── Content typography ── */
.doc-heading-1 { font-family: var(--serif); font-size: 24px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.25; color: var(--fg); margin: 48px 0 16px; padding-top: 0; }
.doc-heading-1:first-child { margin-top: 0; }
.doc-heading-2 { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin: 32px 0 12px; font-weight: 500; }

.doc-lead { font-size: 17px; line-height: 1.7; color: var(--fg-2); margin-bottom: 20px; }
.doc-p    { font-size: 15px; line-height: 1.75; color: var(--fg-2); margin-bottom: 14px; }
.doc-list { font-size: 15px; line-height: 1.75; color: var(--fg-2); padding-left: 20px; margin-bottom: 14px; }
.doc-code { font-family: var(--mono); font-size: 12px; background: rgba(139,92,246,0.12); color: var(--accent-bright); padding: 2px 6px; }

.doc-info-box    { background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.25); padding: 16px 20px; margin: 20px 0; }
.doc-warning-box { background: rgba(255,200,0,0.04); border: 1px solid rgba(255,200,0,0.20); padding: 16px 20px; margin: 20px 0; }

.doc-section { border-top: 1px solid var(--rule); padding-top: 16px; }
.doc-section:first-of-type { border-top: none; padding-top: 0; }

.doc-steps    { display: flex; flex-direction: column; gap: 16px; }
.doc-step     { display: flex; gap: 16px; }
.doc-step-num { width: 24px; height: 24px; border: 1px solid var(--rule-2); color: var(--fg-3); font-family: var(--mono); font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }

.doc-table-wrapper { overflow-x: auto; border: 1px solid var(--rule); }
.doc-table         { width: 100%; font-size: 13px; border-collapse: collapse; }
.doc-table th      { text-align: left; padding: 10px 16px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); background: rgba(13,11,20,0.6); border-bottom: 1px solid var(--rule); }
.doc-table td      { padding: 10px 16px; font-size: 13px; color: var(--fg-2); border-bottom: 1px solid var(--rule); }
.doc-table tr:last-child td { border-bottom: none; }
</style>
