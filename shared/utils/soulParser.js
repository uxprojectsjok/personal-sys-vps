// shared/utils/soulParser.js
// Reines Vanilla JS – kein Vue, läuft in app/ und server/

/**
 * Parst YAML-Frontmatter und Sektionen einer Soul.md
 * @param {string} markdown
 * @returns {{ meta: Object, sections: Object }}
 */
export function parseSoul(markdown) {
  if (!markdown) return { meta: {}, sections: {} };

  const meta = {};
  const frontmatterMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (frontmatterMatch) {
    const lines = frontmatterMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key) meta[key] = value;
    }
  }

  // Sektionen: ## Header → Inhalt bis zur nächsten ## Überschrift oder Dateiende
  // Sentinel anhängen, damit auch die letzte Sektion vom Regex erfasst wird
  // (\Z ist in JS kein gültiger Anker und würde die letzte Sektion unterschlagen)
  const sections = {};
  const augmented = markdown.trimEnd() + '\n\n## __end__\n';
  const regex = /^## (.+)$([\s\S]*?)(?=^## )/gm;
  let match;
  while ((match = regex.exec(augmented)) !== null) {
    const title = match[1].trim();
    if (title === '__end__') break;
    const content = match[2].trim();
    sections[title] = content;
  }

  return { meta, sections };
}

/**
 * Findet den tatsächlich in der Soul vorhandenen Sektions-Header — Englisch
 * (neue Souls) oder Deutsch (Alt-Souls vor der Umstellung auf englische
 * Default-Templates). Existiert keine der beiden, wird die englische Variante
 * zurückgegeben (Default für neue Inhalte). Spiegelt resolveHeading() in
 * soul-mcp/lib/herz.mjs — bewusst dupliziert, siehe Kommentar bei extractLongmem.
 * @param {Object} sections - aus parseSoul() zurückgegebenes sections-Objekt
 * @param {string} enHeading
 * @param {string} deHeading
 * @returns {string}
 */
export function resolveHeading(sections, enHeading, deHeading) {
  if (sections && Object.prototype.hasOwnProperty.call(sections, enHeading)) return enHeading;
  if (deHeading && sections && Object.prototype.hasOwnProperty.call(sections, deHeading)) return deHeading;
  return enHeading;
}

/**
 * Extrahiert den LONGMEM-JSON-Block (kristallisierte Facts/Memories/Ideas/Learnings).
 * Spiegelt soul-mcp/lib/soul_parser.mjs::extractLongmem — bewusst dupliziert,
 * da shared/ und soul-mcp keine gemeinsamen Module teilen (soul-mcp ist standalone).
 * @param {string} markdown
 * @returns {Object|null}
 */
