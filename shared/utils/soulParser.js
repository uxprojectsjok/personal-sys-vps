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
 * Hängt eine neue Zeile an den Session-Log
 * @param {string} markdown
 * @param {string} sessionText - Kurze Zusammenfassung
 * @returns {string}
 */
export function appendSessionLog(markdown, sessionText) {
  const today = new Date().toISOString().split("T")[0];
  const entry = `- **${today}:** ${sessionText}`;

  if (markdown.includes("## Session-Log")) {
    return markdown.replace(
      /## Session-Log \(komprimiert\)\n/,
      `## Session-Log (komprimiert)\n${entry}\n`
    );
  }

  return markdown + `\n\n## Session-Log (komprimiert)\n${entry}\n`;
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
const SOUL_TOPIC_MAP = [
  {
    keywords: ["musik", "song", "track", "künstler", "album", "genre", "hören", "konzert",
               "spotify", "youtube", "video", "film", "serie", "buch", "lesen",
               "kunst", "design", "foto", "bild", "ästhetik", "style", "mode"],
    sections:  ["Ästhetik & Resonanz"]
  },
  {
    keywords: ["familie", "sohn", "kind", "vater", "mutter", "papa", "mama", "eltern",
               "beziehung", "freunde", "partner", "liebe", "zuhause"],
    sections:  ["Kern-Identität", "Werte & Überzeugungen"]
  },
  {
    keywords: ["wert", "prinzip", "glaub", "ethik", "moral", "richtig", "falsch",
               "überzeugung", "sinn", "warum", "bedeutung"],
    sections:  ["Werte & Überzeugungen", "Weltbild"]
  },
  {
    keywords: ["arbeit", "projekt", "studio", "business", "geld", "karriere",
               "content", "produzier", "erstell", "kreativ", "entwickl", "beruf"],
    sections:  ["Kern-Identität", "Wiederkehrende Themen & Obsessionen"]
  },
  {
    keywords: ["angst", "druck", "stress", "gefühl", "emotion", "trauer", "freude",
               "wut", "erschöpf", "energie", "müde", "motivat", "stimmung"],
    sections:  ["Emotionale Signatur", "Wiederkehrende Themen & Obsessionen"]
  },
  {
    keywords: ["zukunft", "ziel", "plan", "träum", "vision", "hoffnung", "wunsch",
               "vorhaben", "absicht"],
    sections:  ["Offene Fragen dieser Person", "Wiederkehrende Themen & Obsessionen"]
  },
  {
    keywords: ["sprach", "ausdrück", "schreib", "formulier", "kommunizier", "wort", "text"],
    sections:  ["Sprachmuster & Ausdruck"]
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

  // Immer-dabei-Sektionen
  const selected = new Set(["Kern-Identität", "Session-Log (komprimiert)"]);

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

  // Vault und Kalender immer dabei wenn vorhanden
  if (sections["Vault"]) selected.add("Vault");
  if (sections["Kalender"]) selected.add("Kalender");

  // Wenn kein spezifisches Thema erkannt → Emotionale Signatur als Standard dazu
  if (selected.size <= 3) {
    selected.add("Emotionale Signatur");
    selected.add("Wiederkehrende Themen & Obsessionen");
  }

  // Soul zusammenbauen: Frontmatter + gewählte Sektionen (nur gefüllte)
  let result = frontmatter;
  for (const key of selected) {
    const content = sections[key];
    if (content && !content.includes("Noch nicht beschrieben") && content.trim()) {
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
 * Fügt einen datierten Eintrag in den ## Kalender Abschnitt der Soul.md ein.
 * Neueste Einträge stehen oben.
 * @param {string} markdown
 * @param {string} date - ISO-Datum "YYYY-MM-DD"
 * @param {string} note - Notiztext
 * @returns {string}
 */
export function appendCalendarEntry(markdown, date, note) {
  const entry = `- **${date}:** ${note.trim()}`;

  if (/^## Kalender\b/m.test(markdown)) {
    return markdown.replace(/(## Kalender[^\n]*\n)/, `$1${entry}\n`);
  }

  return markdown.trimEnd() + `\n\n## Kalender\n${entry}\n`;
}

/**
 * Aktualisiert einen bestehenden Kalender-Eintrag in der Soul.md.
 * Unterstützt beide Format-Varianten: **date:** und **date**:
 */
export function updateCalendarEntry(markdown, date, oldText, newText) {
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(- \*\*)(\d{4}-\d{2}-\d{2})(:\*\*|\*\*:)\s*(.+)$/);
    if (m && m[2] === date && m[4].trim() === oldText.trim()) {
      lines[i] = `${m[1]}${date}${m[3]} ${newText.trim()}`;
      break;
    }
  }
  return lines.join('\n');
}

/**
 * Löscht einen Kalender-Eintrag aus der Soul.md.
 * Unterstützt beide Format-Varianten: **date:** und **date**:
 */
export function deleteCalendarEntry(markdown, date, text) {
  return markdown
    .split('\n')
    .filter(line => {
      const m = line.match(/^- \*\*(\d{4}-\d{2}-\d{2})(:\*\*|\*\*:)\s*(.+)$/);
      if (!m) return true;
      return !(m[1] === date && m[3].trim() === text.trim());
    })
    .join('\n');
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
