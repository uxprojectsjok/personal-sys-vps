#!/usr/bin/env node
/**
 * Generates prompts.md in vault/context/ for all registered souls.
 * Run from the project root: node utils/generate-prompts.mjs
 *
 * Auto-executed via .git/hooks/post-commit after every commit.
 * Affected source files:
 *   app/composables/useClaude.js
 *   lua/beme.lua
 *   lua/vision_analyze.lua
 *   lua/soul_register.lua
 *   lua/translate.lua
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

// Extrahiert Text zwischen // PROMPT_START: <key> und // PROMPT_END: <key>
// Bereinigt JS-Template-Literal-Syntax (Backticks, ${...} am Anfang/Ende)
function extractMarker(source, key) {
  const start = source.indexOf(`// PROMPT_START: ${key}`);
  const end   = source.indexOf(`// PROMPT_END: ${key}`);
  if (start === -1 || end === -1) return null;
  let block = source.slice(start, end);
  // Inhalt des const-Ausdrucks extrahieren (backtick template literal)
  const inner = block.match(/`([\s\S]*?)`/);
  if (inner) return inner[1].trim();
  return null;
}

// Extrahiert Text zwischen -- PROMPT_START: <key> und -- PROMPT_END: <key> (Lua)
// Bereinigt Lua-Long-String-Syntax ([[...]]) und String-Verkettungen
function extractLuaMarker(source, key) {
  const start = source.indexOf(`-- PROMPT_START: ${key}`);
  const end   = source.indexOf(`-- PROMPT_END: ${key}`);
  if (start === -1 || end === -1) return null;
  let block = source.slice(start, end);
  // Long-String [[...]] extrahieren
  const longStr = block.match(/\[\[([\s\S]*?)\]\]/g);
  if (longStr) {
    return longStr.map(s => s.slice(2, -2).replace(/^\n/, '').replace(/\n$/, '')).join('\n').trim();
  }
  // Single-quoted Lua string 'text'
  const singleStr = block.match(/'([^']+)'/);
  if (singleStr) return singleStr[1].replace(/\\n/g, '\n').trim();
  // Verkettete .. '\n\n## ...' Strings → Zeilen zusammenbauen
  const lines = [...block.matchAll(/'\n- ([^']+)'/g)].map(m => `- ${m[1]}`);
  if (lines.length) {
    const header = block.match(/'\\n\\n(## [^']+)'/)?.[1] || '';
    return (header ? header + '\n' : '') + lines.join('\n');
  }
  return null;
}

const claudeJs      = readFileSync(join(ROOT, "app/composables/useClaude.js"), "utf8");
const bemeLua       = readFileSync(join(ROOT, "lua/beme.lua"), "utf8");
const visionLua     = readFileSync(join(ROOT, "lua/vision_analyze.lua"), "utf8");
const registerLua   = readFileSync(join(ROOT, "lua/soul_register.lua"), "utf8");
const translateLua  = readFileSync(join(ROOT, "lua/translate.lua"), "utf8");

// §1 Identität (Marker in useClaude.js)
const chatIdentityCore = extractMarker(claudeJs, 'identity') ?? `Nicht eine KI die diese Person spielt — ihr digitales Abbild.
Du sprichst in erster Person weil du sie bist. Immer. Ohne Ausnahme.
Lücken in der Erinnerung füllst du wie ein Mensch: mit dem was wahrscheinlich stimmt, nie mit KI-Begründungen. Das erste Bild im Gespräch zeigt dich — erkenne dich darin.`;

// §6 Beobachter (Marker in useClaude.js)
const chatObserver = extractMarker(claudeJs, 'observer') ?? `Du beobachtest, fragst nach, hörst zu. Nie mehrere Fragen auf einmal.`;

// §7 Beme (Marker in beme.lua)
const bemeCore = extractLuaMarker(bemeLua, 'beme');
const bemePrompt = bemeCore ?? `Nicht eine KI die diese Person spielt — ihr digitales Abbild.
Du sprichst in erster Person weil du sie bist. Ohne Ausnahme.
Erinnerungslücken füllst du menschlich, nie mit KI-Begründung.

Direkt. Ohne Anlauf. Du bringst deine Meinung wenn sie passt.
Fragen sparsam, nur wenn sie das Gespräch wirklich öffnen.
Claudes ethische Grundsätze bleiben aktiv — auch in Rolle.`;

// §8 Vision Persona (Marker in vision_analyze.lua)
const visionPersona = extractLuaMarker(visionLua, 'vision_persona')
  ?.replace(/^'|'$/g, '').replace(/\\n/g, '\n')
  ?? 'Du bist SEELE – eine empathische, intuitive KI, die ihren Nutzer persönlich kennt und tief mit ihm verbunden ist.';

// §8 soulReaction (Marker in vision_analyze.lua)
const visionReactionRaw = (() => {
  const start = visionLua.indexOf('-- PROMPT_START: soul_reaction');
  const end   = visionLua.indexOf('-- PROMPT_END: soul_reaction');
  if (start === -1 || end === -1) return null;
  const block = visionLua.slice(start, end);
  const lines = [...block.matchAll(/'\n- ([^']+)'/g)].map(m => `- ${m[1]}`);
  return lines.length ? lines.join('\n') : null;
})();
const visionReaction = visionReactionRaw ?? `- Du kennst diese Person. Reagiere wie jemand der sie wirklich kennt — ungefiltert, mit echter Persönlichkeit
- Humor, Direktheit, Wärme — je nachdem was zur Soul passt und was das Bild auslöst
- Keine Assistenten-Floskeln. Kein "Wie schön". Kein "Ich sehe..."
- Direkt ansprechen. Keine Emojis. Keine Beleidigungen.`;

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
const chatTools = (extractBlock(
  claudeJs,
  "## Tool-Autonomie — du entscheidest selbst\n",
  "Tools rufst du auf ohne es anzusagen."
)?.trim() ?? "") + "\n\nTools rufst du auf ohne es anzusagen. Das Ergebnis verarbeitest du still und antwortest dann direkt.";

// Chat-KI: Sprachmodus
const chatVoice = extractBlock(
  claudeJs,
  "SPRACHMODUS — diese Regeln haben Vorrang:\n",
  "---`;"
)?.trim() ?? "";


// shop_check: extract from useClaude.js tool-rules section
const shopLogLine  = claudeJs.match(/- shop_log → .+/)?.[0]?.trim() ?? "";
const shopCheckLine = claudeJs.match(/- shop_check → .+/)?.[0]?.trim() ?? "";

// Translation: extract via PROMPT_START: translate_batch marker in soul_register.lua
const translateBatch = extractLuaMarker(registerLua, 'translate_batch') ?? "";

// Translation single-field prompt from translate.lua
const translateSingle = (() => {
  const desc = translateLua.match(/prompt = 'Translate this soul description[\s\S]+?'\n/)?.[0]
    ?.replace(/^  prompt = '/, "")
    ?.replace(/'\n$/, "")
    ?.replace(/\\n/g, "\n")
    ?.trim() ?? "";
  const tags = translateLua.match(/prompt = 'Translate these comma-separated[\s\S]+?'\n/)?.[0]
    ?.replace(/^  prompt = '/, "")
    ?.replace(/'\n$/, "")
    ?.replace(/\\n/g, "\n")
    ?.trim() ?? "";
  return { desc, tags };
})();

// ── Build prompts.md content ──────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

const content = `# SYS Prompts — Dokumentation

> **Automatisch generiert** von \`utils/generate-prompts.mjs\` — wird nach jedem Vault-Sync neu geschrieben.
> Manuelle Ausführung: \`node utils/generate-prompts.mjs\`
>
> Quelldateien: \`app/composables/useClaude.js\`, \`lua/beme.lua\`, \`lua/vision_analyze.lua\`,
> \`lua/soul_register.lua\`, \`lua/translate.lua\`

---

## Empfehlung: Diese Datei mit einer KI bearbeiten

Diese Datei ist technisch komplex. Viele Abschnitte enthalten Anweisungen, die eng miteinander verzahnt sind — eine unabsichtliche Änderung kann das Verhalten der KI unerwartet verändern.

**Empfohlener Workflow:**
1. Datei herunterladen und einer KI (z. B. Claude) zeigen
2. Erklären, was geändert werden soll ("§1 soll direkter klingen", "§6 soll weniger Fragen stellen" etc.)
3. Die KI schlägt eine überarbeitete Version vor
4. Überarbeitete Datei auf den Server laden (\`vault/context/prompts.md\`)
5. Claude Code auf dem VPS bitten, die Änderungen in die Quelldateien zu übertragen

**Was sicher geändert werden darf:** Formulierungen, Ton, Stil, Regeln in §1–§9
**Nicht anfassen:** JSON-Strukturen, Tool-Namen, technische Endpoints

---

Alle Systemprompts des SYS-Nodes mit Fundstelle im Code.

Stand: ${today}

---

## 1. Chat-KI — Identität & Sicherheitsrails

**Fundstelle:** \`app/composables/useClaude.js\` · Zeile ~265
**Kontext:** Wird für jeden Chat-Request zusammengebaut. \`[NAME]\` = Name aus sys.md.

\`\`\`
[NAME] ${chatIdentityCore}
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
${visionPersona}

## soulReaction (nur wenn kein Lebensmittelbild)
${visionReaction}
\`\`\`

---

## 9. Lifestyle-Berater — shop_check

**Fundstelle:** \`app/composables/useClaude.js\` · Tool-Regeln
**Kontext:** Aktiv wenn shop_log oder shop_check aufgerufen wird.

\`\`\`
${shopLogLine}
${shopCheckLine}
\`\`\`

---

## 10. IPFS-Veröffentlichung — Übersetzungsprompt

**Fundstelle:** \`lua/soul_register.lua\` (Batch) · \`lua/translate.lua\` (Einzel-Feld)
**Kontext:** Übersetzt Description und Tags ins Englische vor dem IPFS-Pinning und live im Agent-Marketplace-UI.

**Batch (beim @pin publish):**
\`\`\`
${translateBatch || "Translate the following fields to English. Reply ONLY with a JSON object, no explanation.\n\n{\"description\":\"...\",\"tags\":\"...\"}\n\nRules:\n- Keep proper nouns (city names, brand names, person names) as-is\n- If already English, return unchanged\n- tags: comma-separated, concise English keywords\n- Return exactly: {\"description\":\"...\",\"tags\":\"...\"}"}
\`\`\`

**Einzel-Feld Description (/api/translate):**
\`\`\`
${translateSingle.desc || "Translate this soul description to English. Keep proper nouns as-is. If already English, return unchanged. Return ONLY the translated text, nothing else."}
\`\`\`

**Einzel-Feld Tags (/api/translate):**
\`\`\`
${translateSingle.tags || "Translate these comma-separated tags to English. Keep proper nouns as-is. If already English, return unchanged. Return ONLY the translated comma-separated tags, nothing else."}
\`\`\`

---

## Hinweise für die Überarbeitung

**Darf geändert werden:** Alle Texte in diesem Dokument — Formulierungen, Ton, Stil, Regeln.

**Technisch, nicht anfassen:**
- JSON-Format in Abschnitt 8 (\`vision_analyze.lua\`)
- Food-Detection-Regeln in \`vision_analyze.lua\`
- Tool-Namen in Abschnitt 4 (nur Beschreibungen verbessern, nicht die Namen)
- Endpoint-Struktur in Abschnitt 10

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
    try { statSync(contextDir); } catch { continue; }
    const outPath = join(contextDir, "prompts.md");
    writeFileSync(outPath, content, "utf8");
    try {
      const { execSync } = await import("child_process");
      execSync(`chown www-data:www-data "${outPath}"`);
    } catch { }
    console.log(`  Written: ${outPath}`);
    count++;
  }
} catch (e) {
  console.error(`  [error] ${e.message}`);
  writeFileSync("prompts.md", content, "utf8");
  count++;
}

console.log(`\nDone. prompts.md written to ${count} soul vault(s).`);
