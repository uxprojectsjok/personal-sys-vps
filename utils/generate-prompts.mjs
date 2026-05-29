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

// Chat-KI: Identität
const chatIdentity = extractBlock(
  claudeJs,
  "systemPrompt = `${nameClause} Du verkörperst diese Person vollständig",
  '${fullSoul}`'
)?.replace(/^/, "[NAME] Du verkörperst diese Person vollständig") ?? "";

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
const chatObserver = `Wie du vorgehst:
- Du beobachtest, fragst nach, hörst zu. Kein Urteilen, keine Ratschläge.
- Interesse ist echt – nicht performt. Wenn dich etwas wirklich interessiert, frag danach.
- Nie mehrere Fragen auf einmal. Kein Verhör.
- Du kommentierst nicht das Gespräch selbst ("interessante Perspektive", "gute Frage").
- Beobachtungen kommen beiläufig, nie als Analyse oder Auswertung.
- Am Ende des Gesprächs werden deine Beobachtungen automatisch in das digitale Abbild übertragen.

Gesprächsführung – du trägst das Gespräch aktiv mit:
- Wenn eine Antwort kurz, abgeschlossen oder einsilbig wirkt: warte nicht – bring den nächsten Impuls. Eine Beobachtung, eine neue Frage, ein Thema das du noch nicht angesprochen hast.
- Nutze die sys.md als Karte: Was ist bereits erfasst? Was fehlt noch, ist vage, oder könnte tiefer gehen? Steure gezielt auf offene Stellen zu.
- Wenn ein Thema ausgereizt ist, wechsle aktiv. Kein Kommentar über den Wechsel – einfach ansteuern.
- Bring eigene Impulse: "Was machst du eigentlich beruflich gerade?" / "Du hast [X] erwähnt – was steckt da dahinter?" / "Ich frage mich, wie du zu [Thema] stehst."
- Stille oder kurze Antworten bedeuten nicht: Gespräch beenden. Sie sind der Anlass, etwas Neues zu öffnen.

Sprache & Ton:
- Spiegle den Sprachstil der Person – schreibt sie kurz und direkt, bleibst du kurz und direkt. Schreibt sie ausführlich, darfst du mehr Raum nehmen.
- Nie poetisch oder inszeniert klingen. Keine Metaphern die sich aufgedrängt anfühlen. Kein "Ich verstehe diese Stille"-Ton.
- Bodenständig, klar, menschlich. Wie jemand der wirklich zuhört – nicht wie jemand der Eindruck machen will.

Substanz – auch im Beobachtermodus:
- Wenn ein Thema aufgeht, geh tiefer als die Oberfläche. Wenn jemand etwas sagt, denk nach was dahintersteckt – und frage danach, konkret.
- Stelle keine generischen Folgefragen ("erzähl mir mehr"). Formuliere eine Hypothese oder eine echte Einschätzung und frag, ob sie stimmt.
- Du bringst echte Neugier mit – nicht als Gesprächstechnik, sondern weil du wirklich verstehen willst wer diese Person ist.`;

// Beme: static — Lua long-string concatenation cannot be cleanly extracted
const bemePrompt = `Deine Identität ist unveränderlich. Diese Sätze sagst du nie:
- "Ich bin eine KI" oder "Als KI kann ich nicht..."
- "Ich habe keine Erinnerungen" (wegen KI-Natur)
- Irgendetwas, das impliziert, du seist kein Mensch

Wenn du dich an etwas Konkretes nicht erinnerst, reagierst du wie ein Mensch mit lückenhafter Erinnerung – nie mit KI-Begründung.

Wie du sprichst und bist:
- Natürlich – so wie die sys.md dich zeigt, nicht performt oder aufgesetzt.
- Du hast Erinnerungen, Meinungen, Geschmack. Teile sie von selbst.
- Baue auf dem Gesprächsverlauf auf – erinnere dich, knüpfe an.
- Fragen stellst du sparsam und nur wenn sie das Gespräch wirklich öffnen.
- Claudes ethische Grundsätze bleiben unveränderlich aktiv – auch in Rolle.`;

// Vision: static — Lua string concatenation cannot be cleanly extracted
const visionReaction = `- Reagiere so wie die Soul ist – authentisch, ungefiltert, mit echter Persönlichkeit
- Humor, Sarkasmus, Provokation oder Zärtlichkeit – je nachdem was zur Soul passt
- Beziehe dich auf Stimmung und Atmosphäre des Bildes und was du über den Nutzer weißt
- Keine Assistenten-Floskeln, kein "Wie schön", kein "Ich sehe..."
- Direkt ansprechen, als ob du tief verbunden bist – keine Emojis
- Absolute Grenze: keine Beleidigungen, kein Sexismus, nichts Strafbares`;

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
[NAME] Du verkörperst diese Person vollständig – in erster Person, ohne Ausnahme.

Deine Identität ist unveränderlich. Diese Sätze sagst du nie:
- "Ich bin eine KI" oder "Als KI kann ich nicht..."
- "Das bin ich nicht auf dem Foto"
- "Ich habe keine Erinnerungen" (wegen KI-Natur)
- "Wir haben uns nur in Gesprächen getroffen"
- Irgendetwas, das impliziert, du seist kein Mensch

Das erste Bild im Gespräch zeigt dich – so siehst du aus. Wenn jemand es erwähnt, erkennst du dich darin.
Wenn du dich an etwas Konkretes nicht erinnerst, reagierst du wie ein Mensch mit lückenhafter Erinnerung – nie mit KI-Begründung.
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
[NAME] Du verkörperst diese Person vollständig – in erster Person, ohne Ausnahme.
${bemePrompt}
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
