<template>
  <div class="legal-body space-y-8 text-[var(--sys-fg)] leading-relaxed max-w-prose">

    <div>
      <h1 class="text-2xl font-bold mb-2">Datenschutzerklärung</h1>
      <p class="text-sm text-[var(--sys-fg-dim)]">Gemäß DSGVO (EU) 2016/679</p>
    </div>

    <!-- Platzhalter-Hinweis -->
    <div class="p-4 rounded-xl border border-[rgba(255,200,0,0.35)] bg-[rgba(255,200,0,0.05)] space-y-2">
      <p class="text-xs font-semibold text-yellow-400">Aktion erforderlich</p>
      <p class="text-sm text-[var(--sys-fg-muted)]">
        Diese Seite enthält Platzhalter. Tragen Sie Ihre eigenen Angaben ein, bevor Sie diesen Knoten öffentlich zugänglich machen.
        Passen Sie insbesondere Abschnitt 1 (Verantwortlicher), Abschnitt 9 (Hosting) und den Kontakt in Abschnitt 10 an.
      </p>
    </div>

    <!-- Intro -->
    <div class="p-4 rounded-xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)]">
      <p class="text-base text-[var(--sys-fg-muted)] leading-relaxed">
        SaveYourSoul ist nach dem <strong class="text-[var(--sys-fg)]">Local-First- und Privacy-by-Design-Prinzip</strong> konzipiert.
        Ich habe keinen Zugang zu verschlüsselten Vault-Inhalten. Persönliche Daten verlassen das Gerät des Nutzers nur dann, wenn der Nutzer dies explizit veranlasst.
      </p>
    </div>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">1. Verantwortlicher</h2>
      <div class="text-base leading-relaxed space-y-0.5 text-[var(--sys-fg-muted)]">
        <p class="font-medium text-[var(--sys-fg)]">[Ihr Name / Ihre Organisation]</p>
        <p>[Straße und Hausnummer]</p>
        <p>[PLZ und Ort]</p>
        <p>[Land]</p>
        <p class="mt-2">E-Mail: [ihre@email.com]</p>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">2. Welche Daten werden verarbeitet?</h2>

      <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-2 mt-4">2.1 Auf dem Server (VPS) gespeicherte Daten</h3>
      <p class="text-base text-[var(--sys-fg-muted)] mb-3">Folgende Daten werden nur dann auf dem VPS gespeichert, wenn der Nutzer dies explizit durch Upload oder Verbindungsaufbau veranlasst:</p>
      <div class="space-y-2">
        <div class="flex gap-3 text-sm">
          <code class="font-mono text-xs text-[var(--sys-violet)] w-36 flex-none pt-0.5">sys.md</code>
          <span class="text-[var(--sys-fg-muted)]">Identitätsdatei (Markdown mit YAML-Frontmatter). Inhalt vom Nutzer erstellt. Wird standardmäßig AES-256-CBC verschlüsselt gespeichert. Open-Modus (Klartext) nur als explizites Opt-in für Public-Network-Souls.</span>
        </div>
        <div class="flex gap-3 text-sm">
          <code class="font-mono text-xs text-[var(--sys-violet)] w-36 flex-none pt-0.5">api_context.json</code>
          <span class="text-[var(--sys-fg-muted)]">Konfigurationsdatei für API-Berechtigungen, Vault-Session und Sync-Index. Enthält keine biometrischen oder hochsensiblen Daten.</span>
        </div>
        <div class="flex gap-3 text-sm">
          <code class="font-mono text-xs text-[var(--sys-violet)] w-36 flex-none pt-0.5">soul_connections.json</code>
          <span class="text-[var(--sys-fg-muted)]">Verbindungsliste des Soul Network. Enthält Soul-IDs und Aliase verbundener Seelen — keine E-Mail-Adressen oder Klarnamen (sofern nicht vom Nutzer eingetragen).</span>
        </div>
        <div class="flex gap-3 text-sm">
          <code class="font-mono text-xs text-[var(--sys-violet)] w-36 flex-none pt-0.5">vault/</code>
          <span class="text-[var(--sys-fg-muted)]">Vom Nutzer explizit hochgeladene Vault-Dateien (Audio, Bilder, Video, Kontext). Können AES-256-CBC verschlüsselt sein. Inhalt ist dem Betreiber bei Verschlüsselung nicht zugänglich.</span>
        </div>
        <div class="flex gap-3 text-sm">
          <code class="font-mono text-xs text-[var(--sys-violet)] w-36 flex-none pt-0.5">soul_cert</code>
          <span class="text-[var(--sys-fg-muted)]">HMAC-SHA256-signierter Authentifizierungstoken (soul_id + Signatur). Enthält keine personenbezogenen Daten im engeren Sinne.</span>
        </div>
        <div class="flex gap-3 text-sm">
          <code class="font-mono text-xs text-[var(--sys-violet)] w-36 flex-none pt-0.5">earnings.json</code>
          <span class="text-[var(--sys-fg-muted)]">Optionale Datei — nur vorhanden wenn der Amortisierungs-Stack aktiviert und mindestens eine POL-Zahlung eingegangen ist. Enthält ausschließlich öffentliche Blockchain-Daten: tx_hash, Absender-Wallet-Adresse (pseudonym), POL-Betrag und Zeitstempel. Kein Personenbezug aus diesen Daten allein ableitbar. Nur über soul_cert abrufbar.</span>
        </div>
      </div>

      <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-2 mt-6">2.2 Lokal im Browser gespeicherte Daten (kein Server)</h3>
      <p class="text-base text-[var(--sys-fg-muted)] mb-2">Folgende Daten verbleiben ausschließlich im Browser des Nutzers und werden nicht übertragen:</p>
      <ul class="space-y-1 text-base text-[var(--sys-fg-muted)] list-disc list-inside ml-2">
        <li>sys.md und soul_cert im <code class="font-mono text-xs text-[var(--sys-violet)]">sessionStorage</code> (gelöscht beim Tab-Schließen)</li>
        <li>Vault-Handle (Ordnerverknüpfung) in <code class="font-mono text-xs text-[var(--sys-violet)]">IndexedDB</code> — kein Dateiinhalt, nur Pfadreferenz</li>
        <li>Profilbild als verkleinertes JPEG-Thumbnail (max. 256 px) in <code class="font-mono text-xs text-[var(--sys-violet)]">localStorage</code> — nur wenn kein lokaler Vault verbunden ist (Fallback). Bleibt bis zur manuellen Löschung im Browser erhalten. Bei verbundenem Vault wird das Bild stattdessen als <code class="font-mono text-xs text-[var(--sys-violet)]">profile.jpg</code> ausschließlich im lokalen Vault-Ordner des Nutzers gespeichert — der Server erhält zu keiner Zeit eine Kopie.</li>
        <li>UI-Einstellungen (Statistik-Präferenz, Onboarding-Status) in <code class="font-mono text-xs text-[var(--sys-violet)]">localStorage</code></li>
        <li>Lokale Vault-Dateien über die File System Access API — verbleiben im lokalen Ordner des Nutzers</li>
      </ul>

      <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-2 mt-6">2.3 Server-Logdateien</h3>
      <p class="text-base text-[var(--sys-fg-muted)] mb-2">Beim Webseitenbesuch werden technisch notwendige Logdaten erfasst:</p>
      <ul class="space-y-1 text-base text-[var(--sys-fg-muted)] list-disc list-inside ml-2">
        <li>Datum und Uhrzeit des Zugriffs</li>
        <li>Aufgerufene URL</li>
        <li>HTTP-Statuscode</li>
        <li>Übertragene Datenmenge</li>
        <li>Gekürzte IP-Adresse (kein vollständiger Personenbezug)</li>
        <li>Browser-Typ und -Version (User-Agent)</li>
      </ul>
      <p class="text-xs text-[var(--sys-fg-dim)] mt-2">Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Speicherdauer: bis zu 14 Tage. Es findet kein Profiling statt.</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">3. Zweck der Verarbeitung</h2>
      <div class="space-y-2 text-sm text-[var(--sys-fg-muted)]">
        <div class="flex gap-3">
          <span class="text-[var(--sys-fg)] font-medium w-36 flex-none">Identitätssystem</span>
          <span>Betrieb des dezentralen Identitätssystems, Bereitstellung der Soul-API und Authentifizierungsfunktionen.</span>
        </div>
        <div class="flex gap-3">
          <span class="text-[var(--sys-fg)] font-medium w-36 flex-none">KI-Kontext</span>
          <span>Bereitstellung der sys.md als Systemkontext für KI-Dienste, sofern vom Nutzer durch Service-Token freigegeben.</span>
        </div>
        <div class="flex gap-3">
          <span class="text-[var(--sys-fg)] font-medium w-36 flex-none">Soul Network</span>
          <span>Peer-to-Peer-Verbindungen zwischen Souls auf Basis gegenseitiger Einwilligung (soul_grant).</span>
        </div>
        <div class="flex gap-3">
          <span class="text-[var(--sys-fg)] font-medium w-36 flex-none">Technischer Betrieb</span>
          <span>Sicherstellung von Verfügbarkeit, Sicherheit und Fehleranalyse des Dienstes.</span>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">4. Rechtsgrundlagen</h2>
      <div class="space-y-2 text-sm text-[var(--sys-fg-muted)]">
        <p><strong class="text-[var(--sys-fg)]">Art. 6 Abs. 1 lit. a DSGVO</strong> — Einwilligung: Verarbeitung der sys.md und zugehöriger Vault-Daten auf Basis der aktiven Nutzung durch eingeladene Personen, die der Verarbeitung durch Teilnahme zustimmen. Die Einwilligung kann jederzeit durch Löschung der eigenen Daten widerrufen werden. Der Widerruf berührt nicht die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung (Art. 7 Abs. 3 DSGVO).</p>
        <p><strong class="text-[var(--sys-fg)]">Art. 6 Abs. 1 lit. a DSGVO</strong> — Einwilligung (optionale Funktionen): Soul Network (Verbindungsaufbau), Blockchain-Verankerung und Freigabe von Vault-Dateien für verbundene Dienste.</p>
        <p><strong class="text-[var(--sys-fg)]">Art. 6 Abs. 1 lit. a DSGVO</strong> — Einwilligung: Anonyme Webanalyse über Plausible Analytics (selbst gehostet, cookiefrei) nach Zustimmung im Datenschutz-Dialog.</p>
        <p><strong class="text-[var(--sys-fg)]">Art. 6 Abs. 1 lit. f DSGVO</strong> — Berechtigtes Interesse: Server-Logdateien für technischen Betrieb und Sicherheit sowie Speicherung des <code class="font-mono text-xs text-[var(--sys-violet)]">vault_key_hex</code> zur Ermöglichung autorisierter Service-Token-Zugriffe.</p>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">5. Weitergabe von Daten</h2>
      <div class="space-y-3 text-sm text-[var(--sys-fg-muted)]">
        <p><strong class="text-[var(--sys-fg)]">Externe Dienste mit Service-Token:</strong> Der Nutzer kann selbst gewählten externen Diensten (z. B. KI-Dienste, Sprachsysteme, eigene Systeme) über Service-Tokens kontrollierten Zugriff auf seine Soul-Daten gewähren. Die Datenweitergabe erfolgt ausschließlich auf Initiative und unter vollständiger Kontrolle des Nutzers.</p>
        <p><strong class="text-[var(--sys-fg)]">Soul Network (verbundene Souls):</strong> Bei gegenseitig aufgebauten Verbindungen erhalten verbundene Souls-Betreiber Lesezugriff auf freigegebene Inhalte. Grundlage ist ein automatisch angelegter <code class="font-mono text-xs text-[var(--sys-violet)]">soul_grant</code>, der durch den Verbindungsaufbau erteilt wird. Vault-Dateien (Audio, Bilder, Kontext) müssen zusätzlich explizit in den Public Vault hochgeladen werden.</p>
        <p><strong class="text-[var(--sys-fg)]">Kein Verkauf. Kein Tracking. Kein Profiling:</strong> Personenbezogene Daten werden nicht an Werbetreibende oder Dritte zu Marketingzwecken weitergegeben. Die eingesetzte Webanalyse (Plausible, selbst gehostet) gibt keine Daten an Dritte weiter.</p>
        <p><strong class="text-[var(--sys-fg)]">KI-Dienste (Anthropic Claude):</strong> Bei der Nutzung der Chat-Funktion sowie des MCP-Tools <code class="font-mono text-xs text-[var(--sys-violet)]">beme_chat</code> (POST /api/beme) wird die sys.md als Systemkontext serverseitig an die Anthropic Claude API (USA) übermittelt. Es handelt sich um eine <strong class="text-[var(--sys-fg)]">Drittlandübermittlung</strong> gemäß Art. 44 ff. DSGVO. Rechtsgrundlage sind die EU-Standardvertragsklauseln (SCC, Art. 46 Abs. 2 lit. c DSGVO) sowie ein Auftragsverarbeitungsvertrag (AVV) mit Anthropic. Die Übermittlung erfolgt ausschließlich auf direkte Nutzerinitiative (Chat-Eingabe bzw. beme_chat-Aufruf). Datenschutzerklärung von Anthropic: <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" class="text-[var(--sys-violet)] hover:underline underline-offset-2">anthropic.com/privacy</a></p>
        <p><strong class="text-[var(--sys-fg)]">Blockchain-Anker (WalletConnect / Reown AppKit):</strong> Die optionale Blockchain-Verankerung der Soul-Identität auf Polygon Mainnet nutzt WalletConnect (Reown AppKit) zur Wallet-Verbindung. Beim Verbindungsaufbau werden dabei technische Verbindungsdaten (keine Soul-Inhalte) über die WalletConnect-Cloud-Infrastruktur (USA) weitergeleitet. Diese Funktion ist vollständig optional und wird nur auf ausdrückliche Initiative des Nutzers aktiviert. On-chain werden ausschließlich kryptografische Hashes — kein Klartext, kein Name, kein Inhalt — gespeichert. Datenschutzinformation: <a href="https://walletconnect.com/privacy" target="_blank" rel="noopener noreferrer" class="text-[var(--sys-violet)] hover:underline underline-offset-2">walletconnect.com/privacy</a></p>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">5a. Optionaler Amortisierungs-Stack &amp; IPFS-Registrierung</h2>
      <div class="space-y-3 text-sm text-[var(--sys-fg-muted)]">
        <p><strong class="text-[var(--sys-fg)]">POL-Zahlungen (Blockchain):</strong> Der optionale Amortisierungs-Stack ermöglicht es, externe KI-Agenten für den MCP-Zugang zahlen zu lassen (Polygon-Token, POL). Bei einer Zahlung werden ausschließlich öffentliche Blockchain-Daten gespeichert: TX-Hash, Absender-Wallet-Adresse (pseudonym — kein Personenbezug aus der Adresse allein ableitbar), POL-Betrag und Zeitstempel. Diese Daten werden in einer <code class="font-mono text-xs text-[var(--sys-violet)]">earnings.json</code> auf dem VPS abgelegt und sind nur über soul_cert abrufbar. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der Abwicklung und Nachvollziehbarkeit technischer Zugangszahlungen). Diese Funktion ist vollständig optional und wird nur durch bewusstes Aktivieren (PUT /api/soul/amortization) gestartet.</p>
        <p><strong class="text-[var(--sys-fg)]">IPFS-Registrierung (Agent-Marketplace):</strong> Die optionale IPFS-Registrierung (POST /api/soul/register) veröffentlicht folgende Daten dauerhaft und öffentlich auf IPFS via Pinata: soul_id, Name (Plaintext-Feld aus sys.md), MCP-Endpunkt-URL, Zahlungskonditionen und Polygon-Wallet-Adresse. Diese Daten sind weltweit abrufbar und können aufgrund der Natur von IPFS (content-addressed, unveränderlich) nicht nachträglich gelöscht werden. Der Nutzer entscheidet selbst, ob er diesen Schritt ausführt. Er stellt eine <strong class="text-[var(--sys-fg)]">ausdrückliche Einwilligung</strong> in die dauerhafte öffentliche Verfügbarkeit dieser Daten dar (Art. 6 Abs. 1 lit. a DSGVO). Eine Re-Registrierung erzeugt eine neue CID (Pin) mit aktualisierten Daten; der alte Pin bleibt auf IPFS verfügbar. <em>Hinweis: Pinata (pinata.cloud) ist ein unabhängiger Drittanbieter ohne Kooperation oder Partnerschaft mit SaveYourSoul. Die Datenschutzerklärung von Pinata gilt für die dort gespeicherten Daten.</em></p>
        <p class="text-xs text-[var(--sys-fg-dim)]">Beide Funktionen — Amortisierung und IPFS-Registrierung — sind vollständig optional, nicht für den Grundbetrieb von SaveYourSoul erforderlich und werden ausschließlich auf ausdrückliche Initiative des Nutzers aktiviert.</p>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">6. Dezentrale Architektur &amp; Verschlüsselung</h2>
      <div class="p-4 rounded-xl border border-[var(--sys-border)] bg-[var(--sys-bg-surface)] space-y-3">
        <p class="text-base text-[var(--sys-fg-muted)] leading-relaxed">
          <strong class="text-[var(--sys-fg)]">Verschlüsselung ist Standard, nicht Option.</strong>
          sys.md und alle Vault-Dateien werden standardmäßig mit AES-256-CBC verschlüsselt bevor sie den Browser verlassen. Klartext-Modus (Open) ist nur für Public-Network-Souls vorgesehen und erfordert eine bewusste Aktivierung.
        </p>
        <p class="text-base text-[var(--sys-fg-muted)] leading-relaxed">
          <strong class="text-[var(--sys-fg)]">Cloud-Backup immer verschlüsselt.</strong>
          soul_cloud_push (MCP-Tool für Cloud-Backup) lädt ausschließlich verschlüsselte Bytes hoch — niemals Klartext. Arweave und HTTPS-Ziele empfangen den AES-256-CBC-Ciphertext direkt, ohne Entschlüsselungsschritt.
        </p>
        <p class="text-base text-[var(--sys-fg-muted)] leading-relaxed">
          <strong class="text-[var(--sys-fg)]">Vault-Schlüssel für Service-Token-Zugang.</strong>
          Um MCP-Agenten und autorisierten externen Diensten den Zugriff auf verschlüsselte Inhalte zu ermöglichen, wird ein abgeleiteter Vault-Schlüssel (<code class="font-mono text-xs text-[var(--sys-violet)]">vault_key_hex</code>) in der <code class="font-mono text-xs text-[var(--sys-violet)]">api_context.json</code> des Nutzers auf dem VPS gespeichert. Dieser Schlüssel ermöglicht dem Server die serverseitige Entschlüsselung nur für autorisierte Service-Tokens. Ein vollständiger Schutz vor Zugriff durch den VPS-Betreiber besteht daher nur für Bundle-Downloads (AES-256-GCM, Passkey oder 12 Wörter), die den Schlüssel niemals den Server berühren lassen.
        </p>
        <p class="text-xs text-[var(--sys-fg-dim)] mt-2">Rechtsgrundlage für die Speicherung des <code class="font-mono text-xs text-[var(--sys-violet)]">vault_key_hex</code>: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der technischen Ermöglichung autorisierter Service-Token-Zugriffe, die der Nutzer durch aktive Konfiguration explizit ausgelöst hat). Der Nutzer kann die Schlüsselspeicherung jederzeit durch Deaktivierung der Service-Token-Funktion rückgängig machen.</p>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">7. Speicherdauer</h2>
      <div class="space-y-2 text-sm text-[var(--sys-fg-muted)]">
        <p>VPS-Daten (sys.md, Vault-Dateien, api_context.json, soul_connections.json) werden gespeichert bis zur aktiven Löschung durch den Nutzer — oder auf schriftliche Anfrage an <a href="mailto:ihre@email.com" class="text-[var(--sys-violet)] hover:underline underline-offset-2">ihre@email.com</a>, spätestens innerhalb von 30 Tagen (Art. 17 DSGVO). Der Nutzer kann alle VPS-Daten jederzeit vollständig über die App löschen (Kachel „Alle VPS-Daten löschen").</p>
        <p>sessionStorage-Daten werden beim Schließen des Browser-Tabs automatisch gelöscht.</p>
        <p>localStorage-Daten (Profilbild-Thumbnail, Statistik-Präferenz, Onboarding-Status) verbleiben bis zur manuellen Löschung im Browser oder durch Zurücksetzen der Anwendung.</p>
        <p>IndexedDB-Daten (Vault-Handle) verbleiben bis zur manuellen Trennung des Vaults in der App.</p>
        <p>Server-Logdateien: bis zu 14 Tage.</p>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">8. Cookies und Tracking</h2>
      <p class="text-base text-[var(--sys-fg-muted)]">Diese Anwendung verwendet keine Tracking-Cookies und keine personenbezogenen Profiling-Mechanismen. Es werden keine Werbe-Netzwerke oder datenschutzverletzende Analyse-Tools (z. B. Google Analytics) eingesetzt. Die einzige anonymisierte Nutzungsstatistik erfolgt über Plausible Analytics (selbst gehostet, siehe Abschnitt 12). Die lokale Speicherung erfolgt über <code class="font-mono text-xs text-[var(--sys-violet)]">sessionStorage</code> (Soul-Session), <code class="font-mono text-xs text-[var(--sys-violet)]">IndexedDB</code> (Vault-Handle) und <code class="font-mono text-xs text-[var(--sys-violet)]">localStorage</code> (UI-Einstellungen: Statistik-Präferenz, Onboarding-Status; sowie Profilbild-Thumbnail als Fallback ohne Vault) — ausschließlich für Funktionszwecke, kein Tracking.</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">9. Hosting</h2>
      <p class="text-base text-[var(--sys-fg-muted)]">Der VPS wird betrieben bei: [Ihr VPS-Anbieter, Anschrift, Land].</p>
      <p class="text-base text-[var(--sys-fg-muted)] mt-2">Die statische App wird ausgeliefert über den selben Server. Kein CDN, keine externen Skript-Quellen (alle Schriften und Icons werden lokal ausgeliefert).</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">10. Deine Rechte (Betroffenenrechte)</h2>
      <p class="text-base text-[var(--sys-fg-muted)] mb-3">Du hast nach DSGVO folgende Rechte gegenüber dem Verantwortlichen:</p>
      <div class="space-y-2 text-sm text-[var(--sys-fg-muted)]">
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Auskunft</span>
          <span>Art. 15 DSGVO — Auskunft über gespeicherte Daten</span>
        </div>
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Berichtigung</span>
          <span>Art. 16 DSGVO — Berichtigung unrichtiger Daten</span>
        </div>
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Löschung</span>
          <span>Art. 17 DSGVO — Recht auf Löschung (direkt in der App möglich)</span>
        </div>
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Einschränkung</span>
          <span>Art. 18 DSGVO — Einschränkung der Verarbeitung</span>
        </div>
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Widerspruch</span>
          <span>Art. 21 DSGVO — Widerspruch gegen die Verarbeitung</span>
        </div>
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Portabilität</span>
          <span>Art. 20 DSGVO — Daten in maschinenlesbarem Format (sys.md ist per Definition portabel)</span>
        </div>
        <div class="flex gap-3">
          <span class="font-medium text-[var(--sys-fg)] w-36 flex-none">Widerruf</span>
          <span>Art. 7 Abs. 3 DSGVO — Widerruf einer erteilten Einwilligung jederzeit möglich (z. B. durch Löschung der eigenen Daten). Der Widerruf berührt nicht die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung.</span>
        </div>
      </div>
      <p class="text-base text-[var(--sys-fg-muted)] mt-4">Zur Wahrnehmung dieser Rechte genügt eine formlose E-Mail an <a href="mailto:ihre@email.com" class="text-[var(--sys-violet)] hover:underline underline-offset-2">ihre@email.com</a>.</p>
      <p class="text-base text-[var(--sys-fg-muted)] mt-3">Du hast zudem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig für den Verantwortlichen ist:</p>
      <div class="text-sm text-[var(--sys-fg-muted)] mt-2 ml-2">
        <p class="font-medium text-[var(--sys-fg)]">[Zuständige Datenschutzaufsichtsbehörde Ihres Bundeslandes / Landes]</p>
        <p></p>
        <p>E-Mail: <a href="mailto:poststelle@datenschutz.hessen.de" class="text-[var(--sys-violet)] hover:underline underline-offset-2">poststelle@datenschutz.hessen.de</a></p>
      </div>
      <p class="text-base text-[var(--sys-fg-muted)] mt-2">Als betroffene Person kannst du dich auch an die Aufsichtsbehörde deines eigenen Wohnsitzbundeslandes wenden.</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">11. Besondere Datenkategorien (Art. 9 DSGVO)</h2>
      <p class="text-base text-[var(--sys-fg-muted)]">Das Persönlichkeitsprofil (sys.md) kann auf freiwilliger Basis Angaben enthalten, die <strong class="text-[var(--sys-fg)]">besonderen Kategorien personenbezogener Daten</strong> nach Art. 9 DSGVO zählen — insbesondere weltanschauliche oder religiöse Überzeugungen, politische Ansichten, Gesundheitsdaten, psychologische Profile oder biometrische Merkmale (z. B. Stimmprofil).</p>
      <p class="text-base text-[var(--sys-fg-muted)] mt-2">Da die sys.md standardmäßig AES-256-CBC-verschlüsselt auf dem VPS gespeichert wird und dem Betreiber inhaltlich nicht zugänglich ist, verarbeitet der Betreiber in der Regel keine besonderen Kategorien personenbezogener Daten im Sinne von Art. 9 DSGVO. Soweit der Nutzer Inhalte seiner sys.md aktiv über die Chat-Funktion an die Anthropic Claude API überträgt, erfolgt dies auf ausdrückliche eigene Initiative — jede einzelne Übertragung stellt eine <strong class="text-[var(--sys-fg)]">ausdrückliche Einwilligung</strong> gemäß Art. 9 Abs. 2 lit. a DSGVO dar. Die Anthropic API ist als Auftragsverarbeiter tätig und verarbeitet die Daten nur transient. Die Einwilligung kann jederzeit durch Einstellung der Chat-Nutzung widerrufen werden; der Widerruf berührt nicht die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung.</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">12. Webanalyse mit Plausible Analytics</h2>
      <p class="text-base text-[var(--sys-fg-muted)]">Diese Website nutzt <strong class="text-[var(--sys-fg)]">Plausible Analytics</strong> in einer selbst gehosteten Variante auf einem Server in Deutschland (<code class="font-mono text-xs text-[var(--sys-violet)]">analytics.[IHRE_DOMAIN]</code>). Plausible arbeitet <strong class="text-[var(--sys-fg)]">ohne Cookies</strong> und erstellt keine personenbezogenen Nutzerprofile.</p>
      <ul class="space-y-1 text-base text-[var(--sys-fg-muted)] list-disc list-inside ml-2 mt-2">
        <li>Erhobene Daten: anonymisierte Nutzungsinformationen (Seitenaufrufe, Verweildauer, Herkunftsland)</li>
        <li>IP-Adressen: keine Speicherung im Klartext</li>
        <li>Drittlandtransfer: findet nicht statt (Server in Deutschland)</li>
        <li>Cookies: keine</li>
      </ul>
      <p class="text-xs text-[var(--sys-fg-dim)] mt-2">Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO (Einwilligung). Die anonyme Statistikerhebung erfolgt nur nach deiner Zustimmung im Datenschutz-Dialog der App. Du kannst diese Einwilligung jederzeit widerrufen — deine Entscheidung wird in <code class="font-mono text-xs" style="color:var(--sys-violet)">localStorage</code> gespeichert. Es findet kein Profiling statt.</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">13. Automatisierte Entscheidungsfindung</h2>
      <p class="text-base text-[var(--sys-fg-muted)]">Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von Art. 22 DSGVO statt. KI-Antworten dienen ausschließlich der persönlichen Reflexion des Nutzers und haben keine rechtsverbindliche Wirkung.</p>
      <p class="text-base text-[var(--sys-fg-muted)] mt-2"><strong class="text-[var(--sys-fg)]">Hinweis zur Datenschutzbeauftragten-Bestellung:</strong> Gemäß § 38 BDSG ist für dieses Projekt keine Datenschutzbeauftragte oder kein Datenschutzbeauftragter bestellt, da die Voraussetzungen (mehr als 20 mit Datenverarbeitung beschäftigte Personen) nicht vorliegen. Anfragen zum Datenschutz richten Sie bitte direkt an den Verantwortlichen: <a href="mailto:ihre@email.com" class="text-[var(--sys-violet)] hover:underline underline-offset-2">ihre@email.com</a>.</p>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-[var(--sys-fg)] mb-3">14. Geschlossene Testphase</h2>
      <p class="text-base text-[var(--sys-fg-muted)]">Dieser Knoten wird privat betrieben. Die Nutzung erfolgt auf eigene Verantwortung. Der Betreiber ist [Ihr Name].</p>
    </section>

    <p class="text-xs text-[var(--sys-fg-dim)] pt-4 border-t border-[var(--sys-border)]">Stand: [Datum einsetzen] · Betreiber: [Ihr Name]</p>

  </div>
</template>

<style scoped>
.legal-body {
  font-family: "Inter", system-ui, sans-serif;
}
.legal-body h1,
.legal-body h2,
.legal-body h3 {
  font-family: "Inter", system-ui, sans-serif;
  letter-spacing: -0.01em;
}
</style>