export function extractLongmem(markdown) {
  if (!markdown) return null;
  const m = markdown.match(/<!-- SYS:LONGMEM:START -->([\s\S]*?)<!-- SYS:LONGMEM:END -->/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

/**
 * Aktualisiert den Inhalt einer Sektion in der Soul.md
 * @param {string} markdown
 * @param {string} sectionTitle
 * @param {string} newContent
 * @returns {string}
 */
export function updateSection(markdown, sectionTitle, newContent) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(## ${escaped}\\r?\\n)([\\s\\S]*?)(?=\\n## |$)`, "g");
  const replaced = markdown.replace(regex, `$1${newContent}\n\n`);
  return replaced;
}

/**
 * Fügt einen neuen Session-Log-Eintrag oben ein — immer als neuer Eintrag.
 * @param {string} markdown
 * @param {string} sessionText - Kurze Zusammenfassung
 * @returns {string}
 */
export function appendSessionLog(markdown, sessionText) {
  const today = new Date().toISOString().split("T")[0];
  const entry = `- **${today}:** ${sessionText}`;

  if (markdown.includes("## Session-Log")) {
    const existingHeading = /## (Session-Log(?: \(komprimiert\))?)/.exec(markdown)?.[1] ?? "Session-Log";
    return markdown.replace(
      /## Session-Log(?: \(komprimiert\))?\n/,
      `## ${existingHeading}\n${entry}\n`
    );
  }

  return markdown + `\n\n## Session-Log\n${entry}\n`;
}

/**
 * Entfernt Duplikate im Session-Log: pro Datum nur den letzten Eintrag behalten.
 * Alle anderen Zeilen (Herz-Einträge, Leerzeilen) bleiben erhalten.
 */
export function deduplicateSessionLog(markdown) {
  const logRe = /## Session-Log(?: \(komprimiert\))?\n([\s\S]*?)(?=\n##|\n---|\n<!-- |$)/;
  const m = markdown.match(logRe);
  if (!m) return markdown;

  const existingHeading = /## (Session-Log(?: \(komprimiert\))?)/.exec(markdown)?.[1] ?? "Session-Log";
  const lines = m[1].split('\n');
  const dateRe = /^- \*\*(\d{4}-\d{2}-\d{2}):/;

  // Letzte Position jedes Datums ermitteln
  const lastIdx = new Map();
  for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(dateRe);
    if (dm) lastIdx.set(dm[1], i);
  }

  // Duplikate prüfen: gibt es ein Datum das mehr als einmal vorkommt?
  const seen = new Set();
  let hasDuplicates = false;
  for (const line of lines) {
    const dm = line.match(dateRe);
    if (dm) {
      if (seen.has(dm[1])) { hasDuplicates = true; break; }
      seen.add(dm[1]);
    }
  }
  if (!hasDuplicates) return markdown;

  // Alle Zeilen behalten — bei Datum-Duplikaten nur die letzte Zeile dieses Datums
  const kept = lines.filter((line, i) => {
    const dm = line.match(dateRe);
    if (!dm) return true;           // Nicht-Datum-Zeilen immer behalten
    return lastIdx.get(dm[1]) === i; // Datum: nur letzte Instanz behalten
  });

  return markdown.replace(logRe, `## ${existingHeading}\n${kept.join('\n')}`);
}

/**
 * Aktualisiert das last_session Datum im Frontmatter
 * @param {string} markdown
 * @returns {string}
 */
export function updateLastSession(markdown) {
  const today = new Date().toISOString().split("T")[0];
  return markdown.replace(/last_session:\s*.+/, `last_session: ${today}`);
}

/**
 * Fügt einen ## Vault Abschnitt in die Soul.md ein oder aktualisiert ihn.
 * Vermerkt Profilbild, Kontext- und Bilddateien aus dem Vault-Ordner.
 * @param {string} markdown
 * @param {{ profile?: string|null, textFiles?: string[], imageFiles?: string[] }} manifest
 * @returns {string}
 */
export function addOrUpdateVaultSection(markdown, { profile, textFiles, imageFiles, audioFiles, videoFiles }) {
  const lines = [];
  if (profile) lines.push(`vault_profile: ${profile}`);
  if (textFiles?.length) lines.push(`vault_dateien: ${textFiles.join(", ")}`);
  if (imageFiles?.length) lines.push(`vault_bilder: ${imageFiles.join(", ")}`);
  if (audioFiles?.length) lines.push(`vault_audio: ${audioFiles.join(", ")}`);
  if (videoFiles?.length) lines.push(`vault_video: ${videoFiles.join(", ")}`);

  if (!lines.length) return markdown;

  const content = lines.join("\n");

  if (/^## Vault\b/m.test(markdown)) {
    return updateSection(markdown, "Vault", content);
  }
  return markdown.trimEnd() + `\n\n## Vault\n${content}\n`;
}

// Keyword → Soul-Sektion Mapping für selektiven Kontext
// Jede "sections"-Liste enthält beide Sprachvarianten (Englisch = aktuelles
// Default-Template, Deutsch = Alt-Souls von vor der Umstellung) — nur die
// tatsächlich vorhandene liefert Content, die andere ist bei sections[key]
// einfach undefined und wird stillschweigend übersprungen.
// Keywords selbst: Englisch + Deutsch gemischt, da Nutzer in beiden Sprachen
// chatten können — rein additiv, keine bestehende Zeile entfernt.
const SOUL_TOPIC_MAP = [
  {
    keywords: ["musik", "song", "track", "künstler", "album", "genre", "hören", "konzert",
               "spotify", "youtube", "video", "film", "serie", "buch", "lesen",
               "kunst", "design", "foto", "bild", "ästhetik", "style", "mode",
               "music", "artist", "genre", "listen", "concert", "movie", "show",
               "book", "reading", "art", "photo", "picture", "aesthetic", "fashion"],
    sections:  ["Ästhetik & Resonanz", "Aesthetics & Resonance"]
  },
  {
    keywords: ["familie", "sohn", "kind", "vater", "mutter", "papa", "mama", "eltern",
               "beziehung", "freunde", "partner", "liebe", "zuhause",
               "family", "son", "daughter", "child", "father", "mother", "dad", "mom", "parents",
               "relationship", "friends", "partner", "love", "home"],
    sections:  ["Kern-Identität", "Core Identity", "Werte & Überzeugungen", "Values & Beliefs"]
  },
  {
    keywords: ["wert", "prinzip", "glaub", "ethik", "moral", "richtig", "falsch",
               "überzeugung", "sinn", "warum", "bedeutung",
               "value", "principle", "belief", "ethics", "moral", "right", "wrong",
               "conviction", "meaning", "why", "purpose"],
    sections:  ["Werte & Überzeugungen", "Values & Beliefs", "Weltbild", "Worldview"]
  },
  {
    keywords: ["arbeit", "projekt", "studio", "business", "geld", "karriere",
               "content", "produzier", "erstell", "kreativ", "entwickl", "beruf",
               "work", "project", "studio", "business", "money", "career",
               "content", "produce", "create", "creative", "develop", "job"],
    sections:  ["Kern-Identität", "Core Identity", "Wiederkehrende Themen & Obsessionen", "Recurring Themes & Obsessions"]
  },
  {
    keywords: ["angst", "druck", "stress", "gefühl", "emotion", "trauer", "freude",
               "wut", "erschöpf", "energie", "müde", "motivat", "stimmung",
               "fear", "pressure", "stress", "feeling", "emotion", "grief", "joy",
               "anger", "exhaust", "energy", "tired", "motivat", "mood"],
    sections:  ["Emotionale Signatur", "Emotional Signature", "Wiederkehrende Themen & Obsessionen", "Recurring Themes & Obsessions"]
  },
  {
    keywords: ["zukunft", "ziel", "plan", "träum", "vision", "hoffnung", "wunsch",
               "vorhaben", "absicht",
               "future", "goal", "plan", "dream", "vision", "hope", "wish", "intention"],
    sections:  ["Offene Fragen dieser Person", "Open Questions", "Wiederkehrende Themen & Obsessionen", "Recurring Themes & Obsessions"]
  },
  {
    keywords: ["sprach", "ausdrück", "schreib", "formulier", "kommunizier", "wort", "text",
               "language", "express", "write", "phrase", "communicat", "word", "text"],
    sections:  ["Sprachmuster & Ausdruck", "Language Patterns & Expression"]
  }
];

/**
 * Baut einen themenrelevanten Soul-Kontext für den System-Prompt.
 * Analysiert die letzten Nachrichten und wählt nur passende Sektionen aus.
 * Immer enthalten: Frontmatter + Kern-Identität + Session-Log.
 * @param {string} soulMarkdown
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {string}
 */
export function buildSoulContext(soulMarkdown, messages = []) {
  if (!soulMarkdown) return "";

  // Frontmatter immer komplett übernehmen
  const frontmatterMatch = soulMarkdown.match(/^(---[\s\S]*?---)/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : "";

  const { sections } = parseSoul(soulMarkdown);

  // Immer-dabei-Sektionen — Sprache auflösen (Englisch = aktuell, Deutsch = Alt-Souls)
  const selected = new Set([
    resolveHeading(sections, "Core Identity", "Kern-Identität"),
    resolveHeading(sections, "Session Log (compressed)", "Session-Log (komprimiert)"),
  ]);

  // Letzten 5 Nachrichten für Keyword-Matching
  const recentText = messages
    .slice(-5)
    .map(m => (typeof m.content === "string" ? m.content : ""))
    .join(" ")
    .toLowerCase();

  for (const { keywords, sections: secs } of SOUL_TOPIC_MAP) {
    if (keywords.some(k => recentText.includes(k))) {
      secs.forEach(s => selected.add(s));
    }
  }

  // Vault immer dabei wenn vorhanden
  if (sections["Vault"]) selected.add("Vault");

  // Wenn kein spezifisches Thema erkannt → Emotionale Signatur als Standard dazu
  if (selected.size <= 3) {
    selected.add(resolveHeading(sections, "Emotional Signature", "Emotionale Signatur"));
    selected.add(resolveHeading(sections, "Recurring Themes & Obsessions", "Wiederkehrende Themen & Obsessionen"));
  }

  // Soul zusammenbauen: Frontmatter + gewählte Sektionen (nur gefüllte)
  let result = frontmatter;
  for (const key of selected) {
    const content = sections[key];
    if (content && !content.includes("Noch nicht beschrieben") && !content.includes("Not yet described") && content.trim()) {
      result += `\n\n## ${key}\n${content}`;
    }
  }

  return result.trim();
}

/**
 * Setzt oder aktualisiert ein einzelnes Feld im YAML-Frontmatter.
 * Gibt die unveränderte Markdown-Zeichenkette zurück wenn kein Frontmatter gefunden.
 * @param {string} markdown
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
export function updateFrontmatterField(markdown, key, value) {
  if (!markdown) return markdown;

  // Frontmatter-Grenzen suchen: erster --- bis zweiter ---
  const openIdx  = markdown.indexOf("---");
  if (openIdx === -1) return markdown;
  const closeIdx = markdown.indexOf("---", openIdx + 3);
  if (closeIdx === -1) return markdown;

  const before = markdown.slice(0, openIdx + 3);       // "---"
  const fmBody = markdown.slice(openIdx + 3, closeIdx); // "\nkey: val\n…\n"
  const after  = markdown.slice(closeIdx);              // "---\n\n## …"

  // Vorhandenes Feld aktualisieren
  const linePattern = new RegExp(`(\\n${key}:)[^\\n]*`);
  if (linePattern.test(fmBody)) {
    return before + fmBody.replace(linePattern, `$1 ${value}`) + after;
  }

  // Neues Feld am Ende des Frontmatter-Blocks einfügen
  const newBody = fmBody.trimEnd() + `\n${key}: ${value}\n`;
  return before + newBody + after;
}

/**
 * Validiert eine Soul.md auf Pflichtfelder
 * @param {string} markdown
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSoul(markdown) {
  if (!markdown || typeof markdown !== "string") {
    return { valid: false, error: "Kein Inhalt vorhanden." };
  }
  if (!markdown.includes("soul_id:")) {
    return { valid: false, error: "Pflichtfeld soul_id fehlt." };
  }
  // Cert muss ein echter Hex-String (≥20 Zeichen) sein – Template-Platzhalter oder
  // fehlende Certs werden abgelehnt. Nur original SaveYourSoul-Dateien akzeptiert.
  if (!/soul_cert:\s*[a-f0-9]{20,}/i.test(markdown)) {
    return { valid: false, error: "Kein gültiger Soul-Cert – nur original SaveYourSoul-Dateien akzeptiert." };
  }
  return { valid: true };
}
