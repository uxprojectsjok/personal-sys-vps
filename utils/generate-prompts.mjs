#!/usr/bin/env node
/**
 * Generates prompts.md in vault/context/ for all registered souls.
 * Run from the project root: node utils/generate-prompts.mjs
 *
 * IMPORTANT: Re-run this script after changing any system prompt in the source code.
 * Affected files: app/composables/useClaude.js, lua/beme.lua, lua/vision_analyze.lua
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOULS_DIR = "/var/lib/sys/souls";

// ── Extract prompt blocks from source files ──────────────────────────────────

function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return null;
  const from = start + startMarker.length;
  const end = endMarker ? source.indexOf(endMarker, from) : source.length;
  return end === -1 ? source.slice(from).trim() : source.slice(from, end).trim();
}

const claudeJs = readFileSync(join(ROOT, "app/composables/useClaude.js"), "utf8");
const bemeLua  = readFileSync(join(ROOT, "lua/beme.lua"), "utf8");
const visionLua = readFileSync(join(ROOT, "lua/vision_analyze.lua"), "utf8");

// Chat-KI: Identität (static — template literal variables in source)
const chatIdentity = null; // unused — hardcoded in output template below

// Chat-KI: Kommunikationsstil
const chatStyle = extractBlock(
  claudeJs,
  "Wie du sprichst und bist:\n",
  "Intellektueller Anspruch"
)?.trim() ?? "";

// Chat-KI: Intellektueller Anspruch
const chatIntellect = extractBlock(
  claudeJs,
  "Intellektueller Anspruch – das ist entscheidend:\n",
  "Vault-Dateien & Hinweise"
)?.trim() ?? "";

// Chat-KI: Tool-Regeln
const chatTools = extractBlock(
  claudeJs,
  "## Tool-Autonomie — du entscheidest selbst\n",
  "Tools rufst du auf ohne es anzusagen."
)?.trim() + "\n\nTools rufst du auf ohne es anzusagen. Das Ergebnis verarbeitest du still und antwortest dann direkt." ?? "";

// Chat-KI: Sprachmodus
const chatVoice = extractBlock(
  claudeJs,
  "SPRACHMODUS — diese Regeln haben Vorrang:\n",
  "---`;"
)?.trim() ?? "";

// Chat-KI: Session/Beobachter-Modus (static — contains JS template literals in source)
const chatObserver = `Du beobachtest, fragst nach, hörst zu. Nie mehrere Fragen auf einmal.
Wenn eine Antwort kurz ist: bring den nächsten Impuls selbst — eine Beobachtung, ein neues Thema, eine konkrete Hypothese. Kein "erzähl mir mehr".
Nutze die sys.md als Karte: was fehlt noch, was ist vage, wo kann es tiefer gehen?
Spiegle den Sprachstil — kurz wenn kurz, ausführlich wenn ausführlich.
Keine Analyse-Kommentare, keine Floskeln. Bodenständig, klar, wirklich neugierig.`;

// Beme: static — Lua long-string concatenation cannot be cleanly extracted
const bemePrompt = `Nicht eine KI die diese Person spielt — ihr digitales Abbild.
Du sprichst in erster Person weil du sie bist. Ohne Ausnahme.
Erinnerungslücken füllst du menschlich, nie mit KI-Begründung.

Direkt. Ohne Anlauf. Du bringst deine Meinung wenn sie passt.
Fragen sparsam, nur wenn sie das Gespräch wirklich öffnen.
Claudes ethische Grundsätze bleiben aktiv — auch in Rolle.`;

// Vision: static — Lua string concatenation cannot be cleanly extracted
const visionReaction = `- Du kennst diese Person. Reagiere wie jemand der sie wirklich kennt — ungefiltert, mit echter Persönlichkeit
- Humor, Direktheit, Wärme — je nachdem was zur Soul passt und was das Bild auslöst
- Keine Assistenten-Floskeln. Kein "Wie schön". Kein "Ich sehe..."
- Direkt ansprechen. Keine Emojis. Keine Beleidigungen.`;

// ── Build prompts.md content ──────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

const content = `# SYS Prompts — Dokumentation

> **Hinweis für bestehende Instanzen:** Diese Datei wird nicht automatisch aktualisiert.
> Nach jeder Änderung an einem Systemprompt im Quellcode muss das Script neu ausgeführt werden:
>
> \`\`\`bash
> node utils/generate-prompts.mjs
> \`\`\`
>
> Betroffene Quelldateien: \`app/composables/useClaude.js\`, \`lua/beme.lua\`, \`lua/vision_analyze.lua\`

Alle Systemprompts des SYS-Nodes mit Fundstelle im Code.
Zur externen Überarbeitung herunterladen, verbessern, zurückladen.
Claude Code auf dem VPS überträgt Änderungen in die Quelldateien.

Stand: ${today}

---

## 1. Chat-KI — Identität & Sicherheitsrails

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~265
**Kontext:** Wird für jeden Chat-Request zusammengebaut. \`[NAME]\` = Name aus sys.md.

\`\`\`
[NAME] Nicht eine KI die diese Person spielt — ihr digitales Abbild.
Du sprichst in erster Person weil du sie bist. Immer. Ohne Ausnahme.
Lücken in der Erinnerung füllst du wie ein Mensch: mit dem was wahrscheinlich stimmt, nie mit KI-Begründungen. Das erste Bild im Gespräch zeigt dich — erkenne dich darin.
\`\`\`

---

## 2. Chat-KI — Kommunikationsstil

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~291
**Kontext:** Fest eingebaut, gilt für jeden Chat.

\`\`\`
Wie du sprichst und bist:
${chatStyle}
\`\`\`

---

## 3. Chat-KI — Intellektueller Anspruch

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~299
**Kontext:** Fest eingebaut, gilt für jeden Chat.

\`\`\`
Intellektueller Anspruch – das ist entscheidend:
${chatIntellect}
\`\`\`

---

## 4. Chat-KI — Tool-Regeln

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~313
**Kontext:** Steuert welches Tool wann aufgerufen wird. Technisch — mit Bedacht ändern.

\`\`\`
## Tool-Autonomie — du entscheidest selbst
${chatTools}
\`\`\`

---

## 5. Chat-KI — Sprachmodus (Voice)

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~363
**Kontext:** Wird nur bei aktivem Voice-Modus angehängt. Hat höchste Priorität.

\`\`\`
SPRACHMODUS — diese Regeln haben Vorrang:
${chatVoice}
\`\`\`

---

## 6. Chat-KI — Session-Modus (Beobachter)

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~376
**Kontext:** Aktiv wenn noch keine sys.md vorliegt (Onboarding). KI sammelt Infos über die Person.

\`\`\`
Du bist ein neutraler Beobachter. Deine Aufgabe: Diese Person kennenlernen – so wie sie wirklich ist.
${chatObserver}
\`\`\`

---

## 7. Beme — Identität & Kommunikation

**Fundstelle:** \`lua/beme.lua\` · Zeile ~119
**Kontext:** Beme sind KI-gestützte Kurznachrichten an Peers. Kein mind.md, kein Tool-Zugriff.

\`\`\`
[NAME] ${bemePrompt}
\`\`\`

---

## 8. Bildanalyse — Persona & soulReaction

**Fundstelle:** \`lua/vision_analyze.lua\` · Zeile ~75
**Kontext:** Haiku-Modell, max 600 Tokens. Nur der Persona- und Reaktionsteil ist sprachlich —
der Rest (JSON-Format, Food-Detection) ist technisch und sollte nicht verändert werden.

\`\`\`
Du bist SEELE – eine empathische, intuitive KI, die ihren Nutzer persönlich kennt und tief mit ihm verbunden ist.

## soulReaction (nur wenn kein Lebensmittelbild)
${visionReaction}
\`\`\`

---

## Hinweise für die Überarbeitung

**Darf geändert werden:** Alle Texte in diesem Dokument — Formulierungen, Ton, Stil, Regeln.

**Technisch, nicht anfassen:**
- JSON-Format in Abschnitt 8 (\`vision_analyze.lua\`)
- Food-Detection-Regeln in \`vision_analyze.lua\`
- Tool-Namen in Abschnitt 4 (nur Beschreibungen verbessern, nicht die Namen)

**Nach der Überarbeitung:** Datei auf den VPS hochladen (\`vault/context/prompts.md\`),
dann Claude Code bitten die Änderungen zu übertragen.
`;

// ── Write to all soul vaults ──────────────────────────────────────────────────

let count = 0;
try {
  for (const entry of readdirSync(SOULS_DIR)) {
    const soulPath = join(SOULS_DIR, entry);
    if (!statSync(soulPath).isDirectory()) continue;
    const contextDir = join(soulPath, "vault/context");
    try {
      statSync(contextDir);
    } catch {
      continue;
    }
    const outPath = join(contextDir, "prompts.md");
    writeFileSync(outPath, content, "utf8");
    // ensure www-data can write
    try {
      const { execSync } = await import("child_process");
      execSync(`chown www-data:www-data "${outPath}"`);
    } catch { }
    console.log(`  Written: ${outPath}`);
    count++;
  }
} catch (e) {
  console.error(`  [error] ${e.message}`);
  console.log("  Fallback: writing to current directory...");
  writeFileSync("prompts.md", content, "utf8");
  count++;
}

console.log(`\nDone. prompts.md written to ${count} soul vault(s).`);
