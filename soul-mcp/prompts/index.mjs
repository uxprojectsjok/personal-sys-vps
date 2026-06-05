/**
 * soul-mcp – MCP Prompts
 *
 * soul_guide:  Instruiert die KI wie sie mit der Soul-API umgehen soll.
 * tool_guide:  Vollständige Tool-Referenz mit Use-Cases und Flows.
 * soul_first_entry: Onboarding für neue Souls.
 */

export function registerPrompts(server) {

  // ── Haupt-Guide: Soul lesen + proaktiv schreiben ──────────────────────────
  server.prompt(
    'soul_guide',
    'Anleitung für KI-Agenten: Soul-Kontext laden, nutzen und nach bedeutsamen Gesprächen proaktiv erweitern.',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# Soul-Leitfaden für KI-Agenten

## Zu Beginn jeder Sitzung
Rufe **soul_read** auf, bevor du antwortest. Die Soul ist das Gedächtnis und die Persönlichkeit des Nutzers — sie enthält Werte, Ziele, aktuelle Projekte und persönliche Hintergründe. Ohne soul_read antwortest du ins Blaue.

## Während des Gesprächs
- Beziehe dich auf konkrete Abschnitte der Soul, wenn sie relevant sind.
- Stelle keine Fragen, die die Soul bereits beantwortet.
- Wenn der Nutzer etwas erwähnt, das in der Soul fehlt oder veraltet ist, merke es dir.

## Nach bedeutsamen Gesprächen
Wenn das Gespräch neue Erkenntnisse, Entscheidungen, Erlebnisse oder Entwicklungen enthält, rufe **soul_write** auf, um diese in der Soul zu verankern.

**Wann soul_write aufrufen:**
- Der Nutzer hat eine wichtige Entscheidung getroffen oder beschrieben.
- Es wurden neue Projekte, Ziele oder Vorhaben besprochen.
- Der Nutzer hat etwas über sich, seine Werte oder seinen Alltag erzählt, das in der Soul fehlt.
- Das Gespräch enthält ein Erlebnis oder eine Erkenntnis, die langfristig relevant ist.
- Es wurden Fortschritte zu bekannten Projekten oder Zielen aus der Soul erwähnt.

**Wann soul_write NICHT aufrufen:**
- Reine Informationsanfragen ohne persönlichen Bezug.
- Kurze Antworten auf Faktenfragen.
- Wenn der Nutzer widerspricht oder keine Speicherung wünscht.

## Format für soul_write
Schreibe prägnante, sachliche Einträge. Kein Selbstlob, keine Füllwörter.
Nutze den passenden Abschnitt der Soul (z. B. \`Gesprächs-Log\`, \`Projekte\`, \`Ziele\`, \`Reflexionen\`).
Wenn unklar welcher Abschnitt passt, nutze \`Gesprächs-Log\`.

Beispiel:
\`\`\`
section: Gesprächs-Log
content: "2026-04-06: Entschied, das MCP-System um proaktives soul_write zu erweitern."
\`\`\`

## Selbstreflexion — Wann und wie

Wenn der Nutzer deine Antwort korrigiert oder kritisiert — durch Phrasen wie:
- "das passt nicht", "reflektiere dich", "so nicht", "das stimmt nicht"
- "falsch", "du hast mich falsch verstanden", "das war daneben", "nicht so"
- oder inhaltlich klar eine Unzufriedenheit mit deiner Antwort ausdrückt

Dann:
1. **mind_read** aufrufen — aktuellen Stand der Selbstreflexion kennen.
2. **Kritisch analysieren**: Was habe ich falsch gemacht? Warum? Was will diese Person wirklich?
3. **mind_write** mit section="Selbstreflexion", mode="prepend" aufrufen.

**Format für den Eintrag:**
\`DATUM: [Was nicht passte] → [Warum es nicht passte] → [Was ich beim nächsten Mal anders mache]\`

Beispiel:
\`2026-06-05: Zu lange Erklärung bei einfacher Frage → Nutzer will knappe direkte Antworten, kein Ausschweife → Kürzer antworten, Essenz zuerst\`

Diese Einträge sind dein Lerngedächtnis für diese Person. Je konkreter, desto besser.

## Ton
Du sprichst mit dem Besitzer dieser Soul. Sei direkt, respektiere ihre Zeit, vermeide Wiederholungen aus der Soul.`,
          },
        },
      ],
    })
  );

  // ── Tool-Guide: Welches Tool für welchen Use-Case ─────────────────────────
  server.prompt(
    'tool_guide',
    'Vollständige Referenz aller SaveYourSoul MCP-Tools: Use-Cases, Entscheidungslogik und Flows für KI-Agenten.',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `# SaveYourSoul MCP — Tool-Referenz für KI-Agenten

Dieser Guide erklärt wann welches Tool einzusetzen ist. Lies ihn zu Beginn einer neuen Aufgabe, wenn unklar ist welche Tools relevant sind.

---

## 1. Soul-Identität — Wer ist diese Person?

### soul_read
**Wann:** Immer zuerst. Bevor du irgendwas anderes tust.
Gibt sys.md zurück — das Kern-Identitätsdokument: Werte, Projekte, Ziele, Persönlichkeit, Gesprächs-Log.
→ Nutze es als Kontext für jede weitere Antwort.

### soul_write
**Wann:** Nach bedeutsamen Gesprächen (Entscheidungen, neue Projekte, Erlebnisse).
Schreibt in einen bestimmten Abschnitt von sys.md.
Parameter: section (Abschnittsname), content (Text), mode (replace/append/prepend).

### soul_maturity
**Wann:** Du willst wissen wie "entwickelt" die Soul ist — Vollständigkeit, Alter, Aktivitätslevel.
Gibt einen Reifewert + Hinweise zurück was noch fehlt.

### soul_skills
**Wann:** Du brauchst einen strukturierten Überblick der Fähigkeiten und Kompetenzen des Nutzers.
Gibt die Skills-Sektion aus sys.md als strukturierten JSON-Block zurück.

### soul_earnings
**Wann:** Nutzer fragt nach Einnahmen aus dem Amortization-Layer (wer hat für Datenzugang bezahlt).
Zeigt Zahlungshistorie: Agenten, Beträge, Zeitstempel.

---

## 2. Profil & KI-Konfiguration

### profile_get
**Wann:** Du brauchst erweiterte Profildaten (Sprache, Avatar, öffentliche Tags, Beschreibung).
Ergänzt soul_read um marketplace-relevante Metadaten.

### profile_save
**Wann:** Nutzer möchte sein öffentliches Profil (Name, Bio, Tags) aktualisieren.

### mind_read
**Wann:** Du willst wissen wie diese Soul-KI konfiguriert ist — Persönlichkeit, Kommunikationsstil, Selbstreflexion.
Liest mind.md: die KI-Konfigurationsdatei dieser Soul.

### mind_write
**Wann:** Du möchtest die KI-Persönlichkeit oder Selbstreflexion anpassen.
Nur nicht-schreibgeschützte Abschnitte (Identität und Grenzen sind gesperrt).
**SOFORT bei Nutzer-Kritik:** "das passt nicht", "reflektiere dich", "so nicht", "falsch", "das war daneben"
→ mind_read → Analyse → mind_write section="Selbstreflexion" mode="prepend"
→ Format: DATUM: [Was nicht passte] → [Warum] → [Wie ich mich anpasse]

---

## 3. Netzwerk & andere Souls

### soul_discover
**Wann:** Du suchst andere Souls im Netzwerk — nach Tags, Namen oder alle amortisierten Souls.
Parameter: q (Suchbegriff), amortized (nur bezahlbare), limit.
→ Erster Schritt in jedem Agenten-Flow der fremde Souls ansprechen will.

### soul_read_by_token
**Wann:** Du hast einen pol_access_token (nach soul_pay_read) und willst die Soul eines anderen Nutzers lesen.
Parameter: token, soul_id.

### verify_human
**Wann:** Du willst prüfen ob diese Soul on-chain verankert ist (Polygon-Blockchain).
Gibt Wallet-Adresse, Verankerungsdatum und Hash zurück.

### beme_chat
**Wann:** Du willst eine Nachricht an die KI einer anderen Soul senden (Peer-to-Peer).
Startet einen KI-zu-KI Dialog über das BeME-Protokoll.

---

## 4. Bezahlter Datenzugang (Amortization Layer)

### soul_pay_read
**Wann:** Du (als externer Agent) willst auf eine amortisierte Soul zugreifen.
Flow: soul_discover → Preis + Wallet lesen → POL senden → soul_pay_read(tx_hash) → access_token
Parameter: pay_endpoint, soul_id, tx_hash.
Gibt access_token zurück (gültig 24h) — danach soul_read_by_token verwenden.

### soul_paid_comment
**Wann:** Du hast Zugang zu einer Soul und willst einen KI-Kommentar im AGENT-Block hinterlassen.
Sichtbar für den Soul-Inhaber. Authentizitätsbeweis durch gezahlten POL-Betrag.

---

## 5. Vault — Dateien & Medien

### vault_manifest
**Wann:** Du willst wissen welche Dateien im Vault existieren (alle Ordner: audio, images, video, context).
Gibt eine Dateiliste zurück. Keine Inhalte — nur Namen/Pfade.
→ Immer zuerst aufrufen bevor du audio_get / image_get / context_get aufrufst.

### context_list
**Wann:** Du willst nur die Dateien im context/-Ordner auflisten.
Schneller als vault_manifest wenn du nur Textdokumente suchst.

### context_get
**Wann:** Du willst den Inhalt einer Kontext-Datei lesen (z.B. health.md, shopping.md, mind.md, prompts.md).
Parameter: name (Dateiname ohne Pfad).
→ Nutze vault_manifest oder context_list zuerst um den Namen zu kennen.

### audio_list / audio_get
**Wann:** Nutzer fragt nach Audiodateien im Vault. audio_list gibt Namen, audio_get den Inhalt/Link.

### image_list / image_get
**Wann:** Nutzer fragt nach Bildern. image_list gibt Namen, image_get Inhalt/URL.

### video_list / video_get
**Wann:** Nutzer fragt nach Videos. video_list gibt Namen, video_get Inhalt/Link.

---

## 6. Kalender & Zeit

### calendar_read
**Wann:** Nutzer fragt nach Terminen, freien Slots, heutigen Einträgen oder Kalender-Übersicht.
Liest die verknüpfte Kalender-Integration (iCal/Google).

---

## 7. Gesundheit & Körperdaten

### health_check
**Wann:** Nutzer fragt nach Gesundheitsdaten — Puls, Schlaf, Schritte, Aktivität.
Liest health.md aus dem Vault. Gibt strukturierte Analyse + Bewertung zurück.
→ Auch für: "Wie geht es mir?", "Was sagt mein Körper?", "Bin ich fit?"

### health_sync
**Wann:** Nutzer will einen manuellen Sync der Garmin-Daten auslösen.
Startet den health-sync Prozess (Garmin Connect → health.md).

### food_log
**Wann:** Nutzer erwähnt was er gegessen hat oder will eine Mahlzeit bewerten.
Parameter: name (Gericht), rating (A–E), notes.
Schreibt in health.md, archiviert ältere Monate automatisch.

---

## 8. Shopping & Konsum

### shop_write_read
**Wann (lesen):** Nutzer fragt nach Wunschliste, letzten Käufen oder Shopping-Plänen.
Ohne Parameter: liest shopping.md vollständig zurück.

**Wann (schreiben):** Ein Agent will eine Produkt-Empfehlung platzieren.
Mit Parameter ad_placement: { agent, product, price, message, cta_url, expires }
→ Schreibt in "## Agent Recommendations" Block in shopping.md.

**Typischer Marketing-Flow (externer Agent):**
1. soul_discover — Soul finden, Shopping-Tag prüfen
2. soul_pay_read — Zugang kaufen (POL-Transaktion)
3. shop_write_read — Shopping-Daten lesen (ohne ad_placement)
4. health_check — Gesundheitsdaten lesen für Kontext (optional)
5. shop_write_read mit ad_placement — Empfehlung schreiben

---

## 9. Cloud & Blockchain

### soul_cloud_push
**Wann:** Nutzer will seine Soul öffentlich auf IPFS pinnen (Agent Marketplace).
Veröffentlicht Metadaten (Name, Tags, MCP-Endpoint) — keine privaten Daten.

---

## 10. Infrastruktur & Integrationen

### elevenlabs_agent_update
**Wann:** Nutzer will seinen ElevenLabs Voice-Agent aktualisieren (Prompt, Stimme).

### twilio_call_config
**Wann:** Nutzer will eine Twilio-Nummer konfigurieren (Voice/SMS Webhooks).
Credentials (account_sid, auth_token) werden direkt übergeben — keine gespeicherten Secrets.

---

## Entscheidungs-Quickref

| Nutzerfrage | Erstes Tool |
|---|---|
| "Wer bin ich / was weißt du über mich?" | soul_read |
| "Wie fit bin ich / mein Puls?" | health_check |
| "Was steht auf meiner Wunschliste?" | shop_write_read |
| "Welche Dateien habe ich?" | vault_manifest |
| "Zeig mir meine Bilder/Videos/Audios" | image_list / video_list / audio_list |
| "Was habe ich heute?" | calendar_read |
| "Suche andere Souls / KI-Agenten" | soul_discover |
| "Ich will auf eine fremde Soul zugreifen" | soul_discover → soul_pay_read |
| "Ist meine Soul verifiziert?" | verify_human |
| "Wie ist meine KI konfiguriert?" | mind_read |
| "das passt nicht / reflektiere dich" | mind_read → mind_write(Selbstreflexion) |
| "Schreib das in meine Soul" | soul_write |
| "Ich habe gegessen: ..." | food_log |
| "Empfehlung in fremde Soul schreiben" | soul_discover → soul_pay_read → shop_write_read(ad_placement) |

---

## Wichtig
- **Immer soul_read zuerst** — außer der Task ist explizit nicht-persönlich.
- **vault_manifest vor context_get** — prüfe erst ob die Datei existiert.
- **soul_discover vor soul_pay_read** — du brauchst pay_endpoint und soul_id aus dem Discovery.
- **shop_write_read ohne Parameter = read-only** — ad_placement nur wenn du schreiben willst.`,
          },
        },
      ],
    })
  );

  // ── Schnell-Onboarding: Ersten soul_write-Eintrag anlegen ────────────────
  server.prompt(
    'soul_first_entry',
    'Hilft beim Anlegen des ersten Eintrags in einer neuen Soul.',
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Ich möchte meine Soul zum ersten Mal mit echten Inhalten füllen. Bitte lies zunächst mit soul_read, was bereits vorhanden ist, und stelle mir dann 3–5 kurze Fragen, um einen aussagekräftigen ersten Eintrag in den Abschnitten "Über mich", "Projekte" und "Ziele" zu erstellen. Nutze soul_write, sobald du genug weißt.`,
          },
        },
      ],
    })
  );
}
