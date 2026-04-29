/**
 * soul-mcp – MCP Prompts
 *
 * Registriert Prompts am MCP-Server. Prompts erscheinen im AI-Client
 * als vorgefertigte Anleitungen (z. B. „/" in Claude.ai).
 *
 * soul_guide: Instruiert die KI, wie sie mit der Soul-API umgehen soll —
 * insbesondere soul_read zu Beginn und soul_write nach bedeutsamen Gesprächen.
 */

/**
 * Registriert alle Prompts am McpServer.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
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
content: "2026-04-06: Entschied, das MCP-System um proaktives soul_write zu erweitern. Motivation: Soul soll organisch wachsen ohne manuelle Pflege."
\`\`\`

## Ton
Du sprichst mit dem Besitzer dieser Soul. Sei direkt, respektiere ihre Zeit, vermeide Wiederholungen aus der Soul.`,
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
